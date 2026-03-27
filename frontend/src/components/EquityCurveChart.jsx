import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries } from "lightweight-charts";

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

/**
 * equityPoints: [{ date: "YYYY-MM-DD", equity: number }, ...]
 */
export default function EquityCurveChart({ equityPoints, theme = "light" }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const [supported, setSupported] = useState(true);

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
          height: 280,
          ...getChartOptions("light"),
        });

        if (typeof localChart.addLineSeries === "function") {
          localSeries = localChart.addLineSeries({
            color: "#2563eb",
            lineWidth: 2,
          });
        } else if (typeof localChart.addSeries === "function" && typeof LineSeries !== "undefined") {
          try {
            localSeries = localChart.addSeries(LineSeries, {
              color: "#2563eb",
              lineWidth: 2,
            });
          } catch (e) {
            console.warn("addSeries(LineSeries) failed", e);
          }
        }

        if (!localSeries) {
          if (mounted) setSupported(false);
          return;
        }

        if (!mounted) {
          if (localChart) localChart.remove();
          return;
        }

        chartRef.current = localChart;
        lineSeriesRef.current = localSeries;
        window.addEventListener("resize", handleResize);
      } catch (err) {
        console.warn("Equity chart init failed:", err);
        if (mounted) setSupported(false);
      }
    }

    init();

    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {}
        chartRef.current = null;
      }
      lineSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions(getChartOptions(theme));
    if (lineSeriesRef.current && typeof lineSeriesRef.current.applyOptions === "function") {
      lineSeriesRef.current.applyOptions({
        color: theme === "dark" ? "#60a5fa" : "#2563eb",
      });
    }
  }, [theme]);

  useEffect(() => {
    if (!supported) return;
    const series = lineSeriesRef.current;
    if (!series || !equityPoints?.length) return;

    const formatted = equityPoints
      .filter((p) => p?.date && p.equity != null)
      .map((p) => ({
        time: p.date,
        value: Number(p.equity),
      }));

    if (typeof series.setData === "function") {
      series.setData(formatted);
    }
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [equityPoints, supported]);

  if (!supported) {
    return (
      <div className="empty-state" style={{ padding: 16 }}>
        Equity chart could not be initialized.
      </div>
    );
  }

  return <div ref={chartContainerRef} style={{ width: "100%", minHeight: 280 }} />;
}
