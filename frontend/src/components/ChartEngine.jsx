import { useEffect, useState, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { apiClient } from '../api/client';

export default function ChartEngine({ dataset }) {
  const chartContainerRef = useRef();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let chart;
    let candlestickSeries;

    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        
        const response = await apiClient.get(`/api/data/candles/${dataset.symbol.replace('/', '-')}`, {
          headers: { 'x-timeframe': dataset.timeframe }
        });

        const rawData = response.data;
        
        if (!rawData || rawData.length === 0) {
           setErrorMsg("Geen data gevonden in database.");
           setLoading(false);
           return;
        }

        const uniqueData = [];
        const seenTimes = new Set();
        rawData.forEach(item => {
            if (!seenTimes.has(item.time)) {
                seenTimes.add(item.time);
                uniqueData.push(item);
            }
        });
        uniqueData.sort((a, b) => a.time - b.time);

        chart = createChart(chartContainerRef.current, {
          layout: { background: { type: 'solid', color: '#0b0e11' }, textColor: '#848e9c' },
          grid: { vertLines: { color: '#1f2329' }, horzLines: { color: '#1f2329' } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: '#2b3139' },
          timeScale: { borderColor: '#2b3139', timeVisible: true, secondsVisible: false },
          autoSize: true, 
        });

        candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#2ebd85', downColor: '#f6465d', borderVisible: false,
          wickUpColor: '#2ebd85', wickDownColor: '#f6465d'
        });

        candlestickSeries.setData(uniqueData);
        chart.timeScale().fitContent(); 

      } catch (error) {
        console.error("Failed to load chart data:", error);
        setErrorMsg(`API Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    return () => { if (chart) chart.remove(); };
  }, [dataset]);

  return (
    <>
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/90 z-20 text-[#fcd535] text-sm tracking-widest animate-pulse">LOADING ENGINE...</div>}
      {errorMsg && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11] z-20 text-[#f6465d] font-bold">{errorMsg}</div>}
      <div ref={chartContainerRef} className="absolute inset-0" />
    </>
  );
}