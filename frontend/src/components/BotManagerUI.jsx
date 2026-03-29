import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import GlowPanel from './ui/GlowPanel';
import SectionHeader from './ui/SectionHeader';
import Modal from './ui/Modal';

export default function BotManagerUI({ setError }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null);

  const fetchBots = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/bots/');
      setBots(response.data);
      if (setError) setError(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to load trading bots.");
    }
    setLoading(false);
  }, [setError]);

  useEffect(() => {
    fetchBots(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, [fetchBots]);

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
      type: 'danger',
      title: 'Delete Algorithm',
      message: `WARNING: Deleting '${botName}' will permanently remove its logic and configuration from the database. Are you sure?`,
      confirmText: 'Delete',
      onConfirm: () => executeDelete(botId),
      onCancel: () => setModalConfig(null)
    });
  };

  const handleClearCacheClick = (bot) => {
    setModalConfig({
      type: 'warning',
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
          } catch {
              setModalConfig({ type: 'danger', title: 'Error', message: "Failed to clear cache.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
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
    } catch {
      if (setError) setError("Failed to update bot configuration.");
      fetchBots();
    }
  };

  return (
    <PageShell glowColor="green">
      <Modal config={modalConfig} />

      <SectionHeader
        title="Trading Algorithms"
        subtitle="Manage, configure, and deploy automated strategies"
        accentColor="white"
        action={
          <button
            className="bg-[#fcd535] text-[#181a20] px-5 py-2.5 text-[10px] font-bold hover:bg-[#e5c02a] transition-all duration-200 rounded-lg shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)] uppercase tracking-wider"
            onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
          >
            + New Algorithm
          </button>
        }
      />

      {loading ? (
        <div className="p-12 text-center text-[#848e9c] animate-pulse tracking-widest text-[10px] uppercase font-bold">Loading Engine...</div>
      ) : bots.length === 0 ? (
        <GlowPanel className="border-dashed !border-[#202532]">
          <p className="text-[#848e9c] text-xs text-center py-4">No trading bots found. Create one using the Visual Builder.</p>
        </GlowPanel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {bots.map((bot, index) => {
            const isBacktestOn = bot.settings?.backtest_on_start === true;
            const isApiExecutionOn = bot.settings?.api_execution === true;
            const hasApiKey = !!bot.settings?.api_key_name;

            const assignedPairs = Array.isArray(bot.settings?.symbols)
                ? bot.settings.symbols
                : (bot.settings?.symbol ? [bot.settings.symbol] : []);

            return (
              <div key={bot.id} className={`terminal-card flex flex-col overflow-hidden transition-all duration-300 hover:border-[#2b3545] hover:shadow-[0_0_30px_rgba(252,213,53,0.03)] fade-in-delay-${Math.min(index + 1, 6)}`}>

                <div className="px-5 py-4 border-b border-[#202532] flex justify-between items-start bg-[#080a0f]/40">
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-2 h-2 rounded-full ${bot.is_active ? 'bg-[#2ebd85] animate-pulse shadow-[0_0_12px_#2ebd85]' : 'bg-[#f6465d]/60'}`}></div>
                      <h3 className="text-[#eaecef] font-bold text-sm tracking-wide">{bot.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2 mt-2.5">
                       <select className="bg-transparent text-[#eaecef] text-[9px] border-b border-[#202532] hover:border-[#848e9c] focus:border-[#fcd535] rounded-none font-bold uppercase outline-none cursor-pointer pb-0.5 max-w-[120px]">
                          <option value="default" className="bg-[#12151c]" disabled>PAIRS ({assignedPairs.length})</option>
                          {assignedPairs.map(pair => <option className="bg-[#12151c]" key={pair} value={pair}>{pair}</option>)}
                       </select>
                       <span className="text-[#fcd535] text-[9px] uppercase font-bold font-mono border border-[#fcd535]/20 px-2 py-0.5 rounded bg-[#fcd535]/5">{bot.settings?.timeframe || "N/A"}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleBotState(bot.id, bot.is_active)}
                    className={`px-6 py-2 text-[10px] font-bold uppercase rounded-lg transition-all duration-200 border ${
                      bot.is_active
                        ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/30 hover:bg-[#f6465d]/20 hover:shadow-[0_0_12px_rgba(246,70,93,0.15)]'
                        : 'bg-[#2ebd85]/10 text-[#2ebd85] border-[#2ebd85]/30 hover:bg-[#2ebd85]/20 hover:shadow-[0_0_12px_rgba(46,189,133,0.15)]'
                    }`}
                  >
                    {bot.is_active ? 'STOP' : 'START ENGINE'}
                  </button>
                </div>

                <div className="px-5 py-4 flex-1 flex flex-col space-y-5">

                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Environment Routing</span>
                      {!hasApiKey && <span className="text-[8px] font-bold uppercase text-[#f6465d]">No API Key Linked</span>}
                    </div>
                    <div className="flex bg-[#080a0f] rounded-lg border border-[#202532] overflow-hidden">
                      <button
                        disabled={bot.is_active}
                        onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: false } })}
                        className={`flex-1 py-2 text-[9px] font-bold uppercase transition-all duration-200 disabled:opacity-50 ${!isApiExecutionOn ? 'bg-[#0ea5e9]/10 text-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.1)]' : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#12151c]'}`}
                      >
                        Paper Trade
                      </button>
                      <button
                        disabled={bot.is_active || !hasApiKey}
                        onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: true } })}
                        title={!hasApiKey ? "Assign an API key to enable live/paper routing." : "Route orders through API key."}
                        className={`flex-1 py-2 text-[9px] font-bold uppercase transition-all duration-200 border-l border-[#202532] disabled:opacity-50 ${isApiExecutionOn ? 'bg-[#fcd535]/10 text-[#fcd535] shadow-[0_0_8px_rgba(252,213,53,0.1)]' : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#12151c]'}`}
                      >
                        Live Exchange
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2 border-t border-[#202532] pt-4">
                    <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Initialization Protocol</span>
                    <label className={`flex items-center p-3 rounded-lg border transition-all duration-200 ${bot.is_active ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer hover:border-[#848e9c]'} ${isBacktestOn ? 'bg-[#2ebd85]/5 border-[#2ebd85]/30' : 'bg-[#080a0f] border-[#202532]'}`}>
                      <input
                        type="checkbox"
                        disabled={bot.is_active}
                        checked={isBacktestOn}
                        onChange={(e) => updateBotConfig(bot.id, bot, { settings: { backtest_on_start: e.target.checked } })}
                        className="form-checkbox h-3.5 w-3.5 text-[#2ebd85] rounded-sm border-[#202532] bg-[#080a0f] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${isBacktestOn ? 'text-[#2ebd85]' : 'text-[#eaecef]'}`}>Run Historical Backtest</span>
                        <span className="text-[9px] text-[#848e9c] mt-0.5">Process past data before executing live.</span>
                      </div>
                    </label>
                  </div>

                </div>

                <div className="px-5 py-3 bg-[#080a0f]/50 backdrop-blur border-t border-[#202532] flex justify-between items-center">
                  <span className="text-[9px] font-bold text-[#848e9c]/60 uppercase tracking-wider font-mono">ID: {bot.id}</span>
                  <div className="flex space-x-3 items-center">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-builder', { detail: bot }))}
                      disabled={bot.is_active}
                      className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      EDIT
                    </button>
                    <span className="text-[#202532]">|</span>
                    <button
                      onClick={() => handleClearCacheClick(bot)}
                      disabled={bot.is_active}
                      className="text-[#fcd535] hover:text-[#e5c02a] text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      WIPE CACHE
                    </button>
                    <span className="text-[#202532]">|</span>
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
    </PageShell>
  );
}
