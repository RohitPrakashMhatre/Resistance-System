import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers } from "lightweight-charts";

/** Native chart markers: green up arrow (buy), red down arrow (sell) */
function buildTradeSeriesMarkers(markers) {
  const buyColor = "#22c55e";
  const sellColor = "#ef4444";
  const out = [];
  (markers?.buy_dates || []).forEach((time) => {
    out.push({
      time,
      position: "belowBar",
      color: buyColor,
      shape: "arrowUp",
      size: 1.35,
    });
  });
  (markers?.sell_dates || []).forEach((time) => {
    out.push({
      time,
      position: "aboveBar",
      color: sellColor,
      shape: "arrowDown",
      size: 1.35,
    });
  });
  return out.sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** @param {"signals" | "trades"} markerVariant */
function buildMarkerDateList(markerVariant, markers) {
  const dateList = [];
  if (markerVariant === "trades") {
    (markers?.buy_dates || []).forEach((date) => dateList.push({ date, type: "buy" }));
    (markers?.sell_dates || []).forEach((date) => dateList.push({ date, type: "sell" }));
  } else {
    (markers?.high_dates || []).forEach((date) => dateList.push({ date, type: "high" }));
    (markers?.low_dates || []).forEach((date) => dateList.push({ date, type: "low" }));
  }
  return dateList;
}

function lineColorForMarker(type, markerVariant, isFocused) {
  if (isFocused) return "#0066ff";
  if (markerVariant === "trades") {
    return type === "buy" ? "#22c55e" : "#f97316";
  }
  return type === "high" ? "#ff6b6b" : "#51cf66";
}

function getChartOptions(theme) {
  if (theme === "dark") {
    return {
      layout: {
        background: { color: "#111827" },
        textColor: "#e5e7eb",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
      },
    };
  }

  return {
    layout: {
      background: { color: "#ffffff" },
      textColor: "#111827",
    },
    grid: {
      vertLines: { color: "#e2e8f0" },
      horzLines: { color: "#e2e8f0" },
    },
    rightPriceScale: {
      borderColor: "#cbd5e1",
    },
    timeScale: {
      borderColor: "#cbd5e1",
    },
  };
}

export default function TradingChart({
  prices,
  markers,
  focusDate,
  theme = "light",
  markerVariant = "signals",
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const seriesMarkersPluginRef = useRef(null);
  const formattedRef = useRef([]);
  const overlayRef = useRef(null);
  const [supported, setSupported] = useState(true);

  // create chart once (async inner init)
  useEffect(() => {
    if (!chartContainerRef.current) return;
    let mounted = true;
    const handleResize = () => {
      if (!chartContainerRef.current) return;
      if (chartRef.current) chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
    };

    async function init() {
      let localChart = null;
      let localSeries = null;

      try {
        localChart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 500,
          ...getChartOptions("light"),
        });

        // prefer addCandlestickSeries, otherwise try addSeries(CandlestickSeries), otherwise line series
        if (typeof localChart.addCandlestickSeries === "function") {
          localSeries = localChart.addCandlestickSeries();
        } else if (typeof localChart.addSeries === "function" && typeof CandlestickSeries !== "undefined") {
          try {
            localSeries = localChart.addSeries(CandlestickSeries);
          } catch (e) {
            console.warn("addSeries(CandlestickSeries) failed, falling back to line series", e);
          }
        }

        if (!localSeries && typeof localChart.addLineSeries === "function") {
          console.warn("Falling back to line series for candlesticks");
          localSeries = localChart.addLineSeries();
        }

        if (!localSeries) {
          console.warn("No series methods available on chart (after fallbacks). Chart object:", localChart);
          if (mounted) setSupported(false);
          return;
        }

        if (!mounted) {
          if (localChart) localChart.remove();
          return;
        }

        chartRef.current = localChart;
        candleSeriesRef.current = localSeries;

        try {
          if (typeof createSeriesMarkers === "function") {
            seriesMarkersPluginRef.current = createSeriesMarkers(localSeries, []);
          }
        } catch (e) {
          console.warn("createSeriesMarkers failed", e);
        }

        window.addEventListener("resize", handleResize);
      } catch (err) {
        console.warn("Chart initialization failed:", err);
        if (mounted) setSupported(false);
      }
    }

    init();

    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
      if (overlayRef.current && chartContainerRef.current) {
        try {
          chartContainerRef.current.removeChild(overlayRef.current);
        } catch (e) {}
        overlayRef.current = null;
      }
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {}
        chartRef.current = null;
      }
      candleSeriesRef.current = null;
      seriesMarkersPluginRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions(getChartOptions(theme));
  }, [theme]);

  // update data when prices change
  useEffect(() => {
    if (!supported) return;
    const series = candleSeriesRef.current;
    if (!series || !prices?.length) return;

    const formattedData = prices.map((item) => ({
      time: item.date,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
    }));

    formattedRef.current = formattedData;

    if (typeof series.setData === "function") {
      series.setData(formattedData);
    }

    // Trade mode: arrow markers via lightweight-charts plugin (no vertical lines)
    if (markerVariant === "trades") {
      try {
        if (seriesMarkersPluginRef.current?.setMarkers) {
          seriesMarkersPluginRef.current.setMarkers(buildTradeSeriesMarkers(markers));
        }
      } catch (e) {
        console.warn("setMarkers failed", e);
      }
      if (overlayRef.current) {
        overlayRef.current.innerHTML = "";
      }
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
      return;
    }

    // Signals mode: clear native series markers
    try {
      if (seriesMarkersPluginRef.current?.setMarkers) {
        seriesMarkersPluginRef.current.setMarkers([]);
      }
    } catch (e) {}

    // create DOM overlay for vertical line markers (since line series don't support markers API)
    if (!overlayRef.current) {
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "1000";
      overlay.style.overflow = "hidden";
      chartContainerRef.current.style.position = "relative";
      chartContainerRef.current.appendChild(overlay);
      overlayRef.current = overlay;
    }

    const dateList = buildMarkerDateList(markerVariant, markers);

    // function to update overlay lines based on visible range and focusDate
    const redrawOverlay = () => {
      if (!overlayRef.current || !chartRef.current) return;
      overlayRef.current.innerHTML = "";
      const timeScale = chartRef.current.timeScale();

      // Build a map of date -> logical index for coordinate conversion
      const dateToIndexMap = {};
      if (formattedData) {
        formattedData.forEach((item, idx) => {
          dateToIndexMap[item.time] = idx;
        });
      }

      dateList.forEach(({ date, type }) => {
        try {
          const logicalIndex = dateToIndexMap[date];
          if (logicalIndex === undefined) {
            return;
          }
          
          const coord = timeScale.logicalToCoordinate(logicalIndex);
          if (coord === null || isNaN(coord)) return;
          
          const line = document.createElement("div");
          line.style.position = "absolute";
          line.style.left = coord + "px";
          line.style.top = "0";
          line.style.width = "2px";
          line.style.height = "100%";
          
          const isFocused = focusDate === date;
          line.style.backgroundColor = lineColorForMarker(type, markerVariant, isFocused);
          line.style.opacity = isFocused ? "1" : "0.65";
          
          line.title = `${type}: ${date}`;
          overlayRef.current.appendChild(line);
        } catch (e) {}
      });
    };

    redrawOverlay();

    // subscribe to visible range changes to reposition lines
    let unsubscribe = null;
    if (chartRef.current) {
      try {
        unsubscribe = chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(redrawOverlay);
      } catch (e) {}
    }

    // fit only on initial load
    if (chartRef.current) chartRef.current.timeScale().fitContent();

    return () => {
      if (unsubscribe) {
        try { unsubscribe(); } catch (e) {}
      }
    };
  }, [prices, markers, supported, markerVariant]);

  // redraw overlay when focusDate changes (to highlight the focused line)
  useEffect(() => {
    if (markerVariant === "trades") return;
    if (!overlayRef.current || !chartRef.current) return;
    
    const timeScale = chartRef.current.timeScale();
    const dateList = buildMarkerDateList(markerVariant, markers);

    overlayRef.current.innerHTML = "";
    
    // Build a map of date -> logical index for coordinate conversion
    const dateToIndexMap = {};
    if (formattedRef.current) {
      formattedRef.current.forEach((item, idx) => {
        dateToIndexMap[item.time] = idx;
      });
    }
    
    dateList.forEach(({ date, type }) => {
      try {
        const logicalIndex = dateToIndexMap[date];
        if (logicalIndex === undefined) {
          // Date not in current data range
          return;
        }
        
        const coord = timeScale.logicalToCoordinate(logicalIndex);
        if (coord === null || isNaN(coord)) return;
        
        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.left = coord + "px";
        line.style.top = "0";
        line.style.width = "2px";
        line.style.height = "100%";
        
        const isFocused = focusDate === date;
        line.style.backgroundColor = lineColorForMarker(type, markerVariant, isFocused);
        line.style.opacity = isFocused ? "1" : "0.65";
        
        line.title = `${type}: ${date}`;
        overlayRef.current.appendChild(line);
      } catch (e) {}
    });
  }, [focusDate, markers, markerVariant]);

  // focus on selected date when requested (center chart on that date)
  useEffect(() => {
    if (!supported) return;
    if (markerVariant === "trades") return;
    if (!focusDate || !formattedRef.current?.length || !chartRef.current) {
      return;
    }

    const idx = formattedRef.current.findIndex((p) => p.time === focusDate);
    const firstDate = formattedRef.current[0].time;
    const lastDate = formattedRef.current[formattedRef.current.length - 1].time;
    const lastIndex = formattedRef.current.length - 1;
    
    try {
      const timeScale = chartRef.current.timeScale();
      
      // Subscribe to visible range changes to redraw overlay once chart has updated
      let unsubscribeVisibleRange = null;
      const redrawOnRangeChange = () => {
        if (!overlayRef.current || !chartRef.current) return;
        
        const timeScale = chartRef.current.timeScale();
        const dateList = buildMarkerDateList(markerVariant, markers);

        // Build a map of date -> logical index for coordinate conversion
        const dateToIndexMap = {};
        if (formattedRef.current) {
          formattedRef.current.forEach((item, idx) => {
            dateToIndexMap[item.time] = idx;
          });
        }

        overlayRef.current.innerHTML = "";
        dateList.forEach(({ date, type }) => {
          try {
            let coord = null;
            const logicalIndex = dateToIndexMap[date];
            
            if (logicalIndex !== undefined) {
              // Date exists in data
              coord = timeScale.logicalToCoordinate(logicalIndex);
            } else {
              // Date doesn't exist - estimate position using linear interpolation
              const lastDataDate = formattedRef.current[lastIndex].time;
              
              if (date > lastDataDate) {
                // Future date: estimate based on date difference
                const refIndex = lastIndex;
                const refCoord = timeScale.logicalToCoordinate(refIndex);
                
                if (refCoord !== null && !isNaN(refCoord)) {
                  // Parse dates as numbers (timestamps)
                  const dateParts = date.split('-').map(Number);
                  const refDateParts = lastDataDate.split('-').map(Number);
                  const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                  const refDate = new Date(refDateParts[0], refDateParts[1] - 1, refDateParts[2]);
                  
                  // Calculate days difference
                  const daysDiff = (targetDate - refDate) / (1000 * 60 * 60 * 24);
                  // Assume ~1 day per ~2 pixels (adjust based on your data frequency)
                  const pixelsPerDay = 2;
                  coord = refCoord + (daysDiff * pixelsPerDay);
                }
              }
            }
            
            if (coord === null || isNaN(coord)) return;
            
            const line = document.createElement("div");
            line.style.position = "absolute";
            line.style.left = coord + "px";
            line.style.top = "0";
            line.style.width = "2px";
            line.style.height = "100%";
            
            const isFocused = focusDate === date;
            line.style.backgroundColor = lineColorForMarker(type, markerVariant, isFocused);
            line.style.opacity = isFocused ? "1" : "0.65";
            
            line.title = `${type}: ${date}`;
            overlayRef.current.appendChild(line);
          } catch (e) {}
        });
        
        // Unsubscribe after first redraw
        if (unsubscribeVisibleRange) {
          try { unsubscribeVisibleRange(); } catch (e) {}
          unsubscribeVisibleRange = null;
        }
      };
      
      // Subscribe to visible range changes
      try {
        unsubscribeVisibleRange = timeScale.subscribeVisibleLogicalRangeChange(redrawOnRangeChange);
      } catch (e) {}
      
      // Handle different date scenarios
      if (idx !== -1) {
        // Date found in data - use setVisibleRange
        const fromIndex = Math.max(0, idx - 30);
        const toIndex = Math.min(lastIndex, idx + 30);
        const from = formattedRef.current[fromIndex].time;
        const to = formattedRef.current[toIndex].time;
        timeScale.setVisibleRange({ from, to });
      } else if (focusDate > lastDate) {
        // Future date - estimate logical index and scroll to it
        const dateParts = focusDate.split('-').map(Number);
        const lastDateParts = lastDate.split('-').map(Number);
        const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const lastDataDate = new Date(lastDateParts[0], lastDateParts[1] - 1, lastDateParts[2]);
        
        // Calculate estimated logical index
        const daysDiff = (targetDate - lastDataDate) / (1000 * 60 * 60 * 24);
        const estimatedIndex = lastIndex + daysDiff;
        
        // Scroll to estimated position (center on future date)
        const fromIndex = Math.max(0, estimatedIndex - 30);
        timeScale.scrollToPosition(fromIndex, true);
      } else if (focusDate < firstDate) {
        // Past date - show from beginning
        const toIndex = Math.min(59, lastIndex);
        const from = firstDate;
        const to = formattedRef.current[toIndex].time;
        timeScale.setVisibleRange({ from, to });
      }
    } catch (err) {
      // Fallback
    }
  }, [focusDate, supported, markers, markerVariant]);

  if (!supported) {
    return (
      <div style={{ width: "100%", padding: 16, background: "#fff", border: "1px solid #eee" }}>
        <div style={{ color: "#b91c1c", fontWeight: 600, marginBottom: 8 }}>Charting not available</div>
        <div style={{ color: "#333" }}>
          The chart library in this environment does not expose the required series APIs. Please ensure
          the `lightweight-charts` package is installed and the correct build is imported. If you used
          a CDN or custom bundle, try installing the NPM ESM package or check the console for details.
        </div>
      </div>
    );
  }

  return <div ref={chartContainerRef} style={{ width: "100%", minHeight: 500 }} />;
}
