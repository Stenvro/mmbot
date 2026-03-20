import { useEffect, useState, useRef } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { apiClient } from '../api/client';

const getOkxWsTimeframe = (tf) => {
  const map = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H', '1d': '1D', '1w': '1W', '1M': '1M' };
  return map[tf] || '1H'; 
};

export default function ChartEngine({ dataset }) {
  const chartContainerRef = useRef();
  
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lastCandleRef = useRef(null); 
  const isCrosshairActive = useRef(false); 
  const wsRef = useRef(null);
  const pingIntervalRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const [hoverData, setHoverData] = useState(null);
  const [marketInfo, setMarketInfo] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const fetchMarketInfo = async () => {
    try {
      const response = await apiClient.get(`/api/data/market-info/${dataset.symbol.replace('/', '-')}`);
      setMarketInfo(response.data);
    } catch (err) {
      console.error("Failed to fetch market info", err);
    }
  };

  useEffect(() => {
    fetchMarketInfo();
    const interval = setInterval(fetchMarketInfo, 60000); 
    return () => clearInterval(interval);
  }, [dataset.symbol]);

  const applyInitialDataToChart = (rawData) => {
    const uniqueData = [];
    const seenTimes = new Set();
    rawData.forEach(item => {
        if (!seenTimes.has(item.time)) {
            seenTimes.add(item.time);
            uniqueData.push(item);
        }
    });
    uniqueData.sort((a, b) => a.time - b.time);

    candleSeriesRef.current.setData(uniqueData);

    const volumeData = uniqueData.map(d => ({
      time: d.time, 
      value: d.value, 
      color: d.close >= d.open ? '#2ebd8580' : '#f6465d80' 
    }));
    volumeSeriesRef.current.setData(volumeData);

    if (uniqueData.length > 0) {
      lastCandleRef.current = { ...uniqueData[uniqueData.length - 1], value: volumeData[volumeData.length - 1].value };
      if (!isCrosshairActive.current) setHoverData(lastCandleRef.current);
    }
  };

  useEffect(() => {
    let chart;
    setIsLive(false); 

    const initChart = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        
        chart = createChart(chartContainerRef.current, {
          layout: { background: { type: 'solid', color: '#0b0e11' }, textColor: '#848e9c' },
          grid: { vertLines: { color: '#1f2329' }, horzLines: { color: '#1f2329' } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: '#2b3139' },
          timeScale: { borderColor: '#2b3139', timeVisible: true },
          autoSize: true, 
        });

        candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
          upColor: '#2ebd85', downColor: '#f6465d', borderVisible: false,
          wickUpColor: '#2ebd85', wickDownColor: '#f6465d'
        });

        volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '', 
        });
        volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        const response = await apiClient.get(`/api/data/candles/${dataset.symbol.replace('/', '-')}`, {
          headers: { 'x-timeframe': dataset.timeframe }
        });

        if (!response.data || response.data.length === 0) {
           setErrorMsg("No data found in database. Please download data first.");
           setLoading(false);
           return;
        }

        applyInitialDataToChart(response.data);
        chart.timeScale().fitContent(); 

        chart.subscribeCrosshairMove((param) => {
          if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
            isCrosshairActive.current = false;
            if (lastCandleRef.current) setHoverData(lastCandleRef.current);
            return;
          }
          
          isCrosshairActive.current = true;
          const dCandle = param.seriesData.get(candleSeriesRef.current);
          const dVol = param.seriesData.get(volumeSeriesRef.current);
          
          if (dCandle) {
            setHoverData({ ...dCandle, value: dVol ? dVol.value : 0 });
          } else {
            if (lastCandleRef.current) setHoverData(lastCandleRef.current);
          }
        });

      } catch (error) {
        setErrorMsg(`API Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    initChart();
    
    return () => { 
      if (wsRef.current) wsRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (chart) chart.remove(); 
    };
  }, [dataset]);

  // De Hybride Live Functie
  const toggleLive = async () => {
    if (isLive) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      setIsLive(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      // FIX: Bepaal exact hoe groot het gat is vanaf de laatste bekende kaars
      const lastKnownTimeMs = lastCandleRef.current 
        ? lastCandleRef.current.time * 1000 
        : Date.now() - (86400000 * 7); // Als vangnet pakken we een week

      // 1. Laat de backend het gat exact dichten
      const payload = {
        timeframe: dataset.timeframe,
        start_date: new Date(lastKnownTimeMs).toISOString(), 
        end_date: new Date().toISOString()
      };
      await apiClient.post(`/api/data/fetch/${dataset.symbol.replace('/', '-')}`, payload);

      // 2. Haal de kersverse data op en pas toe op de grafiek
      const response = await apiClient.get(`/api/data/candles/${dataset.symbol.replace('/', '-')}`, {
        headers: { 'x-timeframe': dataset.timeframe }
      });
      applyInitialDataToChart(response.data);
      setLoading(false);

    } catch (e) {
      console.warn("Gap-sync failed, falling back to live stream anyway", e);
      setLoading(false);
    }

    // 3. Start de WebSocket voor het real-time dansen van de kaars
    const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/business');
    wsRef.current = ws;

    ws.onopen = () => {
      setIsLive(true);
      const channel = `candle${getOkxWsTimeframe(dataset.timeframe)}`;
      const instId = dataset.symbol.replace('/', '-').toUpperCase();
      
      ws.send(JSON.stringify({
        op: "subscribe",
        args: [{ channel: channel, instId: instId }]
      }));

      // Hartslag zodat OKX niet ophangt
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send("ping");
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;

      const response = JSON.parse(event.data);
      
      if (response.event === 'error') {
        console.error("OKX WS Error:", response);
        setErrorMsg(`OKX Live Error: ${response.msg}`);
        setIsLive(false);
        ws.close();
        return;
      }

      if (response.data && response.data.length > 0 && candleSeriesRef.current && volumeSeriesRef.current) {
        const candle = response.data[0];
        const time = Math.floor(parseInt(candle[0]) / 1000);
        const open = parseFloat(candle[1]);
        const high = parseFloat(candle[2]);
        const low = parseFloat(candle[3]);
        const close = parseFloat(candle[4]);
        const volume = parseFloat(candle[5]);

        const tickData = { time, open, high, low, close };
        const volData = { time, value: volume, color: close >= open ? '#2ebd8580' : '#f6465d80' };

        try {
          candleSeriesRef.current.update(tickData);
          volumeSeriesRef.current.update(volData);
          
          const newLatest = { ...tickData, value: volume };
          lastCandleRef.current = newLatest;
          
          if (!isCrosshairActive.current) {
            setHoverData(newLatest);
          }
        } catch (err) {
          // Negeer oude ticks rustig
        }
      }
    };

    ws.onerror = (error) => {
      setIsLive(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    ws.onclose = () => {
      setIsLive(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  };

  const formatNum = (num) => num !== undefined && num !== null ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A';
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
            {marketInfo && (
              <span className={`text-xs font-mono font-medium mt-0.5 ${marketInfo.change_24h >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                {marketInfo.last}
              </span>
            )}
          </div>

          {marketInfo && (
            <>
              <div className="hidden md:flex flex-col border-l border-[#2b3139] pl-6">
                <span className="text-[#848e9c] text-[10px] uppercase">24h Change</span>
                <span className={`text-xs font-mono mt-0.5 ${marketInfo.change_24h >= 0 ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
                  {formatChange(marketInfo.change_24h)}
                </span>
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

        <div>
          <button 
            onClick={toggleLive}
            disabled={loading || errorMsg}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded transition-colors text-sm font-medium ${isLive ? 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/30 hover:bg-[#f6465d]/20' : 'bg-[#2ebd85]/10 text-[#2ebd85] border border-[#2ebd85]/30 hover:bg-[#2ebd85]/20 disabled:opacity-50'}`}
          >
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-[#f6465d] animate-pulse' : 'bg-[#2ebd85]'}`}></div>
            <span>{isLive ? 'Stop Live Feed' : 'Go Live'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative w-full h-full">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/90 z-20 text-[#fcd535] text-sm tracking-widest animate-pulse">LOADING ENGINE...</div>}
        {errorMsg && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/90 z-20 text-[#f6465d] font-bold tracking-widest px-6 text-center">{errorMsg}</div>}
        
        {hoverData && !loading && !errorMsg && (
          <div className="absolute top-3 left-3 z-10 bg-[#181a20]/80 backdrop-blur-sm border border-[#2b3139] p-2 rounded-sm text-xs font-mono pointer-events-none shadow-lg">
            <div className="flex space-x-3">
              <div className="flex space-x-1"><span className="text-[#848e9c]">O</span><span className={hoverData.open > hoverData.close ? 'text-[#f6465d]' : 'text-[#2ebd85]'}>{formatNum(hoverData.open)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">H</span><span className="text-[#eaecef]">{formatNum(hoverData.high)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">L</span><span className="text-[#eaecef]">{formatNum(hoverData.low)}</span></div>
              <div className="flex space-x-1"><span className="text-[#848e9c]">C</span><span className={hoverData.close >= hoverData.open ? 'text-[#2ebd85]' : 'text-[#f6465d]'}>{formatNum(hoverData.close)}</span></div>
              <div className="flex space-x-1 border-l border-[#2b3139] pl-3 ml-1"><span className="text-[#848e9c]">V</span><span className="text-[#fcd535]">{formatNum(hoverData.value)}</span></div>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="absolute inset-0 z-0" />
      </div>

    </div>
  );
}