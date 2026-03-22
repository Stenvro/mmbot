import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function DataManager({ openChart, setError }) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingSymbol, setSyncingSymbol] = useState(null);
  
  const [symbol, setSymbol] = useState('BTC-EUR');
  const [timeframe, setTimeframe] = useState('1d'); 
  const [startDate, setStartDate] = useState('2025-01-01T00:00'); 
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 16));

  // NIEUW: Custom UI Modal States
  const [modalConfig, setModalConfig] = useState(null);
  const [pruneDate, setPruneDate] = useState('');

  const fetchSummary = async () => {
    try {
      const response = await apiClient.get('/api/data/summary');
      setSummary(response.data);
    } catch (err) {
      if (setError) setError(err.message);
    }
  };

  useEffect(() => {
    fetchSummary();
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
        message: `${response.data.message} (${response.data.new_saved} new candles added).`,
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
      setModalConfig({
        type: 'success',
        title: 'Data Pruned',
        message: res.data.message,
        onConfirm: () => setModalConfig(null)
      });
      fetchSummary();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.message);
      setModalConfig(null);
    }
    setLoading(false);
  };

  const handleDeleteClick = (row) => {
    setPruneDate('');
    setModalConfig({
      type: 'prune',
      title: 'Prune Market Data',
      symbol: row.symbol,
      timeframe: row.timeframe,
      onCancel: () => setModalConfig(null)
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 w-full fade-in relative">

      {/* CUSTOM UI MODALS */}
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-md w-full p-6 relative">
            
            {modalConfig.type === 'success' && (
               <>
                 <h3 className="text-lg font-bold mb-2 uppercase tracking-wider text-[#2ebd85]">{modalConfig.title}</h3>
                 <p className="text-[#848e9c] text-sm mb-6 leading-relaxed">{modalConfig.message}</p>
                 <div className="flex justify-end">
                   <button onClick={modalConfig.onConfirm} className="px-6 py-2 rounded text-xs font-bold uppercase transition-colors bg-[#2ebd85] hover:bg-[#2ebd85]/80 text-[#181a20]">OK</button>
                 </div>
               </>
            )}

            {modalConfig.type === 'prune' && (
               <>
                 <h3 className="text-lg font-bold mb-2 uppercase tracking-wider text-[#f6465d]">{modalConfig.title}</h3>
                 <p className="text-[#848e9c] text-sm mb-4 leading-relaxed">
                   Manage local data for <strong>{modalConfig.symbol} ({modalConfig.timeframe})</strong>. Select a date to delete all history before that date, or click 'Delete All' to wipe the entire pair.
                 </p>
                 
                 <label className="block text-xs text-[#848e9c] mb-1.5 uppercase font-bold tracking-wider">Prune Before Date (Optional)</label>
                 <input 
                    type="date" 
                    value={pruneDate} 
                    onChange={e => setPruneDate(e.target.value)} 
                    className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] rounded-sm mb-6 color-scheme-dark" 
                 />
                 
                 <div className="flex justify-between items-center pt-2">
                   <button onClick={modalConfig.onCancel} className="px-4 py-2 rounded text-xs font-bold text-[#848e9c] hover:bg-[#2b3139] transition-colors uppercase">Cancel</button>
                   <div className="flex space-x-3">
                     <button 
                       onClick={() => executeDelete(modalConfig.symbol, modalConfig.timeframe, '')} 
                       className="px-4 py-2 rounded text-xs font-bold uppercase transition-colors border border-[#f6465d]/50 text-[#f6465d] hover:bg-[#f6465d]/10"
                     >
                       Delete All
                     </button>
                     <button 
                       onClick={() => executeDelete(modalConfig.symbol, modalConfig.timeframe, pruneDate)} 
                       disabled={!pruneDate}
                       className="px-4 py-2 rounded text-xs font-bold uppercase transition-colors bg-[#f6465d] hover:bg-[#f6465d]/80 text-white disabled:opacity-30"
                     >
                       Prune Date
                     </button>
                   </div>
                 </div>
               </>
            )}

          </div>
        </div>
      )}

      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <h3 className="text-[#848e9c] text-xs font-bold mb-4 uppercase tracking-wider">Download Market Data</h3>
        <form onSubmit={handleDownload} className="flex flex-wrap gap-4 items-end">
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">Pair (e.g. BTC-EUR)</label>
            <input type="text" required value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" />
          </div>

          <div className="w-24">
            <label className="block text-xs text-[#848e9c] mb-1.5">Timeframe</label>
            <input type="text" required value={timeframe} onChange={e => setTimeframe(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">Start Date</label>
            <input type="datetime-local" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] color-scheme-dark rounded-sm" />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">End Date</label>
            <input type="datetime-local" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] color-scheme-dark rounded-sm" />
          </div>

          <button type="submit" disabled={loading || syncingSymbol !== null} className="bg-[#fcd535] text-[#181a20] px-6 py-2 text-sm font-semibold hover:bg-[#e5c02a] disabled:opacity-50 transition-colors rounded-sm h-[38px]">
            {loading ? 'Fetching...' : 'Download'}
          </button>
        </form>
      </div>

      <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0b0e11] border-b border-[#2b3139] text-xs text-[#848e9c] uppercase tracking-wider">
              <th className="p-4 font-medium">Symbol</th>
              <th className="p-4 font-medium">Interval</th>
              <th className="p-4 font-medium">Candles</th>
              <th className="p-4 font-medium">From</th>
              <th className="p-4 font-medium">To</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {summary.map((row, i) => {
              const isSyncing = syncingSymbol === `${row.symbol}_${row.timeframe}`;
              
              return (
                <tr key={i} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/40 transition-colors">
                  <td className="p-4 text-[#eaecef] font-semibold">{row.symbol}</td>
                  <td className="p-4 text-[#fcd535] font-mono">{row.timeframe}</td>
                  <td className="p-4 font-mono text-[#eaecef]">{row.count.toLocaleString()}</td>
                  <td className="p-4 text-xs text-[#848e9c]">{new Date(row.oldest_candle).toLocaleString()}</td>
                  <td className="p-4 text-xs text-[#eaecef] font-medium">{new Date(row.newest_candle).toLocaleString()}</td>
                  <td className="p-4 text-right space-x-3">
                    
                    <button 
                      onClick={() => handleSync(row)} 
                      disabled={isSyncing || loading}
                      className="text-[#fcd535] hover:text-[#e5c02a] font-medium transition-colors disabled:opacity-50"
                      title="Fetch missing data up to exactly right now"
                    >
                      {isSyncing ? 'Syncing...' : 'Sync to Now'}
                    </button>

                    <button 
                      onClick={() => openChart(row)} 
                      disabled={isSyncing || loading}
                      className="text-[#2ebd85] hover:text-[#2ebd85]/80 font-medium transition-colors disabled:opacity-50"
                    >
                      Chart
                    </button>
                    
                    <button 
                      onClick={() => handleDeleteClick(row)} 
                      disabled={isSyncing || loading}
                      className="text-[#f6465d] hover:text-[#f6465d]/80 font-medium transition-colors disabled:opacity-50"
                    >
                      Prune / Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {summary.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-[#848e9c] italic">
                  No data available in local database. Use the form above to download market data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}