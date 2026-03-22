import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../api/client';

const safeNum = (val, decimals = 2) => {
    if (val === null || val === undefined || isNaN(Number(val))) return (0).toFixed(decimals);
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatCrypto = (val) => {
    if (val === null || val === undefined) return "0.00";
    return Number(val).toFixed(6).replace(/\.?0+$/, ''); 
};

export default function TradeManager({ setError }) {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]); // NIEUW: Orders State
  const [bots, setBots] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null);
  
  const [activeTab, setActiveTab] = useState('positions'); // NIEUW: Tab Switcher

  const [filterMode, setFilterMode] = useState('all');
  const [filterKey, setFilterKey] = useState('all');
  const [filterBot, setFilterBot] = useState('all');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [posRes, botRes, keyRes, ordRes] = await Promise.all([
          apiClient.get('/api/trades/positions'),
          apiClient.get('/api/bots/'),
          apiClient.get('/api/keys'),
          apiClient.get('/api/trades/orders') // Haal nu ook alle ruwe orders op
      ]);
      setPositions(posRes.data || []);
      setBots(botRes.data || []);
      setApiKeys(Array.isArray(keyRes.data) ? keyRes.data : []);
      setOrders(ordRes.data || []);
      if (setError) setError(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to load analytics data.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const getApiKeyForPos = useCallback((item) => {
      if (item.mode === 'backtest') return 'Local Backtest';
      const bot = bots.find(b => b.name === item.bot_name);
      return bot?.settings?.api_key_name || 'Unassigned (Forward Test)';
  }, [bots]);

  const deleteHistoricalTrade = async (id) => {
      setModalConfig({
        type: 'confirm',
        title: 'Delete Trade Record',
        message: `Are you sure you want to permanently delete this trade from the ledger? This will impact your PNL statistics.`,
        confirmClass: 'bg-[#f6465d] hover:bg-[#f6465d]/80 text-white',
        onConfirm: async () => {
            try {
                await apiClient.delete(`/api/trades/positions/${id}`);
                fetchAllData();
                setModalConfig(null);
            } catch (e) {
                setModalConfig({ type: 'error', title: 'Error', message: "Failed to delete trade.", onConfirm: () => setModalConfig(null) });
            }
        },
        onCancel: () => setModalConfig(null)
      });
  };

  const forceClosePosition = async (id) => {
      setModalConfig({
        type: 'confirm',
        title: 'Force Close Position',
        message: 'Are you sure you want to manually force close this position? It will be closed at the last known local market price and added to your Historical Ledger.',
        confirmText: 'Force Close',
        confirmClass: 'bg-[#fcd535] hover:bg-[#e5c02a] text-[#181a20]',
        onConfirm: async () => {
            setLoading(true);
            try {
                const res = await apiClient.post(`/api/trades/positions/${id}/close`);
                fetchAllData();
                setModalConfig({ type: 'success', title: 'Position Closed', message: res.data.message, onConfirm: () => setModalConfig(null) });
            } catch (e) {
                setModalConfig({ type: 'error', title: 'Error', message: e.response?.data?.detail || "Failed to close.", onConfirm: () => setModalConfig(null) });
            }
            setLoading(false);
        },
        onCancel: () => setModalConfig(null)
      });
  };

  const closedPositions = useMemo(() => {
      return positions
          .filter(p => p.status === 'closed')
          .filter(p => filterMode === 'all' || p.mode === filterMode)
          .filter(p => filterKey === 'all' || getApiKeyForPos(p) === filterKey)
          .filter(p => filterBot === 'all' || p.bot_name === filterBot)
          .sort((a, b) => {
              const dateA = a.closed_at ? new Date(a.closed_at) : new Date(0);
              const dateB = b.closed_at ? new Date(b.closed_at) : new Date(0);
              return dateB - dateA;
          });
  }, [positions, filterMode, filterKey, filterBot, getApiKeyForPos]);

  const activePositions = useMemo(() => {
      return positions
          .filter(p => p.status === 'open')
          .filter(p => filterMode === 'all' || p.mode === filterMode)
          .filter(p => filterKey === 'all' || getApiKeyForPos(p) === filterKey)
          .filter(p => filterBot === 'all' || p.bot_name === filterBot);
  }, [positions, filterMode, filterKey, filterBot, getApiKeyForPos]);

  // NIEUW: Gefilterde Ruwe Orders
  const filteredOrders = useMemo(() => {
      return orders
          .filter(o => filterMode === 'all' || o.mode === filterMode)
          .filter(o => filterKey === 'all' || getApiKeyForPos(o) === filterKey)
          .filter(o => filterBot === 'all' || o.bot_name === filterBot)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [orders, filterMode, filterKey, filterBot, getApiKeyForPos]);

  const stats = useMemo(() => {
      const wins = closedPositions.filter(p => (p.profit_abs || 0) > 0);
      const losses = closedPositions.filter(p => (p.profit_abs || 0) <= 0);
      
      const grossProfit = wins.reduce((acc, p) => acc + (p.profit_abs || 0), 0);
      const grossLoss = Math.abs(losses.reduce((acc, p) => acc + (p.profit_abs || 0), 0));
      
      const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
      const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);
      const netPnl = grossProfit - grossLoss;

      return {
          total: closedPositions.length,
          wins: wins.length,
          losses: losses.length,
          winRate: safeNum(winRate, 1),
          profitFactor: safeNum(profitFactor, 2),
          netPnl: safeNum(netPnl, 2)
      };
  }, [closedPositions]);

  const uniqueKeys = useMemo(() => {
      const keys = new Set();
      positions.forEach(p => keys.add(getApiKeyForPos(p)));
      return Array.from(keys);
  }, [positions, getApiKeyForPos]);

  const uniqueBots = useMemo(() => {
      const bts = new Set();
      positions.forEach(p => bts.add(p.bot_name));
      return Array.from(bts);
  }, [positions]);

  const bulkDelete = async () => {
      if (closedPositions.length === 0) return;
      setModalConfig({
        type: 'confirm',
        title: 'Bulk Delete Trades',
        message: `WARNING: You are about to permanently delete ALL ${closedPositions.length} historical trades that match your current filters. Proceed?`,
        confirmText: 'DELETE ALL FILTERED',
        confirmClass: 'bg-[#f6465d] hover:bg-[#f6465d]/80 text-white',
        onConfirm: async () => {
            setLoading(true);
            try {
                await Promise.all(closedPositions.map(p => apiClient.delete(`/api/trades/positions/${p.id}`)));
                fetchAllData();
                setModalConfig(null);
            } catch (e) {
                setModalConfig({ type: 'error', title: 'Error', message: "Some trades failed to delete.", onConfirm: () => setModalConfig(null) });
            }
            setLoading(false);
        },
        onCancel: () => setModalConfig(null)
      });
  };

  const exportToCSV = () => {
      if (activeTab === 'positions') {
          if (closedPositions.length === 0) return;
          const headers = ['Date Closed', 'Bot Name', 'Mode', 'Wallet Key', 'Symbol', 'Side', 'Entry Price', 'Amount', 'Return (%)', 'Net PNL ($)'];
          const csvContent = [
              headers.join(','),
              ...closedPositions.map(p => [
                  new Date(p.closed_at).toISOString(), p.bot_name, p.mode, getApiKeyForPos(p), p.symbol, p.side, p.entry_price, p.amount, p.profit_pct, p.profit_abs
              ].join(','))
          ].join('\n');
          triggerDownload(csvContent, 'apex_positions_ledger');
      } else {
          if (filteredOrders.length === 0) return;
          const headers = ['Timestamp', 'Bot Name', 'Mode', 'Symbol', 'Side', 'Type', 'Price', 'Amount', 'Status'];
          const csvContent = [
              headers.join(','),
              ...filteredOrders.map(o => [
                  new Date(o.timestamp).toISOString(), o.bot_name, o.mode, o.symbol, o.side, o.order_type, o.price, o.amount, o.status
              ].join(','))
          ].join('\n');
          triggerDownload(csvContent, 'apex_raw_orders');
      }
  };

  const triggerDownload = (csvContent, filenamePrefix) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 w-full fade-in relative pb-10">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-lg font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'error' ? 'text-[#f6465d]' : (modalConfig.confirmClass ? 'text-[#f6465d]' : 'text-[#fcd535]')}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-sm mb-6 leading-relaxed">{modalConfig.message}</p>
            <div className="flex justify-end space-x-3">
              {modalConfig.onCancel && <button onClick={modalConfig.onCancel} className="px-4 py-2 rounded text-xs font-bold text-[#848e9c] hover:bg-[#2b3139] uppercase">Cancel</button>}
              <button onClick={modalConfig.onConfirm} className={`px-4 py-2 rounded text-xs font-bold uppercase transition-colors ${modalConfig.confirmClass || 'bg-[#fcd535] hover:bg-[#e5c02a] text-[#181a20]'}`}>
                  {modalConfig.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded shadow-sm flex flex-wrap gap-4 items-center justify-between">
          <div className="flex space-x-4 flex-wrap gap-y-3">
              <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase mb-1">Filter by Bot</span>
                  <select value={filterBot} onChange={e => setFilterBot(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] text-xs rounded px-3 py-1.5 focus:border-[#0ea5e9] outline-none min-w-[140px]">
                      <option value="all">All Bots</option>
                      {uniqueBots.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
              </div>
              <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase mb-1">Filter by Mode</span>
                  <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] text-xs rounded px-3 py-1.5 focus:border-[#fcd535] outline-none">
                      <option value="all">All Modes</option>
                      <option value="live">Live Exchange</option>
                      <option value="paper">Paper Trading</option>
                      <option value="forward_test">Forward Test</option>
                      <option value="backtest">Local Backtest</option>
                  </select>
              </div>
              <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase mb-1">Filter by Wallet</span>
                  <select value={filterKey} onChange={e => setFilterKey(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] text-xs rounded px-3 py-1.5 focus:border-[#2ebd85] outline-none min-w-[160px]">
                      <option value="all">All Wallets</option>
                      {uniqueKeys.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
              </div>
          </div>
          <div className="flex space-x-3 items-center">
              <button onClick={exportToCSV} className="text-[#2ebd85] text-xs font-bold uppercase border border-[#2ebd85]/30 px-4 py-1.5 rounded hover:bg-[#2ebd85]/10 transition-colors">
                 Export CSV
              </button>
              <button onClick={fetchAllData} disabled={loading} className="bg-[#fcd535] text-[#181a20] text-xs font-bold uppercase px-4 py-1.5 rounded hover:bg-[#e5c02a] transition-colors disabled:opacity-50 shadow-sm">
                 {loading ? 'Syncing...' : 'Refresh'}
              </button>
          </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
             <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Filtered Net PNL</span>
             <h3 className={`text-2xl font-mono mt-1 ${stats.netPnl >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                 ${stats.netPnl}
             </h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
             <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Win Rate</span>
             <h3 className="text-2xl font-mono mt-1 text-[#0ea5e9]">{stats.winRate}%</h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
             <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Profit Factor</span>
             <h3 className="text-2xl font-mono mt-1 text-[#fcd535]">{stats.profitFactor}</h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
             <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Trades Taken</span>
             <h3 className="text-2xl font-mono mt-1 text-[#eaecef]">{stats.total}</h3>
          </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex space-x-6 border-b border-[#2b3139] mt-8 mb-4">
          <button 
              onClick={() => setActiveTab('positions')} 
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'positions' ? 'text-[#fcd535] border-[#fcd535]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Position Ledger (Aggregated)
          </button>
          <button 
              onClick={() => setActiveTab('orders')} 
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'orders' ? 'text-[#fcd535] border-[#fcd535]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Raw Order Log (Executions)
          </button>
      </div>

      {activeTab === 'positions' ? (
          <>
            {/* ACTIVE POSITIONS */}
            <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-hidden mb-6">
               <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center">
                  <h3 className="text-[#eaecef] font-bold text-sm uppercase tracking-wider">Active Open Positions ({activePositions.length})</h3>
               </div>
               {activePositions.length === 0 ? (
                   <div className="p-6 text-center text-[#848e9c] text-xs italic">No active positions match your filters.</div>
               ) : (
                  <table className="w-full text-left">
                      <thead className="bg-[#0b0e11] text-[10px] text-[#848e9c] uppercase tracking-wider">
                          <tr>
                              <th className="p-3 font-bold">Bot / Source</th>
                              <th className="p-3 font-bold">Wallet Key</th>
                              <th className="p-3 font-bold">Symbol</th>
                              <th className="p-3 font-bold">Side</th>
                              <th className="p-3 font-bold text-right">Entry Price</th>
                              <th className="p-3 font-bold text-right">Amount</th>
                              <th className="p-3 font-bold text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="text-xs text-[#eaecef]">
                          {activePositions.map(pos => (
                              <tr key={pos.id} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/30">
                                  <td className="p-3 font-bold text-[#0ea5e9]">
                                      {pos.bot_name}
                                      <span className="ml-2 bg-[#2b3139] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                  </td>
                                  <td className="p-3 text-[#848e9c]">{getApiKeyForPos(pos) || 'None'}</td>
                                  <td className="p-3 font-bold">{pos.symbol}</td>
                                  <td className="p-3"><span className="text-[#2ebd85] font-bold uppercase">{pos.side}</span></td>
                                  <td className="p-3 font-mono text-right">${safeNum(pos.entry_price)}</td>
                                  <td className="p-3 font-mono text-right">{formatCrypto(pos.amount)}</td>
                                  <td className="p-3 text-right space-x-3">
                                      <button onClick={() => forceClosePosition(pos.id)} className="text-[#fcd535] hover:text-[#e5c02a] text-[10px] font-bold uppercase transition-colors">Close</button>
                                      <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] text-[10px] font-bold uppercase transition-colors">Del</button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
               )}
            </div>

            {/* HISTORICAL LEDGER */}
            <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-hidden pb-4">
               <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center">
                  <h3 className="text-[#eaecef] font-bold text-sm uppercase tracking-wider">Historical Trade Ledger</h3>
                  <button 
                      onClick={bulkDelete} 
                      disabled={closedPositions.length === 0} 
                      className="text-[#f6465d] hover:text-white border border-[#f6465d]/50 hover:bg-[#f6465d] text-[10px] font-bold uppercase px-3 py-1 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#f6465d]"
                  >
                      Clear Filtered
                  </button>
               </div>
               {closedPositions.length === 0 ? (
                   <div className="p-6 text-center text-[#848e9c] text-xs italic">No historical trades found matching your filters.</div>
               ) : (
                  <table className="w-full text-left">
                      <thead className="bg-[#0b0e11] text-[10px] text-[#848e9c] uppercase tracking-wider">
                          <tr>
                              <th className="p-3 font-bold">Date Closed</th>
                              <th className="p-3 font-bold">Bot Name</th>
                              <th className="p-3 font-bold">Symbol</th>
                              <th className="p-3 font-bold text-right">Entry Price</th>
                              <th className="p-3 font-bold text-right">Amount</th>
                              <th className="p-3 font-bold text-right">Return (%)</th>
                              <th className="p-3 font-bold text-right">Net PNL ($)</th>
                              <th className="p-3 font-bold text-center">Del</th>
                          </tr>
                      </thead>
                      <tbody className="text-xs text-[#eaecef]">
                          {closedPositions.map(pos => {
                              const isWin = (pos.profit_abs || 0) >= 0;
                              return (
                                  <tr key={pos.id} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/30">
                                      <td className="p-3 text-[#848e9c]">{pos.closed_at ? new Date(pos.closed_at).toLocaleString() : 'N/A'}</td>
                                      <td className="p-3 font-bold text-[#fcd535]">
                                          {pos.bot_name}
                                          <span className="ml-2 bg-[#2b3139] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                      </td>
                                      <td className="p-3 font-bold">{pos.symbol}</td>
                                      <td className="p-3 font-mono text-right">${safeNum(pos.entry_price)}</td>
                                      <td className="p-3 font-mono text-right text-[#0ea5e9]">{formatCrypto(pos.amount)}</td>
                                      <td className={`p-3 font-mono text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                          {isWin ? '+' : ''}{safeNum(pos.profit_pct)}%
                                      </td>
                                      <td className={`p-3 font-mono text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                          {isWin ? '+$' : '-$'}{safeNum(Math.abs(pos.profit_abs))}
                                      </td>
                                      <td className="p-3 text-center">
                                          <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors" title="Delete Trade from Ledger">✕</button>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
               )}
            </div>
          </>
      ) : (
          /* RAW ORDER LOG TAB */
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-hidden pb-4">
             <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/50">
                <h3 className="text-[#eaecef] font-bold text-sm uppercase tracking-wider">Raw Order Execution Log</h3>
                <p className="text-[10px] text-[#848e9c] mt-1">Individual buy and sell executions sent to the exchange or local simulator.</p>
             </div>
             {filteredOrders.length === 0 ? (
                 <div className="p-6 text-center text-[#848e9c] text-xs italic">No orders found matching your filters.</div>
             ) : (
                <table className="w-full text-left">
                    <thead className="bg-[#0b0e11] text-[10px] text-[#848e9c] uppercase tracking-wider">
                        <tr>
                            <th className="p-3 font-bold">Execution Date</th>
                            <th className="p-3 font-bold">Bot Name</th>
                            <th className="p-3 font-bold">Symbol</th>
                            <th className="p-3 font-bold">Action</th>
                            <th className="p-3 font-bold text-right">Price Executed</th>
                            <th className="p-3 font-bold text-right">Order Size</th>
                            <th className="p-3 font-bold text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs text-[#eaecef]">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/30">
                                <td className="p-3 text-[#848e9c]">{new Date(order.timestamp).toLocaleString()}</td>
                                <td className="p-3 font-bold text-[#fcd535]">
                                    {order.bot_name}
                                    <span className="ml-2 bg-[#2b3139] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{order.mode}</span>
                                </td>
                                <td className="p-3 font-bold">{order.symbol}</td>
                                <td className="p-3">
                                    <span className={`font-bold uppercase ${order.side === 'buy' ? 'text-[#0ea5e9]' : 'text-[#d946ef]'}`}>
                                        {order.side} {order.order_type}
                                    </span>
                                </td>
                                <td className="p-3 font-mono text-right">${safeNum(order.price)}</td>
                                <td className="p-3 font-mono text-right">{formatCrypto(order.amount)}</td>
                                <td className="p-3 text-right">
                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${order.status === 'filled' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : (order.status === 'rejected' ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#fcd535]/10 text-[#fcd535]')}`}>
                                        {order.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             )}
          </div>
      )}

    </div>
  );
}