import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import GlowPanel from './ui/GlowPanel';
import Modal from './ui/Modal';

export default function DataManager({ openChart, setError }) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingSymbol, setSyncingSymbol] = useState(null);

  const [symbol, setSymbol] = useState('BTC-USDC');
  const [timeframe, setTimeframe] = useState('1d');
  const [startDate, setStartDate] = useState('2024-01-01T00:00');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 16));

  const [modalConfig, setModalConfig] = useState(null);
  const [pruneModalConfig, setPruneModalConfig] = useState(null);
  const [pruneDate, setPruneDate] = useState('');

  const [filterSymbol, setFilterSymbol] = useState('ALL');
  const [filterTf, setFilterTimeframe] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const fetchSummary = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/data/summary');
      setSummary(response.data);
    } catch (err) {
      if (setError) setError(err.message);
    }
  }, [setError]);

  useEffect(() => {
    fetchSummary(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
  }, [fetchSummary]);

  const handleFilterSymbol = useCallback((val) => {
      setFilterSymbol(val);
      setCurrentPage(1);
  }, []);
  const handleFilterTimeframe = useCallback((val) => {
      setFilterTimeframe(val);
      setCurrentPage(1);
  }, []);

  const handleDownload = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (setError) setError(null);
    try {
      const payload = {
        timeframe: timeframe,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString()
      };

      const response = await apiClient.post(`/api/data/fetch/${symbol.toUpperCase()}`, payload);
      setModalConfig({
        type: 'success',
        title: 'Download Complete',
        message: response.data.new_saved != null
          ? `${response.data.message} ${response.data.new_saved} new candles added.`
          : response.data.message,
        confirmText: 'OK',
        onConfirm: () => setModalConfig(null)
      });
      fetchSummary();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleSync = async (row) => {
    setSyncingSymbol(`${row.symbol}_${row.timeframe}`);
    if (setError) setError(null);
    try {
      const payload = {
        timeframe: row.timeframe,
        start_date: new Date(row.newest_candle).toISOString(),
        end_date: new Date().toISOString()
      };

      const safeSymbol = row.symbol.replace('/', '-');
      const response = await apiClient.post(`/api/data/fetch/${safeSymbol}`, payload);
      setModalConfig({
        type: 'success',
        title: 'Sync Complete',
        message: `${row.symbol} synced. ${response.data.new_saved} new candles fetched.`,
        confirmText: 'OK',
        onConfirm: () => setModalConfig(null)
      });
      fetchSummary();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    }
    setSyncingSymbol(null);
  };

  const executeDelete = async (delSymbol, delTimeframe, beforeDateStr) => {
    setLoading(true);
    try {
      let endpoint = `/api/data?symbol=${delSymbol}&timeframe=${delTimeframe}`;
      if (beforeDateStr && beforeDateStr.trim() !== "") {
          const isoDate = new Date(beforeDateStr).toISOString();
          endpoint += `&before_date=${isoDate}`;
      }

      const res = await apiClient.delete(endpoint);
      setPruneModalConfig(null);
      setModalConfig({
        type: 'success',
        title: 'Data Pruned',
        message: res.data.message,
        confirmText: 'OK',
        onConfirm: () => setModalConfig(null)
      });
      fetchSummary();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.message);
      setPruneModalConfig(null);
    }
    setLoading(false);
  };

  const handleDeleteClick = (row) => {
    setPruneDate('');
    setPruneModalConfig({ symbol: row.symbol, timeframe: row.timeframe });
  };

  const uniqueSymbols = useMemo(() => [...new Set(summary.map(r => r.symbol))], [summary]);
  const uniqueTimeframes = useMemo(() => [...new Set(summary.map(r => r.timeframe))], [summary]);

  const filteredData = useMemo(() => {
      return summary.filter(row => {
          if (filterSymbol !== 'ALL' && row.symbol !== filterSymbol) return false;
          if (filterTf !== 'ALL' && row.timeframe !== filterTf) return false;
          return true;
      });
  }, [summary, filterSymbol, filterTf]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const renderedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const bulkDeleteFiltered = async () => {
      if (filteredData.length === 0) return;
      setModalConfig({
        type: 'danger',
        title: 'Bulk Wipe Data',
        message: `WARNING: You are about to permanently delete all data for ${filteredData.length} active filters. Proceed?`,
        confirmText: 'WIPE ALL FILTERED',
        onConfirm: async () => {
            setLoading(true);
            try {
                await Promise.all(filteredData.map(row =>
                    apiClient.delete(`/api/data?symbol=${row.symbol.replace('/', '-')}&timeframe=${row.timeframe}`)
                ));
                fetchSummary();
                setModalConfig({ type: 'success', title: 'Database Wiped', message: `Successfully deleted all data matching your filters.`, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
            } catch {
                setModalConfig({ type: 'danger', title: 'Error', message: 'Failed to delete some data.', confirmText: 'OK', onConfirm: () => setModalConfig(null) });
            }
            setLoading(false);
        },
        onCancel: () => setModalConfig(null)
      });
  };

  const inputClass = "w-full bg-[#080a0f] border border-[#202532] text-[#eaecef] px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#0ea5e9] focus:shadow-[0_0_8px_rgba(14,165,233,0.1)] transition-all duration-200 rounded-lg";
  const selectClass = "bg-[#080a0f] border border-[#202532] text-[#eaecef] text-[10px] uppercase font-bold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-all duration-200 hover:border-[#848e9c]";

  return (
    <PageShell glowColor="gold">
      <Modal config={modalConfig} />

      {/* Prune modal — custom body */}
      {pruneModalConfig && (
        <Modal
          config={{
            type: 'danger',
            title: 'Prune Market Data',
            onCancel: () => setPruneModalConfig(null),
          }}
          customBody={
            <div className="space-y-4">
              <p className="text-[11px] text-[#eaecef] leading-relaxed">
                Manage local data for <strong className="text-[#fcd535]">{pruneModalConfig.symbol} ({pruneModalConfig.timeframe})</strong>. Select a date to delete all history before that date, or click Delete All to wipe the entire pair.
              </p>
              <div>
                <label className="block text-[9px] text-[#848e9c] mb-1.5 uppercase font-bold tracking-wider">Prune Before Date (Optional)</label>
                <input
                  type="date"
                  value={pruneDate}
                  onChange={e => setPruneDate(e.target.value)}
                  className="w-full bg-[#080a0f] border border-[#202532] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#f6465d] rounded-lg color-scheme-dark transition-all duration-200"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => executeDelete(pruneModalConfig.symbol, pruneModalConfig.timeframe, '')}
                  className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all duration-200 border border-[#f6465d]/50 text-[#f6465d] hover:bg-[#f6465d]/10"
                >
                  Delete All
                </button>
                <button
                  onClick={() => executeDelete(pruneModalConfig.symbol, pruneModalConfig.timeframe, pruneDate)}
                  disabled={!pruneDate}
                  className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all duration-200 bg-[#f6465d] hover:bg-[#f6465d]/80 text-white disabled:opacity-30 shadow-[0_0_12px_rgba(246,70,93,0.15)]"
                >
                  Prune Date
                </button>
              </div>
            </div>
          }
        />
      )}

      {/* Download bar */}
      <GlowPanel glowColor="gold">
        <h3 className="text-[#848e9c] text-[10px] font-bold mb-3 uppercase tracking-wider">Historical Data Engine</h3>
        <form onSubmit={handleDownload} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">Asset Pair</label>
            <input type="text" required value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className={inputClass} />
          </div>
          <div className="w-20 md:w-24">
            <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">Interval</label>
            <input type="text" required value={timeframe} onChange={e => setTimeframe(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">Start Date</label>
            <input type="datetime-local" required value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} text-[#848e9c] color-scheme-dark`} />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">End Date</label>
            <input type="datetime-local" required value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} text-[#848e9c] color-scheme-dark`} />
          </div>
          <button type="submit" disabled={loading || syncingSymbol !== null} className="w-full md:w-auto bg-[#fcd535] text-[#181a20] px-6 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-[#e5c02a] disabled:opacity-50 transition-all duration-200 rounded-lg h-[34px] shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)] active:scale-95">
            {loading ? 'Fetching...' : 'Download Data'}
          </button>
        </form>
      </GlowPanel>

      {/* Data table */}
      <div className="terminal-card overflow-hidden flex flex-col h-[600px]">
        <div className="bg-[#080a0f]/40 px-5 py-3.5 border-b border-[#202532] flex flex-wrap gap-y-3 justify-between items-center shrink-0">
            <div className="flex items-center space-x-3">
                <span className="text-[10px] text-[#848e9c] font-bold uppercase tracking-wider hidden md:inline">Filter View:</span>
                <select value={filterSymbol} onChange={(e) => handleFilterSymbol(e.target.value)} className={selectClass}>
                    <option value="ALL">All Pairs</option>
                    {uniqueSymbols.map(sym => <option key={sym} value={sym}>{sym}</option>)}
                </select>
                <select value={filterTf} onChange={(e) => handleFilterTimeframe(e.target.value)} className={selectClass}>
                    <option value="ALL">All Intervals</option>
                    {uniqueTimeframes.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                </select>

                {totalPages > 1 && (
                    <div className="flex space-x-2 items-center bg-[#080a0f] rounded-lg border border-[#202532] overflow-hidden ml-2 md:ml-4">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p=>p-1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9664;</button>
                        <span className="text-[9px] font-bold text-[#eaecef] px-2 font-mono">PG {currentPage} / {totalPages}</span>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p=>p+1)} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9654;</button>
                    </div>
                )}
            </div>

            <button
                onClick={bulkDeleteFiltered}
                disabled={filteredData.length === 0 || loading}
                className="text-[#f6465d] hover:text-white border border-transparent hover:border-[#f6465d]/50 hover:bg-[#f6465d] hover:shadow-[0_0_12px_rgba(246,70,93,0.2)] text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-30"
            >
                Wipe Filtered History
            </button>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-left whitespace-nowrap min-w-[700px] relative">
              <thead className="bg-[#080a0f]/80 border-b border-[#202532] text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-2.5 font-bold">Symbol</th>
                  <th className="px-5 py-2.5 font-bold">Interval</th>
                  <th className="px-5 py-2.5 font-bold">Data Points</th>
                  <th className="px-5 py-2.5 font-bold">Oldest Record</th>
                  <th className="px-5 py-2.5 font-bold">Newest Record</th>
                  <th className="px-5 py-2.5 font-bold text-right">Database Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {renderedData.map((row, i) => {
                  const isSyncing = syncingSymbol === `${row.symbol}_${row.timeframe}`;
                  return (
                    <tr key={i} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors duration-150 group">
                      <td className="px-5 py-2.5 text-[#eaecef] font-bold">{row.symbol}</td>
                      <td className="px-5 py-2.5 text-[#0ea5e9] font-bold">{row.timeframe}</td>
                      <td className="px-5 py-2.5 font-mono text-[#848e9c] group-hover:text-[#eaecef] transition-colors">{row.count.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-[11px] text-[#848e9c]">{new Date(row.oldest_candle).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-[11px] text-[#eaecef] font-bold">{new Date(row.newest_candle).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right space-x-3">
                        <button
                          onClick={() => handleSync(row)}
                          disabled={isSyncing || loading}
                          className="text-[#fcd535] hover:text-[#e5c02a] text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                          title="Fetch missing data up to exactly right now"
                        >
                          {isSyncing ? 'Syncing...' : 'Sync'}
                        </button>
                        <span className="text-[#202532]">|</span>
                        <button
                          onClick={() => openChart(row)}
                          disabled={isSyncing || loading}
                          className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                          Chart
                        </button>
                        <span className="text-[#202532]">|</span>
                        <button
                          onClick={() => handleDeleteClick(row)}
                          disabled={isSyncing || loading}
                          className="text-[#f6465d] hover:text-[#f6465d]/80 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                          Drop
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-12 text-center text-[#848e9c] text-xs">
                      No data matches your filters or the database is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      </div>
    </PageShell>
  );
}
