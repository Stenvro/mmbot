import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';

export default function TradeManager({ setError }) {
  const [activeTab, setActiveTab] = useState('positions'); 
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterBot, setFilterBot] = useState('ALL');
  const [filterMode, setFilterMode] = useState('ALL');

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const [posRes, ordRes] = await Promise.all([
        apiClient.get('/api/trades/positions'),
        apiClient.get('/api/trades/orders')
      ]);
      setPositions(posRes.data);
      setOrders(ordRes.data);
    } catch (err) {
      if (setError) setError("Failed to fetch trades data.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  const handleExport = async (mode) => {
    try {
      const response = await apiClient.get(`/api/trades/export?mode=${mode}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `apexalgo_${mode}_trades.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Export failed.");
    }
  };

  const handleDeleteHistory = async (botName, mode) => {
    const modeLabel = mode === 'ALL' ? 'ALL' : mode.toUpperCase();
    if (!window.confirm(`Are you sure you want to delete ${modeLabel} history for bot: ${botName}?`)) return;
    try {
      await apiClient.delete(`/api/trades/bot/${botName}`, { params: { mode: mode !== 'ALL' ? mode : undefined } });
      fetchTrades();
    } catch (err) {
      alert("Failed to delete history.");
    }
  };

  const formatNum = (num) => num != null ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  // Derived state voor dropdowns
  const uniqueBots = useMemo(() => {
      const bots = new Set([...positions.map(p => p.bot_name), ...orders.map(o => o.bot_name)]);
      return Array.from(bots);
  }, [positions, orders]);

  // Gefilterde data
  const filteredPositions = positions.filter(p => (filterBot === 'ALL' || p.bot_name === filterBot) && (filterMode === 'ALL' || p.mode === filterMode));
  const filteredOrders = orders.filter(o => (filterBot === 'ALL' || o.bot_name === filterBot) && (filterMode === 'ALL' || o.mode === filterMode));

  return (
    <div className="max-w-6xl mx-auto space-y-6 w-full fade-in">
      
      {/* HEADER & EXPORT ACTIONS */}
      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-[#eaecef] font-bold text-lg">Trade Overview</h3>
          <p className="text-[#848e9c] text-xs mt-1">Manage positions, order history, and exports.</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={() => handleExport('backtest')} className="bg-[#2b3139] text-[#eaecef] border border-[#3b4149] px-4 py-2 text-sm font-semibold hover:bg-[#3b4149] transition-colors rounded-sm">
            ⬇ Export Backtest (CSV)
          </button>
          <button onClick={() => handleExport('live')} className="bg-[#2ebd85]/10 text-[#2ebd85] border border-[#2ebd85]/30 px-4 py-2 text-sm font-semibold hover:bg-[#2ebd85]/20 transition-colors rounded-sm">
            ⬇ Export Live Trades (CSV)
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#181a20] p-4 rounded border border-[#2b3139]">
          <div className="flex space-x-1 bg-[#0b0e11] p-1 rounded border border-[#2b3139] w-max">
            <button onClick={() => setActiveTab('positions')} className={`px-6 py-2 text-sm font-medium rounded-sm transition-colors ${activeTab === 'positions' ? 'bg-[#2b3139] text-[#eaecef]' : 'text-[#848e9c] hover:text-[#eaecef]'}`}>
              Open Positions ({filteredPositions.filter(p => p.status === 'open').length})
            </button>
            <button onClick={() => setActiveTab('orders')} className={`px-6 py-2 text-sm font-medium rounded-sm transition-colors ${activeTab === 'orders' ? 'bg-[#2b3139] text-[#eaecef]' : 'text-[#848e9c] hover:text-[#eaecef]'}`}>
              Order History ({filteredOrders.length})
            </button>
          </div>

          <div className="flex space-x-4 items-center">
             <div className="flex flex-col">
                <span className="text-[10px] text-[#848e9c] uppercase font-bold mb-1">Filter by Bot</span>
                <select value={filterBot} onChange={e => setFilterBot(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] text-sm rounded px-3 py-1.5 focus:outline-none focus:border-[#fcd535]">
                    <option value="ALL">All Algorithms</option>
                    {uniqueBots.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] text-[#848e9c] uppercase font-bold mb-1">Filter by Mode</span>
                <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] text-sm rounded px-3 py-1.5 focus:outline-none focus:border-[#fcd535]">
                    <option value="ALL">All Modes</option>
                    <option value="backtest">Backtest Only</option>
                    <option value="paper">Paper Trading</option>
                    <option value="live">Live Execution</option>
                </select>
             </div>
          </div>
      </div>

      {/* DATA TABLES */}
      <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-x-auto min-h-[400px]">
        {loading ? (
           <div className="p-8 text-center text-[#fcd535] animate-pulse tracking-widest text-sm">LOADING DATA...</div>
        ) : activeTab === 'positions' ? (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-[#0b0e11] border-b border-[#2b3139] text-xs text-[#848e9c] uppercase tracking-wider">
                <th className="p-4 font-medium">Bot Name</th>
                <th className="p-4 font-medium">Pair</th>
                <th className="p-4 font-medium">Mode</th>
                <th className="p-4 font-medium">Side</th>
                <th className="p-4 font-medium">Entry Price</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">PNL %</th>
                <th className="p-4 font-medium text-right">Targeted Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredPositions.map((pos, i) => (
                <tr key={i} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/40 transition-colors">
                  <td className="p-4 text-[#eaecef] font-bold">{pos.bot_name}</td>
                  <td className="p-4 text-[#eaecef]">{pos.symbol}</td>
                  <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${pos.mode === 'live' ? 'bg-[#2ebd85]/20 text-[#2ebd85]' : pos.mode === 'paper' ? 'bg-[#0ea5e9]/20 text-[#0ea5e9]' : 'bg-[#fcd535]/20 text-[#fcd535]'}`}>{pos.mode}</span>
                  </td>
                  <td className="p-4 uppercase text-[#848e9c]">{pos.side}</td>
                  <td className="p-4 font-mono text-[#eaecef]">{formatNum(pos.entry_price)}</td>
                  <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${pos.status === 'open' ? 'border-[#0ea5e9] text-[#0ea5e9]' : 'border-[#848e9c] text-[#848e9c]'}`}>{pos.status}</span>
                  </td>
                  <td className={`p-4 font-mono font-bold ${pos.profit_pct > 0 ? 'text-[#2ebd85]' : pos.profit_pct < 0 ? 'text-[#f6465d]' : 'text-[#848e9c]'}`}>
                      {pos.profit_pct != null ? `${formatNum(pos.profit_pct)}%` : '-'}
                  </td>
                  <td className="p-4 text-right space-x-3">
                    <button onClick={() => handleDeleteHistory(pos.bot_name, pos.mode)} className="text-[#f6465d] hover:text-[#f6465d]/80 text-[11px] uppercase font-bold transition-colors">Delete {pos.mode}</button>
                  </td>
                </tr>
              ))}
              {filteredPositions.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-[#848e9c] italic">No positions found for these filters.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-[#0b0e11] border-b border-[#2b3139] text-xs text-[#848e9c] uppercase tracking-wider">
                <th className="p-4 font-medium">Time</th>
                <th className="p-4 font-medium">Bot Name</th>
                <th className="p-4 font-medium">Pair</th>
                <th className="p-4 font-medium">Action</th>
                <th className="p-4 font-medium">Price</th>
                <th className="p-4 font-medium">Mode</th>
                <th className="p-4 font-medium text-right">Targeted Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredOrders.map((ord, i) => (
                <tr key={i} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/40 transition-colors">
                  <td className="p-4 text-[#848e9c] text-xs">{new Date(ord.timestamp).toLocaleString()}</td>
                  <td className="p-4 text-[#eaecef] font-bold">{ord.bot_name}</td>
                  <td className="p-4 text-[#eaecef]">{ord.symbol}</td>
                  <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${ord.side === 'buy' ? 'bg-[#2ebd85]/20 text-[#2ebd85]' : 'bg-[#f6465d]/20 text-[#f6465d]'}`}>{ord.side}</span>
                  </td>
                  <td className="p-4 font-mono text-[#eaecef]">{formatNum(ord.price)}</td>
                  <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${ord.mode === 'live' ? 'bg-[#2ebd85]/20 text-[#2ebd85]' : ord.mode === 'paper' ? 'bg-[#0ea5e9]/20 text-[#0ea5e9]' : 'bg-[#fcd535]/20 text-[#fcd535]'}`}>{ord.mode}</span>
                  </td>
                  <td className="p-4 text-right space-x-3">
                    <button onClick={() => handleDeleteHistory(ord.bot_name, ord.mode)} className="text-[#f6465d] hover:text-[#f6465d]/80 text-[11px] uppercase font-bold transition-colors">Delete {ord.mode}</button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-[#848e9c] italic">No orders found for these filters.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}