import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

export default function TradingChart({ prices, markers, focusDate }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
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
          layout: { background: { color: "#ffffff" } },
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
    };
  }, []);

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

    // build list of dates to mark
    const dateList = [];
    (markers?.high_dates || []).forEach((date) => dateList.push({ date, type: "high" }));
    (markers?.low_dates || []).forEach((date) => dateList.push({ date, type: "low" }));

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
          
          // Use background-color instead of borderLeft for reliable rendering
          if (isFocused) {
            line.style.backgroundColor = "#0066ff";
            line.style.opacity = "1";
          } else {
            line.style.backgroundColor = type === "high" ? "#ff6b6b" : "#51cf66";
            line.style.opacity = "0.6";
          }
          
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
  }, [prices, markers, supported]);

  // redraw overlay when focusDate changes (to highlight the focused line)
  useEffect(() => {
    if (!overlayRef.current || !chartRef.current) return;
    
    const timeScale = chartRef.current.timeScale();
    const dateList = [];
    (markers?.high_dates || []).forEach((date) => dateList.push({ date, type: "high" }));
    (markers?.low_dates || []).forEach((date) => dateList.push({ date, type: "low" }));

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
        if (isFocused) {
          line.style.backgroundColor = "#0066ff";
          line.style.opacity = "1";
        } else {
          line.style.backgroundColor = type === "high" ? "#ff6b6b" : "#51cf66";
          line.style.opacity = "0.6";
        }
        
        line.title = `${type}: ${date}`;
        overlayRef.current.appendChild(line);
      } catch (e) {}
    });
  }, [focusDate, markers]);

  // focus on selected date when requested (center chart on that date)
  useEffect(() => {
    if (!supported) return;
    if (!focusDate || !formattedRef.current?.length || !chartRef.current) {
      return;
    }

    const idx = formattedRef.current.findIndex((p) => p.time === focusDate);
    
    let fromIndex, toIndex;
    
    if (idx !== -1) {
      // Date found in data - center around it
      fromIndex = Math.max(0, idx - 30);
      toIndex = Math.min(formattedRef.current.length - 1, idx + 30);
    } else {
      // Date not in current data range (future/past date)
      const firstDate = formattedRef.current[0].time;
      const lastDate = formattedRef.current[formattedRef.current.length - 1].time;
      
      if (focusDate < firstDate) {
        // Future date is before all data - show from beginning
        fromIndex = 0;
        toIndex = Math.min(59, formattedRef.current.length - 1);
      } else if (focusDate > lastDate) {
        // Future date is after all data - show from end
        toIndex = formattedRef.current.length - 1;
        fromIndex = Math.max(0, toIndex - 59);
      } else {
        // Date is within range but not found (shouldn't happen, but fallback)
        fromIndex = 0;
        toIndex = Math.min(59, formattedRef.current.length - 1);
      }
    }

    const from = formattedRef.current[fromIndex].time;
    const to = formattedRef.current[toIndex].time;

    try {
      const timeScale = chartRef.current.timeScale();
      
      // Subscribe to visible range changes to redraw overlay once chart has updated
      let unsubscribeVisibleRange = null;
      const redrawOnRangeChange = () => {
        if (!overlayRef.current || !chartRef.current) return;
        
        const timeScale = chartRef.current.timeScale();
        const dateList = [];
        (markers?.high_dates || []).forEach((date) => dateList.push({ date, type: "high" }));
        (markers?.low_dates || []).forEach((date) => dateList.push({ date, type: "low" }));

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
            if (isFocused) {
              line.style.backgroundColor = "#0066ff";
              line.style.opacity = "1";
            } else {
              line.style.backgroundColor = type === "high" ? "#ff6b6b" : "#51cf66";
              line.style.opacity = "0.6";
            }
            
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
      
      // Set the visible range (this will trigger the subscription)
      timeScale.setVisibleRange({ from, to });
    } catch (err) {
      try {
        const pos = (fromIndex + toIndex) / 2;
        chartRef.current.timeScale().scrollToPosition(pos, true);
      } catch (e) {}
    }
  }, [focusDate, supported, markers]);

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

  return <div ref={chartContainerRef} style={{ width: "100%" }} />;
}
