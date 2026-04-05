import { useState, useRef, memo, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import GlowPanel from './ui/GlowPanel';
import SectionHeader from './ui/SectionHeader';
import Modal from './ui/Modal';
import BotConsole from './BotConsole';

const BotCard = memo(function BotCard({ bot, index, busyAction, openConsoles, clearSignals, toggleBotState, handleExport, handleDuplicate, handleClearCacheClick, handleDeleteClick, updateBotConfig, toggleConsole }) {
  const isBacktestOn    = bot.settings?.backtest_on_start === true;
  const isApiExecutionOn = bot.settings?.api_execution === true;
  const hasApiKey       = !!bot.settings?.api_key_name;
  const consoleOpen     = openConsoles[bot.id] ?? false;

  const assignedPairs = Array.isArray(bot.settings?.symbols)
    ? bot.settings.symbols
    : (bot.settings?.symbol ? [bot.settings.symbol] : []);

  return (
    <div
      className={`terminal-card flex flex-col overflow-hidden transition-all duration-300 hover:border-[#2b3545] ${
        bot.is_active
          ? 'hover:shadow-[0_0_40px_rgba(14,165,233,0.04)]'
          : 'hover:shadow-[0_0_30px_rgba(252,213,53,0.03)]'
      } fade-in-delay-${Math.min(index + 1, 6)}`}
    >
      {/* ── Card Header ── */}
      <div className="px-5 py-4 border-b border-[#202532] flex justify-between items-start bg-gradient-to-r from-[#080a0f]/60 to-[#12151c]/40">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2.5">
            <div className="relative flex items-center justify-center">
              <div className={`w-2 h-2 rounded-full ${
                bot.is_active
                  ? 'bg-[#2ebd85] animate-pulse shadow-[0_0_12px_#2ebd85]'
                  : 'bg-[#f6465d]/60'
              }`} />
              {bot.is_active && (
                <div className="absolute w-4 h-4 rounded-full border border-[#2ebd85]/30 animate-ping" />
              )}
            </div>
            <h3 className="text-[#eaecef] font-bold text-sm tracking-wide">{bot.name}</h3>
          </div>
          <div className="flex items-center space-x-2 mt-2.5">
            <select className="bg-transparent text-[#eaecef] text-[9px] border-b border-[#202532] hover:border-[#848e9c] focus:border-[#fcd535] rounded-none font-bold uppercase outline-none cursor-pointer pb-0.5 max-w-[120px]">
              <option value="default" className="bg-[#12151c]" disabled>PAIRS ({assignedPairs.length})</option>
              {assignedPairs.map(pair => <option className="bg-[#12151c]" key={pair} value={pair}>{pair}</option>)}
            </select>
            <span className="text-[#fcd535] text-[9px] uppercase font-bold font-mono border border-[#fcd535]/30 px-2 py-0.5 rounded bg-[#fcd535]/5 shadow-[0_0_6px_rgba(252,213,53,0.08)]">
              {bot.settings?.timeframe || "N/A"}
            </span>
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

      {/* ── Card Body ── */}
      <div className="px-5 py-4 flex-1 flex flex-col space-y-5">

        {/* Environment Routing */}
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

        {/* Initialization Protocol */}
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

        {/* Quick Actions */}
        <div className="flex flex-col space-y-2 border-t border-[#202532] pt-4">
          <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Quick Actions</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport(bot)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase border border-[#202532] rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:border-[#2b3545] transition-colors"
            >
              <span className="text-[10px]">↑</span> Export
            </button>
            <button
              onClick={() => handleDuplicate(bot)}
              disabled={bot.is_active}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase border border-[#202532] rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:border-[#2b3545] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="text-[10px]">⎘</span> Duplicate
            </button>
          </div>
        </div>

      </div>

      {/* ── Console Toggle Bar ── */}
      <button
        onClick={() => toggleConsole(bot.id)}
        className="w-full px-5 py-2.5 border-t border-[#202532] bg-[#080a0f]/60 flex justify-between items-center hover:bg-[#080a0f] transition-colors group"
      >
        <span className="text-[8px] font-bold uppercase tracking-widest text-[#848e9c] group-hover:text-[#eaecef] transition-colors">
          Console
        </span>
        <ChevronIcon open={consoleOpen} />
      </button>

      {/* ── Console Panel ── */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          consoleOpen ? 'max-h-56 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <BotConsole botName={bot.name} isOpen={consoleOpen} clearSignal={clearSignals[bot.name] || 0} />
      </div>

      {/* ── Card Footer ── */}
      <div className="px-5 py-3 bg-[#080a0f]/50 backdrop-blur border-t border-[#202532] flex justify-between items-center">
        <span className="text-[9px] font-bold text-[#848e9c]/60 uppercase tracking-wider font-mono">ID: {bot.id}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-builder', { detail: bot }))}
            disabled={bot.is_active}
            className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            EDIT
          </button>
          <div className="w-px h-3 bg-[#202532]" />
          <button
            onClick={() => handleClearCacheClick(bot)}
            disabled={bot.is_active || !!busyAction}
            className="text-[#fcd535] hover:text-[#e5c02a] text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            WIPE CACHE
          </button>
          <div className="w-px h-3 bg-[#202532]" />
          <button
            onClick={() => handleDeleteClick(bot.id, bot.name)}
            disabled={bot.is_active || !!busyAction}
            className="text-[#f6465d] hover:text-[#f6465d]/80 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            DELETE
          </button>
        </div>
      </div>

    </div>
  );
}, (prev, next) =>
  prev.bot.id === next.bot.id &&
  prev.bot.is_active === next.bot.is_active &&
  prev.bot.name === next.bot.name &&
  prev.busyAction === next.busyAction &&
  prev.openConsoles[prev.bot.id] === next.openConsoles[next.bot.id] &&
  prev.clearSignals[prev.bot.name] === next.clearSignals[next.bot.name] &&
  JSON.stringify(prev.bot.settings) === JSON.stringify(next.bot.settings)
);

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3 h-3 text-[#848e9c] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function BotManagerUI({ bots = [], refetchBots, setError }) {
  const [modalConfig, setModalConfig]       = useState(null);
  const [openConsoles, setOpenConsoles]     = useState({});
  const [busyAction, setBusyAction]        = useState(null);  // 'delete:ID' or 'wipe:name'
  const [clearSignals, setClearSignals]     = useState({});
  const fileInputRef                        = useRef(null);

  const toggleBotState = useCallback(async (botId, isCurrentlyActive) => {
    try {
      const endpoint = isCurrentlyActive ? `/api/bots/${botId}/stop` : `/api/bots/${botId}/start`;
      await apiClient.post(endpoint);
      refetchBots();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to toggle bot state.");
    }
  }, [refetchBots, setError]);

  const executeDelete = useCallback(async (botId) => {
    if (busyAction) return;
    setBusyAction(`delete:${botId}`);
    try {
      await apiClient.delete(`/api/bots/${botId}`);
      refetchBots();
      setModalConfig(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to delete bot.");
      setModalConfig(null);
    }
    setBusyAction(null);
  }, [busyAction, refetchBots, setError]);

  const handleDeleteClick = useCallback((botId, botName) => {
    setModalConfig({
      type: 'danger',
      title: 'Delete Algorithm',
      message: `WARNING: Deleting '${botName}' will permanently remove its logic and configuration from the database. Are you sure?`,
      confirmText: 'Delete',
      onConfirm: () => executeDelete(botId),
      onCancel: () => setModalConfig(null)
    });
  }, [executeDelete]);

  const handleClearCacheClick = useCallback((bot) => {
    setModalConfig({
      type: 'warning',
      title: 'Clear Chart Cache',
      message: `Are you sure you want to clear all drawn signals and indicator data for '${bot.name}' from the chart? Your trade ledger will remain intact.`,
      confirmText: 'Clear Cache',
      onConfirm: async () => {
        if (busyAction) return;
        setBusyAction(`wipe:${bot.name}`);
        try {
          await apiClient.delete(`/api/bots/${encodeURIComponent(bot.name)}/cache`);
          refetchBots();
          setClearSignals(prev => ({ ...prev, [bot.name]: (prev[bot.name] || 0) + 1 }));
          setModalConfig({
            type: 'success',
            title: 'Cache Cleared',
            message: `Chart signals and log buffer for '${bot.name}' have been successfully cleared.`,
            confirmText: 'OK',
            onConfirm: () => setModalConfig(null)
          });
        } catch {
          setModalConfig({ type: 'danger', title: 'Error', message: "Failed to clear cache.", confirmText: 'OK', onConfirm: () => setModalConfig(null) });
        }
        setBusyAction(null);
      },
      onCancel: () => setModalConfig(null)
    });
  }, [busyAction, refetchBots]);

  const updateBotConfig = useCallback(async (botId, currentBot, updates) => {
    try {
      await apiClient.put(`/api/bots/${botId}`, updates);
      refetchBots();
    } catch {
      if (setError) setError("Failed to update bot configuration.");
      refetchBots();
    }
  }, [refetchBots, setError]);

  const handleExport = useCallback(async (bot) => {
    try {
      const res = await apiClient.get(`/api/bots/${bot.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bot.name.replace(/\s+/g, '_')}.apex.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      if (setError) setError("Failed to export bot.");
    }
  }, [setError]);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await apiClient.post('/api/bots/import', payload);
      refetchBots();
      setModalConfig({
        type: 'success',
        title: 'Bot Imported',
        message: `'${payload?.bot?.name || 'Bot'}' has been imported successfully.`,
        confirmText: 'OK',
        onConfirm: () => setModalConfig(null)
      });
    } catch (err) {
      const raw = err.response?.data?.detail;
      const detail = typeof raw === 'string' ? raw
          : raw?.validation_errors ? raw.validation_errors.join('\n')
          : "Invalid bot file. The file may be corrupted or from an incompatible version.";
      setModalConfig({ type: 'danger', title: 'Import Failed', message: detail, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDuplicate = useCallback(async (bot) => {
    try {
      await apiClient.post(`/api/bots/${bot.id}/duplicate`);
      refetchBots();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "Failed to duplicate bot.");
    }
  }, [refetchBots, setError]);

  const toggleConsole = useCallback((botId) => {
    setOpenConsoles(prev => ({ ...prev, [botId]: !prev[botId] }));
  }, []);

  return (
    <PageShell glowColor="green">
      <Modal config={modalConfig ? { ...modalConfig, busy: !!busyAction } : null} />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".json,.apex.json"
        onChange={handleImportFile}
      />

      <SectionHeader
        title="Trading Algorithms"
        subtitle="Manage, configure, and deploy automated strategies"
        accentColor="white"
        action={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border border-[#0ea5e9]/30 text-[#0ea5e9] px-4 py-2.5 text-[10px] font-bold hover:bg-[#0ea5e9]/10 transition-all duration-200 rounded-lg uppercase tracking-wider"
            >
              Import Bot
            </button>
            <button
              className="bg-[#fcd535] text-[#181a20] px-5 py-2.5 text-[10px] font-bold hover:bg-[#e5c02a] transition-all duration-200 rounded-lg shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)] uppercase tracking-wider"
              onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
            >
              + New Algorithm
            </button>
          </div>
        }
      />

      {bots.length === 0 ? (
        <GlowPanel className="border-dashed !border-[#202532]">
          <div className="text-center py-8">
            <p className="text-[#848e9c] text-xs mb-3">No trading bots found.</p>
            <p className="text-[9px] text-[#848e9c]/60 uppercase tracking-wider">
              Create one using the Visual Builder or{' '}
              <button onClick={() => fileInputRef.current?.click()} className="text-[#0ea5e9] hover:underline">import a file</button>
            </p>
          </div>
        </GlowPanel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {bots.map((bot, index) => (
            <BotCard
              key={bot.id}
              bot={bot}
              index={index}
              busyAction={busyAction}
              openConsoles={openConsoles}
              clearSignals={clearSignals}
              toggleBotState={toggleBotState}
              handleExport={handleExport}
              handleDuplicate={handleDuplicate}
              handleClearCacheClick={handleClearCacheClick}
              handleDeleteClick={handleDeleteClick}
              updateBotConfig={updateBotConfig}
              toggleConsole={toggleConsole}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
