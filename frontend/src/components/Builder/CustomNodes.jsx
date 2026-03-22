import React from 'react';
import { Handle, Position } from 'reactflow';

// ==========================================
// 1. CONFIGURATIE BLOKKEN
// ==========================================

export const BotConfigNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#8b5cf6] rounded shadow-lg min-w-[280px]">
    <div className="bg-[#8b5cf6]/10 px-3 py-2 border-b border-[#8b5cf6]/30 flex justify-between items-center">
      <span className="font-bold text-[#8b5cf6] text-[11px] uppercase tracking-wider">MAIN CONFIGURATION</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Algorithm Name</label>
        <input 
          type="text" 
          className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none"
          value={data.botName || "Apex Strategy Alpha"}
          onChange={(e) => data.onChange(id, 'botName', e.target.value)}
        />
      </div>
      <div className="flex space-x-2">
        <div className="w-1/2">
            <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Data Interval</label>
            <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.timeframe || "1m"} onChange={(e) => data.onChange(id, 'timeframe', e.target.value)}>
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
            <input type="number" className="w-full bg-[#181a20] border border-[#2b3139] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none font-mono text-center" value={data.maxPositions || 1} onChange={(e) => data.onChange(id, 'maxPositions', parseInt(e.target.value))} />
        </div>
      </div>
      <div className="pt-2 border-t border-[#2b3139]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Position Limit Scope</label>
        <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.maxPositionsScope || "per_pair"} onChange={(e) => data.onChange(id, 'maxPositionsScope', e.target.value)}>
          <option value="per_pair">Per Pair (e.g. 1x BTC, 1x ETH)</option>
          <option value="global">Global (Total across wallet)</option>
        </select>
      </div>
      <div className="pt-2 border-t border-[#2b3139]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Live Execution Mode</label>
        <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#8b5cf6] outline-none" value={data.executionMode || "forward_test"} onChange={(e) => data.onChange(id, 'executionMode', e.target.value)}>
          <option value="forward_test">Forward Testing (Local DB Only)</option>
          <option value="exchange">Exchange Execution (Requires API Key)</option>
        </select>
      </div>
    </div>
  </div>
);

export const WhitelistNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#d946ef] rounded shadow-lg min-w-[260px]">
    <div className="bg-[#d946ef]/10 px-3 py-2 border-b border-[#d946ef]/30 flex justify-between items-center">
      <span className="font-bold text-[#d946ef] text-[11px] uppercase tracking-wider">ASSET WHITELIST</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b">
      <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Tradeable Pairs (Comma Separated)</label>
      <textarea 
        className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#d946ef] outline-none min-h-[60px] resize-none font-mono"
        placeholder="BTC/USDC, ETH/USDC, SOL/USDC"
        value={data.pairs || "BTC/USDC"}
        onChange={(e) => data.onChange(id, 'pairs', e.target.value)}
      />
    </div>
  </div>
);

export const BacktestNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#fcd535] rounded shadow-lg min-w-[260px]">
    <div className="bg-[#fcd535]/10 px-3 py-2 border-b border-[#fcd535]/30 flex justify-between items-center">
      <span className="font-bold text-[#fcd535] text-[11px] uppercase tracking-wider">BACKTEST ENGINE</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b space-y-4">
      <label className="flex items-center cursor-pointer nodrag">
        <input type="checkbox" className="form-checkbox h-4 w-4 text-[#fcd535] rounded border-[#2b3139] bg-[#181a20] focus:ring-0 focus:ring-offset-0" checked={data.runOnStart !== false} onChange={(e) => data.onChange(id, 'runOnStart', e.target.checked)} />
        <span className="ml-3 text-xs text-[#eaecef] font-medium">Run historical backtest on start</span>
      </label>
      <div className="pt-2 border-t border-[#2b3139]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Starting Capital (Base Currency)</label>
        <input type="number" className="w-full bg-[#181a20] border border-[#2b3139] text-[#fcd535] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-mono" value={data.capital || 1000} onChange={(e) => data.onChange(id, 'capital', parseFloat(e.target.value))} />
      </div>
    </div>
  </div>
);

export const ApiKeyNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#0ea5e9] rounded shadow-lg min-w-[260px]">
    <div className="bg-[#0ea5e9]/10 px-3 py-2 border-b border-[#0ea5e9]/30 flex justify-between items-center">
      <span className="font-bold text-[#0ea5e9] text-[11px] uppercase tracking-wider">EXCHANGE ROUTING</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b">
      <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Select API Credentials</label>
      <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#0ea5e9] outline-none" value={data.apiKeyName || ""} onChange={(e) => data.onChange(id, 'apiKeyName', e.target.value)}>
        <option value="" disabled>No key selected (Forward Testing)</option>
        {data.availableKeys?.map(k => (
          <option key={k.name} value={k.name}>{k.name} ({k.is_sandbox ? 'Sandbox' : 'Live'})</option>
        ))}
      </select>
    </div>
  </div>
);

