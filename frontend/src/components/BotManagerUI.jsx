import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function BotManagerUI({ setError }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBots = async () => {
    try {
      const response = await apiClient.get('/api/bots/');
      setBots(response.data);
      setError(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to load trading bots.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleBotState = async (botId, isCurrentlyActive) => {
    try {
      const endpoint = isCurrentlyActive ? `/api/bots/${botId}/stop` : `/api/bots/${botId}/start`;
      await apiClient.post(endpoint);
      fetchBots();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to toggle bot state.");
    }
  };

  const deleteBot = async (botId, botName) => {
    if (!window.confirm(`WARNING: Deleting '${botName}' will permanently remove it from the database. Are you sure?`)) return;
    try {
      await apiClient.delete(`/api/bots/${botId}`);
      fetchBots();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to delete bot.");
    }
  };

  const updateBotConfig = async (botId, currentBot, updates) => {
    try {
      setBots(bots.map(b => b.id === botId ? { ...b, ...updates, settings: { ...b.settings, ...(updates.settings || {}) } } : b));
      await apiClient.put(`/api/bots/${botId}`, updates);
    } catch (err) {
      if (setError) setError("Failed to update bot configuration.");
      fetchBots();
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full fade-in space-y-6">
      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-[#eaecef] font-bold text-lg">Trading Algorithms</h3>
          <p className="text-[#848e9c] text-xs mt-1">Manage, configure, and monitor your automated strategies.</p>
        </div>
        <button 
           className="bg-[#fcd535] text-[#181a20] px-4 py-2 text-sm font-semibold hover:bg-[#e5c02a] transition-colors rounded-sm"
           onClick={() => alert("The Visual Block Builder is coming next! You'll be able to link API Keys here.")}
        >
           + Create New Bot
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-[#fcd535] animate-pulse tracking-widest text-sm">LOADING ALGORITHMS...</div>
      ) : bots.length === 0 ? (
        <div className="bg-[#181a20] border border-[#2b3139] p-8 rounded text-center">
          <p className="text-[#848e9c] italic">No trading bots found. Create one using the Visual Builder or via Swagger.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {bots.map((bot) => {
            const isBacktestOn = bot.settings?.backtest_on_start === true;
            const isApiExecutionOn = bot.settings?.api_execution === true;
            
            // Heeft deze bot in de JSON een API key toegewezen gekregen?
            const hasApiKey = !!bot.settings?.api_key_name; 

            const assignedPairs = Array.isArray(bot.settings?.symbols) 
                ? bot.settings.symbols 
                : (bot.settings?.symbol ? [bot.settings.symbol] : ["No Pair Assigned"]);

            return (
              <div key={bot.id} className="bg-[#181a20] border border-[#2b3139] rounded shadow-sm flex flex-col overflow-hidden transition-all hover:border-[#3b4149]">
                
                {/* BOT HEADER */}
                <div className="p-5 border-b border-[#2b3139] flex justify-between items-start bg-[#0b0e11]/50">
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${bot.is_active ? 'bg-[#2ebd85] animate-pulse shadow-[0_0_8px_#2ebd85]' : 'bg-[#f6465d]'}`}></div>
                      <h3 className="text-[#eaecef] font-bold text-base">{bot.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                       <select className="bg-[#2b3139] text-[#eaecef] text-[10px] px-2 py-0.5 rounded font-bold outline-none cursor-pointer border-none focus:ring-1 focus:ring-[#fcd535] max-w-[120px]">
                          {assignedPairs.map(pair => (
                             <option key={pair} value={pair}>{pair}</option>
                          ))}
                       </select>
                       <span className="bg-[#2b3139] text-[#eaecef] text-[10px] px-2 py-0.5 rounded font-bold">{bot.settings?.timeframe || "N/A"}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => toggleBotState(bot.id, bot.is_active)}
                      className={`px-6 py-2 text-xs font-bold uppercase rounded-sm transition-colors border ${
                        bot.is_active 
                          ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/30 hover:bg-[#f6465d]/20' 
                          : 'bg-[#2ebd85]/10 text-[#2ebd85] border-[#2ebd85]/30 hover:bg-[#2ebd85]/20'
                      }`}
                    >
                      {bot.is_active ? 'STOP' : 'START'}
                    </button>
                  </div>
                </div>

                {/* BOT CONTROLS */}
                <div className="p-5 flex-1 flex flex-col space-y-4">
                  
                  {/* Control 1: Order Execution (API) */}
                  <div className="flex flex-col space-y-1.5">
                    <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Order Execution</span>
                    <label className={`flex items-center p-3 rounded border transition-colors ${bot.is_active || !hasApiKey ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer hover:border-[#3b4149]'} ${isApiExecutionOn ? 'bg-[#0ea5e9]/5 border-[#0ea5e9]/30' : 'bg-[#0b0e11] border-[#2b3139]'}`}>
                      <input 
                        type="checkbox" 
                        disabled={bot.is_active || !hasApiKey}
                        checked={isApiExecutionOn} 
                        onChange={(e) => updateBotConfig(bot.id, bot, { settings: { api_execution: e.target.checked } })}
                        className="form-checkbox h-4 w-4 text-[#0ea5e9] rounded border-[#2b3139] bg-[#0b0e11] focus:ring-0 focus:ring-offset-0"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className={`text-xs font-bold ${isApiExecutionOn ? 'text-[#0ea5e9]' : 'text-[#eaecef]'}`}>Enable API Trades</span>
                        <span className={`text-[10px] ${hasApiKey ? 'text-[#848e9c]' : 'text-[#f6465d] font-semibold italic'}`}>
                          {hasApiKey ? `Using assigned Key: ${bot.settings.api_key_name}` : "Requires an API Key from the Visual Builder."}
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Control 2: Historical Backtest */}
                  <div className="flex flex-col space-y-1.5">
                    <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Startup Behavior</span>
                    <label className={`flex items-center p-3 rounded border transition-colors ${bot.is_active ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer hover:border-[#3b4149]'} ${isBacktestOn ? 'bg-[#2ebd85]/5 border-[#2ebd85]/30' : 'bg-[#0b0e11] border-[#2b3139]'}`}>
                      <input 
                        type="checkbox" 
                        disabled={bot.is_active}
                        checked={isBacktestOn} 
                        onChange={(e) => updateBotConfig(bot.id, bot, { settings: { backtest_on_start: e.target.checked } })}
                        className="form-checkbox h-4 w-4 text-[#2ebd85] rounded border-[#2b3139] bg-[#0b0e11] focus:ring-0 focus:ring-offset-0"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className={`text-xs font-bold ${isBacktestOn ? 'text-[#2ebd85]' : 'text-[#eaecef]'}`}>Run Historical Backtest</span>
                        <span className="text-[10px] text-[#848e9c]">Simulate trades on past data before going live.</span>
                      </div>
                    </label>
                  </div>

                </div>

                {/* BOT FOOTER */}
                <div className="p-3 bg-[#0b0e11] border-t border-[#2b3139] flex justify-between items-center">
                  <span className="text-[10px] text-[#848e9c] font-mono">ID: {bot.id} | CREATED: {new Date(bot.created_at).toLocaleDateString()}</span>
                  <button 
                    onClick={() => deleteBot(bot.id, bot.name)}
                    disabled={bot.is_active}
                    className="text-[#f6465d] hover:text-white text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    DELETE BOT
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}