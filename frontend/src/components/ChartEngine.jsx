import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { apiClient } from '../api/client';

const safeParseTime = (ts) => {
  if (!ts) return null;
  if (typeof ts === 'number') return ts; 
  let cleanTs = ts;
  if (typeof cleanTs === 'string') {
    if (cleanTs.includes(' ')) cleanTs = cleanTs.replace(' ', 'T');
    if (!cleanTs.endsWith('Z') && !cleanTs.includes('+')) cleanTs += 'Z';
  }
  const parsed = Math.floor(new Date(cleanTs).getTime() / 1000);
  return isNaN(parsed) ? null : parsed;
};

const getTimeframeSeconds = (tf) => {
    if (!tf) return 60;
    const val = parseInt(tf);
    if (tf.endsWith('m')) return val * 60;
    if (tf.endsWith('h')) return val * 3600;
    if (tf.endsWith('d')) return val * 86400;
    return 60;
};

const chartColors = ['#fcd535', '#0ea5e9', '#d946ef', '#2ebd85', '#f6465d', '#8b5cf6'];
const getColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return chartColors[Math.abs(hash) % chartColors.length];
};

const formatNum = (num, decimals = 2) => {
    if (num === undefined || num === null || isNaN(Number(num))) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatCrypto = (val) => {
    if (!val) return "0.00";
    return Number(val).toFixed(6).replace(/\.?0+$/, ''); 
};

export default function ChartEngine({ dataset }) {
  if (!dataset || !dataset.symbol) return null;

  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const indicatorSeriesRef = useRef({}); 
  const markersPluginRef = useRef(null); 
  const priceLinesRef = useRef([]); 
  const lastCandleRef = useRef(null); 
  const isCrosshairActive = useRef(false);
  
  const [candleTimes, setCandleTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [marketInfo, setMarketInfo] = useState(null);
  const [isLiveStreamActive, setIsLiveStreamActive] = useState(false);

  const [signals, setSignals] = useState([]);
  const [orders, setOrders] = useState([]); 
  const [positions, setPositions] = useState([]); 
  
  const [showMenu, setShowMenu] = useState(false);
  const [expandedMenuBot, setExpandedMenuBot] = useState(null); 
  const [botConfigs, setBotConfigs] = useState({});

  const getSnappedTime = useCallback((rawTime) => {
      if (!candleTimes || candleTimes.length === 0) return null;
      let closest = candleTimes[0];
      let minDiff = Math.abs(rawTime - closest);
      for (let i = 1; i < candleTimes.length; i++) {
          const diff = Math.abs(rawTime - candleTimes[i]);
          if (diff < minDiff) { minDiff = diff; closest = candleTimes[i]; }
          if (diff === 0) break;
      }
      return minDiff <= 3600 ? closest : null;
  }, [candleTimes]);

  const fetchMarketInfo = async () => {
    try {
      const response = await apiClient.get(`/api/data/market-info/${dataset.symbol.replace('/', '-')}`);
      setMarketInfo(response.data);
    } catch (err) { /* silent */ }
  };

  const initBotConfigs = async () => {
    try {
      const botRes = await apiClient.get('/api/bots/');
      
      // FIX 1: Controleer of de huidige grafiek (dataset.symbol) voorkomt in de LIJST (symbols) van de bot!
      const validBots = botRes.data.filter(b => {
          const syms = b.settings?.symbols || (b.settings?.symbol ? [b.settings.symbol] : []);
          return syms.includes(dataset.symbol) && b.settings?.timeframe === dataset.timeframe;
      });
      
      setBotConfigs(prev => {
         const newConfigs = { ...prev };
         validBots.forEach(bot => {
             if (!newConfigs[bot.name]) {
                 newConfigs[bot.name] = { 
                     showSignals: false, 
                     showBacktestTrades: true, 
                     showRealTrades: true, 
                     showBacktestPositions: false, 
                     showRealPositions: false, 
                     indicators: {}, 
                     nodeMap: {} 
                 };
             }
             newConfigs[bot.name].nodeMap = {};
             if (bot.settings && bot.settings.nodes) {
                 Object.entries(bot.settings.nodes).forEach(([nodeId, node]) => {
                     if (node.class === 'indicator') {
                         const suffix = node.params && node.params.length > 0 ? `_${node.params.join('_')}` : '';
                         const indName = `${node.method.toUpperCase()}${suffix}`;
                         newConfigs[bot.name].nodeMap[nodeId] = indName; 
                     }
                 });
             }
         });
         return newConfigs;
      });
    } catch (e) { console.error("Error setting up configs", e); }
  };

  const pollData = async () => {
    try {
      const safeSymbol = dataset.symbol.replace('/', '-');
      const [sigRes, ordRes, posRes] = await Promise.all([
          apiClient.get(`/api/bots/signals`, { params: { symbol: dataset.symbol, timeframe: dataset.timeframe } }),
          apiClient.get(`/api/trades/orders?symbol=${safeSymbol}`),
          apiClient.get(`/api/trades/positions?symbol=${safeSymbol}`)
      ]);
      setSignals(sigRes.data || []);
      setOrders(ordRes.data || []);
      setPositions(posRes.data || []);
    } catch (e) { console.error("Data Fetch Error:", e); }
  };

  const applyInitialDataToChart = (rawData) => {
    if (!rawData || rawData.length === 0) return;
    const uniqueData = [];
    const seenTimes = new Set();
    const extractedTimes = [];
    
    rawData.forEach(item => {
        const safeTime = safeParseTime(item.time || item.timestamp);
        if (safeTime && !seenTimes.has(safeTime)) {
            seenTimes.add(safeTime);
            extractedTimes.push(safeTime);
            uniqueData.push({ time: safeTime, open: item.open, high: item.high, low: item.low, close: item.close, value: item.volume || item.value });
        }
    });
    
    uniqueData.sort((a, b) => a.time - b.time);
    extractedTimes.sort((a, b) => a - b);
    
    setCandleTimes(extractedTimes);
    
    try {
      candleSeriesRef.current.setData(uniqueData);
      const volumeData = uniqueData.map(d => ({
        time: d.time, value: d.value, color: d.close >= d.open ? '#2ebd8580' : '#f6465d80' 
      }));
      volumeSeriesRef.current.setData(volumeData);
      
      if (uniqueData.length > 0) {
        lastCandleRef.current = { ...uniqueData[uniqueData.length - 1], value: volumeData[volumeData.length - 1].value };
        if (!isCrosshairActive.current) setHoverData({ ...lastCandleRef.current, time: lastCandleRef.current.time });
        
        const tfSeconds = getTimeframeSeconds(dataset.timeframe);
        setIsLiveStreamActive(((Date.now() / 1000) - lastCandleRef.current.time) < (tfSeconds + 120));
      }
    } catch (e) { console.error("Data Load Crash Prevented:", e); }
  };

  const updateLatestCandles = async () => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    try {
      const response = await apiClient.get(`/api/data/candles/${dataset.symbol.replace('/', '-')}`, {
        headers: { 'x-timeframe': dataset.timeframe }, params: { limit: 10 }
      });
      if (response.data && response.data.length > 0) {
        const rawLatest = response.data[response.data.length - 1];
        const latestTime = safeParseTime(rawLatest.time || rawLatest.timestamp);
        if (!latestTime) return;

        const latestDbCandle = { ...rawLatest, time: latestTime };
        
        if (!lastCandleRef.current || latestDbCandle.time >= lastCandleRef.current.time) {
            candleSeriesRef.current.update(latestDbCandle);
            volumeSeriesRef.current.update({
                time: latestDbCandle.time, value: latestDbCandle.volume || latestDbCandle.value,
                color: latestDbCandle.close >= latestDbCandle.open ? '#2ebd8580' : '#f6465d80'
            });
            setCandleTimes(prev => prev.includes(latestDbCandle.time) ? prev : [...prev, latestDbCandle.time].sort((a,b) => a-b));
            const newHoverState = { ...latestDbCandle, value: latestDbCandle.volume || latestDbCandle.value, time: latestDbCandle.time };
            if (!isCrosshairActive.current) setHoverData(newHoverState);
            
            const tfSeconds = getTimeframeSeconds(dataset.timeframe);
            setIsLiveStreamActive(((Date.now() / 1000) - latestDbCandle.time) < (tfSeconds + 120));
            
            lastCandleRef.current = newHoverState;
        }
      }
    } catch (err) { /* silent */ }
  };

  useEffect(() => {
    fetchMarketInfo();
    initBotConfigs(); 
    pollData();    

    const infoInterval = setInterval(fetchMarketInfo, 60000); 

    const initChart = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const chart = createChart(chartContainerRef.current, {
          layout: { background: { type: 'solid', color: '#0b0e11' }, textColor: '#848e9c' },
          grid: { vertLines: { color: '#1f2329' }, horzLines: { color: '#1f2329' } },
          crosshair: { mode: 0 }, 
          rightPriceScale: { borderColor: '#2b3139', autoScale: true },
          leftPriceScale: { visible: true, borderColor: '#2b3139', autoScale: true }, 
          timeScale: { borderColor: '#2b3139', timeVisible: true }, 
          autoSize: true, 
        });
        chartRef.current = chart;

        candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
          upColor: '#2ebd85', downColor: '#f6465d', borderVisible: false, wickUpColor: '#2ebd85', wickDownColor: '#f6465d'
        });
        
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, []);

        volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
        volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        // FIX 2: De chart haalt nu standaard de laatste 3000 candles op voor een enorme geschiedenis!
        const response = await apiClient.get(`/api/data/candles/${dataset.symbol.replace('/', '-')}`, { 
            headers: { 'x-timeframe': dataset.timeframe },
            params: { limit: 3000 }
        });

        if (!response.data || response.data.length === 0) {
           setErrorMsg("No data found in local database. Download historical data first.");
           setLoading(false); return;
        }

        applyInitialDataToChart(response.data);
        chart.timeScale().fitContent(); 

        chart.subscribeCrosshairMove((param) => {
          if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
            isCrosshairActive.current = false;
            if (lastCandleRef.current) setHoverData({ ...lastCandleRef.current, time: lastCandleRef.current.time });
            return;
          }
          isCrosshairActive.current = true;
          const dCandle = param.seriesData.get(candleSeriesRef.current);
          const dVol = param.seriesData.get(volumeSeriesRef.current);
          if (dCandle) setHoverData({ ...dCandle, value: dVol ? dVol.value : 0, time: param.time });
        });
      } catch (error) {
        setErrorMsg(`API Error: ${error.message}`);
      } finally { setLoading(false); }
    };

    initChart();
    const pollInterval = setInterval(updateLatestCandles, 1000);
    const signalInterval = setInterval(pollData, 3000); 
    
    return () => { 
      clearInterval(infoInterval);
      clearInterval(pollInterval);
      clearInterval(signalInterval);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [dataset.symbol, dataset.timeframe]);

  useEffect(() => {
    if (signals.length === 0) return;
    setBotConfigs(prev => {
      let changed = false;
      const next = { ...prev };
      signals.forEach(sig => {
        if (!next[sig.bot_name]) return;
        let parsedExtra = {};
        try { parsedExtra = typeof sig.extra_data === 'string' ? JSON.parse(sig.extra_data) : (sig.extra_data || {}); } catch(e){}
        Object.keys(parsedExtra).forEach(key => {
           const readableKey = next[sig.bot_name].nodeMap?.[key] || key;
           if (next[sig.bot_name].indicators[readableKey] === undefined) {
               if (!changed) changed = true;
               next[sig.bot_name] = { ...next[sig.bot_name], indicators: { ...next[sig.bot_name].indicators, [readableKey]: false } };
           }
        });
      });
      return changed ? next : prev;
    });
  }, [signals]);

  const snappedSignalMap = useMemo(() => {
    const map = {};
    signals.forEach(sig => {
      const rawTime = safeParseTime(sig.timestamp);
      if (!rawTime) return;
      const snappedTime = getSnappedTime(rawTime);
      if (!snappedTime) return;
      if (!map[snappedTime]) map[snappedTime] = {};
      let parsedExtra = {};
      try { parsedExtra = typeof sig.extra_data === 'string' ? JSON.parse(sig.extra_data) : (sig.extra_data || {}); } catch (e) {}
      const config = botConfigs[sig.bot_name];
      const mappedExtra = {};
      Object.keys(parsedExtra).forEach(k => {
          const readableKey = (config && config.nodeMap && config.nodeMap[k]) ? config.nodeMap[k] : k;
          mappedExtra[readableKey] = parsedExtra[k];
      });
      map[snappedTime][sig.bot_name] = { ...sig, extra_data: mappedExtra };
    });
    return map;
  }, [signals, getSnappedTime, botConfigs]);

  const snappedTradeMap = useMemo(() => {
    const map = {};
    orders.forEach(order => {
        const rawTime = safeParseTime(order.timestamp);
        if (!rawTime) return;
        const snappedTime = getSnappedTime(rawTime);
        if (!snappedTime) return;
        
        const config = botConfigs[order.bot_name];
        const isBacktest = order.mode === 'backtest';
        if (isBacktest && !config?.showBacktestTrades) return;
        if (!isBacktest && !config?.showRealTrades) return;

        const relatedPosition = positions.find(p => p.id === order.position_id);

        if (!map[snappedTime]) map[snappedTime] = [];
        map[snappedTime].push({ ...order, position: relatedPosition });
    });
    return map;
  }, [orders, positions, getSnappedTime, botConfigs]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || candleTimes.length === 0) return;
    
    const markersByTime = {};
    signals.forEach(sig => {
      if (botConfigs[sig.bot_name]?.showSignals && (sig.action === 'buy' || sig.action === 'sell')) {
        const rawTime = safeParseTime(sig.timestamp);
        if (!rawTime) return; 
        const snappedTime = getSnappedTime(rawTime);
        if (!snappedTime) return; 
        if (!markersByTime[snappedTime]) markersByTime[snappedTime] = [];
        markersByTime[snappedTime].push({ type: 'signal', data: sig });
      }
    });

    Object.entries(snappedTradeMap).forEach(([timeStr, tradesAtTime]) => {
        const snappedTime = parseInt(timeStr);
        if (!markersByTime[snappedTime]) markersByTime[snappedTime] = [];
        tradesAtTime.forEach(trade => markersByTime[snappedTime].push({ type: 'trade', data: trade }));
    });

    const finalMarkers = [];
    Object.keys(markersByTime).forEach(timeStr => {
        const time = parseInt(timeStr);
        const itemsAtTime = markersByTime[time];
        
        const buySigs = itemsAtTime.filter(i => i.type === 'signal' && i.data.action === 'buy');
        const sellSigs = itemsAtTime.filter(i => i.type === 'signal' && i.data.action === 'sell');
        const buyTrades = itemsAtTime.filter(i => i.type === 'trade' && i.data.side === 'buy');
        const sellTrades = itemsAtTime.filter(i => i.type === 'trade' && i.data.side === 'sell');
        
        if (buySigs.length > 0) finalMarkers.push({ time: time, position: 'belowBar', color: '#2ebd85', shape: 'arrowUp', text: 'S-B' });
        if (sellSigs.length > 0) finalMarkers.push({ time: time, position: 'aboveBar', color: '#f6465d', shape: 'arrowDown', text: 'S-S' });
        
        if (buyTrades.length > 0) finalMarkers.push({ time: time, position: 'belowBar', color: '#0ea5e9', shape: 'circle', text: 'T-BUY' });
        if (sellTrades.length > 0) finalMarkers.push({ time: time, position: 'aboveBar', color: '#d946ef', shape: 'circle', text: 'T-SELL' });
    });

    finalMarkers.sort((a, b) => a.time - b.time);
    try { if (markersPluginRef.current) markersPluginRef.current.setMarkers(finalMarkers); } catch (e) {}

    priceLinesRef.current.forEach(line => { try { candleSeriesRef.current.removePriceLine(line); } catch(e){} });
    priceLinesRef.current = [];

    positions.forEach(pos => {
        if (pos.status === 'open') {
            const isBacktest = pos.mode === 'backtest';
            const config = botConfigs[pos.bot_name];

            if (isBacktest && !config?.showBacktestPositions) return;
            if (!isBacktest && !config?.showRealPositions) return;

            const priceLine = {
                price: pos.entry_price,
                color: isBacktest ? '#848e9c' : (pos.side === 'long' ? '#2ebd85' : '#f6465d'),
                lineWidth: 2,
                lineStyle: 2, 
                axisLabelVisible: true,
                title: `ENTRY (${isBacktest ? 'BT' : 'LIVE'})`,
            };
            try { priceLinesRef.current.push(candleSeriesRef.current.createPriceLine(priceLine)); } catch(e) {}
        }
    });

    Object.keys(botConfigs).forEach(botName => {
        const config = botConfigs[botName];
        Object.keys(config.indicators).forEach(indKey => {
            const seriesId = `${botName}_${indKey}`;
            const isActive = config.indicators[indKey];

            if (isActive) {
                if (!indicatorSeriesRef.current[seriesId]) {
                    const isOscillator = /RSI|MACD|MFI|CCI|STOCH|ATR|ADX/i.test(indKey);
                    indicatorSeriesRef.current[seriesId] = chartRef.current.addSeries(LineSeries, {
                        color: getColor(seriesId), lineWidth: 2, priceScaleId: isOscillator ? 'left' : 'right', title: `${indKey}`, lastValueVisible: true, priceLineVisible: true,
                    });
                }
                const series = indicatorSeriesRef.current[seriesId];
                const dataMap = new Map(); 
                
                signals.forEach(sig => {
                    if (sig.bot_name === botName && sig.extra_data) {
                        let parsedExtra = {};
                        try { parsedExtra = typeof sig.extra_data === 'string' ? JSON.parse(sig.extra_data) : sig.extra_data; } catch (e) {}
                        
                        const mappedExtra = {};
                        Object.keys(parsedExtra).forEach(k => {
                            const readableKey = (config && config.nodeMap && config.nodeMap[k]) ? config.nodeMap[k] : k;
                            mappedExtra[readableKey] = parsedExtra[k];
                        });

                        const val = mappedExtra[indKey]; 
                        if (val !== undefined && val !== null) {
                            const rawTime = safeParseTime(sig.timestamp);
                            if (rawTime && !isNaN(Number(val))) {
                                const snappedTime = getSnappedTime(rawTime);
                                if (snappedTime) dataMap.set(snappedTime, Number(val)); 
                            }
                        }
                    }
                });
                
                const uniqueLineData = Array.from(dataMap.entries()).map(([t, v]) => ({ time: t, value: v })).sort((a, b) => a.time - b.time);
                try {
                  if (uniqueLineData.length > 0) { series.setData(uniqueLineData); series.applyOptions({ visible: true }); } 
                  else { series.applyOptions({ visible: false }); }
                } catch(e) {}
            } else {
                if (indicatorSeriesRef.current[seriesId]) indicatorSeriesRef.current[seriesId].applyOptions({ visible: false });
            }
        });
    });
  }, [signals, orders, positions, botConfigs, getSnappedTime, snappedTradeMap]);

  const toggleBotSetting = (botName, settingKey) => {
      setBotConfigs(prev => {
          const newState = JSON.parse(JSON.stringify(prev));
          newState[botName][settingKey] = !newState[botName][settingKey];
          return newState;
      });
  };

  const toggleIndicatorConfig = (targetBotName, indKey) => {
      setBotConfigs(prev => {
          const newState = JSON.parse(JSON.stringify(prev));
          newState[targetBotName].indicators[indKey] = !newState[targetBotName].indicators[indKey];
          return newState;
      });
  };

  const toggleMenuBot = (botName) => setExpandedMenuBot(expandedMenuBot === botName ? null : botName);

  const formatChange = (num) => {
    if (num === undefined || num === null) return 'N/A';
    const val = parseFloat(num);
    return val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0b0e11] rounded overflow-hidden">
      
      <div className="h-14 bg-[#181a20] border-b border-[#2b3139] flex items-center justify-between px-4 shrink-0 relative z-30">
        <div className="flex items-center space-x-6">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-white font-bold tracking-wider">{dataset.symbol}</span>
              <span className="bg-[#2b3139] text-[#eaecef] text-[10px] px-1.5 py-0.5 rounded uppercase">{dataset.timeframe}</span>
            </div>
            {marketInfo && <span className={`text-xs font-mono font-medium mt-0.5 ${marketInfo.change_24h >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>{formatNum(marketInfo.last)}</span>}
          </div>

          {marketInfo && (
            <>
              <div className="hidden md:flex flex-col border-l border-[#2b3139] pl-6">
                <span className="text-[#848e9c] text-[10px] uppercase">24h Change</span>
                <span className={`text-xs font-mono mt-0.5 ${marketInfo.change_24h >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>{formatChange(marketInfo.change_24h)}</span>
              </div>
              <div className="hidden md:flex flex-col border-l border-[#2b3139] pl-6">
                <span className="text-[#848e9c] text-[10px] uppercase">24h High</span>
                <span className="text-[#eaecef] text-xs font-mono mt-0.5">{formatNum(marketInfo.high_24h)}</span>
              </div>
              <div className="hidden lg:flex flex-col border-l border-[#2b3139] pl-6">
                <span className="text-[#848e9c] text-[10px] uppercase">24h Low</span>
                <span className="text-[#eaecef] text-xs font-mono mt-0.5">{formatNum(marketInfo.low_24h)}</span>
              </div>
              <div className="hidden xl:flex flex-col border-l border-[#2b3139] pl-6">
                <span className="text-[#848e9c] text-[10px] uppercase">24h Volume</span>
                <span className="text-[#eaecef] text-xs font-mono mt-0.5">{formatNum(marketInfo.vol_24h)}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center space-x-4 relative">
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium border ${isLiveStreamActive ? 'bg-[#2ebd85]/10 text-[#2ebd85] border-[#2ebd85]/30' : 'bg-[#fcd535]/10 text-[#fcd535] border-[#fcd535]/30'}`}>
            <div className={`w-2 h-2 rounded-full ${isLiveStreamActive ? 'bg-[#2ebd85] animate-pulse' : 'bg-[#fcd535]'}`}></div>
            <span className="hidden sm:inline">{isLiveStreamActive ? 'SYNCED: LIVE' : 'SYNCED: STATIC'}</span>
          </div>

          <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 rounded bg-[#2b3139] hover:bg-[#3b4149] transition-colors border border-[#3b4149] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#eaecef]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          {showMenu && (
            <div className="absolute top-12 right-0 w-80 bg-[#181a20] border border-[#2b3139] rounded shadow-xl py-2 z-50">
              <div className="px-4 py-3 text-xs font-bold text-[#848e9c] uppercase border-b border-[#2b3139] mb-1">Algorithm Overlay</div>
              {Object.keys(botConfigs).length === 0 ? (
                <div className="px-4 py-3 text-xs text-[#848e9c]">No algorithms active on this chart.</div>
              ) : (
                Object.keys(botConfigs).map(botName => {
                  const config = botConfigs[botName];
                  const isExpanded = expandedMenuBot === botName;

                  return (
                    <div key={botName} className="border-b border-[#2b3139]/50 last:border-0 transition-colors">
                      <button onClick={() => toggleMenuBot(botName)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#2b3139]/30 transition-colors">
                        <div className="text-sm font-bold text-[#eaecef] flex items-center">
                           <span className="w-1.5 h-1.5 rounded-full mr-2 bg-[#2ebd85]"></span>{botName}
                        </div>
                        <svg className={`w-4 h-4 text-[#848e9c] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>

                      {isExpanded && (
                        <div className="flex flex-col space-y-4 pl-8 pr-4 pb-4 bg-[#0b0e11]/50 border-l-2 border-[#2b3139] ml-4 mt-1">
                            <div className="flex flex-col space-y-2 mt-2">
                                <span className="text-[10px] font-bold text-[#0ea5e9] uppercase tracking-wider">LIVE & PAPER MODE</span>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3 w-3 text-[#0ea5e9] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.showRealTrades} onChange={() => toggleBotSetting(botName, 'showRealTrades')} /><span className="ml-2 text-xs text-[#eaecef]">Real Trades (T-B / T-S)</span></label>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3 w-3 text-[#0ea5e9] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.showRealPositions} onChange={() => toggleBotSetting(botName, 'showRealPositions')} /><span className="ml-2 text-xs text-[#eaecef]">Real Position Line</span></label>
                            </div>
                            <div className="flex flex-col space-y-2">
                                <span className="text-[10px] font-bold text-[#fcd535] uppercase tracking-wider">BACKTEST MODE</span>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3 w-3 text-[#fcd535] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.showBacktestTrades} onChange={() => toggleBotSetting(botName, 'showBacktestTrades')} /><span className="ml-2 text-xs text-[#848e9c]">Historical Trades (T-B / T-S)</span></label>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3 w-3 text-[#fcd535] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.showBacktestPositions} onChange={() => toggleBotSetting(botName, 'showBacktestPositions')} /><span className="ml-2 text-xs text-[#848e9c]">Historical Position Line</span></label>
                            </div>
                            <div className="h-px bg-[#2b3139] w-full my-1"></div>
                            <label className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3.5 w-3.5 text-[#2ebd85] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.showSignals} onChange={() => toggleBotSetting(botName, 'showSignals')} /><span className="ml-2 text-xs text-[#eaecef] italic">Engine Thoughts (S-B / S-S)</span></label>
                            {Object.keys(config.indicators).map(indKey => (
                                <label key={indKey} className="flex items-center cursor-pointer"><input type="checkbox" className="form-checkbox h-3.5 w-3.5 text-[#fcd535] rounded border-[#2b3139] bg-[#0b0e11]" checked={config.indicators[indKey]} onChange={() => toggleIndicatorConfig(botName, indKey)} /><span className="ml-2 text-xs text-[#eaecef]">Draw Line: {indKey}</span></label>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative w-full h-full">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/90 z-20 text-[#fcd535] text-sm tracking-widest animate-pulse">LOADING ENGINE...</div>}
        {errorMsg && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/90 z-20 text-[#f6465d] font-bold tracking-widest px-6 text-center">{errorMsg}</div>}
        
        {hoverData && !loading && !errorMsg && (
          <div className="absolute top-3 left-3 z-10 bg-[#181a20]/80 backdrop-blur-sm border border-[#2b3139] p-2 rounded-sm text-xs font-mono pointer-events-none shadow-lg max-w-[80%] flex flex-wrap gap-y-2">
            <div className="flex space-x-3 items-center flex-wrap gap-y-2">
              <div className="flex space-x-1"><span className="text-[#848e9c]">O</span><span className={hoverData.open > hoverData.close ? 'text-[#f6465d]' : 'text-[#2ebd85]'}>{formatNum(hoverData.open)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">H</span><span className="text-[#eaecef]">{formatNum(hoverData.high)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">L</span><span className="text-[#eaecef]">{formatNum(hoverData.low)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">C</span><span className={hoverData.close >= hoverData.open ? 'text-[#2ebd85]' : 'text-[#f6465d]'}>{formatNum(hoverData.close)}</span></div>
              <div className="flex space-x-1 border-l border-[#2b3139] pl-3 ml-1"><span className="text-[#848e9c]">V</span><span className="text-[#eaecef]">{formatNum(hoverData.value)}</span></div>
              
              {Object.keys(botConfigs).map(botName => {
                  const config = botConfigs[botName];
                  const activeInds = Object.keys(config.indicators).filter(k => config.indicators[k]);
                  if (activeInds.length === 0 || !hoverData.time) return null;
                  const botDataAtTime = snappedSignalMap[hoverData.time]?.[botName]?.extra_data || {};
                  
                  return activeInds.map(indKey => {
                      const val = botDataAtTime[indKey];
                      if (val === undefined) return null;
                      return (
                          <div key={`${botName}-${indKey}`} className="flex space-x-1 border-l border-[#2b3139] pl-3 ml-1 items-center">
                              <span className="text-[#848e9c] text-[10px] uppercase">{indKey}</span><span className="text-[#fcd535]">{formatNum(val)}</span>
                          </div>
                      );
                  });
              })}
            </div>
          </div>
        )}

        {hoverData && snappedTradeMap[hoverData.time] && snappedTradeMap[hoverData.time].length > 0 && (
          <div className="absolute top-14 left-3 z-20 flex flex-col space-y-2 pointer-events-none">
            {snappedTradeMap[hoverData.time].map((trade, idx) => {
                const totalValue = trade.price * trade.amount;
                const isWin = trade.position ? trade.price >= trade.position.entry_price : true;
                const pnlPct = trade.position ? (((trade.price - trade.position.entry_price) / trade.position.entry_price) * 100).toFixed(2) : "0.00";
                const pnlAbs = trade.position ? ((trade.price - trade.position.entry_price) * trade.amount).toFixed(2) : "0.00";

                return (
                    <div key={idx} className={`bg-[#181a20]/95 backdrop-blur-md border p-3 rounded shadow-2xl flex flex-col min-w-[260px] ${trade.side === 'buy' ? 'border-[#0ea5e9]' : 'border-[#d946ef]'}`}>
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#2b3139]">
                            <span className={`text-xs font-bold uppercase tracking-wider ${trade.side === 'buy' ? 'text-[#0ea5e9]' : 'text-[#d946ef]'}`}>
                                {trade.side === 'buy' ? 'ENTRY EXECUTION' : 'EXIT EXECUTION'}
                            </span>
                            <span className="bg-[#2b3139] text-[#eaecef] text-[8px] px-1.5 py-0.5 rounded uppercase font-bold">{trade.mode}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Execution Price</span>
                                <span className="text-xs text-[#eaecef] font-mono">${formatNum(trade.price)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Filled Size</span>
                                <span className="text-xs text-[#eaecef] font-mono">{formatCrypto(trade.amount)}</span>
                            </div>
                            
                            <div className="flex flex-col">
                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Total Value</span>
                                <span className="text-xs text-[#eaecef] font-mono">${formatNum(totalValue)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Order Type</span>
                                <span className="text-xs text-[#eaecef] uppercase">{trade.order_type || 'Market'}</span>
                            </div>
                            
                            {trade.side === 'sell' && trade.position && (
                                <div className="flex flex-col col-span-2 pt-2 border-t border-[#2b3139]">
                                    <span className="text-[9px] text-[#848e9c] uppercase font-bold mb-1">Trade Result (PNL)</span>
                                    <div className="grid grid-cols-2 gap-2 bg-[#0b0e11] p-2 rounded border border-[#2b3139]">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-[#848e9c] uppercase">Avg Entry</span>
                                            <span className="text-[10px] text-[#eaecef] font-mono">${formatNum(trade.position.entry_price)}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[8px] text-[#848e9c] uppercase">Realized PNL</span>
                                            <span className={`text-[10px] font-mono font-bold ${isWin ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                                                {isWin ? '+' : ''}${pnlAbs} ({pnlPct}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col col-span-2 pt-2 border-t border-[#2b3139]">
                                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Algorithm Source</span>
                                <span className="text-xs text-[#fcd535] truncate">{trade.bot_name}</span>
                            </div>
                        </div>
                    </div>
                )
            })}
          </div>
        )}

        <div ref={chartContainerRef} className="absolute inset-0 z-0" />
      </div>
    </div>
  );
}