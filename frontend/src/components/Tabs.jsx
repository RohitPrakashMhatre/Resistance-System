function Tabs({ symbols, activeIndex, setActiveIndex }) {
  return (
    <div className="tabs">
      {symbols.map((symbol, index) => (
        <button
          type="button"
          key={symbol}
          className={`tab ${index === activeIndex ? "active" : ""}`}
          onClick={() => setActiveIndex(index)}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
