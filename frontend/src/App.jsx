import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DataManager from './components/DataManager';
import ChartEngine from './components/ChartEngine';
import Settings from './components/Settings';
import BotManagerUI from './components/BotManagerUI';
import TradeManager from './components/TradeManager';
import BotBuilder from './components/Builder/BotBuilder';
import Home from './components/Home';
import { apiClient } from './api/client';

export default function App() {
  const [activeView, setActiveView] = useState(() => {
      return localStorage.getItem('apex_activeView') || 'home';
  });

  const [openCharts, setOpenCharts] = useState(() => {
      const savedCharts = localStorage.getItem('apex_openCharts');
      return savedCharts ? JSON.parse(savedCharts) : [];
  });

  const [runningBots, setRunningBots] = useState([]);
  const [error, setError] = useState(null);
  
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingBot, setEditingBot] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  useEffect(() => {
      localStorage.setItem('apex_activeView', activeView);
  }, [activeView]);

  useEffect(() => {
      localStorage.setItem('apex_openCharts', JSON.stringify(openCharts));
  }, [openCharts]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        if (window.innerWidth < 768) setSidebarOpen(false); 
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
    if (window.innerWidth < 768) setSidebarOpen(false);
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
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const closeChart = (chartId, e) => {
    e.stopPropagation();
    setOpenCharts(prev => prev.filter(c => c.id !== chartId));
    if (activeView === chartId) {
      setActiveView('home');
    }
    // Intentionally not closing the sidebar here to preserve mobile UX state
  };

  const navigateTo = (view) => {
      setActiveView(view);
      if (window.innerWidth < 768) {
          setSidebarOpen(false);
      }
  };

  return (
    <div className="flex h-[100dvh] bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-[#fcd535]/30 overflow-hidden relative">
      
      <button 
        className={`fixed top-3 left-4 z-[90] p-2 bg-[#181a20]/80 backdrop-blur border border-[#2b3139] hover:border-[#fcd535] rounded shadow-lg text-[#848e9c] hover:text-[#fcd535] transition-all duration-300 ${sidebarOpen ? 'opacity-0 pointer-events-none -translate-x-10' : 'opacity-100 translate-x-0'}`}
        onClick={() => setSidebarOpen(true)}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>

      {sidebarOpen && (
         <div className="fixed inset-0 bg-black/60 z-[70] md:hidden fade-in" onClick={() => setSidebarOpen(false)}></div>
      )}

      <Sidebar 
        activeView={activeView} 
        setActiveView={navigateTo} 
        openCharts={openCharts} 
        closeChart={closeChart} 
        runningBots={runningBots}
        openBotChart={openBotChart}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className={`flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300 ease-in-out ${sidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
        
        {['manager', 'settings', 'bots', 'trades'].includes(activeView) && (
          <header className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center justify-between px-4 md:px-6 shrink-0">
            <div className={`${!sidebarOpen ? 'ml-12 transition-all duration-300' : 'ml-0 transition-all duration-300'}`}>
              <h2 className="text-xs md:text-sm font-semibold text-[#eaecef] tracking-wide uppercase">
                {activeView === 'manager' ? 'Market Data Vault' : 
                 activeView === 'bots' ? 'Trading Algorithms' : 
                 activeView === 'trades' ? 'Trade Analytics' :
                 'Exchange Configuration'}
              </h2>
            </div>
          </header>
        )}

        {error && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 p-3 bg-[#f6465d]/10 border border-[#f6465d]/50 text-[#f6465d] text-xs md:text-sm rounded shadow-2xl flex justify-between items-center z-[100] min-w-[300px]">
            <span>{error}</span>
            <button className="text-[#f6465d] hover:text-white ml-4 font-bold" onClick={() => setError(null)}>✕</button>
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
              <div key={chart.id} className="flex-1 w-full h-full relative border-t-0 border border-[#2b3139] fade-in">
                 <ChartEngine dataset={chart} />
              </div>
            )
          ))}
          
        </main>
      </div>

      {showBuilder && (
        <div className="absolute inset-0 z-[100] bg-[#0b0e11] fade-in">
           <BotBuilder closeBuilder={() => setShowBuilder(false)} editingBot={editingBot} />
        </div>
      )}

    </div>
  );
}