import React from 'react';
import { Handle, Position } from 'reactflow';

// ==========================================
// 1. INDICATOR DEFINITIONS
// scale: "overlay" = on price chart, "oscillator" = separate pane (0-100 or centered), "volume" = volume pane
// ==========================================
const INDICATOR_GROUPS = {
    "Trend & Overlap": {
        sma: { name: "SMA (Simple Moving Avg)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        ema: { name: "EMA (Exponential Moving Avg)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        wma: { name: "WMA (Weighted Moving Avg)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        dema: { name: "DEMA (Double EMA)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        tema: { name: "TEMA (Triple EMA)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        kama: { name: "KAMA (Kaufman Adaptive MA)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 10}, {id: "fast", label: "Fast SC", default: 2}, {id: "slow", label: "Slow SC", default: 30}] },
        linreg: { name: "Linear Regression", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        midpoint: { name: "Midpoint (HL/2)", scale: "overlay", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        supertrend: { name: "Supertrend", scale: "overlay", lines: ["Trend", "Direction", "Long", "Short"], params: [{id: "length", label: "ATR Length", default: 10}, {id: "multiplier", label: "Multiplier", default: 3.0}] },
        macd: { name: "MACD", scale: "oscillator", lines: ["MACD Line", "Histogram", "Signal Line"], params: [
            {id: "fast", label: "Fast Length", default: 12},
            {id: "slow", label: "Slow Length", default: 26},
            {id: "signal", label: "Signal Length", default: 9}
        ]},
        adx: { name: "ADX (Average Directional Index)", scale: "oscillator", lines: ["ADX", "DMP (+DI)", "DMN (-DI)"], params: [{id: "length", label: "Length", default: 14}] },
        psar: { name: "Parabolic SAR", scale: "overlay", lines: ["Long", "Short", "AF", "Reversal"], params: [{id: "af0", label: "AF Step", default: 0.02}, {id: "af", label: "AF Max", default: 0.2}] },
        ichimoku: { name: "Ichimoku Cloud", scale: "overlay", lines: ["Conversion (Tenkan)", "Base (Kijun)", "Span A", "Span B", "Chikou"], params: [{id: "tenkan", label: "Tenkan", default: 9}, {id: "kijun", label: "Kijun", default: 26}, {id: "senkou", label: "Senkou", default: 52}] },
    },
    "Momentum": {
        rsi: { name: "RSI (Relative Strength Index)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        stoch: { name: "Stochastic Oscillator", scale: "oscillator", lines: ["%K", "%D"], params: [
            {id: "k", label: "%K Length", default: 14},
            {id: "d", label: "%D Length", default: 3},
            {id: "smooth_k", label: "Smooth %K", default: 3}
        ]},
        stochrsi: { name: "Stochastic RSI", scale: "oscillator", lines: ["%K", "%D"], params: [
            {id: "length", label: "RSI Length", default: 14},
            {id: "rsi_length", label: "Stoch Length", default: 14},
            {id: "k", label: "%K", default: 3},
            {id: "d", label: "%D", default: 3}
        ]},
        cci: { name: "CCI (Commodity Channel Index)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        mfi: { name: "MFI (Money Flow Index)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        willr: { name: "Williams %R", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        roc: { name: "ROC (Rate of Change)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 10}] },
        mom: { name: "Momentum", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 10}] },
        tsi: { name: "TSI (True Strength Index)", scale: "oscillator", lines: ["TSI", "Signal"], params: [{id: "fast", label: "Fast", default: 13}, {id: "slow", label: "Slow", default: 25}, {id: "signal", label: "Signal", default: 13}] },
        uo: { name: "Ultimate Oscillator", scale: "oscillator", lines: ["Main"], params: [{id: "fast", label: "Fast", default: 7}, {id: "medium", label: "Medium", default: 14}, {id: "slow", label: "Slow", default: 28}] },
        ao: { name: "Awesome Oscillator", scale: "oscillator", lines: ["Main"], params: [{id: "fast", label: "Fast", default: 5}, {id: "slow", label: "Slow", default: 34}] },
        ppo: { name: "PPO (Percentage Price Osc)", scale: "oscillator", lines: ["PPO", "Histogram", "Signal"], params: [{id: "fast", label: "Fast", default: 12}, {id: "slow", label: "Slow", default: 26}, {id: "signal", label: "Signal", default: 9}] },
        fisher: { name: "Fisher Transform", scale: "oscillator", lines: ["Fisher", "Signal"], params: [{id: "length", label: "Length", default: 9}] },
        cmo: { name: "CMO (Chande Momentum)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
    },
    "Volatility": {
        bbands: { name: "Bollinger Bands", scale: "overlay", lines: ["Lower Band", "Mid Band", "Upper Band", "Bandwidth", "Percent"], params: [
            {id: "length", label: "Length", default: 20},
            {id: "std", label: "Std Dev", default: 2.0}
        ]},
        atr: { name: "ATR (Average True Range)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        natr: { name: "NATR (Normalized ATR %)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        kc: { name: "Keltner Channels", scale: "overlay", lines: ["Lower", "Mid", "Upper"], params: [
            {id: "length", label: "Length", default: 20},
            {id: "scalar", label: "Multiplier", default: 2.0}
        ]},
        donchian: { name: "Donchian Channels", scale: "overlay", lines: ["Lower", "Mid", "Upper"], params: [
            {id: "lower_length", label: "Lower Length", default: 20},
            {id: "upper_length", label: "Upper Length", default: 20}
        ]},
        accbands: { name: "Acceleration Bands", scale: "overlay", lines: ["Lower", "Mid", "Upper"], params: [{id: "length", label: "Length", default: 20}] },
        massi: { name: "Mass Index", scale: "oscillator", lines: ["Main"], params: [{id: "fast", label: "Fast", default: 9}, {id: "slow", label: "Slow", default: 25}] },
    },
    "Volume": {
        volume: { name: "Raw Volume", scale: "volume", lines: ["Main"], params: [] },
        vma: { name: "VMA (Volume Moving Avg)", scale: "volume", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        obv: { name: "On-Balance Volume (OBV)", scale: "volume", lines: ["Main"], params: [] },
        vwap: { name: "VWAP", scale: "overlay", lines: ["Main"], params: [] },
        cmf: { name: "Chaikin Money Flow", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 20}] },
        ad: { name: "Accumulation/Distribution", scale: "volume", lines: ["Main"], params: [] },
        adosc: { name: "AD Oscillator (Chaikin)", scale: "oscillator", lines: ["Main"], params: [{id: "fast", label: "Fast", default: 3}, {id: "slow", label: "Slow", default: 10}] },
        eom: { name: "Ease of Movement", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        pvt: { name: "Price Volume Trend", scale: "volume", lines: ["Main"], params: [] },
    },
    "Statistics": {
        variance: { name: "Variance", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        stdev: { name: "Standard Deviation", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        zscore: { name: "Z-Score", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 30}] },
        slope: { name: "Slope (Linear Reg)", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 14}] },
        entropy: { name: "Entropy", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 10}] },
        kurtosis: { name: "Kurtosis", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 30}] },
        skew: { name: "Skewness", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 30}] },
        log_return: { name: "Log Return", scale: "oscillator", lines: ["Main"], params: [{id: "length", label: "Length", default: 1}] },
    }
};

