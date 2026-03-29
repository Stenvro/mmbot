import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import StatCard from './ui/StatCard';
import Modal from './ui/Modal';

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
  const [, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null);

  const [activeTab, setActiveTab] = useState('positions');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 150;

  const [livePrices, setLivePrices] = useState({});

  const [filterMode, setFilterMode] = useState('all');
  const [filterBot, setFilterBot] = useState('all');
  const [filterSymbol, setFilterSymbol] = useState('all');

  const fetchLivePrices = useCallback(async (currentPositions) => {
      const activePos = currentPositions.filter(p => p.status === 'open');
      if (activePos.length === 0) return;

      const uniqueSymbols = [...new Set(activePos.map(p => p.symbol))];
      const priceMap = {};

      for (const sym of uniqueSymbols) {
          try {
              const res = await apiClient.get(`/api/data/market-info/${sym.replace('/', '-')}`);
              if (res.data && res.data.last) {
                  priceMap[sym] = res.data.last;
              }
          } catch { /* silent */ }
      }
      setLivePrices(prev => ({ ...prev, ...priceMap }));
  }, []);

  const fetchAllData = useCallback(async () => {
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
  }, [setError, fetchLivePrices]);

  useEffect(() => {
    fetchAllData(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
  }, [fetchAllData]);

  useEffect(() => {
    if (positions.length === 0) return;
    const priceInterval = setInterval(() => fetchLivePrices(positions), 10000);
    return () => clearInterval(priceInterval);
  }, [positions, fetchLivePrices]);

  const deleteHistoricalTrade = async (id) => {
      setModalConfig({
        type: 'danger',
        title: 'Delete Trade Record',
        message: `Are you sure you want to permanently delete this trade from the ledger? This will impact your PNL statistics.`,
        confirmText: 'Delete',
        onConfirm: async () => {
            try {
                await apiClient.delete(`/api/trades/positions/${id}`);
                fetchAllData();
                setModalConfig(null);
            } catch {
                setModalConfig({ type: 'danger', title: 'Error', message: "Failed to delete trade.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
            }
        },
        onCancel: () => setModalConfig(null)
      });
  };

  const forceClosePosition = async (id) => {
      setModalConfig({
        type: 'warning',
        title: 'Force Close Position',
        message: 'Are you sure you want to manually force close this position? It will be closed at the last known local market price and added to your Historical Ledger.',
        confirmText: 'Force Close',
        onConfirm: async () => {
            setLoading(true);
            try {
                const res = await apiClient.post(`/api/trades/positions/${id}/close`);
                fetchAllData();
                setModalConfig({ type: 'success', title: 'Position Closed', message: res.data.message, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
            } catch (e) {
                setModalConfig({ type: 'danger', title: 'Error', message: e.response?.data?.detail || "Failed to close.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
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
          netPnl,
          netPnlFormatted: safeNum(netPnl, 2),
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
        type: 'danger',
        title: 'Bulk Delete Trades',
        message: `WARNING: You are about to permanently delete ALL ${closedPositions.length} historical trades that match your current filters. Proceed?`,
        confirmText: 'DELETE ALL FILTERED',
        onConfirm: async () => {
            setLoading(true);
            try {
                await Promise.all(closedPositions.map(p => apiClient.delete(`/api/trades/positions/${p.id}`)));
                fetchAllData();
                setModalConfig(null);
            } catch {
                setModalConfig({ type: 'danger', title: 'Error', message: "Some trades failed to delete.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
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

  const selectClass = "bg-transparent text-[#eaecef] text-xs font-bold border-b border-[#202532] hover:border-[#848e9c] focus:border-[#fcd535] outline-none cursor-pointer pb-0.5 transition-colors";

  return (
    <PageShell glowColor="cyan">
      <Modal config={modalConfig} />

      {/* FILTER BAR */}
      <div className="terminal-card px-5 py-3.5 flex flex-wrap gap-4 items-center justify-between sticky top-0 z-20">
          <div className="flex space-x-6 flex-wrap gap-y-3">
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Algorithm</span>
                  <select value={filterBot} onChange={e => { setFilterBot(e.target.value); setCurrentPage(1); }} className={selectClass}>
                      <option value="all" className="bg-[#12151c]">All Bots</option>
                      {uniqueBots.map(b => <option key={b} value={b} className="bg-[#12151c]">{b}</option>)}
                  </select>
              </div>
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Asset</span>
                  <select value={filterSymbol} onChange={e => { setFilterSymbol(e.target.value); setCurrentPage(1); }} className={selectClass}>
                      <option value="all" className="bg-[#12151c]">All Pairs</option>
                      {uniqueSymbols.map(s => <option key={s} value={s} className="bg-[#12151c]">{s}</option>)}
                  </select>
              </div>
              <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Environment</span>
                  <select value={filterMode} onChange={e => { setFilterMode(e.target.value); setCurrentPage(1); }} className={selectClass}>
                      <option value="all" className="bg-[#12151c]">All Modes</option>
                      <option value="live" className="bg-[#12151c]">Live Exchange</option>
                      <option value="paper" className="bg-[#12151c]">Paper Trading</option>
                      <option value="backtest" className="bg-[#12151c]">Local Backtest</option>
                  </select>
              </div>
          </div>
          <div className="flex space-x-3 items-center">
              <button onClick={exportToCSV} className="text-[#848e9c] hover:text-[#eaecef] text-[10px] font-bold uppercase px-3 py-1.5 transition-all duration-200 flex items-center border border-transparent hover:border-[#202532] rounded-lg">
                 <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                 Export CSV
              </button>
              <button onClick={fetchAllData} disabled={loading} className="bg-[#202532] hover:bg-[#2b3545] text-[#eaecef] text-[10px] font-bold uppercase px-4 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-50">
                 {loading ? '...' : 'Sync'}
              </button>
          </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard label="Filtered Net PNL" value={`${stats.netPnl >= 0 ? '+' : '-'}$${safeNum(Math.abs(stats.netPnl), 2)}`} color={stats.netPnl >= 0 ? 'green' : 'red'} />
          <StatCard label="Win Rate" value={`${stats.winRate}%`} color="cyan" />
          <StatCard label="Profit Factor" value={stats.profitFactor} color="gold" />
          <StatCard label="Total Trades" value={stats.total} color="white" />
          <div className="terminal-card p-4 border-l-2 border-[#2ebd85]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#848e9c] mb-1">Avg Win / Loss</p>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-mono font-bold text-[#2ebd85]">+{stats.avgWin}</span>
              <span className="text-[10px] text-[#848e9c]">/</span>
              <span className="text-sm font-mono font-bold text-[#f6465d]">-{stats.avgLoss}</span>
            </div>
          </div>
          <div className="terminal-card p-4 border-l-2 border-[#fcd535]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#848e9c] mb-1">Best / Worst</p>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-mono font-bold text-[#2ebd85]">+{stats.bestTrade}</span>
              <span className="text-[10px] text-[#848e9c]">/</span>
              <span className="text-sm font-mono font-bold text-[#f6465d]">-{stats.worstTrade}</span>
            </div>
          </div>
      </div>

      {/* TABS */}
      <div className="flex space-x-8 border-b border-[#202532] mt-2 mb-2">
          <button
              onClick={() => {setActiveTab('positions'); setCurrentPage(1);}}
              className={`pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${activeTab === 'positions' ? 'text-[#fcd535] border-[#fcd535] shadow-[0_2px_12px_rgba(252,213,53,0.15)]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Aggregated Positions
          </button>
          <button
              onClick={() => {setActiveTab('orders'); setCurrentPage(1);}}
              className={`pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${activeTab === 'orders' ? 'text-[#fcd535] border-[#fcd535] shadow-[0_2px_12px_rgba(252,213,53,0.15)]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`}
          >
              Raw Execution Log
          </button>
      </div>

      <div>
      {activeTab === 'positions' ? (
          <>
            {/* ACTIVE POSITIONS */}
            <div className="terminal-card overflow-hidden mb-6">
               <div className="px-5 py-3.5 border-b border-[#202532] bg-[#080a0f]/40 flex justify-between items-center">
                  <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Active Open Positions <span className="text-[#848e9c] ml-1">({activePositions.length})</span></h3>
               </div>
               {activePositions.length === 0 ? (
                   <div className="p-8 text-center text-[#848e9c] text-xs">No active positions match your filters.</div>
               ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider border-b border-[#202532]">
                            <tr>
                                <th className="px-4 py-2.5 font-bold">Algorithm</th>
                                <th className="px-4 py-2.5 font-bold">Symbol</th>
                                <th className="px-4 py-2.5 font-bold">Side</th>
                                <th className="px-4 py-2.5 font-bold text-right">Entry Price</th>
                                <th className="px-4 py-2.5 font-bold text-right">Amount</th>
                                <th className="px-4 py-2.5 font-bold text-right">Live PNL</th>
                                <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px] font-mono text-[#eaecef]">
                            {activePositions.map(pos => {
                                const livePnl = getLivePnl(pos);
                                const isWin = livePnl.abs >= 0;
                                return (
                                <tr key={pos.id} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors duration-150">
                                    <td className="px-4 py-2.5 font-bold font-sans text-[#eaecef]">
                                        {pos.bot_name}
                                        <span className="ml-2 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold font-sans">{pos.symbol}</td>
                                    <td className="px-4 py-2.5 font-sans"><span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${pos.side === 'long' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{pos.side}</span></td>
                                    <td className="px-4 py-2.5 text-right text-[#848e9c]">${safeNum(pos.entry_price)}</td>
                                    <td className="px-4 py-2.5 text-right">{formatCrypto(pos.amount)}</td>
                                    <td className={`px-4 py-2.5 text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                        {livePrices[pos.symbol] ? `${isWin ? '+' : ''}${safeNum(livePnl.pct)}%` : 'Syncing...'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right space-x-3 font-sans">
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
            <div className="terminal-card overflow-hidden flex flex-col h-[600px]">
               <div className="px-5 py-3.5 border-b border-[#202532] bg-[#080a0f]/40 flex justify-between items-center shrink-0">
                  <div className="flex items-center space-x-3">
                      <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Historical Ledger</h3>
                      {totalPagesPositions > 1 && (
                          <div className="flex space-x-2 items-center bg-[#080a0f] rounded-lg border border-[#202532] overflow-hidden ml-4">
                              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p=>p-1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9664;</button>
                              <span className="text-[9px] font-bold text-[#eaecef] px-2 font-mono">PG {currentPage} / {totalPagesPositions}</span>
                              <button disabled={currentPage === totalPagesPositions} onClick={() => setCurrentPage(p=>p+1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9654;</button>
                          </div>
                      )}
                  </div>
                  <button
                      onClick={bulkDelete}
                      disabled={closedPositions.length === 0}
                      className="text-[#f6465d] hover:text-white border border-transparent hover:border-[#f6465d]/50 hover:bg-[#f6465d] hover:shadow-[0_0_12px_rgba(246,70,93,0.2)] text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-30"
                  >
                      Wipe Filtered History
                  </button>
               </div>

               <div className="overflow-y-auto flex-1 custom-scrollbar">
               {closedPositions.length === 0 ? (
                   <div className="p-10 text-center text-[#848e9c] text-xs">No historical trades found matching your filters.</div>
               ) : (
                  <table className="w-full text-left whitespace-nowrap relative">
                      <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 border-b border-[#202532]">
                          <tr>
                              <th className="px-4 py-2.5 font-bold">Date Closed</th>
                              <th className="px-4 py-2.5 font-bold">Algorithm</th>
                              <th className="px-4 py-2.5 font-bold">Pair</th>
                              <th className="px-4 py-2.5 font-bold text-right">Entry</th>
                              <th className="px-4 py-2.5 font-bold text-right">Size</th>
                              <th className="px-4 py-2.5 font-bold text-right">Yield</th>
                              <th className="px-4 py-2.5 font-bold text-right">Net PNL</th>
                              <th className="px-4 py-2.5 font-bold text-center"></th>
                          </tr>
                      </thead>
                      <tbody className="text-[11px] font-mono text-[#eaecef]">
                          {renderedPositions.map(pos => {
                              const isWin = (pos.profit_abs || 0) >= 0;
                              return (
                                  <tr key={pos.id} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors duration-150">
                                      <td className="px-4 py-2.5 text-[#848e9c]">{pos.closed_at ? new Date(pos.closed_at).toLocaleString() : 'N/A'}</td>
                                      <td className="px-4 py-2.5 font-bold font-sans text-[#eaecef]">
                                          {pos.bot_name}
                                          <span className="ml-2 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                      </td>
                                      <td className="px-4 py-2.5 font-bold font-sans">{pos.symbol}</td>
                                      <td className="px-4 py-2.5 text-right text-[#848e9c]">${safeNum(pos.entry_price)}</td>
                                      <td className="px-4 py-2.5 text-right text-[#848e9c]">{formatCrypto(pos.amount)}</td>
                                      <td className="px-4 py-2.5 text-right">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isWin ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                              {isWin ? '+' : ''}{safeNum(pos.profit_pct)}%
                                          </span>
                                      </td>
                                      <td className={`px-4 py-2.5 text-right font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                          {isWin ? '+$' : '-$'}{safeNum(Math.abs(pos.profit_abs))}
                                      </td>
                                      <td className="px-4 py-2.5 text-center font-sans">
                                          <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors font-bold" title="Delete Trade">&#10005;</button>
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
          <div className="terminal-card overflow-hidden flex flex-col h-[600px]">
             <div className="px-5 py-3.5 border-b border-[#202532] bg-[#080a0f]/40 flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-[#eaecef] font-bold text-[11px] uppercase tracking-wider">Raw Execution Log</h3>
                    <p className="text-[9px] text-[#848e9c] mt-0.5">Network requests sent to exchange or simulator.</p>
                </div>
                {totalPagesOrders > 1 && (
                    <div className="flex space-x-2 items-center bg-[#080a0f] rounded-lg border border-[#202532] overflow-hidden ml-4">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p=>p-1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9664;</button>
                        <span className="text-[9px] font-bold text-[#eaecef] px-2 font-mono">PG {currentPage} / {totalPagesOrders}</span>
                        <button disabled={currentPage === totalPagesOrders} onClick={() => setCurrentPage(p=>p+1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9654;</button>
                    </div>
                )}
             </div>

             <div className="overflow-y-auto flex-1 custom-scrollbar">
             {filteredOrders.length === 0 ? (
                 <div className="p-10 text-center text-[#848e9c] text-xs">No orders found matching your filters.</div>
             ) : (
                <table className="w-full text-left whitespace-nowrap relative">
                    <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 border-b border-[#202532]">
                        <tr>
                            <th className="px-4 py-2.5 font-bold">Timestamp</th>
                            <th className="px-4 py-2.5 font-bold">Algorithm</th>
                            <th className="px-4 py-2.5 font-bold">Pair</th>
                            <th className="px-4 py-2.5 font-bold">Action</th>
                            <th className="px-4 py-2.5 font-bold text-right">Fill Price</th>
                            <th className="px-4 py-2.5 font-bold text-right">Size</th>
                            <th className="px-4 py-2.5 font-bold text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px] font-mono text-[#eaecef]">
                        {renderedOrders.map(order => (
                            <tr key={order.id} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors duration-150">
                                <td className="px-4 py-2.5 text-[#848e9c]">{new Date(order.timestamp).toLocaleString()}</td>
                                <td className="px-4 py-2.5 font-bold font-sans text-[#eaecef]">
                                    {order.bot_name}
                                    <span className="ml-2 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{order.mode}</span>
                                </td>
                                <td className="px-4 py-2.5 font-bold font-sans">{order.symbol}</td>
                                <td className="px-4 py-2.5 font-sans">
                                    <span className={`font-bold uppercase ${order.side === 'buy' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                        {order.side} <span className="text-[#848e9c] font-normal text-[9px]">{order.order_type}</span>
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-[#eaecef]">${safeNum(order.price)}</td>
                                <td className="px-4 py-2.5 text-right text-[#848e9c]">{formatCrypto(order.amount)}</td>
                                <td className="px-4 py-2.5 text-right font-sans">
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

    </PageShell>
  );
}
