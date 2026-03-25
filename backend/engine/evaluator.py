import pandas as pd
import pandas_ta_classic as ta

class NodeEvaluator:
    def __init__(self, settings: dict):
        self.settings = settings
        self.df = pd.DataFrame()
        self.entry_trigger = settings.get("entry_node")

    def _calculate_indicators(self):
        """Berekent alle indicatoren in de dataframe via Pandas TA."""
        nodes = self.settings.get("nodes", {})
        
        for node_id, node in nodes.items():
            if node.get("class") == "indicator":
                method = node.get("method")
                params = node.get("params", [])
                out_idx = int(node.get("output_idx", 0)) # Nieuwe Parameter!
                
                if hasattr(self.df.ta, method):
                    try:
                        if isinstance(params, list):
                            res = getattr(self.df.ta, method)(*params)
                        elif isinstance(params, dict):
                            res = getattr(self.df.ta, method)(**params)
                        else:
                            res = getattr(self.df.ta, method)(params)
                        
                        # --- FIX: MULTI-LINE INDICATOR SELECTOR ---
                        # Pandas-TA geeft bijv. voor MACD 3 kolommen terug. 
                        # We pakken precies de kolom die de user in de Builder heeft gekozen.
                        if isinstance(res, pd.DataFrame):
                            if out_idx < len(res.columns):
                                self.df[node_id] = res.iloc[:, out_idx]
                            else:
                                self.df[node_id] = res.iloc[:, 0] # Fallback
                        else:
                            self.df[node_id] = res
                    except Exception as e:
                        print(f"❌ Error calculating indicator {method}: {e}")

        # Bereken ALTIJD de ATR voor de Stop Loss!
        try:
            h = pd.to_numeric(self.df['high'], errors='coerce')
            l = pd.to_numeric(self.df['low'], errors='coerce')
            c = pd.to_numeric(self.df['close'], errors='coerce')
            self.df['atr'] = ta.atr(h, l, c, length=14)
        except Exception:
            self.df['atr'] = 0.0

    def resolve_node(self, node_id: str) -> pd.Series:
        if not node_id:
            return pd.Series(False, index=self.df.index)
            
        nodes = self.settings.get("nodes", {})
        node = nodes.get(node_id)
        if not node:
            return pd.Series(False, index=self.df.index)

        node_class = node.get("class")

        if node_class == "indicator":
            if node_id in self.df.columns:
                return self.df[node_id]
            return pd.Series(0.0, index=self.df.index)

        elif node_class == "price_data":
            price_type = node.get("type", "close").lower()
            offset = int(node.get("offset", 0))
            if price_type in self.df.columns:
                return self.df[price_type].shift(offset).fillna(0.0)
            return pd.Series(0.0, index=self.df.index)

        elif node_class == "condition":
            left_s = self.resolve_operand(node.get("left"))
            right_s = self.resolve_operand(node.get("right"))
            op = node.get("operator")

            if op == "cross_above":
                return (left_s.shift(1) <= right_s.shift(1)) & (left_s > right_s)
            elif op == "cross_below":
                return (left_s.shift(1) >= right_s.shift(1)) & (left_s < right_s)
            elif op == ">": return left_s > right_s
            elif op == "<": return left_s < right_s
            elif op == ">=": return left_s >= right_s
            elif op == "<=": return left_s <= right_s
            elif op == "==": return left_s == right_s
            elif op == "!=": return left_s != right_s
            return pd.Series(False, index=self.df.index)

        elif node_class == "logic":
            left_s = self.resolve_node(node.get("left")).astype(bool)
            right_s = self.resolve_node(node.get("right")).astype(bool) if node.get("right") else pd.Series(False, index=self.df.index)
            op = node.get("operator", "and").lower()

            if op == "and": return left_s & right_s
            if op == "or": return left_s | right_s
            if op == "xor": return left_s ^ right_s
            if op == "nand": return ~(left_s & right_s)
            if op == "nor": return ~(left_s | right_s)
            if op == "not": return ~left_s
            return pd.Series(False, index=self.df.index)

        return pd.Series(0.0, index=self.df.index)

    def resolve_operand(self, operand) -> pd.Series:
        if isinstance(operand, (int, float)):
            return pd.Series(float(operand), index=self.df.index)
        if isinstance(operand, str):
            if operand in self.df.columns:
                return self.df[operand]
            return self.resolve_node(operand)
        try:
            return pd.Series(float(operand), index=self.df.index)
        except (ValueError, TypeError):
            return pd.Series(0.0, index=self.df.index)