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
  const [orders, setOrders] = useState([]); 
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null);
  
  const [activeTab, setActiveTab] = useState('positions'); 

  // Paginering States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 150;

  // Live PNL States voor Active Positions
  const [livePrices, setLivePrices] = useState({});

  const [filterMode, setFilterMode] = useState('all');
  const [filterBot, setFilterBot] = useState('all');
  const [filterSymbol, setFilterSymbol] = useState('all');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [posRes, botRes, ordRes] = await Promise.all([
          apiClient.get('/api/trades/positions'),
          apiClient.get('/api/bots/'),
          apiClient.get('/api/trades/orders') 
      ]);
      setPositions(posRes.data || []);
      setBots(botRes.data || []);
      setOrders(ordRes.data || []);
      if (setError) setError(null);
      
      fetchLivePrices(posRes.data || []);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to load analytics data.");
    }
    setLoading(false);
  };

  const fetchLivePrices = async (currentPositions) => {
      const activePos = currentPositions.filter(p => p.status === 'open');
      if (activePos.length === 0) return;
      
      const uniqueSymbols = [...new Set(activePos.map(p => p.symbol))];
      const priceMap = { ...livePrices };
      
      for (const sym of uniqueSymbols) {
          try {
              const res = await apiClient.get(`/api/data/market-info/${sym.replace('/', '-')}`);
              if (res.data && res.data.last) {
                  priceMap[sym] = res.data.last;
              }
          } catch (e) {} // Silently fail if price fetch fails for one coin
      }
      setLivePrices(priceMap);
  };

  useEffect(() => {
    fetchAllData();
    // Live price update every 10 seconds for open positions
    const priceInterval = setInterval(() => fetchLivePrices(positions), 10000);
    return () => clearInterval(priceInterval);
  }, []);

  // Reset page when filters change
  useEffect(() => {
      setCurrentPage(1);
  }, [filterMode, filterBot, filterSymbol, activeTab]);

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
          .filter(p => filterBot === 'all' || p.bot_name === filterBot)
          .filter(p => filterSymbol === 'all' || p.symbol === filterSymbol)
          .sort((a, b) => {
              const dateA = a.closed_at ? new Date(a.closed_at) : new Date(0);
              const dateB = b.closed_at ? new Date(b.closed_at) : new Date(0);
              return dateB - dateA;
          });
  }, [positions, filterMode, filterBot, filterSymbol]);

  const activePositions = useMemo(() => {
      return positions
          .filter(p => p.status === 'open')
          .filter(p => filterMode === 'all' || p.mode === filterMode)
          .filter(p => filterBot === 'all' || p.bot_name === filterBot)
          .filter(p => filterSymbol === 'all' || p.symbol === filterSymbol);
  }, [positions, filterMode, filterBot, filterSymbol]);

  const filteredOrders = useMemo(() => {
      return orders
          .filter(o => filterMode === 'all' || o.mode === filterMode)
          .filter(o => filterBot === 'all' || o.bot_name === filterBot)
          .filter(o => filterSymbol === 'all' || o.symbol === filterSymbol)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [orders, filterMode, filterBot, filterSymbol]);

  // Extended Stats
  const stats = useMemo(() => {
      const wins = closedPositions.filter(p => (p.profit_abs || 0) > 0);
      const losses = closedPositions.filter(p => (p.profit_abs || 0) <= 0);
      
      const grossProfit = wins.reduce((acc, p) => acc + (p.profit_abs || 0), 0);
      const grossLoss = Math.abs(losses.reduce((acc, p) => acc + (p.profit_abs || 0), 0));
      
      const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
      const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);
      const netPnl = grossProfit - grossLoss;

      const bestTrade = wins.length > 0 ? Math.max(...wins.map(p => p.profit_abs || 0)) : 0;
      const worstTrade = losses.length > 0 ? Math.min(...losses.map(p => p.profit_abs || 0)) : 0;
      const avgWin = wins.length > 0 ? (grossProfit / wins.length) : 0;
      const avgLoss = losses.length > 0 ? (grossLoss / losses.length) : 0;

      return {
          total: closedPositions.length,
          wins: wins.length,
          losses: losses.length,
          winRate: safeNum(winRate, 1),
          profitFactor: safeNum(profitFactor, 2),
          netPnl: safeNum(netPnl, 2),
          bestTrade: safeNum(bestTrade, 2),
          worstTrade: safeNum(Math.abs(worstTrade), 2),
          avgWin: safeNum(avgWin, 2),
          avgLoss: safeNum(avgLoss, 2)
      };
  }, [closedPositions]);

  const uniqueBots = useMemo(() => {
      const bts = new Set();
      positions.forEach(p => bts.add(p.bot_name));
      return Array.from(bts);
  }, [positions]);

  const uniqueSymbols = useMemo(() => {
      const syms = new Set();
      positions.forEach(p => syms.add(p.symbol));
      orders.forEach(o => syms.add(o.symbol));
      return Array.from(syms);
  }, [positions, orders]);

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
                // VERZEKERING: Hij mapt over ALLE closedPositions, niet alleen de pagina!
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
          const headers = ['Date Closed', 'Bot Name', 'Mode', 'Symbol', 'Side', 'Entry Price', 'Amount', 'Return (%)', 'Net PNL ($)'];
          const csvContent = [
              headers.join(','),
              ...closedPositions.map(p => [
                  new Date(p.closed_at).toISOString(), p.bot_name, p.mode, p.symbol, p.side, p.entry_price, p.amount, p.profit_pct, p.profit_abs
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

  // Pagination Logic
  const totalPagesPositions = Math.ceil(closedPositions.length / itemsPerPage);
  const totalPagesOrders = Math.ceil(filteredOrders.length / itemsPerPage);
  
  const renderedPositions = closedPositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const renderedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getLivePnl = (pos) => {
      if (!livePrices[pos.symbol]) return { abs: 0, pct: 0 };
      const currentPrice = livePrices[pos.symbol];
      const isLong = pos.side === 'long';
      const pnlAbs = isLong ? (currentPrice - pos.entry_price) * pos.amount : (pos.entry_price - currentPrice) * pos.amount;
      const pnlPct = isLong ? ((currentPrice - pos.entry_price) / pos.entry_price) * 100 : ((pos.entry_price - currentPrice) / pos.entry_price) * 100;
      return { abs: pnlAbs, pct: pnlPct };
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 w-full fade-in relative pb-10">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-sm font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'error' ? 'text-[#f6465d]' : (modalConfig.confirmClass ? 'text-[#f6465d]' : 'text-[#fcd535]')}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-xs mb-6 leading-relaxed">{modalConfig.message}</p>
            <div className="flex justify-end space-x-3">
              {modalConfig.onCancel && <button onClick={modalConfig.onCancel} className="px-4 py-1.5 rounded text-[10px] font-bold text-[#848e9c] hover:bg-[#2b3139] uppercase border border-transparent hover:text-[#eaecef]">Cancel</button>}
              <button onClick={modalConfig.onConfirm} className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${modalConfig.confirmClass || 'bg-[#fcd535] hover:bg-[#e5c02a] text-[#181a20]'}`}>
                  {modalConfig.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER BAR - ULTRA MINIMALIST */}
      <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm px-4 py-3 flex flex-wrap gap-4 items-center justify-between sticky top-0 z-20">
          <div className="flex space-x-6 flex-wrap gap-y-3">
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Algorithm</span>
                  <select value={filterBot} onChange={e => setFilterBot(e.target.value)} className="bg-transparent text-[#eaecef] text-xs font-bold border-b border-[#2b3139] hover:border-[#848e9c] focus:border-[#fcd535] outline-none cursor-pointer pb-0.5 transition-colors">
                      <option value="all" className="bg-[#181a20]">All Bots</option>
                      {uniqueBots.map(b => <option key={b} value={b} className="bg-[#181a20]">{b}</option>)}
                  </select>
              </div>
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Asset</span>
                  <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} className="bg-transparent text-[#eaecef] text-xs font-bold border-b border-[#2b3139] hover:border-[#848e9c] focus:border-[#fcd535] outline-none cursor-pointer pb-0.5 transition-colors">
                      <option value="all" className="bg-[#181a20]">All Pairs</option>
                      {uniqueSymbols.map(s => <option key={s} value={s} className="bg-[#181a20]">{s}</option>)}
                  </select>
              </div>
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Environment</span>
                  <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="bg-transparent text-[#eaecef] text-xs font-bold border-b border-[#2b3139] hover:border-[#848e9c] focus:border-[#fcd535] outline-none cursor-pointer pb-0.5 transition-colors">
                      <option value="all" className="bg-[#181a20]">All Modes</option>
                      <option value="live" className="bg-[#181a20]">Live Exchange</option>
                      <option value="paper" className="bg-[#181a20]">Paper Trading</option>
                      <option value="backtest" className="bg-[#181a20]">Local Backtest</option>
                  </select>
              </div>
          </div>
          <div className="flex space-x-3 items-center">
              <button onClick={exportToCSV} className="text-[#848e9c] hover:text-[#eaecef] text-[10px] font-bold uppercase px-3 py-1.5 transition-colors flex items-center border border-transparent hover:border-[#3b4149] rounded-sm">
                 <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                 Export CSV
              </button>
              <button onClick={fetchAllData} disabled={loading} className="bg-[#2b3139] hover:bg-[#3b4149] text-[#eaecef] text-[10px] font-bold uppercase px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50">
                 {loading ? '...' : 'Sync'}
              </button>
          </div>
      </div>

      {/* EXTENDED PRO STATS OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Filtered Net PNL</span>
             <h3 className={`text-xl font-mono mt-1 ${stats.netPnl >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                 {stats.netPnl >= 0 ? '+' : '-'}${Math.abs(stats.netPnl)}
             </h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Win Rate</span>
             <h3 className="text-xl font-mono mt-1 text-[#0ea5e9]">{stats.winRate}<span className="text-xs text-[#848e9c] ml-1">%</span></h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Profit Factor</span>
             <h3 className="text-xl font-mono mt-1 text-[#fcd535]">{stats.profitFactor}</h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Total Trades</span>
             <h3 className="text-xl font-mono mt-1 text-[#eaecef]">{stats.total}</h3>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Avg Win / Loss</span>
             <div className="flex items-center space-x-2 mt-1">
                <span className="text-sm font-mono text-[#2ebd85]">+{stats.avgWin}</span>
                <span className="text-[10px] text-[#848e9c]">/</span>
                <span className="text-sm font-mono text-[#f6465d]">-{stats.avgLoss}</span>
             </div>
          </div>
          <div className="bg-[#181a20] border border-[#2b3139] p-4 rounded-sm flex flex-col justify-center">
             <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Best / Worst</span>
             <div className="flex items-center space-x-2 mt-1">
                <span className="text-sm font-mono text-[#2ebd85]">+{stats.bestTrade}</span>
                <span className="text-[10px] text-[#848e9c]">/</span>
                <span className="text-sm font-mono text-[#f6465d]">-{stats.worstTrade}</span>
             </div>
          </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex space-x-8 border-b border-[#2b3139] mt-6 mb-2">
          <button 
              onClick={() => {setActiveTab('positions'); setCurrentPage(1);}} 
              className={`pb-2 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'positions' ? 'text-[#fcd535] border-[#fcd535]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Aggregated Positions
          </button>
          <button 
              onClick={() => {setActiveTab('orders'); setCurrentPage(1);}} 
              className={`pb-2 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'orders' ? 'text-[#fcd535] border-[#fcd535]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Raw Execution Log
          </button>
      </div>

      <div>
      {activeTab === 'positions' ? (
          <>
            {/* ACTIVE POSITIONS */}
            <div className="bg-[#181a20] border border-[#2b3139] rounded-sm overflow-hidden mb-6">
               <div className="px-4 py-3 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center">
                  <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Active Open Positions <span className="text-[#848e9c] ml-1">({activePositions.length})</span></h3>
               </div>
               {activePositions.length === 0 ? (
                   <div className="p-6 text-center text-[#848e9c] text-xs italic">No active positions match your filters.</div>
               ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-[#0b0e11] text-[9px] text-[#848e9c] uppercase tracking-wider border-b border-[#2b3139]">
                            <tr>
                                <th className="px-4 py-2 font-bold">Algorithm</th>
                                <th className="px-4 py-2 font-bold">Symbol</th>
                                <th className="px-4 py-2 font-bold">Side</th>
                                <th className="px-4 py-2 font-bold text-right">Entry Price</th>
                                <th className="px-4 py-2 font-bold text-right">Amount</th>
                                <th className="px-4 py-2 font-bold text-right">Live PNL</th>
                                <th className="px-4 py-2 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px] text-[#eaecef]">
                            {activePositions.map(pos => {
                                const livePnl = getLivePnl(pos);
                                const isWin = livePnl.abs >= 0;
                                return (
                                <tr key={pos.id} className="border-b border-[#2b3139]/30 hover:bg-[#2b3139]/20 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-[#eaecef]">
                                        {pos.bot_name}
                                        <span className="ml-2 bg-[#2b3139] px-1 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold">{pos.symbol}</td>
                                    <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${pos.side === 'long' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{pos.side}</span></td>
                                    <td className="px-4 py-2.5 font-mono text-right text-[#848e9c]">${safeNum(pos.entry_price)}</td>
                                    <td className="px-4 py-2.5 font-mono text-right">{formatCrypto(pos.amount)}</td>
                                    <td className={`px-4 py-2.5 font-mono text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                        {livePrices[pos.symbol] ? `${isWin ? '+' : ''}${safeNum(livePnl.pct)}%` : 'Syncing...'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right space-x-3">
                                        <button onClick={() => forceClosePosition(pos.id)} className="text-[#fcd535] hover:text-[#e5c02a] text-[9px] font-bold uppercase transition-colors">Close Market</button>
                                        <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] text-[9px] font-bold uppercase transition-colors">Drop</button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                  </div>
               )}
            </div>

            {/* HISTORICAL LEDGER */}
            <div className="bg-[#181a20] border border-[#2b3139] rounded-sm overflow-hidden flex flex-col h-[600px]">
               <div className="px-4 py-3 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center shrink-0">
                  <div className="flex items-center space-x-3">
                      <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Historical Ledger</h3>
                      {totalPagesPositions > 1 && (
                          <div className="flex space-x-2 items-center bg-[#181a20] rounded border border-[#2b3139] overflow-hidden ml-4">
                              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p=>p-1)} className="px-2 py-0.5 hover:bg-[#3b4149] disabled:opacity-30 text-[#848e9c]">◀</button>
                              <span className="text-[9px] font-bold text-[#eaecef] px-2">PG {currentPage} / {totalPagesPositions}</span>
                              <button disabled={currentPage === totalPagesPositions} onClick={() => setCurrentPage(p=>p+1)} className="px-2 py-0.5 hover:bg-[#3b4149] disabled:opacity-30 text-[#848e9c]">▶</button>
                          </div>
                      )}
                  </div>
                  <button 
                      onClick={bulkDelete} 
                      disabled={closedPositions.length === 0} 
                      className="text-[#f6465d] hover:text-white border border-transparent hover:border-[#f6465d]/50 hover:bg-[#f6465d] text-[9px] font-bold uppercase px-2 py-1 rounded transition-colors disabled:opacity-30"
                  >
                      Wipe Filtered History
                  </button>
               </div>
               
               <div className="overflow-y-auto flex-1 custom-scrollbar">
               {closedPositions.length === 0 ? (
                   <div className="p-10 text-center text-[#848e9c] text-xs italic">No historical trades found matching your filters.</div>
               ) : (
                  <table className="w-full text-left whitespace-nowrap relative">
                      <thead className="bg-[#0b0e11] text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 shadow-sm border-b border-[#2b3139]">
                          <tr>
                              <th className="px-4 py-2 font-bold">Date Closed</th>
                              <th className="px-4 py-2 font-bold">Algorithm</th>
                              <th className="px-4 py-2 font-bold">Pair</th>
                              <th className="px-4 py-2 font-bold text-right">Entry</th>
                              <th className="px-4 py-2 font-bold text-right">Size</th>
                              <th className="px-4 py-2 font-bold text-right">Yield</th>
                              <th className="px-4 py-2 font-bold text-right">Net PNL</th>
                              <th className="px-4 py-2 font-bold text-center"></th>
                          </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#eaecef]">
                          {renderedPositions.map(pos => {
                              const isWin = (pos.profit_abs || 0) >= 0;
                              return (
                                  <tr key={pos.id} className="border-b border-[#2b3139]/30 hover:bg-[#2b3139]/20 transition-colors">
                                      <td className="px-4 py-2 text-[#848e9c]">{pos.closed_at ? new Date(pos.closed_at).toLocaleString() : 'N/A'}</td>
                                      <td className="px-4 py-2 font-bold text-[#eaecef]">
                                          {pos.bot_name}
                                          <span className="ml-2 bg-[#2b3139] px-1 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                      </td>
                                      <td className="px-4 py-2 font-bold">{pos.symbol}</td>
                                      <td className="px-4 py-2 font-mono text-right text-[#848e9c]">${safeNum(pos.entry_price)}</td>
                                      <td className="px-4 py-2 font-mono text-right text-[#848e9c]">{formatCrypto(pos.amount)}</td>
                                      <td className="px-4 py-2 text-right">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${isWin ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                              {isWin ? '+' : ''}{safeNum(pos.profit_pct)}%
                                          </span>
                                      </td>
                                      <td className={`px-4 py-2 font-mono text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                          {isWin ? '+$' : '-$'}{safeNum(Math.abs(pos.profit_abs))}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                          <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors font-bold" title="Delete Trade">✕</button>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
               )}
               </div>
            </div>
          </>
      ) : (
          <div className="bg-[#181a20] border border-[#2b3139] rounded-sm overflow-hidden flex flex-col h-[600px]">
             <div className="px-4 py-3 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Raw Execution Log</h3>
                    <p className="text-[9px] text-[#848e9c] mt-0.5">Network requests sent to exchange or simulator.</p>
                </div>
                {totalPagesOrders > 1 && (
                    <div className="flex space-x-2 items-center bg-[#181a20] rounded border border-[#2b3139] overflow-hidden ml-4">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p=>p-1)} className="px-2 py-0.5 hover:bg-[#3b4149] disabled:opacity-30 text-[#848e9c]">◀</button>
                        <span className="text-[9px] font-bold text-[#eaecef] px-2">PG {currentPage} / {totalPagesOrders}</span>
                        <button disabled={currentPage === totalPagesOrders} onClick={() => setCurrentPage(p=>p+1)} className="px-2 py-0.5 hover:bg-[#3b4149] disabled:opacity-30 text-[#848e9c]">▶</button>
                    </div>
                )}
             </div>
             
             <div className="overflow-y-auto flex-1 custom-scrollbar">
             {filteredOrders.length === 0 ? (
                 <div className="p-10 text-center text-[#848e9c] text-xs italic">No orders found matching your filters.</div>
             ) : (
                <table className="w-full text-left whitespace-nowrap relative">
                    <thead className="bg-[#0b0e11] text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 shadow-sm border-b border-[#2b3139]">
                        <tr>
                            <th className="px-4 py-2 font-bold">Timestamp</th>
                            <th className="px-4 py-2 font-bold">Algorithm</th>
                            <th className="px-4 py-2 font-bold">Pair</th>
                            <th className="px-4 py-2 font-bold">Action</th>
                            <th className="px-4 py-2 font-bold text-right">Fill Price</th>
                            <th className="px-4 py-2 font-bold text-right">Size</th>
                            <th className="px-4 py-2 font-bold text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#eaecef]">
                        {renderedOrders.map(order => (
                            <tr key={order.id} className="border-b border-[#2b3139]/30 hover:bg-[#2b3139]/20 transition-colors">
                                <td className="px-4 py-2 text-[#848e9c]">{new Date(order.timestamp).toLocaleString()}</td>
                                <td className="px-4 py-2 font-bold text-[#eaecef]">
                                    {order.bot_name}
                                    <span className="ml-2 bg-[#2b3139] px-1 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{order.mode}</span>
                                </td>
                                <td className="px-4 py-2 font-bold">{order.symbol}</td>
                                <td className="px-4 py-2">
                                    <span className={`font-bold uppercase ${order.side === 'buy' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                        {order.side} <span className="text-[#848e9c] font-normal text-[9px]">{order.order_type}</span>
                                    </span>
                                </td>
                                <td className="px-4 py-2 font-mono text-right text-[#eaecef]">${safeNum(order.price)}</td>
                                <td className="px-4 py-2 font-mono text-right text-[#848e9c]">{formatCrypto(order.amount)}</td>
                                <td className="px-4 py-2 text-right">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${order.status === 'filled' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : (order.status === 'rejected' ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#fcd535]/10 text-[#fcd535]')}`}>
                                        {order.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             )}
             </div>
          </div>
      )}
      </div>

    </div>
  );
}