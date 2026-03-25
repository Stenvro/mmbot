import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function BotManagerUI({ setError }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null);

  const fetchBots = async () => {
    try {
      const response = await apiClient.get('/api/bots/');
      setBots(response.data);
      if (setError) setError(null);
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

  const executeDelete = async (botId) => {
    try {
      await apiClient.delete(`/api/bots/${botId}`);
      fetchBots();
      setModalConfig(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to delete bot.");
      setModalConfig(null);
    }
  };

  const handleDeleteClick = (botId, botName) => {
    setModalConfig({
      type: 'confirm',
      title: 'Delete Algorithm',
      message: `WARNING: Deleting '${botName}' will permanently remove its logic and configuration from the database. Are you sure?`,
      confirmText: 'Delete',
      onConfirm: () => executeDelete(botId),
      onCancel: () => setModalConfig(null)
    });
  };

  const handleClearCacheClick = (bot) => {
    setModalConfig({
      type: 'confirm',
      title: 'Clear Chart Cache',
      message: `Are you sure you want to clear all drawn signals (T-B / T-S) and indicator data for '${bot.name}' from the chart? Your trade ledger will remain intact.`,
      confirmText: 'Clear Cache',
      onConfirm: async () => {
          try {
              await apiClient.delete(`/api/bots/${encodeURIComponent(bot.name)}/cache`);
              fetchBots();
              setModalConfig({ 
                  type: 'success', 
                  title: 'Cache Cleared', 
                  message: `Chart signals for '${bot.name}' have been successfully cleared.`, 
                  confirmText: 'OK',
                  onConfirm: () => setModalConfig(null) 
              });
          } catch (e) {
              setModalConfig({ type: 'error', title: 'Error', message: "Failed to clear cache.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
          }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const updateBotConfig = async (botId, currentBot, updates) => {
    try {
      setBots(bots.map(b => b.id === botId ? { ...b, ...updates, settings: { ...b.settings, ...(updates.settings || {}) } } : b));
      await apiClient.put(`/api/bots/${botId}`, updates);
      fetchBots();
    } catch (err) {
      if (setError) setError("Failed to update bot configuration.");
      fetchBots(); 
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full fade-in space-y-6 relative pb-10">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-sm font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'success' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-xs mb-6 leading-relaxed">{modalConfig.message}</p>
            <div className="flex justify-end space-x-3">
              {modalConfig.onCancel && (
                <button onClick={modalConfig.onCancel} className="px-4 py-1.5 rounded text-[10px] font-bold text-[#848e9c] hover:bg-[#2b3139] hover:text-[#eaecef] transition-colors uppercase border border-transparent">
                  Cancel
                </button>
              )}
              <button 
                onClick={modalConfig.onConfirm} 
                className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${modalConfig.type === 'success' ? 'bg-[#2b3139] hover:bg-[#3b4149] text-[#eaecef]' : 'bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d] hover:bg-[#f6465d]/20'}`}
              >
                {modalConfig.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-[#181a20] border border-[#2b3139] px-5 py-4 rounded-sm shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-[#eaecef] font-bold text-sm uppercase tracking-wider">Trading Algorithms</h3>
          <p className="text-[#848e9c] text-[10px] mt-0.5">Manage, configure, and deploy automated strategies.</p>
        </div>
        <button 
           className="bg-[#eaecef] text-[#181a20] px-4 py-2 text-[10px] font-bold hover:bg-white transition-colors rounded-sm shadow-sm uppercase tracking-wider"
           onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
        >
           + New Algorithm
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-[#848e9c] animate-pulse tracking-widest text-[10px] uppercase font-bold">Loading Engine...</div>
      ) : bots.length === 0 ? (
        <div className="bg-[#181a20] border border-[#2b3139] border-dashed p-8 rounded-sm text-center">
          <p className="text-[#848e9c] text-xs italic">No trading bots found. Create one using the Visual Builder.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {bots.map((bot) => {
            const isBacktestOn = bot.settings?.backtest_on_start === true;
            const isApiExecutionOn = bot.settings?.api_execution === true;
            const hasApiKey = !!bot.settings?.api_key_name; 

            const assignedPairs = Array.isArray(bot.settings?.symbols) 
                ? bot.settings.symbols 
                : (bot.settings?.symbol ? [bot.settings.symbol] : []);

            return (
              <div key={bot.id} className="bg-[#181a20] border border-[#2b3139] rounded-sm shadow-sm flex flex-col overflow-hidden transition-all hover:border-[#3b4149]">
                
                <div className="px-5 py-4 border-b border-[#2b3139] flex justify-between items-start bg-[#0b0e11]/50">
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${bot.is_active ? 'bg-[#2ebd85] animate-pulse shadow-[0_0_8px_#2ebd85]' : 'bg-[#f6465d]'}`}></div>
                      <h3 className="text-[#eaecef] font-bold text-sm">{bot.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                       <select className="bg-transparent text-[#eaecef] text-[9px] border-b border-[#2b3139] hover:border-[#848e9c] focus:border-[#fcd535] rounded-none font-bold uppercase outline-none cursor-pointer pb-0.5 max-w-[120px]">
                          <option value="default" className="bg-[#181a20]" disabled>PAIRS ({assignedPairs.length})</option>
                          {assignedPairs.map(pair => <option className="bg-[#181a20]" key={pair} value={pair}>{pair}</option>)}
                       </select>
                       <span className="text-[#848e9c] text-[9px] uppercase font-bold border border-[#2b3139] px-1.5 py-0.5 rounded-sm">{bot.settings?.timeframe || "N/A"}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => toggleBotState(bot.id, bot.is_active)}
                      className={`px-6 py-1.5 text-[10px] font-bold uppercase rounded-sm transition-colors border ${
                        bot.is_active 
                          ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/30 hover:bg-[#f6465d]/20' 
                          : 'bg-[#2ebd85]/10 text-[#2ebd85] border-[#2ebd85]/30 hover:bg-[#2ebd85]/20'
                      }`}
                    >
                      {bot.is_active ? 'STOP' : 'START ENGINE'}
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 flex-1 flex flex-col space-y-5">
                  
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Environment Routing</span>
                      {!hasApiKey && <span className="text-[8px] font-bold uppercase text-[#f6465d]">No API Key Linked</span>}
                    </div>
                    <div className="flex bg-[#0b0e11] rounded-sm border border-[#2b3139] overflow-hidden">
                      <button 
                        disabled={bot.is_active}
                        onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: false } })}
                        className={`flex-1 py-1.5 text-[9px] font-bold uppercase transition-colors disabled:opacity-50 ${!isApiExecutionOn ? 'bg-[#0ea5e9]/10 text-[#0ea5e9]' : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#181a20]'}`}
                      >
                        Paper Trade
                      </button>
                      <button 
                        disabled={bot.is_active || !hasApiKey}
                        onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: true } })}
                        title={!hasApiKey ? "Assign an API key to enable live/paper routing." : "Route orders through API key."}
                        className={`flex-1 py-1.5 text-[9px] font-bold uppercase transition-colors border-l border-[#2b3139] disabled:opacity-50 ${isApiExecutionOn ? 'bg-[#fcd535]/10 text-[#fcd535]' : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#181a20]'}`}
                      >
                        Live Exchange
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2 border-t border-[#2b3139] pt-4">
                    <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Initialization Protocol</span>
                    <label className={`flex items-center p-3 rounded-sm border transition-colors ${bot.is_active ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer hover:border-[#848e9c]'} ${isBacktestOn ? 'bg-[#2ebd85]/5 border-[#2ebd85]/30' : 'bg-[#0b0e11] border-[#2b3139]'}`}>
                      <input 
                        type="checkbox" 
                        disabled={bot.is_active}
                        checked={isBacktestOn} 
                        onChange={(e) => updateBotConfig(bot.id, bot, { settings: { backtest_on_start: e.target.checked } })}
                        className="form-checkbox h-3.5 w-3.5 text-[#2ebd85] rounded-sm border-[#2b3139] bg-[#0b0e11] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${isBacktestOn ? 'text-[#2ebd85]' : 'text-[#eaecef]'}`}>Run Historical Backtest</span>
                        <span className="text-[9px] text-[#848e9c] mt-0.5">Process past data before executing live.</span>
                      </div>
                    </label>
                  </div>

                </div>

                <div className="px-5 py-3 bg-[#0b0e11] border-t border-[#2b3139] flex justify-between items-center">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">ID: {bot.id}</span>
                  <div className="flex space-x-3 items-center">
                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('open-builder', { detail: bot }))}
                      disabled={bot.is_active}
                      className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      EDIT
                    </button>
                    <span className="text-[#2b3139]">|</span>
                    <button 
                      onClick={() => handleClearCacheClick(bot)}
                      disabled={bot.is_active}
                      className="text-[#fcd535] hover:text-[#e5c02a] text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      WIPE CACHE
                    </button>
                    <span className="text-[#2b3139]">|</span>
                    <button 
                      onClick={() => handleDeleteClick(bot.id, bot.name)}
                      disabled={bot.is_active}
                      className="text-[#f6465d] hover:text-[#f6465d]/80 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      DELETE
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}