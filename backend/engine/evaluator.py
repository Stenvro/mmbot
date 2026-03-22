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
                
                if hasattr(self.df.ta, method):
                    try:
                        # Slimme check voor Pandas TA argumenten
                        if isinstance(params, list):
                            res = getattr(self.df.ta, method)(*params)
                        elif isinstance(params, dict):
                            res = getattr(self.df.ta, method)(**params)
                        else:
                            res = getattr(self.df.ta, method)(params)
                        
                        # pandas_ta geeft soms 1 kolom terug (RSI), soms meerdere (MACD, BBANDS)
                        if isinstance(res, pd.DataFrame):
                            # Neem de eerste resultaat-kolom (vaak de hoofdlijn van de indicator)
                            self.df[node_id] = res.iloc[:, 0] 
                        else:
                            self.df[node_id] = res
                            
                    except Exception as e:
                        print(f"❌ Error calculating indicator {method}: {e}")

    def resolve_node(self, node_id: str, index: int):
        """Evalueert een specifieke node recursief (zoals een logic of condition)."""
        if not node_id:
            return False
            
        nodes = self.settings.get("nodes", {})
        node = nodes.get(node_id)
        if not node:
            return False

        node_class = node.get("class")

        # 1. Indicator Node: Geef de berekende waarde terug
        if node_class == "indicator":
            return float(self.df.at[index, node_id]) if node_id in self.df.columns else 0.0

        # 2. Condition Node: Vergelijk twee waarden (bijv: RSI < 40)
        elif node_class == "condition":
            left_val = self.resolve_operand(node.get("left"), index)
            right_val = self.resolve_operand(node.get("right"), index)
            op = node.get("operator")

            if op == ">": return left_val > right_val
            if op == "<": return left_val < right_val
            if op == ">=": return left_val >= right_val
            if op == "<=": return left_val <= right_val
            if op == "==": return left_val == right_val
            if op == "!=": return left_val != right_val
            return False

        # 3. Logic Node: Combineer twee condities (bijv: COND_1 AND COND_2)
        elif node_class == "logic":
            left_val = bool(self.resolve_node(node.get("left"), index))
            right_val = bool(self.resolve_node(node.get("right"), index))
            op = node.get("operator", "and").lower()

            if op == "and": return left_val and right_val
            if op == "or": return left_val or right_val
            return False

        return False

    def resolve_operand(self, operand, index: int):
        """Helper functie om uit te vinden of iets een getal is, of een indicatornaam."""
        if isinstance(operand, (int, float)):
            return float(operand)
        if isinstance(operand, str) and operand in self.df.columns:
            return float(self.df.at[index, operand])
        return 0.0

    def evaluate(self, df: pd.DataFrame) -> bool:
        """Hoofdfunctie voor live trading."""
        self.df = df.copy()
        self._calculate_indicators()
        
        if self.df.empty or not self.entry_trigger:
            return False
            
        latest_index = len(self.df) - 1
        
        try:
            return bool(self.resolve_node(self.entry_trigger, latest_index))
        except Exception as e:
            print(f"❌ Strategy Evaluation Error: {e}")
            return False