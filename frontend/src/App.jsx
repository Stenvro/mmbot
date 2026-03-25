import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DataManager from './components/DataManager';
import ChartEngine from './components/ChartEngine';
import Settings from './components/Settings';
import BotManagerUI from './components/BotManagerUI';
import TradeManager from './components/TradeManager';
import BotBuilder from './components/Builder/BotBuilder';
import Home from './components/Home'; // NIEUW
import { apiClient } from './api/client';

export default function App() {
  // --- FIX: Start op de nieuwe home pagina ---
  const [activeView, setActiveView] = useState('home');
  const [openCharts, setOpenCharts] = useState([]);
  const [runningBots, setRunningBots] = useState([]);
  const [error, setError] = useState(null);
  
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingBot, setEditingBot] = useState(null);

  // --- MOBIELE MENU FIX ---
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchRunningBots = async () => {
    try {
      const res = await apiClient.get('/api/bots/');
      const active = res.data.filter(b => b.is_active);
      setRunningBots(active);
    } catch (err) {
      console.error("Silent background fetch error:", err);
    }
  };

  useEffect(() => {
    fetchRunningBots();
    const botInterval = setInterval(fetchRunningBots, 5000);
    
    const handleOpenBuilder = (e) => {
        setEditingBot(e.detail || null); 
        setShowBuilder(true);
        setMobileMenuOpen(false); // Sluit menu op mobiel als builder opent
    };
    
    window.addEventListener('open-builder', handleOpenBuilder);

    return () => {
      clearInterval(botInterval);
      window.removeEventListener('open-builder', handleOpenBuilder);
    };
  }, []);

  const handleOpenChart = (dataset) => {
    const chartId = `${dataset.symbol}_${dataset.timeframe}`;
    if (!openCharts.find(c => c.id === chartId)) {
      setOpenCharts(prev => [...prev, { ...dataset, id: chartId }]);
    }
    setActiveView(chartId);
    setMobileMenuOpen(false);
  };

  const openBotChart = (bot) => {
    const symbolsToOpen = (bot.settings?.symbols && bot.settings.symbols.length > 0) 
      ? bot.settings.symbols 
      : (bot.settings?.symbol ? [bot.settings.symbol] : []);

    const timeframe = bot.settings?.timeframe || "15m";
    let updatedCharts = [...openCharts];
    let lastOpenedChartId = "";

    symbolsToOpen.forEach(sym => {
      const chartId = `${sym}_${timeframe}`;
      lastOpenedChartId = chartId; 
      if (!updatedCharts.find(c => c.id === chartId)) {
        updatedCharts.push({ id: chartId, symbol: sym, timeframe: timeframe });
      }
    });

    setOpenCharts(updatedCharts);
    if (lastOpenedChartId) {
      setActiveView(lastOpenedChartId);
    }
    setMobileMenuOpen(false);
  };

  const closeChart = (chartId, e) => {
    e.stopPropagation();
    setOpenCharts(prev => prev.filter(c => c.id !== chartId));
    if (activeView === chartId) {
      setActiveView('home');
    }
  };

  // Functie om views te veranderen EN het mobiele menu te sluiten
  const navigateTo = (view) => {
      setActiveView(view);
      setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-[#fcd535]/30 relative overflow-hidden">
      
      {/* MOBIELE HAMBURGER KNOP */}
      <button 
        className="md:hidden fixed top-3 right-4 z-[90] p-2 bg-[#181a20] border border-[#2b3139] rounded text-white"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
      </button>

      {/* SIDEBAR (Responsive classes toegevoegd) */}
      <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform fixed md:static inset-y-0 left-0 z-[80] w-64 md:w-48 bg-[#181a20] border-r border-[#2b3139] flex flex-col shadow-2xl md:shadow-none`}>
          <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/30 cursor-pointer" onClick={() => navigateTo('home')}>
            <h1 className="text-lg font-bold tracking-widest text-white">
              APEX<span className="text-[#fcd535]">ALGO</span>
            </h1>
            <p className="text-[#848e9c] text-[9px] mt-0.5 uppercase tracking-wider">Engine</p>
          </div>
          
          <nav className="flex-1 p-2 space-y-1 mt-2 overflow-y-auto">
            <button onClick={() => navigateTo('settings')} className={`w-full text-left px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium rounded transition-colors ${activeView === 'settings' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>Exchange Settings</button>
            <button onClick={() => navigateTo('bots')} className={`w-full text-left px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium rounded transition-colors ${activeView === 'bots' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>Trading Bots</button>
            <button onClick={() => navigateTo('manager')} className={`w-full text-left px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium rounded transition-colors ${activeView === 'manager' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>Data Vault</button>
            <button onClick={() => navigateTo('trades')} className={`w-full text-left px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium rounded transition-colors ${activeView === 'trades' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>Trade Analytics</button>
            
            {runningBots && runningBots.length > 0 && (
              <div className="pt-4 pb-1 px-2 flex items-center">
                <span className="w-1.5 h-1.5 bg-[#2ebd85] rounded-full mr-2 animate-pulse"></span>
                <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Active Bots</span>
              </div>
            )}
            {runningBots && runningBots.map(bot => (
              <button key={`bot_${bot.id}`} onClick={() => openBotChart(bot)} className="w-full text-left px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium text-[#eaecef] hover:bg-[#2b3139]/50 transition-colors rounded truncate">{bot.name}</button>
            ))}

            {openCharts.length > 0 && (
              <div className="pt-4 pb-1 px-2">
                <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Open Charts</span>
              </div>
            )}
            {openCharts.map(chart => (
              <div key={chart.id} className={`flex items-center justify-between px-3 py-2 md:py-1.5 text-sm md:text-xs font-medium rounded transition-colors ${activeView === chart.id ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>
                <button className="flex-1 text-left truncate" onClick={() => navigateTo(chart.id)}>{chart.symbol} <span className="text-[9px] text-[#fcd535] ml-1">{chart.timeframe}</span></button>
                <button onClick={(e) => closeChart(chart.id, e)} className="text-[#848e9c] hover:text-[#f6465d] ml-1 px-2 py-1 md:px-1 transition-colors">✕</button>
              </div>
            ))}
          </nav>
      </div>

      {/* Overlay to close menu on mobile when clicking outside */}
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-[70] md:hidden" onClick={() => setMobileMenuOpen(false)}></div>}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {['manager', 'settings', 'bots', 'trades'].includes(activeView) && (
          <header className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center px-4 md:px-6 shrink-0 pt-1 md:pt-0">
            <h2 className="text-xs md:text-sm font-semibold text-[#eaecef] tracking-wide uppercase">
              {activeView === 'manager' ? 'Market Data Vault' : 
               activeView === 'bots' ? 'Trading Algorithms' : 
               activeView === 'trades' ? 'Trade Analytics' :
               'Exchange Configuration'}
            </h2>
          </header>
        )}

        {error && (
          <div className="m-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/50 text-[#f6465d] text-xs md:text-sm rounded shadow-sm flex justify-between items-center shrink-0 z-50">
            <span>{error}</span>
            <button className="text-[#f6465d] hover:text-white px-2" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto flex flex-col relative w-full custom-scrollbar">
          
          {activeView === 'home' && (
             <Home setActiveView={navigateTo} />
          )}

          {activeView === 'manager' && (
             <div className="p-4 md:p-6 w-full fade-in"><DataManager openChart={handleOpenChart} setError={setError} /></div>
          )}

          {activeView === 'settings' && (
             <div className="p-4 md:p-6 w-full fade-in"><Settings setError={setError} /></div>
          )}

          {activeView === 'bots' && (
             <div className="p-4 md:p-6 w-full fade-in"><BotManagerUI setError={setError} /></div>
          )}

          {activeView === 'trades' && (
             <div className="p-4 md:p-6 w-full fade-in"><TradeManager setError={setError} /></div>
          )}

          {openCharts.map(chart => (
            activeView === chart.id && (
              <div key={chart.id} className="flex-1 w-full h-full relative border-t-0 border border-[#2b3139]">
                 <ChartEngine dataset={chart} />
              </div>
            )
          ))}
          
        </main>
      </div>

      {showBuilder && (
        <div className="absolute inset-0 z-[100] bg-[#0b0e11]">
           <BotBuilder closeBuilder={() => setShowBuilder(false)} editingBot={editingBot} />
        </div>
      )}

    </div>
  );
}