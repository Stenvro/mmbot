import { useState } from 'react';
import Sidebar from './components/Sidebar';
import DataManager from './components/DataManager';
import ChartEngine from './components/ChartEngine';
import Settings from './components/Settings';

export default function App() {
  const [activeView, setActiveView] = useState('manager');
  const [openCharts, setOpenCharts] = useState([]);
  const [error, setError] = useState(null);

  const handleOpenChart = (dataset) => {
    const chartId = `${dataset.symbol}_${dataset.timeframe}`;
    
    if (!openCharts.find(c => c.id === chartId)) {
      setOpenCharts(prev => [...prev, { ...dataset, id: chartId }]);
    }
    setActiveView(chartId);
  };

  const closeChart = (chartId, e) => {
    e.stopPropagation();
    setOpenCharts(prev => prev.filter(c => c.id !== chartId));
    if (activeView === chartId) {
      setActiveView('manager');
    }
  };

  const getHeaderTitle = () => {
    if (activeView === 'manager') return 'Market Data Vault';
    if (activeView === 'settings') return 'Exchange Configuration';
    const activeChart = openCharts.find(c => c.id === activeView);
    if (activeChart) return `${activeChart.symbol} | ${activeChart.timeframe}`;
    return '';
  };

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-[#fcd535]/30">
      
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        openCharts={openCharts} 
        closeChart={closeChart} 
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center px-6">
          <h2 className="text-sm font-semibold text-[#eaecef] tracking-wide">
            {getHeaderTitle()}
          </h2>
        </header>

        {error && (
          <div className="m-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/50 text-[#f6465d] text-sm rounded shadow-sm flex justify-between items-center">
            <span>{error}</span>
            <button className="text-[#f6465d] hover:text-white" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6 flex flex-col relative">
          {activeView === 'manager' && (
             <DataManager openChart={handleOpenChart} setError={setError} />
          )}

          {activeView === 'settings' && (
             <Settings setError={setError} />
          )}

          {openCharts.map(chart => (
            activeView === chart.id && (
              <div key={chart.id} className="flex-1 w-full border border-[#2b3139] rounded overflow-hidden shadow-2xl relative">
                 <ChartEngine dataset={chart} />
              </div>
            )
          ))}
        </main>
      </div>
    </div>
  );
}