const FLAT_INDICATORS = {};
Object.values(INDICATOR_GROUPS).forEach(group => {
    Object.assign(FLAT_INDICATORS, group);
});

// ==========================================
// CONFIGURATION NODES
// ==========================================

export const BotConfigNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#8b5cf6] rounded-xl shadow-lg min-w-[280px]">
    <div className="bg-[#8b5cf6]/10 px-3 py-2 border-b border-[#8b5cf6]/30 flex justify-between items-center">
      <span className="font-bold text-[#8b5cf6] text-[11px] uppercase tracking-wider">MAIN CONFIGURATION</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Algorithm Name</label>
        <input 
          type="text" 
          className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none"
          value={data.botName !== undefined ? data.botName : "Apex Strategy Alpha"}
          onChange={(e) => data.onChange(id, 'botName', e.target.value)}
        />
      </div>
      <div className="flex space-x-2">
        <div className="w-1/2">
            <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Data Interval</label>
            <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.timeframe !== undefined ? data.timeframe : "1m"} onChange={(e) => data.onChange(id, 'timeframe', e.target.value)}>
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
            </select>
        </div>
        <div className="w-1/2">
            <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Max Positions</label>
            <input type="number" className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.maxPositions !== undefined ? data.maxPositions : 1} onChange={(e) => data.onChange(id, 'maxPositions', e.target.value === "" ? "" : parseInt(e.target.value))} />
        </div>
      </div>
      <div className="pt-2 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Position Limit Scope</label>
        <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.maxPositionsScope !== undefined ? data.maxPositionsScope : "per_pair"} onChange={(e) => data.onChange(id, 'maxPositionsScope', e.target.value)}>
          <option value="per_pair">Per Pair (e.g. 1x BTC, 1x ETH)</option>
          <option value="global">Global (Total across wallet)</option>
        </select>
      </div>

      <div className="pt-2 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Max New Entries per X Candles (0 = Off)</label>
        <div className="flex space-x-2 items-center">
            <input type="number" placeholder="Max Entries" title="Max Entries" className="w-1/2 bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.cooldownTrades !== undefined ? data.cooldownTrades : 0} onChange={(e) => data.onChange(id, 'cooldownTrades', e.target.value === "" ? "" : parseInt(e.target.value))} />
            <span className="text-[9px] text-[#848e9c] font-bold uppercase">PER</span>
            <input type="number" placeholder="Candles" title="Amount of Candles" className="w-1/2 bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.cooldownCandles !== undefined ? data.cooldownCandles : 0} onChange={(e) => data.onChange(id, 'cooldownCandles', e.target.value === "" ? "" : parseInt(e.target.value))} />
        </div>
      </div>
      <div className="pt-2 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Max Drawdown % (0 = Off)</label>
        <input type="number" step="0.1" className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.maxDrawdown !== undefined ? data.maxDrawdown : 0} onChange={(e) => data.onChange(id, 'maxDrawdown', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        <span className="text-[9px] text-[#848e9c] block mt-1">Auto-stops bot if cumulative drawdown exceeds this %</span>
      </div>
      <div className="pt-2 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Max Order Value USD (0 = Off)</label>
        <input type="number" step="1" className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.maxOrderValue !== undefined ? data.maxOrderValue : 0} onChange={(e) => data.onChange(id, 'maxOrderValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        <span className="text-[9px] text-[#848e9c] block mt-1">Safety guard: rejects live orders exceeding this USD value</span>
      </div>
      <div className="pt-2 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Live Execution Mode</label>
        <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.executionMode !== undefined ? data.executionMode : "paper"} onChange={(e) => data.onChange(id, 'executionMode', e.target.value)}>
          <option value="paper">Paper Trading (Simulated Execution)</option>
          <option value="exchange">Live Exchange (Requires API Key)</option>
        </select>
      </div>
    </div>
  </div>
);

export const WhitelistNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#d946ef] rounded-xl shadow-lg min-w-[260px]">
    <div className="bg-[#d946ef]/10 px-3 py-2 border-b border-[#d946ef]/30 flex justify-between items-center">
      <span className="font-bold text-[#d946ef] text-[11px] uppercase tracking-wider">ASSET WHITELIST</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b">
      <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Tradeable Pairs (Comma Separated)</label>
      <textarea 
        className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#d946ef] outline-none min-h-[60px] resize-none font-mono"
        placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
        value={data.pairs !== undefined ? data.pairs : "BTC/USDT"}
        onChange={(e) => data.onChange(id, 'pairs', e.target.value)}
      />
    </div>
  </div>
);

