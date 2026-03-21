import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Tabs from "./components/Tabs";
import { TabContent } from "./components/TabContent";

const createEmptyTabState = () => ({
  prices: [],
  markers: { high_dates: [], low_dates: [] },
  loading: false,
  focusDate: null,
  backtestConfigs: [
    {
      id: "scenario-1",
      minWindow: 0,
      maxWindow: 0,
      holdDays: 30,
      transactionCostPct: 0.2,
      stopLossPct: 0,
      topN: 20,
      loading: false,
      topWindows: [],
      isStale: false,
      staleMessage: null,
    },
  ],
  dataRange: null,
});

function App() {
  const [symbols, setSymbols] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [windowMap, setWindowMap] = useState({});
  const [tabDataMap, setTabDataMap] = useState({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("app-theme") || "light");

  const handleAddSymbols = (input) => {
    const list = input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s !== "");

    if (list.length === 0) return;

    setSymbols((prevSymbols) => {
      const nextSymbols = [...prevSymbols];
      let firstNewSymbol = null;

      list.forEach((symbol) => {
        if (!nextSymbols.includes(symbol)) {
          nextSymbols.push(symbol);
          if (!firstNewSymbol) firstNewSymbol = symbol;
        }
      });

      setWindowMap((prev) => {
        const next = { ...prev };
        list.forEach((symbol) => {
          if (!(symbol in next)) next[symbol] = "";
        });
        return next;
      });

      setTabDataMap((prev) => {
        const next = { ...prev };
        list.forEach((symbol) => {
          if (!next[symbol]) next[symbol] = createEmptyTabState();
        });
        return next;
      });

      if (nextSymbols.length > 0) {
        if (activeIndex === null) {
          setActiveIndex(0);
        } else if (firstNewSymbol) {
          setActiveIndex(nextSymbols.indexOf(firstNewSymbol));
        }
      }

      return nextSymbols;
    });
  };

  const removeSymbols = (symbolsToRemove) => {
    if (!symbolsToRemove || symbolsToRemove.size === 0) return;

    setSymbols((prevSymbols) => {
      const nextSymbols = prevSymbols.filter((s) => !symbolsToRemove.has(s));
      const prevActiveSymbol =
        activeIndex !== null ? prevSymbols[activeIndex] : null;

      setWindowMap((prevWindowMap) => {
        const next = {};
        nextSymbols.forEach((s) => {
          next[s] = prevWindowMap[s] ?? "";
        });
        return next;
      });

      setTabDataMap((prevTabDataMap) => {
        const next = {};
        nextSymbols.forEach((s) => {
          next[s] = prevTabDataMap[s] || createEmptyTabState();
        });
        return next;
      });

      if (nextSymbols.length === 0) {
        setActiveIndex(null);
      } else if (prevActiveSymbol && nextSymbols.includes(prevActiveSymbol)) {
        setActiveIndex(nextSymbols.indexOf(prevActiveSymbol));
      } else {
        setActiveIndex(0);
      }

      return nextSymbols;
    });
  };

  const handleDeleteSymbol = (symbol) => {
    removeSymbols(new Set([symbol]));
  };

  const handleDeleteSelected = (selectedSymbols) => {
    removeSymbols(new Set(selectedSymbols));
  };

  useEffect(() => {
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  useEffect(() => {
    const hydrateState = async () => {
      try {
        const response = await fetch("http://localhost:8000/ui/state");
        const data = await response.json();
        const savedSymbols = (data?.symbols || [])
          .map((item) => (item.symbol || "").trim().toUpperCase())
          .filter(Boolean);

        const nextWindowMap = {};
        savedSymbols.forEach((symbol) => {
          const found = data.symbols.find(
            (item) => (item.symbol || "").trim().toUpperCase() === symbol
          );
          nextWindowMap[symbol] = found?.window_size ?? "";
        });

        const nextTabDataMap = {};
        savedSymbols.forEach((symbol) => {
          nextTabDataMap[symbol] = createEmptyTabState();
        });

        setSymbols(savedSymbols);
        setWindowMap(nextWindowMap);
        setTabDataMap(nextTabDataMap);
        setActiveIndex(savedSymbols.length > 0 ? 0 : null);
      } catch (error) {
        console.error("Failed to load UI state", error);
      } finally {
        setIsHydrated(true);
      }
    };

    hydrateState();
  }, []);

  const persistedState = useMemo(
    () => symbols.map((symbol) => ({ symbol, window_size: windowMap[symbol] ?? "" })),
    [symbols, windowMap]
  );

  useEffect(() => {
    if (!isHydrated) return;

    const saveState = async () => {
      try {
        await fetch("http://localhost:8000/ui/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: persistedState }),
        });
      } catch (error) {
        console.error("Failed to save UI state", error);
      }
    };

    saveState();
  }, [isHydrated, persistedState]);

  const activeSymbol = activeIndex !== null ? symbols[activeIndex] : null;
  const activeTabData = activeSymbol
    ? tabDataMap[activeSymbol] || createEmptyTabState()
    : createEmptyTabState();

  return (
    <div className={`app-container ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <Sidebar
        symbols={symbols}
        onSubmit={handleAddSymbols}
        onDeleteSymbol={handleDeleteSymbol}
        onDeleteSelected={handleDeleteSelected}
      />

      <div className="main-content">
        <div className="top-navbar">
          <div className="brand-block">
            <div className="brand-dot" />
            <div>
              <h1 className="brand-title">Resistance Signal Dashboard</h1>
              <p className="brand-subtitle">Professional signal analysis workspace</p>
            </div>
          </div>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
        <Tabs
          symbols={symbols}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />

        {activeSymbol && (
          <TabContent
            symbol={activeSymbol}
            theme={theme}
            windowSize={windowMap[activeSymbol]}
            setWindowSize={(val) =>
              setWindowMap((prev) => ({ ...prev, [activeSymbol]: val }))
            }
            tabData={activeTabData}
            setTabData={(updater) =>
              setTabDataMap((prev) => {
                const current = prev[activeSymbol] || createEmptyTabState();
                const nextTabData =
                  typeof updater === "function" ? updater(current) : updater;
                return { ...prev, [activeSymbol]: nextTabData };
              })
            }
          />
        )}
      </div>
    </div>
  );
}

export default App;
