import { useState } from 'react';
import Sidebar from './components/Sidebar';
import DataManager from './components/DataManager';
import ChartEngine from './components/ChartEngine';

export default function App() {
  const [activeView, setActiveView] = useState('manager');
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [error, setError] = useState(null);

  const openChart = (dataset) => {
    setSelectedDataset(dataset);
    setActiveView('chart');
  };

  const closeChart = () => {
    setSelectedDataset(null);
    setActiveView('manager');
  };

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-[#fcd535]/30">
      
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        selectedDataset={selectedDataset} 
        closeChart={closeChart} 
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center px-6">
          <h2 className="text-sm font-semibold text-[#eaecef] tracking-wide">
            {activeView === 'manager' ? 'Market Data Vault' : `${selectedDataset?.symbol} | ${selectedDataset?.timeframe}`}
          </h2>
        </header>

        {error && (
          <div className="m-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/50 text-[#f6465d] text-sm rounded shadow-sm">
            {error}
            <button className="float-right text-[#f6465d] hover:text-white" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6 flex flex-col relative">
          {activeView === 'manager' && (
             <DataManager openChart={openChart} setError={setError} />
          )}

          {activeView === 'chart' && selectedDataset && (
            <div className="flex-1 w-full border border-[#2b3139] rounded overflow-hidden shadow-2xl relative">
               <ChartEngine dataset={selectedDataset} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}