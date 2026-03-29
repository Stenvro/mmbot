export default function Sidebar({ activeView, setActiveView, openCharts, closeChart, runningBots, openBotChart, sidebarOpen, setSidebarOpen }) {
  return (
    <div className={`fixed inset-y-0 left-0 z-[80] w-64 bg-[#12151c]/95 backdrop-blur-xl border-r border-[#202532] flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      <div className="relative p-4 border-b border-[#202532] flex justify-between items-center cursor-pointer overflow-hidden" onClick={() => setActiveView('home')}>
        <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full blur-[60px] bg-[#fcd535]/5 pointer-events-none" />
        <div className="relative">
            <h1 className="text-lg font-bold tracking-widest text-white flex items-center">
              APEX<span className="text-[#fcd535]">ALGO</span>
            </h1>
            <p className="text-[#848e9c] text-[9px] mt-0.5 uppercase tracking-wider font-mono">Engine Core</p>
        </div>
        <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
            className="relative text-[#848e9c] hover:text-[#f6465d] transition-colors p-1"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar pb-24 md:pb-3">
        {[
          { key: 'settings', label: 'Exchange Setup' },
          { key: 'bots', label: 'Algorithms' },
          { key: 'manager', label: 'Data Vault' },
          { key: 'trades', label: 'Trade Analytics' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key)}
            className={`w-full text-left px-3 py-3 md:py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${
              activeView === item.key
                ? 'bg-[#202532]/80 text-[#eaecef] border-l-2 border-[#fcd535] shadow-sm'
                : 'text-[#848e9c] hover:bg-[#202532]/40 hover:text-white border-l-2 border-transparent'
            }`}
          >
            {item.label}
          </button>
        ))}

        {runningBots && runningBots.length > 0 && (
          <div className="pt-5 pb-2 px-2 flex items-center border-t border-[#202532]/50 mt-4">
            <span className="w-1.5 h-1.5 bg-[#2ebd85] rounded-full mr-2 animate-pulse shadow-[0_0_12px_#2ebd85]"></span>
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">Live Engines</span>
          </div>
        )}

        {runningBots && runningBots.map(bot => (
          <button
            key={`bot_${bot.id}`}
            onClick={() => openBotChart(bot)}
            className="w-full text-left px-3 py-3 md:py-2 text-xs font-bold text-[#eaecef] hover:bg-[#202532]/40 transition-all duration-200 rounded-lg truncate border border-transparent hover:border-[#202532]"
          >
            {bot.name}
          </button>
        ))}

        {openCharts.length > 0 && (
          <div className="pt-5 pb-2 px-2 border-t border-[#202532]/50 mt-4">
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">Active Charts</span>
          </div>
        )}

        {openCharts.map(chart => (
          <div key={chart.id} className={`flex items-center justify-between px-3 py-2 md:py-1.5 text-xs font-bold rounded-lg transition-all duration-200 border ${
            activeView === chart.id
              ? 'bg-[#202532]/80 text-[#eaecef] border-[#202532]'
              : 'text-[#848e9c] hover:bg-[#202532]/30 hover:text-white border-transparent hover:border-[#202532]/50'
          }`}>
            <button className="flex-1 text-left truncate py-1.5 md:py-0" onClick={() => setActiveView(chart.id)}>
              {chart.symbol} <span className="text-[9px] text-[#fcd535] ml-1 border border-[#fcd535]/30 px-1.5 py-0.5 rounded font-mono">{chart.timeframe}</span>
            </button>
            <button onClick={(e) => closeChart(chart.id, e)} className="text-[#848e9c] hover:text-[#f6465d] ml-2 px-2 py-1 md:px-1 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </nav>
    </div>
  );
}
