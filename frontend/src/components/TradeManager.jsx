import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import Modal from './ui/Modal';

// ─── Formatters ──────────────────────────────────────────────────────────────

const safeNum = (val, decimals = 2) => {
    if (val === null || val === undefined || isNaN(Number(val))) return (0).toFixed(decimals);
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatCrypto = (val) => {
    if (val === null || val === undefined) return '0.00';
    return Number(val).toFixed(6).replace(/\.?0+$/, '');
};

const formatHoldTime = (ms) => {
    if (!ms || ms <= 0) return '—';
    const totalMins = Math.floor(ms / 60000);
    const totalHours = Math.floor(totalMins / 60);
    if (totalHours >= 48) return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
    if (totalHours >= 1) return `${totalHours}h ${totalMins % 60}m`;
    return `${totalMins}m`;
};

const pnlColor = (v) => (v >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]');
const pnlSign = (v) => (v >= 0 ? '+' : '');

// ─── Equity Curve SVG ────────────────────────────────────────────────────────

const EquityCurve = ({ data }) => {
    if (data.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-2 text-center">
                <svg className="w-8 h-8 text-[#202532]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <p className="text-[10px] text-[#848e9c] uppercase tracking-wider">Close at least 2 trades to render the curve</p>
            </div>
        );
    }

    const W = 600, H = 140;
    const PAD = { t: 12, r: 8, b: 24, l: 8 };
    const iW = W - PAD.l - PAD.r;
    const iH = H - PAD.t - PAD.b;

    const values = data.map(d => d.value);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const range = maxV - minV || 1;

    const xS = (i) => PAD.l + (i / (data.length - 1)) * iW;
    const yS = (v) => PAD.t + iH - ((v - minV) / range) * iH;

    const zeroY = yS(0);
    const points = data.map((d, i) => `${xS(i)},${yS(d.value)}`).join(' ');
    const areaPath = [
        `M${xS(0)},${zeroY}`,
        `L${xS(0)},${yS(data[0].value)}`,
        ...data.map((d, i) => `L${xS(i)},${yS(d.value)}`),
        `L${xS(data.length - 1)},${zeroY}`,
        'Z',
    ].join(' ');

    const lastVal = data[data.length - 1].value;
    const lineClr = lastVal >= 0 ? '#2ebd85' : '#f6465d';
    const fillClr = lastVal >= 0 ? '#2ebd85' : '#f6465d';
    const gradId = lastVal >= 0 ? 'ecGreen' : 'ecRed';

    const firstDate = data[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lastDate = data[data.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={fillClr} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={fillClr} stopOpacity="0.01" />
                </linearGradient>
            </defs>
            {/* Zero baseline */}
            <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY}
                stroke="#202532" strokeWidth="1" strokeDasharray="3,4" />
            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradId})`} />
            {/* Line */}
            <polyline points={points} fill="none" stroke={lineClr} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            {/* End dot */}
            <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r="2.5" fill={lineClr} />
            {/* Date labels */}
            <text x={PAD.l} y={H - 4} fill="#848e9c" fontSize="10" fontFamily="monospace">{firstDate}</text>
            <text x={W - PAD.r} y={H - 4} fill="#848e9c" fontSize="10" fontFamily="monospace" textAnchor="end">{lastDate}</text>
        </svg>
    );
};

// ─── Stat Card ───────────────────────────────────────────────────────────────

const Stat = ({ label, value, sub, accent = 'white', border = '#202532' }) => {
    const accentClass = {
        green: 'text-[#2ebd85]',
        red: 'text-[#f6465d]',
        gold: 'text-[#fcd535]',
        cyan: 'text-[#0ea5e9]',
        white: 'text-[#eaecef]',
    }[accent] || 'text-[#eaecef]';

    return (
        <div className="terminal-card p-4 flex flex-col justify-between" style={{ borderLeft: `2px solid ${border}` }}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#848e9c] mb-1.5">{label}</p>
            <p className={`text-xl font-mono font-bold leading-none ${accentClass}`}>{value}</p>
            {sub && <p className="text-[9px] text-[#848e9c] mt-1 font-mono">{sub}</p>}
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TradeManager({ setError }) {
    const [positions, setPositions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalConfig, setModalConfig] = useState(null);
    const [activeTab, setActiveTab] = useState('positions');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 150;

    const [livePrices, setLivePrices] = useState({});
    const [priceSyncing, setPriceSyncing] = useState(false);

    const [filterBot, setFilterBot] = useState('all');
    const [filterSymbol, setFilterSymbol] = useState('all');
    const [filterExchange, setFilterExchange] = useState('all');
    const [filterMode, setFilterMode] = useState('all');

    // ── Data fetching ─────────────────────────────────────────────────────────

    const fetchLivePrices = useCallback(async (currentPositions) => {
        const activePos = currentPositions.filter(p => p.status === 'open');
        if (activePos.length === 0) return;
        setPriceSyncing(true);
        const uniqueSymbols = [...new Set(activePos.map(p => p.symbol))];
        const priceMap = {};
        for (const sym of uniqueSymbols) {
            try {
                const res = await apiClient.get(`/api/data/market-info/${sym.replace('/', '-')}`);
                if (res.data?.last) priceMap[sym] = res.data.last;
            } catch { /* silent */ }
        }
        setLivePrices(prev => ({ ...prev, ...priceMap }));
        setPriceSyncing(false);
    }, []);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [posRes, ordRes] = await Promise.all([
                apiClient.get('/api/trades/positions'),
                apiClient.get('/api/trades/orders'),
            ]);
            const pos = posRes.data || [];
            const ord = ordRes.data || [];
            setPositions(pos);
            setOrders(ord);
            if (setError) setError(null);
            fetchLivePrices(pos);
        } catch (err) {
            if (setError) setError(err.response?.data?.detail || 'Failed to load analytics data.');
        }
        setLoading(false);
    }, [setError, fetchLivePrices]);

    useEffect(() => {
        fetchAllData(); // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchAllData]);

    useEffect(() => {
        if (positions.length === 0) return;
        const t = setInterval(() => fetchLivePrices(positions), 10000);
        return () => clearInterval(t);
    }, [positions, fetchLivePrices]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const deleteHistoricalTrade = (id) => {
        setModalConfig({
            type: 'danger',
            title: 'Delete Trade Record',
            message: 'Permanently delete this trade from the ledger? This will affect your statistics.',
            confirmText: 'Delete',
            onConfirm: async () => {
                try {
                    await apiClient.delete(`/api/trades/positions/${id}`);
                    fetchAllData();
                    setModalConfig(null);
                } catch {
                    setModalConfig({ type: 'danger', title: 'Error', message: 'Failed to delete trade.', confirmText: 'OK', onConfirm: () => setModalConfig(null) });
                }
            },
            onCancel: () => setModalConfig(null),
        });
    };

    const forceClosePosition = (id) => {
        setModalConfig({
            type: 'warning',
            title: 'Force Close Position',
            message: 'Close this position at the last known local market price? It will be added to your Historical Ledger.',
            confirmText: 'Force Close',
            onConfirm: async () => {
                setLoading(true);
                try {
                    const res = await apiClient.post(`/api/trades/positions/${id}/close`);
                    fetchAllData();
                    setModalConfig({ type: 'success', title: 'Position Closed', message: res.data.message, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
                } catch (e) {
                    setModalConfig({ type: 'danger', title: 'Error', message: e.response?.data?.detail || 'Failed to close.', confirmText: 'OK', onConfirm: () => setModalConfig(null) });
                }
                setLoading(false);
            },
            onCancel: () => setModalConfig(null),
        });
    };

    const bulkDelete = async () => {
        if (closedPositions.length === 0) return;
        setModalConfig({
            type: 'danger',
            title: 'Bulk Delete Trades',
            message: `WARNING: Permanently delete ALL ${closedPositions.length} historical trades matching your current filters?`,
            confirmText: 'DELETE ALL FILTERED',
            onConfirm: async () => {
                setLoading(true);
                try {
                    await Promise.all(closedPositions.map(p => apiClient.delete(`/api/trades/positions/${p.id}`)));
                    fetchAllData();
                    setModalConfig(null);
                } catch {
                    setModalConfig({ type: 'danger', title: 'Error', message: 'Some trades failed to delete.', confirmText: 'OK', onConfirm: () => setModalConfig(null) });
                }
                setLoading(false);
            },
            onCancel: () => setModalConfig(null),
        });
    };

    // ── Filters ───────────────────────────────────────────────────────────────

    const applyFilters = useCallback((arr) =>
        arr
            .filter(x => filterBot === 'all' || x.bot_name === filterBot)
            .filter(x => filterSymbol === 'all' || x.symbol === filterSymbol)
            .filter(x => filterExchange === 'all' || (x.exchange || 'okx') === filterExchange)
            .filter(x => filterMode === 'all' || x.mode === filterMode),
    [filterBot, filterSymbol, filterExchange, filterMode]);

    const resetPage = () => setCurrentPage(1);

    const closedPositions = useMemo(() =>
        applyFilters(positions.filter(p => p.status === 'closed'))
            .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)),
    [positions, applyFilters]);

    const activePositions = useMemo(() =>
        applyFilters(positions.filter(p => p.status === 'open')),
    [positions, applyFilters]);

    const filteredOrders = useMemo(() =>
        applyFilters(orders).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [orders, applyFilters]);

    // ── Unique filter options ─────────────────────────────────────────────────

    const uniqueBots = useMemo(() => [...new Set(positions.map(p => p.bot_name).filter(Boolean))], [positions]);
    const uniqueSymbols = useMemo(() => [...new Set([...positions, ...orders].map(x => x.symbol).filter(Boolean))], [positions, orders]);
    const uniqueExchanges = useMemo(() => [...new Set([...positions, ...orders].map(x => x.exchange || 'okx').filter(Boolean))], [positions, orders]);

    // ── Stats ─────────────────────────────────────────────────────────────────

    const stats = useMemo(() => {
        const wins = closedPositions.filter(p => (p.profit_abs || 0) > 0);
        const losses = closedPositions.filter(p => (p.profit_abs || 0) <= 0);
        const grossProfit = wins.reduce((s, p) => s + (p.profit_abs || 0), 0);
        const grossLoss = Math.abs(losses.reduce((s, p) => s + (p.profit_abs || 0), 0));
        const netPnl = grossProfit - grossLoss;
        const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

        // Max drawdown from equity curve
        const sorted = [...closedPositions].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
        let equity = 0, peak = 0, maxDD = 0;
        for (const p of sorted) {
            equity += (p.profit_abs || 0);
            if (equity > peak) peak = equity;
            if (peak > 0) maxDD = Math.max(maxDD, ((peak - equity) / peak) * 100);
        }

        // Avg hold time
        const withTimes = closedPositions.filter(p => p.created_at && p.closed_at);
        const avgHoldMs = withTimes.length > 0
            ? withTimes.reduce((s, p) => s + (new Date(p.closed_at) - new Date(p.created_at)), 0) / withTimes.length
            : 0;

        // Return/Risk (simplified Sharpe)
        const returns = closedPositions.map(p => p.profit_pct || 0);
        const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        const stddev = returns.length > 1
            ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1))
            : 0;
        const sharpe = stddev > 0 ? mean / stddev : 0;

        // Total fees from orders linked to filtered positions
        const filteredPosIds = new Set(closedPositions.map(p => p.id));
        const totalFees = orders
            .filter(o => o.position_id && filteredPosIds.has(o.position_id))
            .reduce((s, o) => s + (o.fee || 0), 0);

        return {
            netPnl,
            winRate,
            wins: wins.length,
            losses: losses.length,
            total: closedPositions.length,
            profitFactor,
            maxDD,
            avgHoldMs,
            sharpe,
            totalFees,
            avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
            avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
        };
    }, [closedPositions, orders]);

    // ── Equity curve data ─────────────────────────────────────────────────────

    const equityCurveData = useMemo(() => {
        const sorted = [...closedPositions].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
        let cum = 0;
        return sorted.map(p => ({ date: new Date(p.closed_at), value: (cum += (p.profit_abs || 0)) }));
    }, [closedPositions]);

    // ── Buy & Hold comparison ─────────────────────────────────────────────────

    const buyAndHoldData = useMemo(() => {
        const bySymbol = {};
        for (const p of closedPositions) {
            if (!bySymbol[p.symbol]) {
                bySymbol[p.symbol] = { firstDate: new Date(p.created_at), firstPrice: p.entry_price, positions: [] };
            }
            const s = bySymbol[p.symbol];
            if (new Date(p.created_at) < s.firstDate) {
                s.firstDate = new Date(p.created_at);
                s.firstPrice = p.entry_price;
            }
            s.positions.push(p);
        }
        return Object.entries(bySymbol).map(([symbol, d]) => {
            const totalInvested = d.positions.reduce((s, p) => s + (p.entry_price * p.amount), 0);
            const strategyPnl = d.positions.reduce((s, p) => s + (p.profit_abs || 0), 0);
            const strategyPct = totalInvested > 0 ? (strategyPnl / totalInvested) * 100 : 0;
            const curPrice = livePrices[symbol];
            const bhPct = (curPrice && d.firstPrice > 0)
                ? ((curPrice - d.firstPrice) / d.firstPrice) * 100
                : null;
            const edge = bhPct !== null ? strategyPct - bhPct : null;
            return { symbol, strategyPct, bhPct, edge, totalInvested, strategyPnl };
        });
    }, [closedPositions, livePrices]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const getLivePnl = (pos) => {
        const cur = livePrices[pos.symbol];
        if (!cur) return { abs: 0, pct: 0 };
        const isLong = pos.side !== 'short';
        const abs = isLong ? (cur - pos.entry_price) * pos.amount : (pos.entry_price - cur) * pos.amount;
        const pct = isLong ? ((cur - pos.entry_price) / pos.entry_price) * 100 : ((pos.entry_price - cur) / pos.entry_price) * 100;
        return { abs, pct };
    };

    const getExitPrice = (pos) => {
        if (!pos.profit_abs || !pos.entry_price || !pos.amount) return null;
        return pos.side === 'short'
            ? pos.entry_price - pos.profit_abs / pos.amount
            : pos.entry_price + pos.profit_abs / pos.amount;
    };

    // ── CSV Export ────────────────────────────────────────────────────────────

    const exportToCSV = () => {
        if (activeTab === 'positions') {
            if (closedPositions.length === 0) return;
            const headers = ['Date Closed', 'Bot', 'Exchange', 'Mode', 'Symbol', 'Side', 'Entry', 'Exit', 'Amount', 'Hold Time', 'Return %', 'Net PNL', 'Fees'];
            const rows = closedPositions.map(p => {
                const fees = orders
                    .filter(o => o.position_id === p.id)
                    .reduce((s, o) => s + (o.fee || 0), 0);
                const holdMs = p.closed_at && p.created_at ? new Date(p.closed_at) - new Date(p.created_at) : 0;
                const exit = getExitPrice(p);
                return [
                    new Date(p.closed_at).toISOString(),
                    p.bot_name, p.exchange || 'okx', p.mode, p.symbol, p.side,
                    p.entry_price, exit?.toFixed(6) ?? '', p.amount,
                    formatHoldTime(holdMs), p.profit_pct, p.profit_abs, fees.toFixed(4),
                ].join(',');
            });
            triggerDownload([headers.join(','), ...rows].join('\n'), 'apex_positions_ledger');
        } else {
            if (filteredOrders.length === 0) return;
            const headers = ['Timestamp', 'Bot', 'Exchange', 'Mode', 'Symbol', 'Side', 'Type', 'Price', 'Amount', 'Fee', 'Status'];
            const rows = filteredOrders.map(o => [
                new Date(o.timestamp).toISOString(),
                o.bot_name, o.exchange || 'okx', o.mode, o.symbol,
                o.side, o.order_type, o.price, o.amount, o.fee ?? '', o.status,
            ].join(','));
            triggerDownload([headers.join(','), ...rows].join('\n'), 'apex_raw_orders');
        }
    };

    const triggerDownload = (csv, prefix) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${prefix}_${new Date().toISOString().split('T')[0]}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Pagination ────────────────────────────────────────────────────────────

    const totalPagesPos = Math.ceil(closedPositions.length / itemsPerPage);
    const totalPagesOrd = Math.ceil(filteredOrders.length / itemsPerPage);
    const renderedPositions = closedPositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const renderedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ── Shared styles ─────────────────────────────────────────────────────────

    const selectClass = 'bg-transparent text-[#eaecef] text-xs font-bold border-b border-[#202532] hover:border-[#848e9c] focus:border-[#fcd535] outline-none cursor-pointer pb-0.5 transition-colors max-w-[120px]';
    const tabClass = (active) => `pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${active ? 'text-[#fcd535] border-[#fcd535]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'}`;

    const PaginationBar = ({ total, current, onPrev, onNext }) => total <= 1 ? null : (
        <div className="flex items-center bg-[#080a0f] rounded-lg border border-[#202532] overflow-hidden">
            <button disabled={current === 1} onClick={onPrev} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9664;</button>
            <span className="text-[9px] font-bold text-[#eaecef] px-2 font-mono">{current} / {total}</span>
            <button disabled={current === total} onClick={onNext} className="px-2.5 py-1 hover:bg-[#202532] disabled:opacity-30 text-[#848e9c] transition-colors">&#9654;</button>
        </div>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <PageShell glowColor="cyan">
            <Modal config={modalConfig} />

            {/* ── FILTER BAR ─────────────────────────────────────────────────── */}
            <div className="terminal-card px-4 py-3 flex flex-wrap gap-x-5 gap-y-2.5 items-center justify-between sticky top-0 z-20">
                <div className="flex flex-wrap gap-x-5 gap-y-2.5 items-center">
                    <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider whitespace-nowrap">Algorithm</span>
                        <select value={filterBot} onChange={e => { setFilterBot(e.target.value); resetPage(); }} className={selectClass}>
                            <option value="all" className="bg-[#12151c]">All Bots</option>
                            {uniqueBots.map(b => <option key={b} value={b} className="bg-[#12151c]">{b}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider whitespace-nowrap">Asset</span>
                        <select value={filterSymbol} onChange={e => { setFilterSymbol(e.target.value); resetPage(); }} className={selectClass}>
                            <option value="all" className="bg-[#12151c]">All Pairs</option>
                            {uniqueSymbols.map(s => <option key={s} value={s} className="bg-[#12151c]">{s}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider whitespace-nowrap">Exchange</span>
                        <select value={filterExchange} onChange={e => { setFilterExchange(e.target.value); resetPage(); }} className={selectClass}>
                            <option value="all" className="bg-[#12151c]">All Exchanges</option>
                            {uniqueExchanges.map(ex => <option key={ex} value={ex} className="bg-[#12151c]">{ex.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-wider whitespace-nowrap">Mode</span>
                        <select value={filterMode} onChange={e => { setFilterMode(e.target.value); resetPage(); }} className={selectClass}>
                            <option value="all" className="bg-[#12151c]">All Modes</option>
                            <option value="live" className="bg-[#12151c]">Live</option>
                            <option value="paper" className="bg-[#12151c]">Paper</option>
                            <option value="backtest" className="bg-[#12151c]">Backtest</option>
                            <option value="forward_test" className="bg-[#12151c]">Forward Test</option>
                        </select>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={exportToCSV} className="text-[#848e9c] hover:text-[#eaecef] text-[9px] font-bold uppercase px-3 py-1.5 border border-transparent hover:border-[#202532] rounded-lg transition-all flex items-center space-x-1.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        <span>Export</span>
                    </button>
                    <button onClick={fetchAllData} disabled={loading} className="bg-[#202532] hover:bg-[#2b3545] text-[#eaecef] text-[9px] font-bold uppercase px-4 py-1.5 rounded-lg transition-all disabled:opacity-50">
                        {loading ? '...' : 'Sync'}
                    </button>
                </div>
            </div>

            {/* ── STATS GRID ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                    label="Net PNL"
                    value={`${pnlSign(stats.netPnl)}$${safeNum(Math.abs(stats.netPnl))}`}
                    sub={`${stats.wins}W / ${stats.losses}L`}
                    accent={stats.netPnl >= 0 ? 'green' : 'red'}
                    border={stats.netPnl >= 0 ? '#2ebd85' : '#f6465d'}
                />
                <Stat
                    label="Win Rate"
                    value={`${safeNum(stats.winRate, 1)}%`}
                    sub={`${stats.total} closed trades`}
                    accent="cyan"
                    border="#0ea5e9"
                />
                <Stat
                    label="Profit Factor"
                    value={stats.profitFactor >= 999 ? '∞' : safeNum(stats.profitFactor)}
                    sub="gross profit / gross loss"
                    accent="gold"
                    border="#fcd535"
                />
                <Stat
                    label="Max Drawdown"
                    value={stats.total > 0 ? `-${safeNum(stats.maxDD, 1)}%` : '—'}
                    sub="peak-to-trough"
                    accent={stats.maxDD > 20 ? 'red' : 'white'}
                    border={stats.maxDD > 20 ? '#f6465d' : '#202532'}
                />
                <Stat
                    label="Avg Win"
                    value={stats.wins > 0 ? `+$${safeNum(stats.avgWin)}` : '—'}
                    sub={stats.losses > 0 ? `Avg Loss  -$${safeNum(stats.avgLoss)}` : 'No losses'}
                    accent="green"
                    border="#2ebd85"
                />
                <Stat
                    label="Avg Hold Time"
                    value={stats.total > 0 ? formatHoldTime(stats.avgHoldMs) : '—'}
                    sub="per closed position"
                    accent="white"
                    border="#202532"
                />
                <Stat
                    label="Total Fees Paid"
                    value={stats.totalFees > 0 ? `-$${safeNum(stats.totalFees)}` : '—'}
                    sub="all linked orders"
                    accent={stats.totalFees > 0 ? 'red' : 'white'}
                    border="#202532"
                />
                <Stat
                    label="Return / Risk"
                    value={stats.total > 1 ? safeNum(stats.sharpe) : '—'}
                    sub="mean return ÷ std dev"
                    accent={stats.sharpe > 1 ? 'green' : stats.sharpe > 0 ? 'gold' : 'red'}
                    border="#202532"
                />
            </div>

            {/* ── EQUITY CURVE + BUY & HOLD ──────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-4">

                {/* Equity Curve */}
                <div className="terminal-card glow-panel-cyan p-5 flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#eaecef]">Equity Curve</h2>
                            <p className="text-[9px] text-[#848e9c] mt-0.5 uppercase tracking-wider">Cumulative PNL — closed trades</p>
                        </div>
                        {equityCurveData.length >= 2 && (
                            <span className={`text-sm font-mono font-bold ${pnlColor(equityCurveData[equityCurveData.length - 1].value)}`}>
                                {pnlSign(equityCurveData[equityCurveData.length - 1].value)}${safeNum(Math.abs(equityCurveData[equityCurveData.length - 1].value))}
                            </span>
                        )}
                    </div>
                    <div className="h-[160px] w-full">
                        <EquityCurve data={equityCurveData} />
                    </div>
                </div>

                {/* Buy & Hold Comparison */}
                <div className="terminal-card p-5 lg:w-[340px] shrink-0">
                    <div className="mb-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#eaecef]">Strategy vs Buy & Hold</h2>
                        <p className="text-[9px] text-[#848e9c] mt-0.5 uppercase tracking-wider">Per symbol — from first entry to now</p>
                    </div>

                    {buyAndHoldData.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-[#848e9c] text-[10px] text-center">
                            No closed trades to compare.<br />Close positions to see the comparison.
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                            {buyAndHoldData.map(d => (
                                <div key={d.symbol} className="bg-[#080a0f]/50 border border-[#202532] rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-[#eaecef]">{d.symbol}</span>
                                        {d.edge !== null && (
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.edge >= 0 ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                                {d.edge >= 0 ? '↑' : '↓'} Edge: {pnlSign(d.edge)}{safeNum(d.edge, 1)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {/* Strategy bar */}
                                        <div>
                                            <div className="flex justify-between mb-0.5">
                                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Strategy</span>
                                                <span className={`text-[9px] font-mono font-bold ${pnlColor(d.strategyPct)}`}>
                                                    {pnlSign(d.strategyPct)}{safeNum(d.strategyPct, 1)}%
                                                </span>
                                            </div>
                                            <div className="h-1 bg-[#202532] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${d.strategyPct >= 0 ? 'bg-[#2ebd85]' : 'bg-[#f6465d]'}`}
                                                    style={{ width: `${Math.min(100, Math.abs(d.strategyPct))}%` }}
                                                />
                                            </div>
                                        </div>
                                        {/* Buy & Hold bar */}
                                        <div>
                                            <div className="flex justify-between mb-0.5">
                                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Buy & Hold</span>
                                                <span className={`text-[9px] font-mono font-bold ${d.bhPct !== null ? pnlColor(d.bhPct) : 'text-[#848e9c]'}`}>
                                                    {d.bhPct !== null ? `${pnlSign(d.bhPct)}${safeNum(d.bhPct, 1)}%` : 'Loading…'}
                                                </span>
                                            </div>
                                            <div className="h-1 bg-[#202532] rounded-full overflow-hidden">
                                                {d.bhPct !== null && (
                                                    <div
                                                        className={`h-full rounded-full transition-all opacity-50 ${d.bhPct >= 0 ? 'bg-[#0ea5e9]' : 'bg-[#f6465d]'}`}
                                                        style={{ width: `${Math.min(100, Math.abs(d.bhPct))}%` }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {priceSyncing && (
                        <p className="text-[8px] text-[#848e9c] mt-2 text-right animate-pulse">Updating prices…</p>
                    )}
                </div>
            </div>

            {/* ── ACTIVE POSITIONS ───────────────────────────────────────────── */}
            {activePositions.length > 0 && (
                <div className="terminal-card overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#202532] bg-[#080a0f]/40 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#2ebd85] animate-pulse shadow-[0_0_6px_#2ebd85]" />
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#eaecef]">
                                Open Positions <span className="text-[#848e9c] font-normal ml-1">({activePositions.length})</span>
                            </h3>
                        </div>
                        {priceSyncing && <span className="text-[9px] text-[#848e9c] animate-pulse">Syncing prices…</span>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap min-w-[700px]">
                            <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider border-b border-[#202532]">
                                <tr>
                                    <th className="px-4 py-2.5 font-bold">Algorithm</th>
                                    <th className="px-4 py-2.5 font-bold">Exchange</th>
                                    <th className="px-4 py-2.5 font-bold">Symbol</th>
                                    <th className="px-4 py-2.5 font-bold">Side</th>
                                    <th className="px-4 py-2.5 font-bold text-right">Entry</th>
                                    <th className="px-4 py-2.5 font-bold text-right">Size</th>
                                    <th className="px-4 py-2.5 font-bold text-right">Unreal. PNL</th>
                                    <th className="px-4 py-2.5 font-bold text-right">Unreal. %</th>
                                    <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                {activePositions.map(pos => {
                                    const pnl = getLivePnl(pos);
                                    const hasPrice = !!livePrices[pos.symbol];
                                    return (
                                        <tr key={pos.id} className="border-b border-[#202532]/40 hover:bg-[#2ebd85]/[0.015] transition-colors">
                                            <td className="px-4 py-3 font-bold text-[#eaecef]">
                                                {pos.bot_name}
                                                <span className="ml-2 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                            </td>
                                            <td className="px-4 py-3 text-[#fcd535] font-bold uppercase text-[10px]">{pos.exchange || 'okx'}</td>
                                            <td className="px-4 py-3 font-bold text-[#eaecef] font-mono">{pos.symbol}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${pos.side === 'long' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{pos.side}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-[#848e9c]">${safeNum(pos.entry_price)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-[#848e9c]">{formatCrypto(pos.amount)}</td>
                                            <td className={`px-4 py-3 text-right font-mono font-bold ${hasPrice ? pnlColor(pnl.abs) : 'text-[#848e9c]'}`}>
                                                {hasPrice ? `${pnlSign(pnl.abs)}$${safeNum(Math.abs(pnl.abs))}` : '—'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-mono font-bold ${hasPrice ? pnlColor(pnl.pct) : 'text-[#848e9c]'}`}>
                                                {hasPrice ? `${pnlSign(pnl.pct)}${safeNum(pnl.pct, 2)}%` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-3">
                                                <button onClick={() => forceClosePosition(pos.id)} className="text-[#fcd535] hover:text-[#e5c02a] text-[9px] font-bold uppercase transition-colors">Close</button>
                                                <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] text-[9px] font-bold uppercase transition-colors">Drop</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── TABS ───────────────────────────────────────────────────────── */}
            <div className="flex space-x-8 border-b border-[#202532]">
                <button onClick={() => { setActiveTab('positions'); resetPage(); }} className={tabClass(activeTab === 'positions')}>
                    Historical Ledger
                    {closedPositions.length > 0 && <span className="ml-2 bg-[#202532] text-[#848e9c] px-1.5 py-0.5 rounded text-[8px] font-mono">{closedPositions.length}</span>}
                </button>
                <button onClick={() => { setActiveTab('orders'); resetPage(); }} className={tabClass(activeTab === 'orders')}>
                    Execution Log
                    {filteredOrders.length > 0 && <span className="ml-2 bg-[#202532] text-[#848e9c] px-1.5 py-0.5 rounded text-[8px] font-mono">{filteredOrders.length}</span>}
                </button>
            </div>

            {/* ── HISTORICAL LEDGER ──────────────────────────────────────────── */}
            {activeTab === 'positions' && (
                <div className="terminal-card overflow-hidden flex flex-col h-[560px]">
                    <div className="px-5 py-3 border-b border-[#202532] bg-[#080a0f]/40 flex flex-wrap gap-y-2 items-center justify-between shrink-0">
                        <div className="flex items-center space-x-3">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#eaecef]">Historical Ledger</h3>
                            <PaginationBar
                                total={totalPagesPos}
                                current={currentPage}
                                onPrev={() => setCurrentPage(p => p - 1)}
                                onNext={() => setCurrentPage(p => p + 1)}
                            />
                        </div>
                        <button
                            onClick={bulkDelete}
                            disabled={closedPositions.length === 0}
                            className="text-[#f6465d] hover:text-white border border-transparent hover:border-[#f6465d]/50 hover:bg-[#f6465d] hover:shadow-[0_0_12px_rgba(246,70,93,0.2)] text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all disabled:opacity-30"
                        >
                            Wipe Filtered
                        </button>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                        {closedPositions.length === 0 ? (
                            <div className="p-12 text-center text-[#848e9c] text-xs">No historical trades match your filters.</div>
                        ) : (
                            <table className="w-full text-left whitespace-nowrap min-w-[860px] relative">
                                <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 border-b border-[#202532]">
                                    <tr>
                                        <th className="px-4 py-2.5 font-bold">Date Closed</th>
                                        <th className="px-4 py-2.5 font-bold">Algorithm</th>
                                        <th className="px-4 py-2.5 font-bold">Exchange</th>
                                        <th className="px-4 py-2.5 font-bold">Pair</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Entry → Exit</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Size</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Hold</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Yield</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Net PNL</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Fees</th>
                                        <th className="px-4 py-2.5 font-bold text-center"></th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px]">
                                    {renderedPositions.map(pos => {
                                        const isWin = (pos.profit_abs || 0) >= 0;
                                        const exitPrice = getExitPrice(pos);
                                        const holdMs = pos.closed_at && pos.created_at
                                            ? new Date(pos.closed_at) - new Date(pos.created_at)
                                            : 0;
                                        const posFees = orders
                                            .filter(o => o.position_id === pos.id)
                                            .reduce((s, o) => s + (o.fee || 0), 0);
                                        return (
                                            <tr key={pos.id} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors group">
                                                <td className="px-4 py-2.5 font-mono text-[#848e9c] text-[10px]">
                                                    {pos.closed_at ? new Date(pos.closed_at).toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 font-bold text-[#eaecef]">
                                                    {pos.bot_name}
                                                    <span className="ml-1.5 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{pos.mode}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-[#fcd535] font-bold uppercase text-[10px]">{pos.exchange || 'okx'}</td>
                                                <td className="px-4 py-2.5 font-bold font-mono text-[#eaecef]">{pos.symbol}</td>
                                                <td className="px-4 py-2.5 text-right font-mono text-[10px]">
                                                    <span className="text-[#848e9c]">${safeNum(pos.entry_price)}</span>
                                                    <span className="text-[#202532] mx-1">→</span>
                                                    <span className={exitPrice ? pnlColor(pos.profit_abs) : 'text-[#848e9c]'}>
                                                        {exitPrice ? `$${safeNum(exitPrice)}` : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-mono text-[#848e9c] text-[10px]">{formatCrypto(pos.amount)}</td>
                                                <td className="px-4 py-2.5 text-right font-mono text-[#848e9c] text-[10px]">{formatHoldTime(holdMs)}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isWin ? 'bg-[#2ebd85]/10 text-[#2ebd85]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                                        {pnlSign(pos.profit_pct)}{safeNum(pos.profit_pct)}%
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-2.5 text-right font-mono font-bold ${pnlColor(pos.profit_abs)}`}>
                                                    {pnlSign(pos.profit_abs)}${safeNum(Math.abs(pos.profit_abs))}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-mono text-[#848e9c] text-[10px]">
                                                    {posFees > 0 ? `-$${safeNum(posFees, 4)}` : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors font-bold text-xs">✕</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ── EXECUTION LOG ──────────────────────────────────────────────── */}
            {activeTab === 'orders' && (
                <div className="terminal-card overflow-hidden flex flex-col h-[560px]">
                    <div className="px-5 py-3 border-b border-[#202532] bg-[#080a0f]/40 flex flex-wrap gap-y-2 items-center justify-between shrink-0">
                        <div className="flex items-center space-x-3">
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#eaecef]">Execution Log</h3>
                                <p className="text-[9px] text-[#848e9c] mt-0.5 tracking-wide">Every order dispatched to exchange or simulator</p>
                            </div>
                            <PaginationBar
                                total={totalPagesOrd}
                                current={currentPage}
                                onPrev={() => setCurrentPage(p => p - 1)}
                                onNext={() => setCurrentPage(p => p + 1)}
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                        {filteredOrders.length === 0 ? (
                            <div className="p-12 text-center text-[#848e9c] text-xs">No orders match your filters.</div>
                        ) : (
                            <table className="w-full text-left whitespace-nowrap min-w-[800px] relative">
                                <thead className="bg-[#080a0f]/80 text-[9px] text-[#848e9c] uppercase tracking-wider sticky top-0 z-10 border-b border-[#202532]">
                                    <tr>
                                        <th className="px-4 py-2.5 font-bold">Timestamp</th>
                                        <th className="px-4 py-2.5 font-bold">Algorithm</th>
                                        <th className="px-4 py-2.5 font-bold">Exchange</th>
                                        <th className="px-4 py-2.5 font-bold">Pair</th>
                                        <th className="px-4 py-2.5 font-bold">Action</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Fill Price</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Size</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Fee</th>
                                        <th className="px-4 py-2.5 font-bold text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px]">
                                    {renderedOrders.map(order => (
                                        <tr key={order.id} className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors">
                                            <td className="px-4 py-2.5 font-mono text-[#848e9c] text-[10px]">{new Date(order.timestamp).toLocaleString()}</td>
                                            <td className="px-4 py-2.5 font-bold text-[#eaecef]">
                                                {order.bot_name}
                                                <span className="ml-1.5 bg-[#202532] px-1.5 py-0.5 rounded text-[8px] uppercase text-[#848e9c]">{order.mode}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-[#fcd535] font-bold uppercase text-[10px]">{order.exchange || 'okx'}</td>
                                            <td className="px-4 py-2.5 font-bold font-mono text-[#eaecef]">{order.symbol}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`font-bold uppercase text-[10px] ${order.side === 'buy' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                                    {order.side}
                                                </span>
                                                <span className="ml-1.5 text-[#848e9c] text-[9px] uppercase">{order.order_type}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-[#eaecef]">${safeNum(order.price)}</td>
                                            <td className="px-4 py-2.5 text-right font-mono text-[#848e9c]">{formatCrypto(order.amount)}</td>
                                            <td className="px-4 py-2.5 text-right font-mono text-[#848e9c] text-[10px]">
                                                {order.fee > 0 ? `-$${safeNum(order.fee, 4)}` : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                                                    order.status === 'filled' ? 'bg-[#2ebd85]/10 text-[#2ebd85]' :
                                                    order.status === 'rejected' || order.status === 'canceled' ? 'bg-[#f6465d]/10 text-[#f6465d]' :
                                                    'bg-[#fcd535]/10 text-[#fcd535]'
                                                }`}>{order.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </PageShell>
    );
}
