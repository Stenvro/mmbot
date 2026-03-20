export default function Sidebar({ activeView, setActiveView, openCharts, closeChart }) {
  return (
    <div className="w-56 bg-[#181a20] border-r border-[#2b3139] flex flex-col">
      <div className="p-5 border-b border-[#2b3139]">
        <h1 className="text-xl font-bold tracking-widest text-white">
          APEX<span className="text-[#fcd535]">ALGO</span>
        </h1>
        <p className="text-[#848e9c] text-[10px] mt-1 uppercase tracking-wider">Algorithmic Engine</p>
      </div>
      
      <nav className="flex-1 p-3 space-y-2 mt-2 overflow-y-auto">
        <button 
          onClick={() => setActiveView('settings')}
          className={`w-full text-left px-4 py-2.5 text-sm font-medium rounded transition-colors ${activeView === 'settings' ? 'bg-[#2b3139] text-white' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Exchange Settings
        </button>

        <button 
          onClick={() => setActiveView('manager')}
          className={`w-full text-left px-4 py-2.5 text-sm font-medium rounded transition-colors ${activeView === 'manager' ? 'bg-[#2b3139] text-white' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Data Manager
        </button>
        
        {openCharts.length > 0 && (
          <div className="pt-4 pb-1 px-2">
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Active Charts</span>
          </div>
        )}

        {openCharts.map(chart => (
          <div key={chart.id} className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium rounded transition-colors ${activeView === chart.id ? 'bg-[#2b3139] text-white' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>
            <button className="flex-1 text-left truncate" onClick={() => setActiveView(chart.id)}>
              {chart.symbol} <span className="text-xs text-[#fcd535] ml-1">{chart.timeframe}</span>
            </button>
            <button onClick={(e) => closeChart(chart.id, e)} className="text-[#848e9c] hover:text-[#f6465d] ml-2 px-1 transition-colors">
              ✕
            </button>
          </div>
        ))}
      </nav>
    </div>
  );
}