import pandas as pd
import pandas_ta_classic as ta

class NodeEvaluator:
    def __init__(self, settings: dict):
        self.settings = settings
        self.df = pd.DataFrame()
        self.entry_trigger = settings.get("entry_node")

    def _calculate_indicators(self):
        """Calculates all indicators on the DataFrame using pandas_ta."""
        nodes = self.settings.get("nodes", {})
        
        for node_id, node in nodes.items():
            if node.get("class") == "indicator":
                method = str(node.get("method", "rsi")).lower()
                params = node.get("params", {})
                out_idx = int(node.get("output_idx", 0))
                
                if method == "volume":
                    self.df[node_id] = self.df['volume'] if 'volume' in self.df.columns else 0.0
                    continue
                elif method == "vma":
                    if 'volume' in self.df.columns:
                        length = params.get('length', 14) if isinstance(params, dict) else 14
                        self.df[node_id] = ta.sma(self.df['volume'], length=length)
                    else:
                        self.df[node_id] = 0.0
                    continue

                if hasattr(self.df.ta, method):
                    res = None
                    try:
                        if isinstance(params, list) and len(params) > 0:
                            res = getattr(self.df.ta, method)(*params)
                        elif isinstance(params, dict) and len(params) > 0:
                            res = getattr(self.df.ta, method)(**params)
                        elif isinstance(params, (int, float, str)):
                            res = getattr(self.df.ta, method)(params)
                        else:
                            res = getattr(self.df.ta, method)()
                            
                    except Exception as e:
                        print(f"Warning: invalid params for '{method}' ({params}), retrying with defaults. ({e})")
                        try:
                            res = getattr(self.df.ta, method)()
                        except Exception as e2:
                            print(f"Error: could not compute indicator '{method}': {e2}")
                            continue

                    if res is None:
                        continue

                    if isinstance(res, pd.DataFrame):
                        if not res.empty:
                            if out_idx < len(res.columns):
                                self.df[node_id] = res.iloc[:, out_idx]
                            else:
                                self.df[node_id] = res.iloc[:, 0]
                    else:
                        self.df[node_id] = res

        try:
            if 'high' in self.df and 'low' in self.df and 'close' in self.df:
                h = pd.to_numeric(self.df['high'], errors='coerce')
                l = pd.to_numeric(self.df['low'], errors='coerce')
                c = pd.to_numeric(self.df['close'], errors='coerce')
                self.df['atr'] = ta.atr(h, l, c, length=14)
            else:
                self.df['atr'] = 0.0
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
            op = node.get("operator")

            if op == "increasing":
                return left_s > left_s.shift(1)
            elif op == "decreasing":
                return left_s < left_s.shift(1)

            right_s = self.resolve_operand(node.get("right"))

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
            # Cast to bool explicitly: a child node may return a numeric series instead of a boolean one
            left_resolved = self.resolve_node(node.get("left"))
            right_resolved = self.resolve_node(node.get("right")) if node.get("right") else pd.Series(False, index=self.df.index)

            left_s = left_resolved.astype(bool) if isinstance(left_resolved, pd.Series) else pd.Series(bool(left_resolved), index=self.df.index)
            right_s = right_resolved.astype(bool) if isinstance(right_resolved, pd.Series) else pd.Series(bool(right_resolved), index=self.df.index)
            
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