export const BacktestNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#fcd535] rounded-xl shadow-lg min-w-[280px]">
    <div className="bg-[#fcd535]/10 px-3 py-2 border-b border-[#fcd535]/30 flex justify-between items-center">
      <span className="font-bold text-[#fcd535] text-[11px] uppercase tracking-wider">BACKTEST ENGINE</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b space-y-4">
      <label className="flex items-center cursor-pointer nodrag">
        <input type="checkbox" className="form-checkbox h-4 w-4 text-[#fcd535] rounded border-[#202532] bg-[#12151c] focus:ring-0 focus:ring-offset-0" checked={data.runOnStart !== false} onChange={(e) => data.onChange(id, 'runOnStart', e.target.checked)} />
        <span className="ml-3 text-xs text-[#eaecef] font-medium">Run historical backtest on start</span>
      </label>
      <div className="flex space-x-2 pt-2 border-t border-[#202532]">
        <div className="w-1/2">
            <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Start Capital</label>
            <input type="number" className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-mono text-center" value={data.capital !== undefined ? data.capital : 1000} onChange={(e) => data.onChange(id, 'capital', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        </div>
        <div className="w-1/2">
            <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Candles (Lookback)</label>
            <input type="number" className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-mono text-center" value={data.lookback !== undefined ? data.lookback : 150} onChange={(e) => data.onChange(id, 'lookback', e.target.value === "" ? "" : parseInt(e.target.value))} />
        </div>
      </div>
    </div>
  </div>
);

