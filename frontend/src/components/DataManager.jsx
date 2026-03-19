import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function DataManager({ openChart, setError }) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Form states met standaardwaarden
  const [symbol, setSymbol] = useState('BTC-EUR');
  const [timeframe, setTimeframe] = useState('1h');
  const [startDate, setStartDate] = useState('2024-01-01T00:00');
  // End date standaard op nu (zonder seconden)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 16));

  // Haal het overzicht van opgeslagen data op
  const fetchSummary = async () => {
    try {
      const response = await apiClient.get('/api/data/summary');
      setSummary(response.data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Laad overzicht bij opstarten
  useEffect(() => {
    fetchSummary();
  }, []);

  // Handler voor het downloaden van nieuwe data
  const handleDownload = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Het nieuwe JSON payload object, passend bij het backend schema
      const payload = {
        timeframe: timeframe,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString()
      };

      // POST request met JSON body, symbool in de URL
      const response = await apiClient.post(`/api/data/fetch/${symbol.toUpperCase()}`, payload);
      
      alert(`Success: ${response.data.message} (${response.data.new_saved} new candles)`);
      // Ververs de tabel
      fetchSummary();
    } catch (err) {
      // Vang detailfouten van de backend op, of algemene fouten
      setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  // Handler voor het verwijderen van data
  const handleDelete = async (delSymbol, delTimeframe) => {
    if (!window.confirm(`Are you sure you want to delete all ${delSymbol} data for timeframe ${delTimeframe}?`)) return;
    try {
      // DELETE request met query parameters
      await apiClient.delete(`/api/data?symbol=${delSymbol}&timeframe=${delTimeframe}`);
      fetchSummary();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 w-full fade-in">
      
      {/* DOWNLOAD FORMULIER SECTIE */}
      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <h3 className="text-[#848e9c] text-xs font-bold mb-4 uppercase tracking-wider">Download Market Data</h3>
        <form onSubmit={handleDownload} className="flex flex-wrap gap-4 items-end">
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">Pair (e.g. BTC-EUR)</label>
            <input 
              type="text" 
              required 
              value={symbol} 
              onChange={e => setSymbol(e.target.value.toUpperCase())} 
              className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" 
            />
          </div>

          <div className="w-24">
            <label className="block text-xs text-[#848e9c] mb-1.5">Timeframe</label>
            <input 
              type="text" 
              required 
              value={timeframe} 
              onChange={e => setTimeframe(e.target.value)} 
              className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" 
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">Start Date</label>
            <input 
              type="datetime-local" 
              required 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] color-scheme-dark rounded-sm" 
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[#848e9c] mb-1.5">End Date</label>
            <input 
              type="datetime-local" 
              required 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] color-scheme-dark rounded-sm" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="bg-[#fcd535] text-[#181a20] px-6 py-2 text-sm font-semibold hover:bg-[#e5c02a] disabled:opacity-50 transition-colors rounded-sm h-[38px]"
          >
            {loading ? 'Fetching...' : 'Download'}
          </button>
        </form>
      </div>

      {/* OPSLAG OVERZICHT TABEL SECTIE */}
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
            {summary.map((row, i) => (
              <tr key={i} className="border-b border-[#2b3139]/50 hover:bg-[#2b3139]/40 transition-colors">
                <td className="p-4 text-[#eaecef] font-semibold">{row.symbol}</td>
                <td className="p-4 text-[#fcd535] font-mono">{row.timeframe}</td>
                <td className="p-4 font-mono text-[#eaecef]">{row.count.toLocaleString()}</td>
                <td className="p-4 text-xs text-[#848e9c]">{new Date(row.oldest_candle).toLocaleString()}</td>
                <td className="p-4 text-xs text-[#848e9c]">{new Date(row.newest_candle).toLocaleString()}</td>
                <td className="p-4 text-right space-x-4">
                  <button 
                    onClick={() => openChart(row)} 
                    className="text-[#2ebd85] hover:text-[#2ebd85]/80 font-medium transition-colors"
                  >
                    Chart
                  </button>
                  <button 
                    onClick={() => handleDelete(row.symbol, row.timeframe)} 
                    className="text-[#f6465d] hover:text-[#f6465d]/80 font-medium transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
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