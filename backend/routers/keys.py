import logging
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import ccxt

from backend.core.database import get_db
from backend.models.exchange_keys import ExchangeKey
from backend.core.security import verify_api_key
from backend.core.encryption import encrypt_data, decrypt_data

logger = logging.getLogger("apexalgo.keys")

router = APIRouter(
    prefix="/api/keys",
    tags=["Exchange Keys"],
    dependencies=[Depends(verify_api_key)]
)

class ExchangeKeyCreate(BaseModel):
    name: str
    exchange: str = "okx"
    api_key: str
    api_secret: str
    passphrase: str
    is_sandbox: bool = True


def _create_exchange(api_key: str, secret: str, passphrase: str, is_sandbox: bool = False):
    """Create a configured CCXT OKX exchange instance."""
    exchange = ccxt.okx({
        'apiKey': api_key,
        'secret': secret,
        'password': passphrase,
        'enableRateLimit': True,
        'hostname': 'eea.okx.com'
    })
    if is_sandbox:
        exchange.set_sandbox_mode(True)
    return exchange


def _get_exchange_for_key(key_record: ExchangeKey):
    """Decrypt credentials and create exchange instance from a DB record."""
    dec_key = decrypt_data(key_record.api_key)
    dec_secret = decrypt_data(key_record.api_secret)
    dec_passphrase = decrypt_data(key_record.passphrase)
    return _create_exchange(dec_key, dec_secret, dec_passphrase, key_record.is_sandbox)


@router.post("")
def save_exchange_keys(req: ExchangeKeyCreate, db: Session = Depends(get_db)):
    try:
        test_exchange = _create_exchange(req.api_key, req.api_secret, req.passphrase, req.is_sandbox)
        test_exchange.fetch_balance()
    except Exception as e:
        logger.warning("Exchange key validation failed for '%s': %s", req.name, type(e).__name__)
        raise HTTPException(status_code=400, detail="OKX Connection Rejected: Could not authenticate with the provided credentials.")

    try:
        enc_key = encrypt_data(req.api_key)
        enc_secret = encrypt_data(req.api_secret)
        enc_passphrase = encrypt_data(req.passphrase)

        existing = db.query(ExchangeKey).filter(ExchangeKey.name == req.name).first()

        if existing:
            existing.api_key = enc_key
            existing.api_secret = enc_secret
            existing.passphrase = enc_passphrase
            existing.is_sandbox = req.is_sandbox
            existing.exchange = req.exchange
        else:
            new_key = ExchangeKey(
                name=req.name,
                exchange=req.exchange,
                api_key=enc_key,
                api_secret=enc_secret,
                passphrase=enc_passphrase,
                is_sandbox=req.is_sandbox
            )
            db.add(new_key)

        db.commit()
        return {"message": f"Exchange key '{req.name}' verified and saved securely."}
    except Exception as e:
        logger.error("Database error saving key '%s': %s", req.name, e)
        raise HTTPException(status_code=500, detail="Database error while saving exchange key.")

@router.get("")
def get_exchange_keys_status(db: Session = Depends(get_db)):
    keys = db.query(ExchangeKey).all()
    result = []
    for k in keys:
        is_active = False
        error_msg = ""
        try:
            test_exchange = _get_exchange_for_key(k)
            test_exchange.fetch_balance()
            is_active = True
        except Exception as e:
            is_active = False
            error_msg = type(e).__name__

        result.append({
            "name": k.name,
            "exchange": k.exchange,
            "is_sandbox": k.is_sandbox,
            "is_active": is_active,
            "error_msg": error_msg
        })
    return result

@router.get("/{key_name}/balance")
def get_key_balance(key_name: str, db: Session = Depends(get_db)):
    key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()
    if not key_record:
        raise HTTPException(status_code=404, detail=f"Key '{key_name}' not found.")

    try:
        exchange = _get_exchange_for_key(key_record)
        balance_data = exchange.fetch_balance()

        active_balances = {}
        if 'total' in balance_data:
            for coin, amount in balance_data['total'].items():
                if amount > 0:
                    active_balances[coin] = {
                        "free": balance_data['free'].get(coin, 0),
                        "used": balance_data['used'].get(coin, 0),
                        "total": amount
                    }
        return {"name": key_name, "balances": active_balances}
    except Exception as e:
        logger.warning("Failed to fetch balance for '%s': %s", key_name, type(e).__name__)
        raise HTTPException(status_code=400, detail="Failed to fetch balance from exchange.")

