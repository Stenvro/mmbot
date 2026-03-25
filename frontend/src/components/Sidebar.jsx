export default function Sidebar({ activeView, setActiveView, openCharts, closeChart, runningBots, openBotChart }) {
  return (
    <div className="w-48 bg-[#181a20] border-r border-[#2b3139] flex flex-col z-50">
      <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/30">
        <h1 className="text-lg font-bold tracking-widest text-white">
          APEX<span className="text-[#fcd535]">ALGO</span>
        </h1>
        <p className="text-[#848e9c] text-[9px] mt-0.5 uppercase tracking-wider">Engine</p>
      </div>
      
      <nav className="flex-1 p-2 space-y-1 mt-2 overflow-y-auto">
        <button 
          onClick={() => setActiveView('settings')}
          className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeView === 'settings' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Exchange Settings
        </button>

        <button 
          onClick={() => setActiveView('bots')}
          className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeView === 'bots' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Trading Bots
        </button>

        <button 
          onClick={() => setActiveView('manager')}
          className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeView === 'manager' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Data Vault
        </button>

        <button
          onClick={() => setActiveView('trades')}
          className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeView === 'trades' ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Trade Analytics
        </button>
        
        {/* RUNNING BOTS DIRECT LINKS */}
        {runningBots && runningBots.length > 0 && (
          <div className="pt-4 pb-1 px-2 flex items-center">
            <span className="w-1.5 h-1.5 bg-[#2ebd85] rounded-full mr-2 animate-pulse"></span>
            <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Active Bots</span>
          </div>
        )}

        {runningBots && runningBots.map(bot => (
          <button 
            key={`bot_${bot.id}`}
            onClick={() => openBotChart(bot)}
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-[#eaecef] hover:bg-[#2b3139]/50 transition-colors rounded truncate"
          >
            {bot.name}
          </button>
        ))}

        {/* ACTIVE OPEN CHARTS */}
        {openCharts.length > 0 && (
          <div className="pt-4 pb-1 px-2">
            <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider">Open Charts</span>
          </div>
        )}

        {openCharts.map(chart => (
          <div key={chart.id} className={`flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeView === chart.id ? 'bg-[#2b3139] text-white shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}>
            <button className="flex-1 text-left truncate" onClick={() => setActiveView(chart.id)}>
              {chart.symbol} <span className="text-[9px] text-[#fcd535] ml-1">{chart.timeframe}</span>
            </button>
            <button onClick={(e) => closeChart(chart.id, e)} className="text-[#848e9c] hover:text-[#f6465d] ml-1 px-1 transition-colors">
              ✕
            </button>
          </div>
        ))}
      </nav>
    </div>
  );
}