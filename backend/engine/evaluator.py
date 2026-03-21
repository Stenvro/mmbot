import pandas as pd
import pandas_ta_classic as ta
import operator

OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    ">": operator.gt,
    "<": operator.lt,
    "==": operator.eq,
    ">=": operator.ge,
    "<=": operator.le,
    "AND": operator.and_,
    "OR": operator.or_,
    "XOR": operator.xor
}

class NodeEvaluator:
    def __init__(self, strategy_json: dict):
        self.nodes = strategy_json.get("nodes", {})
        self.entry_trigger = strategy_json.get("entry_trigger")
        self.df = None

    def evaluate(self, df: pd.DataFrame) -> bool:
        if df.empty or not self.entry_trigger:
            return False
            
        self.df = df.copy()
        self._calculate_indicators()
        
        latest_row_index = self.df.index[-1]
        result = self.resolve_node(self.entry_trigger, latest_row_index)
        
        return bool(result)

    def _calculate_indicators(self):
        for node_id, node_data in self.nodes.items():
            if node_data.get("class") == "indicator":
                method_name = node_data.get("method")
                params = node_data.get("params", {})
                
                if hasattr(self.df.ta, method_name.lower()):
                    ta_function = getattr(self.df.ta, method_name.lower())
                    ta_function(**params, append=True)
                else:
                    print(f"Warning: Indicator '{method_name}' not found in pandas-ta.")

    def resolve_node(self, node_id: str, row_index):
        if node_id not in self.nodes:
            raise ValueError(f"Node {node_id} not found in strategy definition.")
            
        node = self.nodes[node_id]
        node_class = node.get("class")
        
        if node_class == "constant":
            return node.get("value")
            
        elif node_class == "indicator":
            method = node.get("method").upper()
            length = node.get("params", {}).get("length", "")
            
            matching_cols = [c for c in self.df.columns if c.startswith(method)]
            
            if matching_cols:
                return self.df.at[row_index, matching_cols[0]]
            return None
            
        elif node_class in ["logic", "math"]:
            op_string = node.get("operator")
            inputs = node.get("inputs", [])
            
            if len(inputs) != 2:
                raise ValueError(f"Operator {op_string} expects exactly 2 inputs, got {len(inputs)}.")
                
            left_value = self.resolve_node(inputs[0], row_index)
            right_value = self.resolve_node(inputs[1], row_index)
            
            if pd.isna(left_value) or pd.isna(right_value):
                return False
                
            math_func = OPERATORS.get(op_string)
            if math_func:
                return math_func(left_value, right_value)
            else:
                raise ValueError(f"Unknown operator: {op_string}")