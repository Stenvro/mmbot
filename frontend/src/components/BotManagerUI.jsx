import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function BotManagerUI({ setError }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedBot, setExpandedBot] = useState(null);

  const fetchBots = async () => {
    try {
      // FIX: Trailing slash toegevoegd om de 307 redirect te voorkomen!
      const response = await apiClient.get('/api/bots/');
      setBots(response.data);
    } catch (err) {
      if (setError) setError("Failed to fetch bots from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  const toggleBotState = async (botId, currentStatus) => {
    try {
      const endpoint = currentStatus ? 'stop' : 'start';
      await apiClient.post(`/api/bots/${botId}/${endpoint}`);
      fetchBots(); 
    } catch (err) {
      if (setError) setError("Error changing bot status.");
    }
  };

  const deleteBot = async (botId) => {
    if (!window.confirm("Are you sure? This will delete the bot and ALL its historical signals.")) return;
    try {
      await apiClient.delete(`/api/bots/${botId}`);
      fetchBots();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Error deleting bot. Stop it first.");
    }
  };

  const toggleAssets = (botId) => {
    setExpandedBot(expandedBot === botId ? null : botId);
  };

  if (loading) return <div className="max-w-6xl mx-auto space-y-6 w-full text-[#848e9c] animate-pulse">Loading Configurations...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 w-full fade-in">
      
      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-[#848e9c] text-xs font-bold uppercase tracking-wider mb-1">Algorithm Configurations</h3>
          <p className="text-xs text-[#848e9c]">Manage your active node evaluators and execution modes.</p>
        </div>
        <button 
          className="bg-[#fcd535] text-[#181a20] px-6 py-2 text-sm font-semibold hover:bg-[#e5c02a] transition-colors rounded-sm h-[38px] flex items-center shadow-lg"
          onClick={() => alert("WIP: Node Builder opent hier binnenkort.")}
        >
          <span className="text-lg mr-2 leading-none mt-[-2px]">+</span> Add Bot
        </button>
      </div>

      <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0b0e11] border-b border-[#2b3139] text-xs text-[#848e9c] uppercase tracking-wider">
              <th className="p-4 font-medium">Configuration Name</th>
              <th className="p-4 font-medium">Interval & Markets</th>
              <th className="p-4 font-medium">Mode</th>
              <th className="p-4 font-medium">Engine Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {bots.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-[#848e9c] italic">No bots configured yet.</td></tr>
            ) : (
              bots.map((bot) => (
                <React.Fragment key={bot.id}>
                  <tr className={`border-b border-[#2b3139]/50 hover:bg-[#2b3139]/40 transition-colors ${expandedBot === bot.id ? 'bg-[#2b3139]/20' : ''}`}>
                    <td className="p-4 text-[#eaecef] font-semibold">{bot.name}</td>
                    
                    <td className="p-4">
                      <div className="flex items-center space-x-4">
                        <span className="text-[#fcd535] font-mono text-sm font-bold">
                          {bot.settings?.timeframe || '?'}
                        </span>
                        <button 
                          onClick={() => toggleAssets(bot.id)} 
                          className="flex items-center space-x-1 text-[#848e9c] hover:text-[#eaecef] font-medium text-xs transition-colors"
                        >
                          <span>View Assets</span>
                          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedBot === bot.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="bg-[#2b3139] px-2 py-1 rounded text-[10px] font-bold tracking-wider text-[#eaecef]">
                        {bot.is_sandbox ? 'PAPER' : 'LIVE'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider flex items-center w-max ${bot.is_active ? 'bg-[#2ebd85]/10 text-[#2ebd85] border border-[#2ebd85]/30' : 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/30'}`}>
                        {bot.is_active && <span className="w-1.5 h-1.5 bg-[#2ebd85] rounded-full mr-2 animate-pulse"></span>}
                        {bot.is_active ? 'RUNNING' : 'STOPPED'}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-4">
                      <button 
                        onClick={() => toggleBotState(bot.id, bot.is_active)}
                        className={`text-sm font-bold tracking-wider transition-colors ${bot.is_active ? 'text-[#fcd535] hover:text-[#e5c02a]' : 'text-[#2ebd85] hover:text-[#259c6d]'}`}
                      >
                        {bot.is_active ? 'STOP' : 'START'}
                      </button>
                      <button 
                        onClick={() => deleteBot(bot.id)}
                        className="text-[#f6465d] text-sm hover:text-[#f6465d]/80 font-bold tracking-wider transition-colors"
                      >
                        DELETE
                      </button>
                    </td>
                  </tr>

                  {expandedBot === bot.id && (
                    <tr className="bg-[#0b0e11] border-b border-[#2b3139]">
                      <td colSpan="5" className="px-4 py-4 border-l-2 border-[#fcd535] ml-2">
                        <div className="flex flex-col space-y-2 pl-2">
                          <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Target Markets ({bot.settings?.timeframe})</span>
                          <div className="flex flex-wrap gap-2">
                            <div className="bg-[#181a20] border border-[#2b3139] px-3 py-1.5 rounded flex items-center shadow-sm">
                              <span className="font-mono text-xs text-[#eaecef]">{bot.settings?.symbol || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}