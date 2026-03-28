import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Home({ setActiveView }) {
    const [stats, setStats] = useState({ bots: 0, positions: 0, balance: 0 });

    useEffect(() => {
        const pingStats = async () => {
            try {
                const botRes = await apiClient.get('/api/bots/');
                const posRes = await apiClient.get('/api/trades/positions');
                setStats({
                    bots: botRes.data.length,
                    positions: posRes.data.filter(p => p.status === 'open').length,
                    balance: 1000 
                });
            } catch(e) {}
        };
        pingStats();
    }, []);

    return (
        <div className="w-full min-h-full flex flex-col items-center justify-start md:justify-center relative overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#080a0f] grid-background p-6 pt-24 md:pt-6">
            
            {/* Subtiele ambient glow in het midden (Geen storende strepen meer) */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#fcd535]/5 rounded-full blur-[120px] pointer-events-none"></div>
            
            <div className="z-10 flex flex-col items-center text-center fade-in max-w-4xl w-full">
                
                <div className="mb-10 p-8 rounded-2xl bg-[#12151c]/90 backdrop-blur-xl border border-[#202532] glow-panel w-full sm:w-auto shadow-2xl">
                    <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-widest text-white drop-shadow-lg mb-3">
                        APEX<span className="text-[#fcd535]">ALGO</span>
                    </h1>
                    <p className="text-[#0ea5e9] text-[10px] sm:text-xs md:text-sm font-mono tracking-[0.25em] uppercase">Quantitative Trading Engine v0.1.0-alpha.1</p>
                </div>

                <p className="text-[#7d8598] text-sm sm:text-base md:text-lg mb-12 max-w-2xl leading-relaxed px-4">
                    Deploy institutional-grade trading algorithms in seconds. Visual architecture, local high-frequency backtesting, and direct API execution.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full mb-12 px-4">
                    <div className="bg-[#12151c] border border-[#202532] p-8 rounded-xl text-center hover:border-[#2ebd85] transition-colors group cursor-pointer shadow-lg" onClick={() => setActiveView('bots')}>
                        <div className="text-[#2ebd85] mb-4"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div>
                        <h3 className="text-3xl font-mono font-bold text-white mb-2">{stats.bots}</h3>
                        <span className="text-[10px] text-[#7d8598] uppercase tracking-widest font-bold">Algorithms Loaded</span>
                    </div>

                    <div className="bg-[#12151c] border border-[#202532] p-8 rounded-xl text-center hover:border-[#0ea5e9] transition-colors group cursor-pointer shadow-lg" onClick={() => setActiveView('trades')}>
                        <div className="text-[#0ea5e9] mb-4"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></div>
                        <h3 className="text-3xl font-mono font-bold text-white mb-2">{stats.positions}</h3>
                        <span className="text-[10px] text-[#7d8598] uppercase tracking-widest font-bold">Active Open Trades</span>
                    </div>

                    <div className="bg-[#12151c] border border-[#202532] p-8 rounded-xl text-center hover:border-[#fcd535] transition-colors group cursor-pointer shadow-lg" onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}>
                        <div className="text-[#fcd535] mb-4"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></div>
                        <h3 className="text-2xl font-mono font-bold text-white mb-2 pt-1">Visual</h3>
                        <span className="text-[10px] text-[#7d8598] uppercase tracking-widest font-bold">Strategy Builder</span>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto px-4 mt-2">
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
                        className="px-10 py-4 bg-[#fcd535] text-[#080a0f] font-bold text-xs uppercase tracking-widest rounded-lg shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.3)] hover:bg-[#e5c02a] transition-all w-full md:w-auto"
                    >
                        Launch Architecture
                    </button>
                    <button 
                        onClick={() => setActiveView('manager')}
                        className="px-10 py-4 bg-[#12151c] border border-[#202532] text-[#f1f3f5] font-bold text-xs uppercase tracking-widest rounded-lg hover:border-[#7d8598] transition-colors w-full md:w-auto"
                    >
                        Enter Data Vault
                    </button>
                </div>

            </div>

            <div className="absolute bottom-6 left-6 text-[9px] font-mono text-[#7d8598] opacity-60 hidden md:block leading-relaxed tracking-widest">
                <p>&gt; ENGINE_CORE: ONLINE</p>
                <p>&gt; WS_STREAM: CONNECTED</p>
                <p>&gt; DB_STATUS: SYNCHRONIZED</p>
                <p className="text-[#2ebd85] animate-pulse mt-1">&gt; WAITING FOR ALGO DEPLOYMENT...</p>
            </div>
        </div>
    );
}