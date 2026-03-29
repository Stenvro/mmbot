export default function Sidebar({ activeView, setActiveView, openCharts, closeChart, runningBots, openBotChart, sidebarOpen, setSidebarOpen }) {
  return (
    <div className={`fixed inset-y-0 left-0 z-[80] w-64 bg-[#181a20] border-r border-[#2b3139] flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      
      <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/30 flex justify-between items-center cursor-pointer" onClick={() => setActiveView('home')}>
        <div>
            <h1 className="text-lg font-bold tracking-widest text-white flex items-center">
              APEX<span className="text-[#fcd535]">ALGO</span>
            </h1>
            <p className="text-[#848e9c] text-[9px] mt-0.5 uppercase tracking-wider">Engine Core</p>
        </div>
        <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }} 
            className="text-[#848e9c] hover:text-[#f6465d] transition-colors p-1"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar pb-24 md:pb-3">
        <button 
          onClick={() => setActiveView('settings')}
          className={`w-full text-left px-3 py-3 md:py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${activeView === 'settings' ? 'bg-[#2b3139] text-[#eaecef] shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Exchange Setup
        </button>

        <button 
          onClick={() => setActiveView('bots')}
          className={`w-full text-left px-3 py-3 md:py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${activeView === 'bots' ? 'bg-[#2b3139] text-[#eaecef] shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Algorithms
        </button>

        <button 
          onClick={() => setActiveView('manager')}
          className={`w-full text-left px-3 py-3 md:py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${activeView === 'manager' ? 'bg-[#2b3139] text-[#eaecef] shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Data Vault
        </button>

        <button
          onClick={() => setActiveView('trades')}
          className={`w-full text-left px-3 py-3 md:py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${activeView === 'trades' ? 'bg-[#2b3139] text-[#eaecef] shadow-sm' : 'text-[#848e9c] hover:bg-[#2b3139]/50 hover:text-white'}`}
        >
          Trade Analytics
        </button>
        
        {runningBots && runningBots.length > 0 && (
          <div className="pt-5 pb-2 px-2 flex items-center border-t border-[#2b3139]/50 mt-4">
            <span className="w-1.5 h-1.5 bg-[#2ebd85] rounded-full mr-2 animate-pulse shadow-[0_0_5px_#2ebd85]"></span>
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">Live Engines</span>
          </div>
        )}

        {runningBots && runningBots.map(bot => (
          <button 
            key={`bot_${bot.id}`}
            onClick={() => openBotChart(bot)}
            className="w-full text-left px-3 py-3 md:py-2 text-xs font-bold text-[#eaecef] hover:bg-[#2b3139]/50 transition-colors rounded truncate border border-transparent hover:border-[#3b4149]"
          >
            {bot.name}
          </button>
        ))}

        {openCharts.length > 0 && (
          <div className="pt-5 pb-2 px-2 border-t border-[#2b3139]/50 mt-4">
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">Active Charts</span>
          </div>
        )}

        {openCharts.map(chart => (
          <div key={chart.id} className={`flex items-center justify-between px-3 py-2 md:py-1.5 text-xs font-bold rounded transition-colors border border-transparent ${activeView === chart.id ? 'bg-[#2b3139] text-[#eaecef] border-[#3b4149]' : 'text-[#848e9c] hover:bg-[#2b3139]/30 hover:text-white hover:border-[#3b4149]/50'}`}>
            <button className="flex-1 text-left truncate py-1.5 md:py-0" onClick={() => setActiveView(chart.id)}>
              {chart.symbol} <span className="text-[9px] text-[#fcd535] ml-1 border border-[#fcd535]/30 px-1 rounded-sm">{chart.timeframe}</span>
            </button>
            <button onClick={(e) => closeChart(chart.id, e)} className="text-[#848e9c] hover:text-[#f6465d] ml-2 px-2 py-1 md:px-1 transition-colors">
              ✕
            </button>
          </div>
        ))}
      </nav>
    </div>
  );
}