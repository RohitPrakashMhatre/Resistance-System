import { useEffect, useState } from "react";

function ChartView({ symbol, window }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [symbol, window]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:8000/generate/signal?symbol=${symbol}&window=${window}`
      );

      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching data:", error);
    }

    setLoading(false);
  };

  if (loading) return <div className="chart-area">Loading...</div>;
  if (!data) return <div className="chart-area">No Data</div>;

  return (
    <div className="chart-area">
      <h3>
        {symbol} - {window}
      </h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default ChartView;
