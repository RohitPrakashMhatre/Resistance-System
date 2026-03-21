import { useState } from "react";
import TradingChart from "./TradingChart";

export function TabContent({ symbol }) {
  const [windowSize, setWindowSize] = useState("");
  const [prices, setPrices] = useState([]);
  const [markers, setMarkers] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchChart = async () => {
    if (!windowSize) return;

    try {
      setLoading(true);

      const response = await fetch(
        `http://localhost:8000/generate/signals?symbol=${symbol}&window=${windowSize}`
      );

      const data = await response.json();

      setPrices(data.prices || []);
      setMarkers(data.markers || {});

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>{symbol} Chart</h2>

      <input
        type="number"
        placeholder="Window"
        value={windowSize}
        onChange={(e) => setWindowSize(e.target.value)}
      />

      <button onClick={fetchChart} disabled={loading}>
        {loading ? "Generating..." : "Generate"}
      </button>

      {prices.length > 0 && (
        <TradingChart prices={prices} markers={markers} />
      )}
    </div>
  );
}