@router.delete("/{key_name}")
def delete_exchange_keys(key_name: str, db: Session = Depends(get_db)):
    key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()
    if not key_record:
        raise HTTPException(status_code=404, detail=f"Key '{key_name}' not found.")

    db.delete(key_record)
    db.commit()
    return {"message": f"Key '{key_name}' deleted successfully."}

@router.post("/{name}/swap")
async def execute_quick_swap(name: str, request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    try:
        key_record = db.query(ExchangeKey).filter(ExchangeKey.name == name).first()
        if not key_record:
            return JSONResponse(status_code=404, content={"detail": f"API Wallet '{name}' not found"})

        exchange = _get_exchange_for_key(key_record)

        from_asset = payload.get('from_asset', '').upper()
        to_asset = payload.get('to_asset', '').upper()
        amount = float(payload.get('amount', 0))

        exchange.load_markets()
        symbol_buy = f"{to_asset}/{from_asset}"
        symbol_sell = f"{from_asset}/{to_asset}"

        if symbol_buy in exchange.markets:
            ticker = exchange.fetch_ticker(symbol_buy)
            raw_amount = (amount / ticker['last']) if payload.get('amount_type') == 'from' else amount
            # Round to OKX precision requirements before submitting
            trade_amount = float(exchange.amount_to_precision(symbol_buy, raw_amount))
            order = exchange.create_market_buy_order(symbol_buy, trade_amount)

        elif symbol_sell in exchange.markets:
            ticker = exchange.fetch_ticker(symbol_sell)
            raw_amount = amount if payload.get('amount_type') == 'from' else (amount / ticker['last'])
            # Round to OKX precision requirements before submitting
            trade_amount = float(exchange.amount_to_precision(symbol_sell, raw_amount))
            order = exchange.create_market_sell_order(symbol_sell, trade_amount)
        else:
            return JSONResponse(status_code=400, content={"detail": f"Trading pair {from_asset}/{to_asset} not supported on this environment."})

        # Wait briefly then re-fetch to detect orders stuck due to zero liquidity on testnet
        time.sleep(1.0)
        fetched_order = exchange.fetch_order(order['id'], order['symbol'])

        if fetched_order['status'] == 'canceled':
            return JSONResponse(status_code=400, content={"detail": f"OKX canceled the order. Reason: Zero liquidity for {order['symbol']} on the Testnet."})
        if fetched_order['status'] == 'open':
            exchange.cancel_order(order['id'], order['symbol'])
            return JSONResponse(status_code=400, content={"detail": f"Order stuck. No volume for {order['symbol']} on the Sandbox. Order auto-canceled to prevent stuck balance."})

        return {"status": "success", "order": fetched_order}

    except ccxt.ExchangeError as e:
        error_msg = str(e)
        if "51155" in error_msg or "compliance" in error_msg.lower():
            return JSONResponse(status_code=400, content={"detail": "European Compliance Error (MiCA): You cannot trade USDT on OKX in Europe. Please swap to USDC or EUR instead."})
        return JSONResponse(status_code=400, content={"detail": "Exchange rejected the order. Please check your assets and try again."})
    except ccxt.InsufficientFunds:
        return JSONResponse(status_code=400, content={"detail": "Insufficient funds in your account to cover this swap amount."})
    except ccxt.InvalidOrder as e:
        return JSONResponse(status_code=400, content={"detail": "Order size too small or invalid for this exchange."})
    except Exception as e:
        logger.error("Swap error for wallet '%s': %s", name, e, exc_info=True)
        return JSONResponse(status_code=400, content={"detail": "An unexpected error occurred during the swap."})
