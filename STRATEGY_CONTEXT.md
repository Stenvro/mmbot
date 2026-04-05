# ApexAlgo Strategy Builder — AI Prompt Context

> Copy and paste this file (or the relevant sections) into any AI assistant to get strategy suggestions that are **directly buildable** in ApexAlgo's visual node editor. The AI will know exactly which indicators, conditions, logic gates, and risk tools are available — and how to wire them.

---

## What is ApexAlgo?

ApexAlgo is a no-code algorithmic trading platform. You build strategies by connecting visual nodes on a canvas:

**Indicators** output a number per candle (e.g. RSI value, moving average price).
**Conditions** compare two values and output true/false (e.g. RSI > 70).
**Logic Gates** combine conditions (e.g. RSI > 70 AND price crosses below upper Bollinger Band).
**Actions** execute trades when the logic chain resolves to true.
**Risk Nodes** attach stop-losses and take-profits to entry actions.

The flow is always: **Indicator/Price Data --> Condition --> Logic Gate (optional) --> Action --> Risk Nodes**

---

## Available Node Types

### 1. Configuration Nodes (one of each per strategy)

**Main Configuration**
- Algorithm name
- Data interval: depends on the selected exchange (e.g. OKX supports `1m` through `3M`; Coinbase supports `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `6h`, `1d`). The timeframe dropdown updates automatically when you change the exchange.
- Max positions: number of concurrent open positions allowed
- Position limit scope: `per_pair` (e.g. 1x BTC + 1x ETH) or `global` (total across all pairs)
- Cooldown: max N new entries per X candles (0 = off)
- Max drawdown %: evaluated after the full backtest completes — if exceeded, the bot is stopped and not allowed to go live (0 = off). During live trading, checked after every closed position. Calculated as `(peak_equity - current_equity) / peak_equity * 100` where equity = starting capital + cumulative P&L
- Max order value USD: rejects live orders above this dollar amount (0 = off)
- Execution mode: `Paper Trading` (simulated) or `Live Exchange` (real orders)

**Asset Whitelist**
- Comma-separated trading pairs, e.g. `BTC/USDT, ETH/USDT, SOL/USDT`

**Backtest Engine**
- Toggle: run historical backtest on start
- Start capital (USD)
- Lookback period (number of candles)

**Exchange Routing**
- If an API key is selected: the exchange is automatically derived from the key (shown as a read-only badge). The key determines whether the bot runs in sandbox (paper) or live mode.
- If no API key is selected: a **Data Exchange** dropdown appears, letting you manually select which exchange provides market data. The bot runs in forward-test mode (local simulation, no API calls).
- Supported exchanges: OKX, Binance, Bitvavo, Coinbase, Crypto.com, Kraken, KuCoin

---

### 2. Data Source Nodes

#### Technical Indicators

Each indicator outputs one or more signal lines. Multi-line indicators have an **output selector** to pick which line to use.

**Trend & Overlap** (drawn on price chart)
| Indicator | Key | Lines | Parameters |
|---|---|---|---|
| SMA | `sma` | Main | length (14) |
| EMA | `ema` | Main | length (14) |
| WMA | `wma` | Main | length (14) |
| DEMA | `dema` | Main | length (14) |
| TEMA | `tema` | Main | length (14) |
| KAMA | `kama` | Main | length (10), fast SC (2), slow SC (30) |
| Linear Regression | `linreg` | Main | length (14) |
| Midpoint | `midpoint` | Main | length (14) |
| Supertrend | `supertrend` | Trend, Direction, Long, Short | ATR length (10), multiplier (3.0) |
| MACD | `macd` | MACD Line, Histogram, Signal Line | fast (12), slow (26), signal (9) |
| ADX | `adx` | ADX, +DI, -DI | length (14) |
| Parabolic SAR | `psar` | Long, Short, AF, Reversal | AF step (0.02), AF max (0.2) |
| Ichimoku Cloud | `ichimoku` | Conversion, Base, Span A, Span B, Chikou | tenkan (9), kijun (26), senkou (52) |

**Momentum** (separate oscillator pane)
| Indicator | Key | Lines | Parameters |
|---|---|---|---|
| RSI | `rsi` | Main | length (14) |
| Stochastic | `stoch` | %K, %D | K (14), D (3), smooth K (3) |
| Stochastic RSI | `stochrsi` | %K, %D | RSI length (14), stoch length (14), K (3), D (3) |
| CCI | `cci` | Main | length (14) |
| MFI | `mfi` | Main | length (14) |
| Williams %R | `willr` | Main | length (14) |
| ROC | `roc` | Main | length (10) |
| Momentum | `mom` | Main | length (10) |
| TSI | `tsi` | TSI, Signal | fast (13), slow (25), signal (13) |
| Ultimate Oscillator | `uo` | Main | fast (7), medium (14), slow (28) |
| Awesome Oscillator | `ao` | Main | fast (5), slow (34) |
| PPO | `ppo` | PPO, Histogram, Signal | fast (12), slow (26), signal (9) |
| Fisher Transform | `fisher` | Fisher, Signal | length (9) |
| CMO | `cmo` | Main | length (14) |

**Volatility**
| Indicator | Key | Lines | Parameters |
|---|---|---|---|
| Bollinger Bands | `bbands` | Lower, Mid, Upper, Bandwidth, Percent | length (20), std dev (2.0) |
| ATR | `atr` | Main | length (14) |
| Normalized ATR % | `natr` | Main | length (14) |
| Keltner Channels | `kc` | Lower, Mid, Upper | length (20), multiplier (2.0) |
| Donchian Channels | `donchian` | Lower, Mid, Upper | lower length (20), upper length (20) |
| Acceleration Bands | `accbands` | Lower, Mid, Upper | length (20) |
| Mass Index | `massi` | Main | fast (9), slow (25) |

**Volume**
| Indicator | Key | Lines | Parameters |
|---|---|---|---|
| Raw Volume | `volume` | Main | — |
| VMA | `vma` | Main | length (14) |
| OBV | `obv` | Main | — |
| VWAP | `vwap` | Main | — |
| Chaikin Money Flow | `cmf` | Main | length (20) |
| Accumulation/Distribution | `ad` | Main | — |
| AD Oscillator (Chaikin) | `adosc` | Main | fast (3), slow (10) |
| Ease of Movement | `eom` | Main | length (14) |
| Price Volume Trend | `pvt` | Main | — |

**Statistics**
| Indicator | Key | Lines | Parameters |
|---|---|---|---|
| Variance | `variance` | Main | length (14) |
| Standard Deviation | `stdev` | Main | length (14) |
| Z-Score | `zscore` | Main | length (30) |
| Slope | `slope` | Main | length (14) |
| Entropy | `entropy` | Main | length (10) |
| Kurtosis | `kurtosis` | Main | length (30) |
| Skewness | `skew` | Main | length (30) |
| Log Return | `log_return` | Main | length (1) |

#### Price Data Node
- Outputs raw candle values: `open`, `high`, `low`, `close`, or `volume`
- Candle offset: current (live), previous (closed), or 2 candles ago

---

### 3. Condition Node

Compares two inputs and outputs true/false per candle.

**Inputs:**
- **Input A (left)**: connect an indicator or price data node
- **Input B (right)**: connect another indicator/price data node, OR enter a static number

**Operators:**
| Operator | Description |
|---|---|
| `>` | A is greater than B |
| `<` | A is less than B |
| `>=` | A is greater than or equal to B |
| `<=` | A is less than or equal to B |
| `==` | A equals B |
| `!=` | A does not equal B |
| `cross_above` | A crosses above B (was below, now above) |
| `cross_below` | A crosses below B (was above, now below) |
| `increasing` | A is rising (single input, no B needed) |
| `decreasing` | A is falling (single input, no B needed) |
| `increasing_for` | A has been rising for N consecutive bars |
| `decreasing_for` | A has been falling for N consecutive bars |

---

### 4. Logic Gate Node

Combines two condition outputs into a single true/false signal.

| Gate | Description |
|---|---|
| `AND` | Both inputs must be true |
| `OR` | At least one input must be true |
| `XOR` | Exactly one input must be true |
| `NAND` | Not both true (inverse of AND) |
| `NOR` | Neither true (inverse of OR) |
| `NOT` | Inverts a single input (one input only) |

Logic gates can be chained: the output of one gate can feed into another gate, allowing complex multi-condition strategies.

---

### 5. Action Node (Order Routing)

Executes a trade when its logic input resolves to true.

**Settings per action:**
- **Direction**: `BUY` (open long) or `SELL` (close position)
- **Order type**: `Market` or `Limit`
- **Entry size**: percentage of capital or fixed amount
- **Slippage %**: expected slippage for backtesting (default 0.05%)
- **Trading fee %**: expected fee for backtesting (default 0.1%)

**Connection points:**
- **Left (logic input)**: connect from a condition or logic gate — this is the trigger
- **Right (TP output)**: connect to Take Profit nodes
- **Right (SL output)**: connect to Stop Loss nodes

---

### 6. Risk Management Nodes

#### Stop Loss
- **Trigger types**: Percentage (%), Trailing (%), ATR Trailing (multiplier), Fixed Price
- **Close amount**: percentage of position or fixed amount
- Multiple stop losses can be attached to one entry action (tiered exits)

#### Take Profit
- **Trigger types**: Percentage (%), Trailing (%), ATR Trailing (multiplier), Fixed Price
- **Close amount**: percentage of position or fixed amount
- Multiple take profits can be attached to one entry action (scale-out targets)

**Tiered exit example**: TP1 at 2% closing 50%, TP2 at 5% closing 100%. SL at 1.5% closing 100%.

---

## How to Wire a Strategy

### Basic Pattern
```
[Indicator A] ──> [Condition: A > 30] ──> [Action: BUY]
                                                ├──> [Take Profit: 3%]
                                                └──> [Stop Loss: 1.5%]
```

### Multi-Condition Pattern
```
[RSI(14)] ──────────> [Condition: RSI < 30] ──┐
                                               ├──> [Logic: AND] ──> [Action: BUY]
[EMA(20)] ──> [Condition: Price > EMA] ───────┘
[Price Close] ─┘
```

### Full Strategy Pattern
```
ENTRY SIDE:
[Indicator 1] ──> [Condition 1] ──┐
                                   ├──> [Logic: AND] ──> [Action: BUY] ──> [TP1: 2% close 50%]
[Indicator 2] ──> [Condition 2] ──┘                           │         ──> [TP2: 5% close 100%]
                                                              │         ──> [SL: Trailing 1.5%]
EXIT SIDE:
[Indicator 3] ──> [Condition 3] ──> [Action: SELL (100%)]
```

---

## Strategy Design Rules

1. **Every strategy needs at minimum**: Main Configuration + Asset Whitelist + at least one Action node with a connected logic chain
2. **Indicators cannot connect directly to actions** — they must pass through a Condition node first
3. **Conditions need at least Input A** — Input B can be another node or a static number
4. **Logic gates are optional** — a single condition can connect directly to an action
5. **Multiple logic gates can chain together** for complex conditions (e.g. AND -> OR -> action)
6. **You need separate action nodes for entry and exit** — one set to BUY, one set to SELL
7. **Strategy-based exits are optional** — if you only use TP/SL, you don't need a SELL action node
8. **TP and SL nodes connect to the BUY action** (the entry), not to sell actions
9. **Backtest node is optional** — without it, the bot only trades live candles
10. **Exchange Routing node is optional** — without it, the bot runs in forward-test mode (local simulation)
11. **If an API key is selected in the Exchange Routing node**, the exchange and sandbox/live mode are derived automatically from that key. Do not specify the exchange separately.
12. **If no API key is selected**, choose a Data Exchange from the dropdown for market data. The bot will not place real orders.

---

## Example Prompt for AI Strategy Design

> "Design me an ApexAlgo strategy for BTC/USDT on the 15m timeframe. I want to enter long when RSI(14) crosses below 30 AND the price is above the EMA(200). Take profit in two stages: 50% at 2% profit and the rest at 5%. Use a 1.5% trailing stop loss. Max 2 concurrent positions, cooldown of 1 entry per 10 candles. Backtest with 500 candles and $10,000 capital."

The AI should respond with:
- Exact node types to place on the canvas
- Indicator parameters to set
- Condition operators and values
- How to wire/connect the nodes
- Risk management settings
- Configuration values

---

## Tips for Prompting

- **Be specific about timeframe** — it affects indicator behavior significantly
- **Specify entry AND exit logic** — or state that you only want TP/SL exits
- **Mention your risk tolerance** — helps size TP/SL levels appropriately
- **State the market type** — trending, ranging, or volatile markets need different approaches
- **Ask for multiple timeframe confirmation** — e.g. "only enter if the 1h trend is up" (requires multiple bots or manual confirmation, since each bot uses one timeframe)
- **Request the exact wiring** — ask the AI to describe which node connects to which input (left/right, in1/in2, logic/tp/sl)
- **Specify the exchange** — if not using an API key, mention which exchange to pull data from (OKX, Binance, Kraken, etc.)
- **Timeframes are exchange-specific** — Coinbase does NOT support `4h` (use `6h` or `2h`). OKX and Binance support `4h`. Always check the exchange's supported timeframes.

---

## Bot Import File Format (`.apex.json`)

AI assistants can generate `.apex.json` files that users import directly into ApexAlgo. The format must match exactly.

### File Structure

```json
{
  "apex_version": "1.0",
  "exported_at": "2026-04-05T12:00:00Z",
  "bot": {
    "name": "Strategy Name",
    "is_sandbox": true,
    "strategy": "node_evaluator",
    "settings": {
      "symbol": "BTC/USDC",
      "symbols": ["BTC/USDC", "ETH/USDC"],
      "timeframe": "1h",
      "max_positions": 1,
      "max_positions_scope": "per_pair",
      "cooldown_trades": 0,
      "cooldown_candles": 0,
      "max_drawdown": 0,
      "max_order_value": 0,
      "api_execution": false,
      "backtest_on_start": true,
      "backtest_capital": 1000,
      "backtest_lookback": 500,
      "api_key_name": null,
      "data_exchange": "okx",
      "trade_settings": { ... },
      "nodes": { ... },
      "ui_layout": { "nodes": [], "edges": [] },
      "entry_node": "node_id_ref",
      "exit_node": "node_id_ref"
    }
  }
}
```

### Settings Fields

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Primary symbol (first in whitelist) |
| `symbols` | string[] | All trading pairs |
| `timeframe` | string | Candle interval — must be supported by `data_exchange` |
| `max_positions` | int | Max concurrent open positions (>= 1) |
| `max_positions_scope` | `"per_pair"` or `"global"` | Position limit scope |
| `cooldown_trades` | int | Max new entries per cooldown window (0 = off) |
| `cooldown_candles` | int | Cooldown window size in candles |
| `max_drawdown` | number | Auto-stop threshold in % (0 = off) |
| `max_order_value` | number | Max USD per live order (0 = off) |
| `api_execution` | bool | `true` for live/paper via API key |
| `backtest_on_start` | bool | Run backtest when bot starts |
| `backtest_capital` | number | Starting capital for backtest (USD) |
| `backtest_lookback` | int | Number of historical candles to backtest |
| `api_key_name` | string/null | Name of saved API key (null = no key) |
| `data_exchange` | string | Exchange for market data: `okx`, `binance`, `bitvavo`, `coinbase`, `cryptocom`, `kraken`, `kucoin` |

### Exchange Timeframe Compatibility

Not all exchanges support all timeframes. The system validates this on import.

| Exchange | Supported Timeframes |
|----------|---------------------|
| OKX | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`, `1w`, `1M` |
| Binance | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M` |
| Coinbase | `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `6h`, `1d` |
| Kraken | `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w` |
| Bitvavo | `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d` |
| KuCoin | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `1w` |

### Node Definitions (`settings.nodes`)

Each node has a unique ID (key) and a definition object. Nodes reference each other by ID.

**Indicator node:**
```json
"n_rsi": {
  "class": "indicator",
  "method": "rsi",
  "params": { "length": 14 },
  "output_idx": 0
}
```
- `method`: indicator key from the tables above (e.g. `rsi`, `ema`, `bbands`, `supertrend`)
- `params`: parameter object matching the indicator's parameter IDs and values
- `output_idx`: which output line to use (0 = first line). For multi-line indicators like MACD (3 lines) or Bollinger Bands (5 lines), this selects which line feeds into conditions.

**Price data node:**
```json
"n_close": {
  "class": "price_data",
  "type": "close",
  "offset": 0
}
```
- `type`: `open`, `high`, `low`, `close`, or `volume`
- `offset`: `0` = current candle, `-1` = previous candle, etc.

**Condition node:**
```json
"c_uptrend": {
  "class": "condition",
  "left": "n_close",
  "operator": ">",
  "right": "n_ema200"
}
```
- `left`: node ID reference (Input A)
- `operator`: comparison operator (see operator table above)
- `right`: node ID reference (Input B) OR a static number (e.g. `30`, `70`, `-1`)

**Logic gate node:**
```json
"g_entry": {
  "class": "logic",
  "operator": "and",
  "left": "c_uptrend",
  "right": "c_oversold"
}
```
- `operator`: `and`, `or`, `xor`, `nand`, `nor`, `not`
- `left`/`right`: node ID references. For `not`, only `left` is used.
- Logic gates can reference other logic gates for complex chains.

### Trade Settings (`settings.trade_settings`)

```json
"trade_settings": {
  "entry": {
    "order_type": "market",
    "amount_type": "percentage",
    "amount_value": 25,
    "fee": 0.06,
    "slippage": 0.025,
    "take_profits": [
      { "type": "percentage", "value": 4.0, "close_amount_type": "percentage", "close_amount_value": 50 },
      { "type": "percentage", "value": 8.0, "close_amount_type": "percentage", "close_amount_value": 100 }
    ],
    "stop_losses": [
      { "type": "trailing", "value": 2.0, "close_amount_type": "percentage", "close_amount_value": 100 }
    ]
  },
  "exit": {
    "order_type": "market",
    "amount_type": "percentage",
    "amount_value": 100,
    "fee": 0.06,
    "slippage": 0.025
  }
}
```

- `amount_type`: `"percentage"` (% of capital) or `"fixed"` (fixed USD)
- `fee`/`slippage`: percentages as decimals (0.06 = 0.06%)
- TP/SL `type`: `"percentage"`, `"trailing"`, `"atr"`, or `"fixed"`
- TP/SL `close_amount_type`: `"percentage"` or `"fixed"`

### Entry/Exit Node References

```json
"entry_node": "g_entry",
"exit_node": "c_overbought"
```

These point to the final node in the logic chain that triggers the BUY/SELL action. The entry_node feeds into the BUY action, exit_node into the SELL action.

### UI Layout

```json
"ui_layout": { "nodes": [], "edges": [] }
```

Set to empty arrays for programmatic/AI-generated bots. ApexAlgo automatically reconstructs the visual layout when opening the editor. If you export a bot that was built in the visual editor, this field contains the full ReactFlow node positions and edge connections.

### Complete Example: RSI Oversold + EMA Trend Filter

```json
{
  "apex_version": "1.0",
  "exported_at": "2026-04-05T12:00:00Z",
  "bot": {
    "name": "RSI Oversold Trend Entry",
    "is_sandbox": true,
    "strategy": "node_evaluator",
    "settings": {
      "symbol": "BTC/USDC",
      "symbols": ["BTC/USDC", "ETH/USDC"],
      "timeframe": "1h",
      "max_positions": 1,
      "max_positions_scope": "per_pair",
      "cooldown_trades": 1,
      "cooldown_candles": 4,
      "max_drawdown": 10,
      "max_order_value": 0,
      "api_execution": false,
      "backtest_on_start": true,
      "backtest_capital": 1000,
      "backtest_lookback": 5000,
      "api_key_name": null,
      "data_exchange": "coinbase",
      "trade_settings": {
        "entry": {
          "order_type": "market",
          "amount_type": "percentage",
          "amount_value": 25,
          "fee": 0.06,
          "slippage": 0.025,
          "take_profits": [
            { "type": "percentage", "value": 3.0, "close_amount_type": "percentage", "close_amount_value": 50 },
            { "type": "percentage", "value": 6.0, "close_amount_type": "percentage", "close_amount_value": 100 }
          ],
          "stop_losses": [
            { "type": "trailing", "value": 2.0, "close_amount_type": "percentage", "close_amount_value": 100 }
          ]
        },
        "exit": {
          "order_type": "market",
          "amount_type": "percentage",
          "amount_value": 100,
          "fee": 0.06,
          "slippage": 0.025
        }
      },
      "nodes": {
        "n_ema200": { "class": "indicator", "method": "ema", "params": { "length": 200 }, "output_idx": 0 },
        "n_rsi": { "class": "indicator", "method": "rsi", "params": { "length": 14 }, "output_idx": 0 },
        "n_close": { "class": "price_data", "type": "close", "offset": 0 },
        "c_uptrend": { "class": "condition", "left": "n_close", "operator": ">", "right": "n_ema200" },
        "c_oversold": { "class": "condition", "left": "n_rsi", "operator": "<", "right": 30 },
        "g_entry": { "class": "logic", "operator": "and", "left": "c_uptrend", "right": "c_oversold" },
        "c_overbought": { "class": "condition", "left": "n_rsi", "operator": ">", "right": 70 }
      },
      "ui_layout": { "nodes": [], "edges": [] },
      "entry_node": "g_entry",
      "exit_node": "c_overbought"
    }
  }
}
```

**Logic flow:**
- Entry: Price > EMA(200) AND RSI(14) < 30 → BUY 25% of capital → TP1 at 3% (close 50%), TP2 at 6% (close 100%) → SL trailing 2%
- Exit: RSI(14) > 70 → SELL 100% of position