export const ApiKeyNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#0ea5e9] rounded-xl shadow-lg min-w-[260px]">
    <div className="bg-[#0ea5e9]/10 px-3 py-2 border-b border-[#0ea5e9]/30 flex justify-between items-center">
      <span className="font-bold text-[#0ea5e9] text-[11px] uppercase tracking-wider">EXCHANGE ROUTING</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b">
      <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Select API Credentials</label>
      <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#0ea5e9] outline-none" value={data.apiKeyName !== undefined ? data.apiKeyName : ""} onChange={(e) => data.onChange(id, 'apiKeyName', e.target.value)}>
        <option value="">No key selected (Local Engine)</option>
        {data.availableKeys?.map(k => (
          <option key={k.name} value={k.name}>{k.name} ({k.is_sandbox ? 'Sandbox' : 'Live'})</option>
        ))}
      </select>
    </div>
  </div>
);

// ==========================================
// 2. LOGIC AND DATA NODES
// ==========================================

export const IndicatorNode = ({ id, data }) => {
  const currentIndKey = data.indicator !== undefined ? data.indicator : "rsi";
  const indDef = FLAT_INDICATORS[currentIndKey] || FLAT_INDICATORS.rsi;
  const showDropdown = indDef.lines.length > 1;

  const currentParams = data.params || {};

  const handleParamChange = (paramId, value) => {
      const parsed = value === "" ? "" : parseFloat(value);
      const newParams = { ...currentParams, [paramId]: parsed };
      data.onChange(id, 'params', newParams);
  };

  return (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#202532] rounded-xl shadow-lg min-w-[250px] hover:border-[#fcd535] transition-all duration-200 relative">
    <div className="bg-[#202532] px-3 py-2 flex justify-between items-center">
      <span className="font-bold text-[#eaecef] text-[11px] uppercase tracking-wider">TECHNICAL INDICATOR</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 space-y-3 bg-[#080a0f]/80 rounded-b">
      
      <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-[11px] rounded p-2 nodrag focus:border-[#fcd535] outline-none font-semibold" value={currentIndKey} onChange={(e) => data.onChange(id, 'indicator', e.target.value)}>
          {Object.entries(INDICATOR_GROUPS).map(([groupName, indicators]) => (
              <optgroup key={groupName} label={groupName}>
                  {Object.keys(indicators).map(key => (
                      <option key={key} value={key}>{indicators[key].name}</option>
                  ))}
              </optgroup>
          ))}
      </select>

      {indDef.params && indDef.params.length > 0 && (
          <div className="border-t border-[#202532] pt-3 space-y-2">
              {indDef.params.map(p => (
                  <div key={p.id} className="flex items-center space-x-2">
                    <span className="text-[10px] text-[#848e9c] font-bold uppercase flex-1">{p.label}</span>
                    <input 
                        type="number" 
                        step="any"
                        className="w-16 bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-1 nodrag text-right font-mono focus:border-[#fcd535] outline-none" 
                        value={currentParams[p.id] !== undefined ? currentParams[p.id] : p.default} 
                        onChange={(e) => handleParamChange(p.id, e.target.value)} 
                    />
                  </div>
              ))}
          </div>
      )}

      {showDropdown && (
        <div className="border-t border-[#202532] pt-3 mt-3 animate-fade-in">
          <label className="text-[9px] text-[#0ea5e9] font-bold uppercase mb-1.5 block">Signal Output (Multi-Line)</label>
          <select className="w-full bg-[#12151c] border border-[#0ea5e9]/50 text-[#eaecef] text-[10px] rounded p-1.5 focus:border-[#0ea5e9] outline-none" value={data.outputIdx !== undefined ? data.outputIdx : 0} onChange={(e) => data.onChange(id, 'outputIdx', parseInt(e.target.value))}>
            {indDef.lines.map((lineName, idx) => (
                <option key={idx} value={idx}>{lineName} (Idx: {idx})</option>
            ))}
          </select>
        </div>
      )}

    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-8 h-8 bg-[#fcd535] border-[4px] border-[#12151c] -right-[16px]" />
  </div>
  );
};

export const PriceDataNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#202532] rounded-xl shadow-lg min-w-[220px] hover:border-[#fcd535] transition-all duration-200 relative">
    <div className="bg-[#202532]/30 px-3 py-2 border-b border-[#202532]/50 flex justify-between items-center">
      <span className="font-bold text-[#eaecef] text-[11px] uppercase tracking-wider">PRICE DATA</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 space-y-3 bg-[#080a0f]/80 rounded-b">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Price Type</label>
        <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-semibold" value={data.priceType !== undefined ? data.priceType : "close"} onChange={(e) => data.onChange(id, 'priceType', e.target.value)}>
          <option value="open">Open</option>
          <option value="high">High</option>
          <option value="low">Low</option>
          <option value="close">Close</option>
          <option value="volume">Volume</option>
        </select>
      </div>
      <div className="border-t border-[#202532] pt-3">
         <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Candle Offset</label>
         <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-semibold" value={data.offset !== undefined ? data.offset : 0} onChange={(e) => data.onChange(id, 'offset', parseInt(e.target.value))}>
            <option value={0}>Current (Live)</option>
            <option value={1}>Previous (Closed)</option>
            <option value={2}>2 Candles Ago</option>
         </select>
      </div>
    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-8 h-8 bg-[#fcd535] border-[4px] border-[#12151c] -right-[16px]" />
  </div>
);

export const ConditionNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#202532] rounded-xl shadow-lg min-w-[260px] relative">
    <Handle type="target" position={Position.Left} id="left" style={{ top: '38%' }} className="w-8 h-8 bg-[#0ea5e9] border-[4px] border-[#12151c] -left-[16px]" />
    <Handle type="target" position={Position.Left} id="right" style={{ top: '80%' }} className="w-8 h-8 bg-[#d946ef] border-[4px] border-[#12151c] -left-[16px]" />
    
    <div className="bg-[#202532]/30 px-3 py-2 border-b border-[#202532]/50 flex justify-between items-center">
      <span className="font-bold text-[#eaecef] text-[11px] uppercase tracking-wider">DATA CONDITION</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    
    <div className="p-4 bg-[#080a0f]/80 rounded-b flex flex-col space-y-4">
      <div className="flex items-center">
         <span className="text-[10px] text-[#0ea5e9] font-bold uppercase ml-1">Input A (Signal)</span>
      </div>
      <div className="flex justify-center border-y border-[#202532] py-2">
        <select className="w-full bg-[#12151c] border border-[#202532] text-[#fcd535] text-xs rounded p-2 nodrag font-bold focus:border-[#fcd535] outline-none text-center" value={data.operator !== undefined ? data.operator : ">"} onChange={(e) => data.onChange(id, 'operator', e.target.value)}>
          <option value=">">IS GREATER THAN (&gt;)</option>
          <option value="<">IS LESS THAN (&lt;)</option>
          <option value="==">IS EQUAL TO (==)</option>
          <option value="!=">IS NOT EQUAL (!=)</option>
          <option value=">=">GREATER OR EQUAL (&gt;=)</option>
          <option value="<=">LESS OR EQUAL (&lt;=)</option>
          <option value="cross_above">CROSSES ABOVE</option>
          <option value="cross_below">CROSSES BELOW</option>
          <option value="increasing">IS INCREASING (Up)</option>
          <option value="decreasing">IS DECREASING (Down)</option>
          <option value="increasing_for">INCREASING FOR N BARS</option>
          <option value="decreasing_for">DECREASING FOR N BARS</option>
        </select>
      </div>
      <div className={`flex items-center justify-between transition-opacity ${['increasing', 'decreasing'].includes(data.operator) ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
         <span className="text-[10px] text-[#d946ef] font-bold uppercase ml-1">Input B</span>
         <div className="flex items-center space-x-2">
           <span className="text-[9px] text-[#848e9c] font-bold">OR</span>
           <input type="number" placeholder="Static Value" title="Connect a line to Input B or type a static number here." className="w-20 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-1.5 nodrag font-mono focus:border-[#fcd535] outline-none text-center" value={data.rightValue !== undefined ? data.rightValue : ""} onChange={(e) => data.onChange(id, 'rightValue', e.target.value === "" ? "" : parseFloat(e.target.value))} disabled={['increasing', 'decreasing'].includes(data.operator)} />
         </div>
      </div>
    </div>
    
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-8 h-8 bg-[#fcd535] border-[4px] border-[#12151c] -right-[16px]" />
  </div>
);

export const LogicNode = ({ id, data }) => {
  const isSingleInput = data.logicType === "not";
  return (
    <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#2ea043] rounded-xl shadow-lg min-w-[200px] relative">
      <Handle type="target" position={Position.Left} id="in1" style={{ top: isSingleInput ? '50%' : '35%' }} className="w-8 h-8 bg-[#848e9c] border-[4px] border-[#12151c] -left-[16px]" />
      {!isSingleInput && (
        <Handle type="target" position={Position.Left} id="in2" style={{ top: '65%' }} className="w-8 h-8 bg-[#848e9c] border-[4px] border-[#12151c] -left-[16px]" />
      )}
      <div className="bg-[#2ea043]/10 px-3 py-2 border-b border-[#2ea043]/30 flex justify-between items-center">
        <span className="font-bold text-[#2ea043] text-[11px] uppercase tracking-wider">LOGIC GATE</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
      <div className="p-4 bg-[#080a0f]/80 rounded-b">
        <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag font-bold text-center focus:border-[#2ea043] outline-none" value={data.logicType !== undefined ? data.logicType : "and"} onChange={(e) => data.onChange(id, 'logicType', e.target.value)}>
          <option value="and">AND (Require Both)</option>
          <option value="or">OR (Require Either)</option>
          <option value="xor">XOR (Exclusive OR)</option>
          <option value="nand">NAND (Not AND)</option>
          <option value="nor">NOR (Not OR)</option>
          <option value="not">NOT (Invert Input)</option>
        </select>
      </div>
      <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-8 h-8 bg-[#fcd535] border-[4px] border-[#12151c] -right-[16px]" />
    </div>
  );
};

// ==========================================
// 3. RISK MANAGEMENT NODES
// ==========================================

export const StopLossNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#f6465d] rounded-xl shadow-lg min-w-[280px] relative">
    
    <Handle type="target" position={Position.Left} style={{ top: '50%' }} className="w-8 h-8 bg-[#f6465d] border-[4px] border-[#12151c] -left-[16px]" />
    
    <div className="bg-[#f6465d]/10 px-3 py-2 border-b border-[#f6465d]/30 flex justify-between items-center">
      <span className="font-bold text-[#f6465d] text-[11px] uppercase tracking-wider">STOP LOSS (RISK)</span>
      <div className="flex space-x-3 items-center">
        <span className="text-[9px] text-[#848e9c] font-mono">&larr; IN</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Trigger Level (Loss)</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-[10px] font-bold rounded p-2 nodrag focus:border-[#f6465d] outline-none" value={data.triggerType !== undefined ? data.triggerType : "percentage"} onChange={(e) => data.onChange(id, 'triggerType', e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="trailing">Trailing (%)</option>
                <option value="atr">ATR Trailing (x)</option>
                <option value="fixed">Fixed Price</option>
            </select>
            <input type="number" placeholder={data.triggerType === 'atr' ? "Multiplier (e.g. 2.5)" : "Value"} className="w-1/2 bg-[#12151c] border border-[#202532] text-[#f6465d] text-xs rounded p-2 nodrag font-mono focus:border-[#f6465d] outline-none text-center" value={data.triggerValue !== undefined ? data.triggerValue : ""} onChange={(e) => data.onChange(id, 'triggerValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        </div>
      </div>
      <div className="pt-3 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Amount to Close</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#f6465d] outline-none" value={data.closeType !== undefined ? data.closeType : "percentage"} onChange={(e) => data.onChange(id, 'closeType', e.target.value)}>
                <option value="percentage">% of Position</option>
                <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="100" className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag font-mono focus:border-[#f6465d] outline-none text-center" value={data.closeValue !== undefined ? data.closeValue : 100} onChange={(e) => data.onChange(id, 'closeValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        </div>
      </div>
    </div>
  </div>
);

export const TakeProfitNode = ({ id, data }) => (
  <div className="bg-[#12151c]/90 backdrop-blur-xl border border-[#2ebd85] rounded-xl shadow-lg min-w-[280px] relative">
    
    <Handle type="target" position={Position.Left} style={{ top: '50%' }} className="w-8 h-8 bg-[#2ebd85] border-[4px] border-[#12151c] -left-[16px]" />

    <div className="bg-[#2ebd85]/10 px-3 py-2 border-b border-[#2ebd85]/30 flex justify-between items-center">
      <span className="font-bold text-[#2ebd85] text-[11px] uppercase tracking-wider">TAKE PROFIT (TARGET)</span>
      <div className="flex space-x-3 items-center">
        <span className="text-[9px] text-[#848e9c] font-mono">&larr; IN</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
    </div>
    <div className="p-4 bg-[#080a0f]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Trigger Level (Profit)</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-[10px] font-bold rounded p-2 nodrag focus:border-[#2ebd85] outline-none" value={data.triggerType !== undefined ? data.triggerType : "percentage"} onChange={(e) => data.onChange(id, 'triggerType', e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="trailing">Trailing (%)</option>
                <option value="atr">ATR Trailing (x)</option>
                <option value="fixed">Fixed Price</option>
            </select>
            <input type="number" placeholder={data.triggerType === 'atr' ? "Multiplier (e.g. 2.5)" : "Value"} className="w-1/2 bg-[#12151c] border border-[#202532] text-[#2ebd85] text-xs rounded p-2 nodrag font-mono focus:border-[#2ebd85] outline-none text-center" value={data.triggerValue !== undefined ? data.triggerValue : ""} onChange={(e) => data.onChange(id, 'triggerValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        </div>
      </div>
      <div className="pt-3 border-t border-[#202532]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Amount to Close</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#2ebd85] outline-none" value={data.closeType !== undefined ? data.closeType : "percentage"} onChange={(e) => data.onChange(id, 'closeType', e.target.value)}>
                <option value="percentage">% of Position</option>
                <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="100" className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag font-mono focus:border-[#2ebd85] outline-none text-center" value={data.closeValue !== undefined ? data.closeValue : 100} onChange={(e) => data.onChange(id, 'closeValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
        </div>
      </div>
    </div>
  </div>
);

// ==========================================
// 4. ACTION NODE
// ==========================================

export const ActionNode = ({ id, data }) => {
  const isBuy = data.actionType === 'buy';
  const color = isBuy ? '#2ebd85' : '#f6465d';
  
  return (
    <div className={`bg-[#12151c]/90 backdrop-blur-xl border-2 rounded-xl shadow-lg min-w-[320px]`} style={{ borderColor: color }}>
      
      <div className="px-3 py-2 font-bold text-[11px] uppercase tracking-wider border-b flex justify-between items-center" style={{ backgroundColor: `${color}10`, color: color, borderColor: `${color}30` }}>
        <span>{isBuy ? 'ORDER ROUTING: LONG ENTRY' : 'ORDER ROUTING: CLOSE POSITION'}</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
      
      <div className="p-4 bg-[#080a0f]/80 rounded-b space-y-4">
         
         <div className="relative border border-[#202532] rounded p-3">
             <Handle type="target" position={Position.Left} id="logic" className="w-8 h-8 bg-[#848e9c] border-[4px] border-[#12151c] -left-[16px]" style={{ top: '50%' }} />
             <span className="absolute -left-14 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#848e9c] -rotate-90">LOGIC</span>
             
             <div className="flex space-x-2">
                <div className="w-1/2">
                    <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Direction</label>
                    <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag font-bold outline-none" style={{ color: color }} value={data.actionType !== undefined ? data.actionType : "buy"} onChange={(e) => data.onChange(id, 'actionType', e.target.value)}>
                        <option value="buy">BUY (Open)</option>
                        <option value="sell">SELL (Close)</option>
                    </select>
                </div>
                <div className="w-1/2">
                    <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Order Type</label>
                    <select className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag outline-none focus:border-[#0ea5e9]" value={data.orderType !== undefined ? data.orderType : "market"} onChange={(e) => data.onChange(id, 'orderType', e.target.value)}>
                        <option value="market">Market</option>
                        <option value="limit">Limit</option>
                    </select>
                </div>
             </div>
         </div>

         <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Slippage (%)</label>
                <input type="number" step="0.01" className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag outline-none" value={data.slippage !== undefined ? data.slippage : 0.05} onChange={(e) => data.onChange(id, 'slippage', e.target.value === "" ? "" : parseFloat(e.target.value))} />
            </div>
            <div>
                <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Trading Fee (%)</label>
                <input type="number" step="0.01" className="w-full bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag outline-none" value={data.fee !== undefined ? data.fee : 0.1} onChange={(e) => data.onChange(id, 'fee', e.target.value === "" ? "" : parseFloat(e.target.value))} />
            </div>
         </div>

         <div className="border border-[#202532] rounded p-3">
             <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">{isBuy ? 'Entry Size' : 'Amount to Close'}</label>
             <div className="flex space-x-2">
                 <select className="w-1/2 bg-[#12151c] border border-[#202532] text-[#eaecef] text-xs rounded p-2 nodrag outline-none focus:border-[#0ea5e9]" value={data.amountType !== undefined ? data.amountType : "percentage"} onChange={(e) => data.onChange(id, 'amountType', e.target.value)}>
                     <option value="percentage">{isBuy ? '% of Capital' : '% of Position'}</option>
                     <option value="fixed">Fixed Amount</option>
                 </select>
                 <input type="number" placeholder="100" className="w-1/2 bg-[#12151c] border border-[#202532] text-[#0ea5e9] text-xs rounded p-2 nodrag text-center font-mono focus:border-[#0ea5e9] outline-none" value={data.amountValue !== undefined ? data.amountValue : 100} onChange={(e) => data.onChange(id, 'amountValue', e.target.value === "" ? "" : parseFloat(e.target.value))} />
             </div>
         </div>

         {isBuy && (
             <div className="relative border border-[#202532] rounded p-3 pt-4 pb-4 mt-2">
                 
                 <Handle type="source" position={Position.Right} id="tp" className="w-8 h-8 bg-[#2ebd85] border-[4px] border-[#12151c] -right-[16px]" style={{ top: '30%' }} />
                 <span className="absolute right-[8px] top-[30%] -translate-y-1/2 text-[9px] font-bold text-[#2ebd85] translate-x-full">TP</span>
                 
                 <Handle type="source" position={Position.Right} id="sl" className="w-8 h-8 bg-[#f6465d] border-[4px] border-[#12151c] -right-[16px]" style={{ top: '70%' }} />
                 <span className="absolute right-[8px] top-[70%] -translate-y-1/2 text-[9px] font-bold text-[#f6465d] translate-x-full">SL</span>
                 
                 <div className="text-[9px] text-[#848e9c] italic text-center leading-relaxed">
                     Connect Take Profit or Stop Loss blocks to the <span className="text-[#2ebd85] font-bold">TP</span> and <span className="text-[#f6465d] font-bold">SL</span> ports on the right.
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};