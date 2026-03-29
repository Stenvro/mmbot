// Indicator scale classification for chart rendering.
// "overlay" = on price chart, "oscillator" = separate pane, "volume" = volume pane
// This is the single source of truth — used by both CustomNodes and ChartEngine.

export const INDICATOR_SCALE_MAP = {
    // Trend & Overlap (overlay)
    SMA: 'overlay', EMA: 'overlay', WMA: 'overlay', DEMA: 'overlay', TEMA: 'overlay',
    KAMA: 'overlay', LINREG: 'overlay', MIDPOINT: 'overlay', SUPERTREND: 'overlay',
    PSAR: 'overlay', ICHIMOKU: 'overlay',
    // Trend (oscillator)
    MACD: 'oscillator', ADX: 'oscillator',
    // Momentum (oscillator)
    RSI: 'oscillator', STOCH: 'oscillator', STOCHRSI: 'oscillator', CCI: 'oscillator',
    MFI: 'oscillator', WILLR: 'oscillator', ROC: 'oscillator', MOM: 'oscillator',
    TSI: 'oscillator', UO: 'oscillator', AO: 'oscillator', PPO: 'oscillator',
    FISHER: 'oscillator', CMO: 'oscillator',
    // Volatility
    BBANDS: 'overlay', KC: 'overlay', DONCHIAN: 'overlay', ACCBANDS: 'overlay',
    ATR: 'oscillator', NATR: 'oscillator', MASSI: 'oscillator',
    // Volume
    VOLUME: 'volume', VMA: 'volume', OBV: 'volume', AD: 'volume', PVT: 'volume',
    VWAP: 'overlay', CMF: 'oscillator', ADOSC: 'oscillator', EOM: 'oscillator',
    // Statistics (oscillator)
    VARIANCE: 'oscillator', STDEV: 'oscillator', ZSCORE: 'oscillator', SLOPE: 'oscillator',
    ENTROPY: 'oscillator', KURTOSIS: 'oscillator', SKEW: 'oscillator', LOG_RETURN: 'oscillator',
};
