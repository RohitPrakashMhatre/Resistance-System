import { useEffect, useMemo, useState } from "react";

function Sidebar({ symbols, onSubmit, onDeleteSymbol, onDeleteSelected }) {
  const [input, setInput] = useState("");
  const [selectedMap, setSelectedMap] = useState({});

  const handleClick = () => {
    if (input.trim() !== "") {
      onSubmit(input);
      setInput("");
    }
  };

  useEffect(() => {
    setSelectedMap((prev) => {
      const next = {};
      symbols.forEach((symbol) => {
        next[symbol] = Boolean(prev[symbol]);
      });
      return next;
    });
  }, [symbols]);

  const allSelected = useMemo(
    () => symbols.length > 0 && symbols.every((symbol) => selectedMap[symbol]),
    [symbols, selectedMap]
  );

  const selectedSymbols = useMemo(
    () => symbols.filter((symbol) => selectedMap[symbol]),
    [symbols, selectedMap]
  );

  const handleToggleAll = (checked) => {
    const next = {};
    symbols.forEach((symbol) => {
      next[symbol] = checked;
    });
    setSelectedMap(next);
  };

  return (
    <div className="sidebar">
      <h2>Symbols</h2>

      <input
        type="text"
        placeholder="RELIANCE, TCS, INFY"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <button className="sidebar-primary-btn" onClick={handleClick}>
        Create Tabs
      </button>

      <div className="sidebar-symbol-controls">
        <label className="sidebar-select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => handleToggleAll(e.target.checked)}
          />
          Select all
        </label>
        <button
          className="sidebar-danger-btn"
          onClick={() => onDeleteSelected(selectedSymbols)}
          disabled={selectedSymbols.length === 0}
        >
          Delete selected
        </button>
      </div>

      <div className="sidebar-symbol-list">
        {symbols.length === 0 ? (
          <div className="sidebar-empty">No symbols added</div>
        ) : (
          symbols.map((symbol) => (
            <div key={symbol} className="sidebar-symbol-row">
              <label className="sidebar-symbol-label">
                <input
                  type="checkbox"
                  checked={Boolean(selectedMap[symbol])}
                  onChange={(e) =>
                    setSelectedMap((prev) => ({ ...prev, [symbol]: e.target.checked }))
                  }
                />
                <span>{symbol}</span>
              </label>
              <button
                className="sidebar-danger-btn"
                onClick={() => onDeleteSymbol(symbol)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Sidebar;
