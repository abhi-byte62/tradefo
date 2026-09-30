import React, { useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { RefreshCw } from 'lucide-react';
import { Candle } from '../types';

export const ChartPanel: React.FC = () => {
  const {
    selectedSymbol,
    instruments,
    ticks,
    candles,
    timeframe,
    setTimeframe,
    fetchCandles
  } = useTerminalStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [hoverData, setHoverData] = useState<{ candle: Candle; mouseX: number; mouseY: number } | null>(null);
  const [, setDimensions] = useState({ width: 0, height: 0 });

  const inst = instruments.find(i => i.symbol === selectedSymbol);
  const currentTick = ticks[selectedSymbol];

  // Auto-resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Draw Candlestick Canvas Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#0E131D';
    ctx.fillRect(0, 0, width, height);

    // Layout margins
    const priceAxisWidth = 65;
    const timeAxisHeight = 24;
    const chartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight;

    const volumeHeight = chartHeight * 0.22;
    const priceChartHeight = chartHeight - volumeHeight - 10;

    // Calculate Price Range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    for (const c of candles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    }

    // Add 2% padding
    const pricePadding = (maxPrice - minPrice) * 0.05 || 1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    // Helper functions for coordinates
    const getX = (index: number) => {
      const candleWidth = chartWidth / candles.length;
      return index * candleWidth + candleWidth / 2;
    };

    const getY = (price: number) => {
      return priceChartHeight - ((price - minPrice) / priceRange) * priceChartHeight + 10;
    };

    const getVolumeY = (vol: number) => {
      const normVol = (vol / (maxVolume || 1)) * volumeHeight;
      return chartHeight - normVol;
    };

    // Draw Grid Lines
    ctx.strokeStyle = '#1B2433';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Horizontal Price grid lines
    const gridSteps = 6;
    ctx.fillStyle = '#7E8DA4';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i <= gridSteps; i++) {
      const price = minPrice + (priceRange / gridSteps) * i;
      const y = getY(price);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price label on right axis
      ctx.fillText(price.toFixed(2), chartWidth + 6, y + 3);
    }

    // Vertical Time grid lines
    const timeSteps = Math.min(8, candles.length);
    for (let i = 0; i < timeSteps; i++) {
      const idx = Math.floor((candles.length / timeSteps) * i);
      const x = getX(idx);
      const c = candles[idx];

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      // Time label on bottom axis
      const date = new Date(c.time * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(timeStr, x - 15, height - 6);
    }

    ctx.setLineDash([]); // Reset dash

    // Draw Volume Bars
    const candleWidth = Math.max(2, (chartWidth / candles.length) * 0.7);

    candles.forEach((c, i) => {
      const x = getX(i);
      const isGreen = c.close >= c.open;
      const volY = getVolumeY(c.volume);

      ctx.fillStyle = isGreen ? 'rgba(0, 208, 132, 0.25)' : 'rgba(255, 77, 109, 0.25)';
      ctx.fillRect(x - candleWidth / 2, volY, candleWidth, chartHeight - volY);
    });

    // Draw Candlesticks (Wick & Body)
    candles.forEach((c, i) => {
      const x = getX(i);
      const isGreen = c.close >= c.open;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      const color = isGreen ? '#00D084' : '#FF4D6D';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.2;

      // Wick (High to Low)
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Candle Body (Open to Close)
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Draw SMA 20 (Simple Moving Average)
    if (showSMA && candles.length >= 20) {
      ctx.strokeStyle = '#3B82F6'; // Blue
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let started = false;
      for (let i = 19; i < candles.length; i++) {
        let sum = 0;
        for (let j = 0; j < 20; j++) sum += candles[i - j].close;
        const sma = sum / 20;
        const x = getX(i);
        const y = getY(sma);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw EMA 50 (Exponential Moving Average)
    if (showEMA && candles.length >= 30) {
      ctx.strokeStyle = '#F59E0B'; // Amber
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const k = 2 / (50 + 1);
      let ema = candles[0].close;
      let started = false;

      for (let i = 0; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        if (i >= 20) {
          const x = getX(i);
          const y = getY(ema);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }

    // Draw Live LTP Price Line
    if (currentTick) {
      const ltpY = getY(currentTick.ltp);
      ctx.strokeStyle = currentTick.change >= 0 ? '#00D084' : '#FF4D6D';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);

      ctx.beginPath();
      ctx.moveTo(0, ltpY);
      ctx.lineTo(chartWidth, ltpY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Tag on right axis
      ctx.fillStyle = currentTick.change >= 0 ? '#00D084' : '#FF4D6D';
      ctx.fillRect(chartWidth + 1, ltpY - 8, priceAxisWidth - 2, 16);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(currentTick.ltp.toFixed(2), chartWidth + 5, ltpY + 3);
    }

    // Draw Crosshair & Tooltip if mouse is hovering
    if (hoverData) {
      ctx.strokeStyle = '#5C6C84';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoverData.mouseX, 0);
      ctx.lineTo(hoverData.mouseX, chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hoverData.mouseY);
      ctx.lineTo(chartWidth, hoverData.mouseY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, currentTick, showSMA, showEMA, hoverData]);

  // Handle Mouse Move for Crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const priceAxisWidth = 65;
    const chartWidth = rect.width - priceAxisWidth;

    if (mouseX < 0 || mouseX > chartWidth) {
      setHoverData(null);
      return;
    }

    const candleWidth = chartWidth / candles.length;
    const index = Math.min(candles.length - 1, Math.max(0, Math.floor(mouseX / candleWidth)));
    const candle = candles[index];

    setHoverData({ candle, mouseX, mouseY });
  };

  const activeCandle = hoverData ? hoverData.candle : (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div ref={containerRef} className="flex-1 bg-[#0E131D] flex flex-col h-full overflow-hidden select-none">
      {/* Chart Top Bar */}
      <div className="h-10 bg-terminal-panel border-b border-terminal-border px-3 flex items-center justify-between text-xs shrink-0">
        {/* Left: Symbol details & OHLC HUD */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white text-sm tracking-wide">{selectedSymbol}</span>
            <span className="text-2xs bg-terminal-surface text-blue-400 font-mono px-1.5 py-0.2 rounded border border-terminal-border">
              {inst?.exchange || 'NSE'}
            </span>
          </div>

          {activeCandle && (
            <div className="hidden sm:flex items-center space-x-2.5 font-mono text-2xs text-terminal-muted tabular-nums">
              <span>O: <strong className="text-white">{activeCandle.open.toFixed(2)}</strong></span>
              <span>H: <strong className="text-trade-buy">{activeCandle.high.toFixed(2)}</strong></span>
              <span>L: <strong className="text-trade-sell">{activeCandle.low.toFixed(2)}</strong></span>
              <span>C: <strong className="text-white">{activeCandle.close.toFixed(2)}</strong></span>
              <span>Vol: <strong className="text-terminal-text">{activeCandle.volume.toLocaleString()}</strong></span>
            </div>
          )}
        </div>

        {/* Right: Timeframe Switcher & Indicators */}
        <div className="flex items-center space-x-2">
          {/* Timeframe Buttons */}
          <div className="flex items-center bg-terminal-surface border border-terminal-border rounded p-0.5 font-mono text-2xs">
            {['1m', '5m', '15m', '1h', '1D'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-terminal-muted hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Indicators Toggle */}
          <div className="flex items-center space-x-1.5 font-mono text-2xs">
            <button
              onClick={() => setShowSMA(!showSMA)}
              className={`px-2 py-1 rounded border transition-colors ${
                showSMA ? 'bg-blue-900/40 text-blue-300 border-blue-600' : 'bg-terminal-surface text-terminal-subtle border-terminal-border'
              }`}
            >
              SMA 20
            </button>
            <button
              onClick={() => setShowEMA(!showEMA)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEMA ? 'bg-amber-900/40 text-amber-300 border-amber-600' : 'bg-terminal-surface text-terminal-subtle border-terminal-border'
              }`}
            >
              EMA 50
            </button>
          </div>

          <button
            onClick={() => fetchCandles()}
            title="Refresh chart data"
            className="p-1 text-terminal-muted hover:text-white hover:bg-terminal-surface rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="flex-1 relative w-full h-full">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverData(null)}
          className="w-full h-full cursor-crosshair block"
        />
      </div>
    </div>
  );
};
