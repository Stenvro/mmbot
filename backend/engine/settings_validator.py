import logging
import pandas as pd
import pandas_ta_classic  # noqa: F401 — registers .ta accessor on DataFrame

logger = logging.getLogger("apexalgo.settings_validator")

VALID_TIMEFRAMES = {'1m', '5m', '15m', '1h', '4h', '1d'}
VALID_EXIT_TYPES = {'percentage', 'trailing', 'atr', 'fixed'}
VALID_AMOUNT_TYPES = {'percentage', 'fixed'}
VALID_CLOSE_AMOUNT_TYPES = {'percentage', 'fixed'}
VALID_CONDITION_OPS = {'>', '<', '>=', '<=', '==', '!=', 'cross_above', 'cross_below', 'increasing', 'decreasing', 'increasing_for', 'decreasing_for'}
VALID_LOGIC_OPS = {'and', 'or', 'xor', 'nand', 'nor', 'not'}
VALID_PRICE_TYPES = {'open', 'high', 'low', 'close', 'volume'}


def validate_bot_settings(settings: dict) -> dict:
    """Validate bot settings and return errors and warnings.

    Returns dict with 'errors' (list of blocking issues) and
    'warnings' (list of non-blocking issues).
    """
    errors = []
    warnings = []
    nodes = settings.get("nodes", {})

    # Symbols
    symbols = settings.get("symbols", [])
    if not symbols:
        if settings.get("symbol"):
            warnings.append("Using single 'symbol' field; consider using 'symbols' list.")
        else:
            errors.append("No trading symbols configured.")

    # Timeframe
    tf = settings.get("timeframe")
    if tf and tf not in VALID_TIMEFRAMES:
        errors.append(f"Invalid timeframe '{tf}'. Valid: {', '.join(sorted(VALID_TIMEFRAMES))}")

    # Entry/exit node references
    entry_node = settings.get("entry_node")
    exit_node = settings.get("exit_node")
    if entry_node and entry_node not in nodes:
        errors.append(f"entry_node '{entry_node}' not found in nodes.")
    if exit_node and exit_node not in nodes:
        errors.append(f"exit_node '{exit_node}' not found in nodes.")
    if not entry_node and not exit_node:
        warnings.append("No entry_node or exit_node configured. Bot will not generate signals.")

    # Max positions
    max_pos = settings.get("max_positions", 1)
    if isinstance(max_pos, (int, float)) and max_pos < 1:
        errors.append("max_positions must be >= 1.")

    # Validate each node
    for node_id, node in nodes.items():
        node_class = node.get("class")

        if node_class == "indicator":
            method = str(node.get("method", "")).lower()
            if method and method not in ('volume', 'vma'):
                if not hasattr(pd.DataFrame().ta, method):
                    errors.append(f"Node '{node_id}': indicator method '{method}' not found in pandas_ta.")

        elif node_class == "price_data":
            price_type = node.get("type", "close")
            if price_type not in VALID_PRICE_TYPES:
                errors.append(f"Node '{node_id}': invalid price type '{price_type}'.")

        elif node_class == "condition":
            op = node.get("operator")
            if op and op not in VALID_CONDITION_OPS:
                errors.append(f"Node '{node_id}': invalid condition operator '{op}'.")
            _validate_operand_ref(node.get("left"), node_id, "left", nodes, warnings)
            if op not in ("increasing", "decreasing"):
                _validate_operand_ref(node.get("right"), node_id, "right", nodes, warnings)

        elif node_class == "logic":
            op = node.get("operator", "and").lower()
            if op not in VALID_LOGIC_OPS:
                errors.append(f"Node '{node_id}': invalid logic operator '{op}'.")
            _validate_operand_ref(node.get("left"), node_id, "left", nodes, warnings)
            if op != "not":
                _validate_operand_ref(node.get("right"), node_id, "right", nodes, warnings)

    # Trade settings
    trade_settings = settings.get("trade_settings", {})
    entry_ts = trade_settings.get("entry", {})
    exit_ts = trade_settings.get("exit", {})

    # Entry amount
    amount_type = entry_ts.get("amount_type", "percentage")
    if amount_type not in VALID_AMOUNT_TYPES:
        errors.append(f"Invalid entry amount_type '{amount_type}'.")
    amount_value = entry_ts.get("amount_value")
    if amount_value is not None:
        try:
            if float(amount_value) <= 0:
                warnings.append("Entry amount_value is <= 0.")
        except (ValueError, TypeError):
            errors.append(f"Entry amount_value '{amount_value}' is not a valid number.")

    # Stop losses
    for i, sl in enumerate(entry_ts.get("stop_losses", [])):
        sl_type = sl.get("type", "")
        if sl_type not in VALID_EXIT_TYPES:
            errors.append(f"Stop loss #{i}: invalid type '{sl_type}'.")
        try:
            if float(sl.get("value", 0)) <= 0:
                warnings.append(f"Stop loss #{i}: value is <= 0.")
        except (ValueError, TypeError):
            errors.append(f"Stop loss #{i}: value is not a valid number.")
        cat = sl.get("close_amount_type", "percentage")
        if cat not in VALID_CLOSE_AMOUNT_TYPES:
            errors.append(f"Stop loss #{i}: invalid close_amount_type '{cat}'.")

    # Take profits
    for i, tp in enumerate(entry_ts.get("take_profits", [])):
        tp_type = tp.get("type", "")
        if tp_type not in VALID_EXIT_TYPES:
            errors.append(f"Take profit #{i}: invalid type '{tp_type}'.")
        try:
            if float(tp.get("value", 0)) <= 0:
                warnings.append(f"Take profit #{i}: value is <= 0.")
        except (ValueError, TypeError):
            errors.append(f"Take profit #{i}: value is not a valid number.")
        cat = tp.get("close_amount_type", "percentage")
        if cat not in VALID_CLOSE_AMOUNT_TYPES:
            errors.append(f"Take profit #{i}: invalid close_amount_type '{cat}'.")

    # API execution
    if settings.get("api_execution") and not settings.get("api_key_name"):
        errors.append("api_execution is enabled but no api_key_name specified.")

    # API key reference reminder
    if settings.get("api_key_name"):
        warnings.append(f"Bot references API key '{settings['api_key_name']}'. Verify this key exists and has correct permissions.")

    return {"errors": errors, "warnings": warnings}


def _validate_operand_ref(operand, node_id: str, side: str, nodes: dict, warnings: list):
    """Check that a node operand reference is valid."""
    if operand is None:
        return
    if isinstance(operand, (int, float)):
        return
    if isinstance(operand, str):
        try:
            float(operand)
            return
        except (ValueError, TypeError):
            pass
        if operand not in nodes:
            warnings.append(f"Node '{node_id}': {side} references '{operand}' which is not in nodes.")