// ==========================================
// 2. LOGICA & DATA BLOKKEN
// ==========================================

export const IndicatorNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-lg min-w-[220px] hover:border-[#fcd535] transition-colors relative">
    <div className="bg-[#2b3139] px-3 py-2 flex justify-between items-center">
      <span className="font-bold text-[#eaecef] text-[11px] uppercase tracking-wider">TECHNICAL INDICATOR</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 space-y-3 bg-[#0b0e11]/80 rounded-b">
      <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#fcd535] outline-none font-semibold" value={data.indicator || "rsi"} onChange={(e) => data.onChange(id, 'indicator', e.target.value)}>
        <optgroup label="Oscillators">
          <option value="rsi">RSI (Relative Strength)</option>
          <option value="macd">MACD</option>
          <option value="stoch">Stochastic</option>
          <option value="cci">CCI</option>
        </optgroup>
        <optgroup label="Moving Averages">
          <option value="sma">SMA (Simple)</option>
          <option value="ema">EMA (Exponential)</option>
        </optgroup>
        <optgroup label="Volatility">
          <option value="bbands">Bollinger Bands</option>
          <option value="atr">ATR</option>
        </optgroup>
      </select>
      <div className="flex items-center space-x-2 border-t border-[#2b3139] pt-3">
        <span className="text-[10px] text-[#848e9c] font-bold uppercase w-12">Period</span>
        <input type="number" className="flex-1 bg-[#181a20] border border-[#2b3139] text-[#fcd535] text-xs rounded p-1.5 nodrag text-right font-mono focus:border-[#fcd535] outline-none" value={data.period || 14} onChange={(e) => data.onChange(id, 'period', parseInt(e.target.value))} />
      </div>
    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-3 h-3 bg-[#fcd535] border-2 border-[#181a20]" />
  </div>
);

export const ConditionNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#3b4149] rounded shadow-lg min-w-[280px] relative">
    <Handle type="target" position={Position.Left} id="left" style={{ top: '50%' }} className="w-3 h-3 bg-[#848e9c] border-2 border-[#181a20]" />
    <div className="bg-[#3b4149]/30 px-3 py-2 border-b border-[#3b4149]/50 flex justify-between items-center">
      <span className="font-bold text-[#eaecef] text-[11px] uppercase tracking-wider">DATA CONDITION</span>
      {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b flex flex-col space-y-3">
      <div className="text-[10px] text-[#848e9c] font-bold uppercase flex justify-between px-1">
        <span>Target (A)</span>
        <span>Operator</span>
        <span>Value (B)</span>
      </div>
      <div className="flex space-x-2 items-center">
        <div className="w-8 h-8 rounded bg-[#181a20] flex items-center justify-center text-xs font-bold text-[#848e9c] border border-[#2b3139]">IN</div>
        <select className="bg-[#181a20] border border-[#2b3139] text-[#fcd535] text-xs rounded p-2 nodrag font-bold focus:border-[#fcd535] outline-none flex-1 text-center" value={data.operator || ">"} onChange={(e) => data.onChange(id, 'operator', e.target.value)}>
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value="==">==</option>
          <option value=">=">&gt;=</option>
          <option value="<=">&lt;=</option>
        </select>
        <input type="number" placeholder="0.00" className="w-20 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag font-mono focus:border-[#fcd535] outline-none text-center" value={data.rightValue !== undefined ? data.rightValue : ""} onChange={(e) => data.onChange(id, 'rightValue', parseFloat(e.target.value))} />
      </div>
    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-3 h-3 bg-[#fcd535] border-2 border-[#181a20]" />
  </div>
);

export const LogicNode = ({ id, data }) => {
  const isSingleInput = data.logicType === "not";
  return (
    <div className="bg-[#181a20] border border-[#2ea043] rounded shadow-lg min-w-[200px] relative">
      <Handle type="target" position={Position.Left} id="in1" style={{ top: isSingleInput ? '50%' : '35%' }} className="w-3 h-3 bg-[#848e9c] border-2 border-[#181a20]" />
      {!isSingleInput && (
        <Handle type="target" position={Position.Left} id="in2" style={{ top: '65%' }} className="w-3 h-3 bg-[#848e9c] border-2 border-[#181a20]" />
      )}
      <div className="bg-[#2ea043]/10 px-3 py-2 border-b border-[#2ea043]/30 flex justify-between items-center">
        <span className="font-bold text-[#2ea043] text-[11px] uppercase tracking-wider">LOGIC GATE</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
      <div className="p-4 bg-[#0b0e11]/80 rounded-b">
        <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag font-bold text-center focus:border-[#2ea043] outline-none" value={data.logicType || "and"} onChange={(e) => data.onChange(id, 'logicType', e.target.value)}>
          <option value="and">AND (Require Both)</option>
          <option value="or">OR (Require Either)</option>
          <option value="xor">XOR (Exclusive OR)</option>
          <option value="nand">NAND (Not AND)</option>
          <option value="nor">NOR (Not OR)</option>
          <option value="not">NOT (Invert Input)</option>
        </select>
      </div>
      <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-3 h-3 bg-[#fcd535] border-2 border-[#181a20]" />
    </div>
  );
};

// ==========================================
// 3. RISK MANAGEMENT BLOKKEN
// ==========================================

export const StopLossNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#f6465d] rounded shadow-lg min-w-[280px] relative">
    <div className="bg-[#f6465d]/10 px-3 py-2 border-b border-[#f6465d]/30 flex justify-between items-center">
      <span className="font-bold text-[#f6465d] text-[11px] uppercase tracking-wider">STOP LOSS (RISK)</span>
      <div className="flex space-x-3 items-center">
        <span className="text-[9px] text-[#848e9c] font-mono">OUT &rarr;</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Trigger Level (Loss)</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#f6465d] outline-none" value={data.triggerType || "percentage"} onChange={(e) => data.onChange(id, 'triggerType', e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="trailing">Trailing (%)</option>
                <option value="fixed">Fixed Price</option>
            </select>
            <input type="number" placeholder="e.g. 5" className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#f6465d] text-xs rounded p-2 nodrag font-mono focus:border-[#f6465d] outline-none text-center" value={data.triggerValue !== undefined ? data.triggerValue : ""} onChange={(e) => data.onChange(id, 'triggerValue', parseFloat(e.target.value))} />
        </div>
      </div>
      <div className="pt-3 border-t border-[#2b3139]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Amount to Close</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#f6465d] outline-none" value={data.closeType || "percentage"} onChange={(e) => data.onChange(id, 'closeType', e.target.value)}>
                <option value="percentage">% of Position</option>
                <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="100" className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag font-mono focus:border-[#f6465d] outline-none text-center" value={data.closeValue !== undefined ? data.closeValue : 100} onChange={(e) => data.onChange(id, 'closeValue', parseFloat(e.target.value))} />
        </div>
      </div>
    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-3 h-3 bg-[#f6465d] border-2 border-[#181a20]" />
  </div>
);

export const TakeProfitNode = ({ id, data }) => (
  <div className="bg-[#181a20] border border-[#2ebd85] rounded shadow-lg min-w-[280px] relative">
    <div className="bg-[#2ebd85]/10 px-3 py-2 border-b border-[#2ebd85]/30 flex justify-between items-center">
      <span className="font-bold text-[#2ebd85] text-[11px] uppercase tracking-wider">TAKE PROFIT (TARGET)</span>
      <div className="flex space-x-3 items-center">
        <span className="text-[9px] text-[#848e9c] font-mono">OUT &rarr;</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
    </div>
    <div className="p-4 bg-[#0b0e11]/80 rounded-b space-y-4">
      <div>
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Trigger Level (Profit)</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#2ebd85] outline-none" value={data.triggerType || "percentage"} onChange={(e) => data.onChange(id, 'triggerType', e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Price</option>
            </select>
            <input type="number" placeholder="e.g. 10" className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#2ebd85] text-xs rounded p-2 nodrag font-mono focus:border-[#2ebd85] outline-none text-center" value={data.triggerValue !== undefined ? data.triggerValue : ""} onChange={(e) => data.onChange(id, 'triggerValue', parseFloat(e.target.value))} />
        </div>
      </div>
      <div className="pt-3 border-t border-[#2b3139]">
        <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">Amount to Close</label>
        <div className="flex space-x-2">
            <select className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag focus:border-[#2ebd85] outline-none" value={data.closeType || "percentage"} onChange={(e) => data.onChange(id, 'closeType', e.target.value)}>
                <option value="percentage">% of Position</option>
                <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="100" className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag font-mono focus:border-[#2ebd85] outline-none text-center" value={data.closeValue !== undefined ? data.closeValue : 100} onChange={(e) => data.onChange(id, 'closeValue', parseFloat(e.target.value))} />
        </div>
      </div>
    </div>
    <Handle type="source" position={Position.Right} style={{ top: '50%' }} className="w-3 h-3 bg-[#2ebd85] border-2 border-[#181a20]" />
  </div>
);

// ==========================================
// 4. ACTION NODE (Netjes Uitgelijnde Handles)
// ==========================================

export const ActionNode = ({ id, data }) => {
  const isBuy = data.actionType === 'buy';
  const color = isBuy ? '#2ebd85' : '#f6465d';
  
  return (
    <div className={`bg-[#181a20] border-2 rounded shadow-lg min-w-[320px]`} style={{ borderColor: color }}>
      
      <div className="px-3 py-2 font-bold text-[11px] uppercase tracking-wider border-b flex justify-between items-center" style={{ backgroundColor: `${color}10`, color: color, borderColor: `${color}30` }}>
        <span>{isBuy ? 'ORDER ROUTING: LONG ENTRY' : 'ORDER ROUTING: CLOSE POSITION'}</span>
        {data.onDelete && <button onClick={() => data.onDelete(id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors">✕</button>}
      </div>
      
      <div className="p-4 bg-[#0b0e11]/80 rounded-b space-y-4">
         
         {/* LOGIC ROW */}
         <div className="relative border border-[#2b3139] rounded p-3">
             <Handle type="target" position={Position.Left} id="logic" className="w-3 h-3 bg-[#848e9c] border-2 border-[#181a20] -left-[18px]" style={{ top: '50%' }} />
             <span className="absolute -left-10 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#848e9c] -rotate-90">LOGIC</span>
             
             <div className="flex space-x-2">
                <div className="w-1/2">
                    <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Direction</label>
                    <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag font-bold outline-none" value={data.actionType || "buy"} onChange={(e) => data.onChange(id, 'actionType', e.target.value)}>
                        <option value="buy">BUY (Open)</option>
                        <option value="sell">SELL (Close)</option>
                    </select>
                </div>
                <div className="w-1/2">
                    <label className="text-[9px] text-[#848e9c] font-bold uppercase mb-1 block">Order Type</label>
                    <select className="w-full bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag outline-none focus:border-[#0ea5e9]" value={data.orderType || "market"} onChange={(e) => data.onChange(id, 'orderType', e.target.value)}>
                        <option value="market">Market</option>
                        <option value="limit">Limit</option>
                    </select>
                </div>
             </div>
         </div>

         {/* SIZING ROW */}
         <div className="border border-[#2b3139] rounded p-3">
             <label className="text-[10px] text-[#848e9c] font-bold uppercase mb-1.5 block">{isBuy ? 'Entry Size' : 'Amount to Close'}</label>
             <div className="flex space-x-2">
                 <select className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#eaecef] text-xs rounded p-2 nodrag outline-none focus:border-[#0ea5e9]" value={data.amountType || "percentage"} onChange={(e) => data.onChange(id, 'amountType', e.target.value)}>
                     <option value="percentage">{isBuy ? '% of Capital' : '% of Position'}</option>
                     <option value="fixed">Fixed Amount</option>
                 </select>
                 <input type="number" placeholder="100" className="w-1/2 bg-[#181a20] border border-[#2b3139] text-[#0ea5e9] text-xs rounded p-2 nodrag text-center font-mono focus:border-[#0ea5e9] outline-none" value={data.amountValue !== undefined ? data.amountValue : 100} onChange={(e) => data.onChange(id, 'amountValue', parseFloat(e.target.value))} />
             </div>
         </div>

         {/* RISK ROUTING ROW (Only for BUY) */}
         {isBuy && (
             <div className="relative border border-[#2b3139] rounded p-3 pt-4 pb-4">
                 <Handle type="target" position={Position.Left} id="tp" className="w-3 h-3 bg-[#2ebd85] border-2 border-[#181a20] -left-[18px]" style={{ top: '30%' }} />
                 <span className="absolute -left-6 top-[30%] -translate-y-1/2 text-[9px] font-bold text-[#2ebd85]">TP</span>
                 
                 <Handle type="target" position={Position.Left} id="sl" className="w-3 h-3 bg-[#f6465d] border-2 border-[#181a20] -left-[18px]" style={{ top: '70%' }} />
                 <span className="absolute -left-6 top-[70%] -translate-y-1/2 text-[9px] font-bold text-[#f6465d]">SL</span>
                 
                 <div className="text-[9px] text-[#848e9c] italic text-center leading-relaxed">
                     Connect multiple Take Profit or Stop Loss blocks to the <span className="text-[#2ebd85] font-bold">TP</span> and <span className="text-[#f6465d] font-bold">SL</span> inputs to build advanced scaling-out strategies.
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};