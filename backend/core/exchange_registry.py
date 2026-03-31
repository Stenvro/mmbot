import logging
import ccxt

logger = logging.getLogger("apexalgo.exchange_registry")

# All exchanges supported by ApexAlgo. Key = ccxt exchange ID, Value = display name.
SUPPORTED_EXCHANGES: dict[str, str] = {
    "okx":       "OKX",
    "binance":   "Binance",
    "bitvavo":   "Bitvavo",
    "coinbase":  "Coinbase",
    "cryptocom": "Crypto.com",
    "kraken":    "Kraken",
    "kucoin":    "KuCoin",
}

# Exchanges that authenticate via api_key + api_secret + passphrase.
# All others use only api_key + api_secret.
_PASSPHRASE_EXCHANGES: frozenset[str] = frozenset({"okx", "kucoin"})

# Per-exchange static configuration applied at instantiation.
_EXCHANGE_CONFIG: dict[str, dict] = {
    "okx": {"hostname": "eea.okx.com"},
}


def build_exchange(
    exchange_id: str,
    api_key: str | None = None,
    api_secret: str | None = None,
    passphrase: str | None = None,
    sandbox: bool = False,
) -> ccxt.Exchange:
    """
    Instantiate and return a configured CCXT exchange.

    Parameters
    ----------
    exchange_id : str
        Lowercase exchange identifier (e.g. "okx", "binance").
    api_key / api_secret : str, optional
        Omit for unauthenticated (public market data) connections.
    passphrase : str, optional
        Only applied for exchanges that require it (OKX, KuCoin).
    sandbox : bool
        Enable exchange sandbox / testnet mode when supported.
    """
    exchange_id = exchange_id.lower()

    if exchange_id not in SUPPORTED_EXCHANGES:
        raise ValueError(
            f"Exchange '{exchange_id}' is not supported. "
            f"Supported: {', '.join(SUPPORTED_EXCHANGES)}"
        )

    cls = getattr(ccxt, exchange_id, None)
    if cls is None:
        raise RuntimeError(
            f"Exchange '{exchange_id}' was not found in the installed CCXT version. "
            "Run: pip install --upgrade ccxt"
        )

    config: dict = {"enableRateLimit": True}
    config.update(_EXCHANGE_CONFIG.get(exchange_id, {}))

    if api_key:
        config["apiKey"] = api_key
        config["secret"] = api_secret

    if passphrase and exchange_id in _PASSPHRASE_EXCHANGES:
        config["password"] = passphrase

    exchange = cls(config)

    if sandbox:
        try:
            exchange.set_sandbox_mode(True)
        except Exception:
            logger.debug("Exchange '%s' does not support sandbox mode.", exchange_id)

    return exchange


def build_exchange_from_key(key_record) -> ccxt.Exchange:
    """
    Convenience wrapper: build an authenticated exchange instance
    directly from a decrypted ExchangeKey record.
    """
    from backend.core.encryption import decrypt_data
    return build_exchange(
        exchange_id=key_record.exchange,
        api_key=decrypt_data(key_record.api_key),
        api_secret=decrypt_data(key_record.api_secret),
        passphrase=decrypt_data(key_record.passphrase) if key_record.passphrase else None,
        sandbox=key_record.is_sandbox,
    )
