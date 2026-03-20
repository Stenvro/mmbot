from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import ccxt

from backend.core.database import get_db
from backend.models.exchange_keys import ExchangeKey
from backend.core.security import verify_api_key
from backend.core.encryption import encrypt_data, decrypt_data

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

@router.post("")
def save_exchange_keys(req: ExchangeKeyCreate, db: Session = Depends(get_db)):
    try:
        test_exchange = ccxt.okx({
            'apiKey': req.api_key,
            'secret': req.api_secret,
            'password': req.passphrase,
            'enableRateLimit': True,
            'hostname': 'eea.okx.com'
        })
        
        if req.is_sandbox:
            test_exchange.set_sandbox_mode(True)
            
        test_exchange.fetch_balance()
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OKX Connection Rejected: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("")
def get_exchange_keys_status(db: Session = Depends(get_db)):
    keys = db.query(ExchangeKey).all()
    result = []
    for k in keys:
        is_active = False
        error_msg = ""
        try:
            dec_key = decrypt_data(k.api_key)
            dec_secret = decrypt_data(k.api_secret)
            dec_passphrase = decrypt_data(k.passphrase)
            
            test_exchange = ccxt.okx({
                'apiKey': dec_key,
                'secret': dec_secret,
                'password': dec_passphrase,
                'enableRateLimit': True,
                'hostname': 'eea.okx.com'
            })
            if k.is_sandbox:
                test_exchange.set_sandbox_mode(True)
                
            test_exchange.fetch_balance()
            is_active = True
        except Exception as e:
            is_active = False
            error_msg = str(e)
            
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
        dec_key = decrypt_data(key_record.api_key)
        dec_secret = decrypt_data(key_record.api_secret)
        dec_passphrase = decrypt_data(key_record.passphrase)
        
        test_exchange = ccxt.okx({
            'apiKey': dec_key,
            'secret': dec_secret,
            'password': dec_passphrase,
            'enableRateLimit': True,
            'hostname': 'eea.okx.com'
        })
        if key_record.is_sandbox:
            test_exchange.set_sandbox_mode(True)
            
        balance_data = test_exchange.fetch_balance()
        
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
        raise HTTPException(status_code=400, detail=f"Failed to fetch balance: {str(e)}")

@router.delete("/{key_name}")
def delete_exchange_keys(key_name: str, db: Session = Depends(get_db)):
    try:
        key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()
        if key_record:
            db.delete(key_record)
            db.commit()
            return {"message": f"Key '{key_name}' deleted successfully."}
        raise HTTPException(status_code=404, detail=f"Key '{key_name}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))