import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DataManager from './components/DataManager';
import ChartEngine from './components/ChartEngine';
import Settings from './components/Settings';
import BotManagerUI from './components/BotManagerUI';
import TradeManager from './components/TradeManager';
import BotBuilder from './components/Builder/BotBuilder';
import { apiClient } from './api/client';

export default function App() {
  const [activeView, setActiveView] = useState('manager');
  const [openCharts, setOpenCharts] = useState([]);
  const [runningBots, setRunningBots] = useState([]);
  const [error, setError] = useState(null);
  
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingBot, setEditingBot] = useState(null);

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
  };

  // HIER IS DE NIEUWE MULTI-CHART LOGICA
  const openBotChart = (bot) => {
    // 1. Haal de lijst op (en val terug op de oude enkele 'symbol' als het een oude bot is)
    const symbolsToOpen = (bot.settings?.symbols && bot.settings.symbols.length > 0) 
      ? bot.settings.symbols 
      : (bot.settings?.symbol ? [bot.settings.symbol] : []);

    const timeframe = bot.settings?.timeframe || "15m";

    // 2. We maken een kopie van je huidige open grafieken
    let updatedCharts = [...openCharts];
    let lastOpenedChartId = "";

    // 3. Loop door alle munten uit je whitelist heen
    symbolsToOpen.forEach(sym => {
      const chartId = `${sym}_${timeframe}`;
      lastOpenedChartId = chartId; // We onthouden de laatste zodat we daarop kunnen focussen
      
      // Voeg hem alleen toe als hij nog niet open staat
      if (!updatedCharts.find(c => c.id === chartId)) {
        updatedCharts.push({ id: chartId, symbol: sym, timeframe: timeframe });
      }
    });

    // 4. Update de state in React zodat alle tabbladen verschijnen
    setOpenCharts(updatedCharts);
    
    // 5. Zet je actieve scherm op de laatst geopende grafiek
    if (lastOpenedChartId) {
      setActiveView(lastOpenedChartId);
    }
  };

  const closeChart = (chartId, e) => {
    e.stopPropagation();
    setOpenCharts(prev => prev.filter(c => c.id !== chartId));
    if (activeView === chartId) {
      setActiveView('manager');
    }
  };

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-[#fcd535]/30 relative">
      
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        openCharts={openCharts} 
        closeChart={closeChart} 
        runningBots={runningBots}
        openBotChart={openBotChart} // NU GEKOPPELD AAN DE NIEUWE FUNCTIE
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        
        {['manager', 'settings', 'bots', 'trades'].includes(activeView) && (
          <header className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center px-6 shrink-0">
            <h2 className="text-sm font-semibold text-[#eaecef] tracking-wide uppercase">
              {activeView === 'manager' ? 'Market Data Vault' : 
               activeView === 'bots' ? 'Trading Algorithms' : 
               activeView === 'trades' ? 'Trade Analytics' :
               'Exchange Configuration'}
            </h2>
          </header>
        )}

        {error && (
          <div className="m-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/50 text-[#f6465d] text-sm rounded shadow-sm flex justify-between items-center shrink-0 z-50">
            <span>{error}</span>
            <button className="text-[#f6465d] hover:text-white" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <main className="flex-1 overflow-auto flex flex-col relative">
          
          {activeView === 'manager' && (
             <div className="p-6 w-full fade-in"><DataManager openChart={handleOpenChart} setError={setError} /></div>
          )}

          {activeView === 'settings' && (
             <div className="p-6 w-full fade-in"><Settings setError={setError} /></div>
          )}

          {activeView === 'bots' && (
             <div className="p-6 w-full fade-in"><BotManagerUI setError={setError} /></div>
          )}

          {activeView === 'trades' && (
             <div className="p-6 w-full fade-in"><TradeManager setError={setError} /></div>
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