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
        <div className="w-full min-h-full flex flex-col items-center justify-start md:justify-center relative overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#0b0e11] grid-background scanline-effect p-6 pt-24 pb-24 md:pt-6">
            
            {/* Background Accents */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#0ea5e9]/10 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#fcd535]/10 rounded-full blur-[100px] pointer-events-none"></div>
            
            <div className="z-10 flex flex-col items-center text-center fade-in max-w-4xl w-full">
                
                <div className="mb-8 p-6 rounded-2xl bg-[#181a20]/80 backdrop-blur-xl border border-[#2b3139] glow-panel w-full sm:w-auto">
                    <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-widest text-white drop-shadow-lg mb-2">
                        APEX<span className="text-[#fcd535]">ALGO</span>
                    </h1>
                    <p className="text-[#0ea5e9] text-[10px] sm:text-xs md:text-sm font-mono tracking-[0.2em] sm:tracking-[0.3em] uppercase">Quantitative Trading Engine v3.0</p>
                </div>

                <p className="text-[#848e9c] text-sm sm:text-base md:text-lg mb-12 max-w-2xl leading-relaxed px-4">
                    Deploy institutional-grade trading algorithms in seconds. Visual architecture, local high-frequency backtesting, and direct API execution.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full mb-12 px-4">
                    <div className="bg-[#181a20]/90 backdrop-blur border border-[#2b3139] p-6 rounded-lg text-center hover:border-[#2ebd85] transition-colors group cursor-pointer" onClick={() => setActiveView('bots')}>
                        <div className="text-[#2ebd85] mb-2"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div>
                        <h3 className="text-3xl font-mono font-bold text-white mb-1">{stats.bots}</h3>
                        <span className="text-[10px] text-[#848e9c] uppercase tracking-wider font-bold">Algorithms Loaded</span>
                    </div>

                    <div className="bg-[#181a20]/90 backdrop-blur border border-[#2b3139] p-6 rounded-lg text-center hover:border-[#0ea5e9] transition-colors group cursor-pointer" onClick={() => setActiveView('trades')}>
                        <div className="text-[#0ea5e9] mb-2"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></div>
                        <h3 className="text-3xl font-mono font-bold text-white mb-1">{stats.positions}</h3>
                        <span className="text-[10px] text-[#848e9c] uppercase tracking-wider font-bold">Active Open Trades</span>
                    </div>

                    <div className="bg-[#181a20]/90 backdrop-blur border border-[#2b3139] p-6 rounded-lg text-center hover:border-[#fcd535] transition-colors group cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}>
                        <div className="text-[#fcd535] mb-2"><svg className="w-8 h-8 mx-auto group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></div>
                        <h3 className="text-3xl font-mono font-bold text-white mb-1">Visual</h3>
                        <span className="text-[10px] text-[#848e9c] uppercase tracking-wider font-bold">Strategy Builder</span>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto px-4">
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
                        className="px-8 py-4 bg-[#fcd535] text-[#181a20] font-bold text-sm uppercase tracking-wider rounded shadow-[0_0_15px_rgba(252,213,53,0.3)] hover:shadow-[0_0_25px_rgba(252,213,53,0.5)] hover:bg-[#e5c02a] transition-all transform hover:-translate-y-1 w-full md:w-auto"
                    >
                        Launch Architecture
                    </button>
                    <button 
                        onClick={() => setActiveView('manager')}
                        className="px-8 py-4 bg-transparent border border-[#2b3139] text-[#eaecef] font-bold text-sm uppercase tracking-wider rounded hover:border-[#848e9c] hover:bg-[#181a20] transition-colors w-full md:w-auto"
                    >
                        Enter Data Vault
                    </button>
                </div>

            </div>

            <div className="absolute bottom-4 left-4 text-[9px] font-mono text-[#848e9c] opacity-50 hidden md:block">
                <p>&gt; ENGINE_CORE: ONLINE</p>
                <p>&gt; WS_STREAM: CONNECTED</p>
                <p>&gt; DB_STATUS: SYNCHRONIZED</p>
                <p className="text-[#2ebd85] animate-pulse">&gt; WAITING FOR ALGO DEPLOYMENT...</p>
            </div>
        </div>
    );
}