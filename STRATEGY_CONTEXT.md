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
- Data interval: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`
- Max positions: number of concurrent open positions allowed
- Position limit scope: `per_pair` (e.g. 1x BTC + 1x ETH) or `global` (total across all pairs)
- Cooldown: max N new entries per X candles (0 = off)
- Max drawdown %: auto-stops bot when cumulative loss exceeds threshold (0 = off)
- Max order value USD: rejects live orders above this dollar amount (0 = off)
- Execution mode: `Paper Trading` (simulated) or `Live Exchange` (real orders)

**Asset Whitelist**
- Comma-separated trading pairs, e.g. `BTC/USDT, ETH/USDT, SOL/USDT`

**Backtest Engine**
- Toggle: run historical backtest on start
- Start capital (USD)
- Lookback period (number of candles)

**Exchange Routing**
- Select API key for paper (sandbox) or live execution
- "No key selected" = forward test (local simulation, no API calls)

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
10. **API key node is optional** — without it, the bot runs in forward-test mode (local simulation)

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
