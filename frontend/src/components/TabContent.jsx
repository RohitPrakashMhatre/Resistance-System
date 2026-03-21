import { useEffect } from "react";
import TradingChart from "./TradingChart";

export function TabContent({ symbol, theme, windowSize, setWindowSize, tabData, setTabData }) {
	const prices = tabData?.prices || [];
	const markers = tabData?.markers || { high_dates: [], low_dates: [] };
	const loading = tabData?.loading || false;
	const focusDate = tabData?.focusDate || null;
	const backtestConfigs = tabData?.backtestConfigs || [];
	const dataRange = tabData?.dataRange || null;

	const defaultScenario = () => ({
		id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
	});

	const fetchChart = async () => {
		const windowParam = Number(windowSize);
		if (!windowSize || Number.isNaN(windowParam) || windowParam <= 0) return;

		try {
			setTabData((prev) => ({ ...prev, loading: true }));

			const response = await fetch(
				`http://localhost:8000/generate/signals?symbol=${symbol}&window=${windowParam}`
			);

			const data = await response.json();

			setTabData((prev) => ({
				...prev,
				prices: data.prices || [],
				markers: data.markers || { high_dates: [], low_dates: [] },
				dataRange: data.data_range || null,
			}));

		} catch (err) {
			console.error(err);
		} finally {
			setTabData((prev) => ({ ...prev, loading: false }));
		}
	};

	const highDates = markers && markers.high_dates ? markers.high_dates : [];
	const lowDates = markers && markers.low_dates ? markers.low_dates : [];

	const updateScenario = (scenarioId, updater) => {
		setTabData((prev) => ({
			...prev,
			backtestConfigs: (prev.backtestConfigs || []).map((cfg) =>
				cfg.id === scenarioId ? updater(cfg) : cfg
			),
		}));
	};

	const runBacktest = async (scenario) => {
		const holdDaysParam = Number(scenario.holdDays);
		const transactionCostParam = Number(scenario.transactionCostPct);
		const stopLossParam = Number(scenario.stopLossPct);
		const minWindowParam = Number(scenario.minWindow);
		const maxWindowParam = Number(scenario.maxWindow);
		const topNParam = Number(scenario.topN);
		if (Number.isNaN(holdDaysParam) || holdDaysParam <= 0) return;
		if (Number.isNaN(transactionCostParam) || transactionCostParam < 0) return;
		if (Number.isNaN(stopLossParam) || stopLossParam < 0) return;
		if (Number.isNaN(minWindowParam) || minWindowParam < 2) return;
		if (Number.isNaN(maxWindowParam) || maxWindowParam < minWindowParam) return;
		if (Number.isNaN(topNParam) || topNParam <= 0) return;

		try {
			updateScenario(scenario.id, (cfg) => ({ ...cfg, loading: true }));

			const response = await fetch("http://localhost:8000/generate/backtest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					symbol,
					hold_days: holdDaysParam,
					min_window: minWindowParam,
					max_window: maxWindowParam,
					transaction_cost_pct: transactionCostParam,
					stop_loss_pct: stopLossParam,
					top_n: topNParam,
				}),
			});
			const data = await response.json();
			updateScenario(scenario.id, (cfg) => ({
				...cfg,
				topWindows: data?.top_windows || [],
				isStale: false,
				staleMessage: null,
			}));
		} catch (err) {
			console.error(err);
		} finally {
			updateScenario(scenario.id, (cfg) => ({ ...cfg, loading: false }));
		}
	};

	useEffect(() => {
		const loadSavedScenarios = async () => {
			try {
				const response = await fetch(
					`http://localhost:8000/generate/backtest/scenarios?symbol=${encodeURIComponent(symbol)}&limit=20`
				);
				const data = await response.json();
				const saved = data?.scenarios || [];
				if (!saved.length) {
					setTabData((prev) => ({ ...prev, backtestConfigs: [defaultScenario()] }));
					return;
				}

				const mapped = saved.map((item, idx) => ({
					id: `scenario-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
					minWindow: item.min_window ?? 0,
					maxWindow: item.max_window ?? 0,
					holdDays: item.hold_days ?? 30,
					transactionCostPct: item.transaction_cost_pct ?? 0.2,
					stopLossPct: item.stop_loss_pct ?? 0,
					topN: item.top_n ?? 20,
					loading: false,
					topWindows: item.top_windows || [],
					isStale: Boolean(item.is_stale),
					staleMessage: item.stale_message || null,
				}));

				setTabData((prev) => ({ ...prev, backtestConfigs: mapped }));
			} catch (err) {
				console.error(err);
				if (!backtestConfigs.length) {
					setTabData((prev) => ({ ...prev, backtestConfigs: [defaultScenario()] }));
				}
			}
		};

		loadSavedScenarios();
	}, [symbol]);

	const loadLatestBacktest = async (scenario) => {
		const holdDaysParam = Number(scenario.holdDays);
		const transactionCostParam = Number(scenario.transactionCostPct);
		const stopLossParam = Number(scenario.stopLossPct);
		const minWindowParam = Number(scenario.minWindow);
		const maxWindowParam = Number(scenario.maxWindow);
		const topNParam = Number(scenario.topN);
		if (Number.isNaN(holdDaysParam) || holdDaysParam <= 0) return;
		if (Number.isNaN(transactionCostParam) || transactionCostParam < 0) return;
		if (Number.isNaN(stopLossParam) || stopLossParam < 0) return;
		if (Number.isNaN(minWindowParam) || minWindowParam < 2) return;
		if (Number.isNaN(maxWindowParam) || maxWindowParam < minWindowParam) return;
		if (Number.isNaN(topNParam) || topNParam <= 0) return;

		try {
			const response = await fetch(
				`http://localhost:8000/generate/backtest/latest?symbol=${encodeURIComponent(symbol)}&hold_days=${holdDaysParam}&min_window=${minWindowParam}&max_window=${maxWindowParam}&transaction_cost_pct=${transactionCostParam}&stop_loss_pct=${stopLossParam}&top_n=${topNParam}`
			);
			const data = await response.json();
			updateScenario(scenario.id, (cfg) => ({
				...cfg,
				topWindows: data?.top_windows || [],
				isStale: Boolean(data?.is_stale),
				staleMessage: data?.stale_message || null,
			}));
		} catch (err) {
			console.error(err);
		}
	};

	const removeScenario = async (scenario) => {
		const confirmed = window.confirm("Delete this scenario from UI and DB cache?");
		if (!confirmed) return;

		try {
			await fetch("http://localhost:8000/generate/backtest", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					symbol,
					hold_days: Number(scenario.holdDays),
					min_window: Number(scenario.minWindow),
					max_window: Number(scenario.maxWindow),
					transaction_cost_pct: Number(scenario.transactionCostPct),
					stop_loss_pct: Number(scenario.stopLossPct),
					top_n: Number(scenario.topN),
				}),
			});
		} catch (err) {
			console.error(err);
		}

		setTabData((prev) => {
			const remaining = (prev.backtestConfigs || []).filter((cfg) => cfg.id !== scenario.id);
			return {
				...prev,
				backtestConfigs: remaining,
			};
		});
	};

	return (
		<div className="tab-panel">
			<div className="tab-panel-header">
				<div>
					<h2 className="tab-panel-title">{symbol} Overview</h2>
					<p className="tab-panel-subtitle">Analyze resistance signals with configurable window size.</p>
					{dataRange?.start_date && dataRange?.end_date && (
						<div className="data-range-text">
							Data range: {dataRange.start_date} to {dataRange.end_date} ({dataRange.rows} rows)
						</div>
					)}
				</div>
				<div className="controls">
						<input
							type="number"
							min="1"
							placeholder="Window size"
							value={windowSize ?? ""}
							onChange={(e) => setWindowSize(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") fetchChart();
							}}
						/>
						<button className="primary-btn" onClick={fetchChart} disabled={loading}>
							{loading ? "Generating..." : "Generate"}
						</button>
				</div>
			</div>

			<div className="panel-layout">
				<div className="chart-card">
					<div className="chart-card-inner">
						{prices.length > 0 ? (
							<TradingChart prices={prices} markers={markers} focusDate={focusDate} theme={theme} />
						) : (
							<div className="empty-state">
								No data. Enter window and click Generate.
							</div>
						)}
					</div>
				</div>

				<div className="signals-card">
					<h3>Signals</h3>
					<div className="signal-metrics">
						<div className="metric-chip metric-chip-high">
							<span>High</span>
							<strong>{highDates.length}</strong>
						</div>
						<div className="metric-chip metric-chip-low">
							<span>Low</span>
							<strong>{lowDates.length}</strong>
						</div>
					</div>
					<div className="signal-count">
						<strong>High signals:</strong> {highDates.length}
					</div>
					<div className="signal-count">
						<strong>Low signals:</strong> {lowDates.length}
					</div>

					<div className="dates-grid">
						<div className="date-column">
							<div className="date-title">High dates</div>
							<div className="date-list-box">
								{highDates.length === 0 ? (
									<div className="date-empty">No highs</div>
								) : (
									highDates.map((d, i) => (
										<div
											key={`${d}-high-${i}`}
											className="date-item"
											onClick={() => setTabData((prev) => ({ ...prev, focusDate: d }))}
										>{d}</div>
									))
								)}
							</div>
						</div>

						<div className="date-column">
							<div className="date-title">Low dates</div>
							<div className="date-list-box">
								{lowDates.length === 0 ? (
									<div className="date-empty">No lows</div>
								) : (
									lowDates.map((d, i) => (
										<div
											key={`${d}-low-${i}`}
											className="date-item"
											onClick={() => setTabData((prev) => ({ ...prev, focusDate: d }))}
										>{d}</div>
									))
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="backtest-section">
				<div className="backtest-header">
					<div>
						<h3 className="backtest-title">Backtesting Scenarios</h3>
						<p className="backtest-subtitle">Configure window range, stop-loss, holding days, fees, and top N results.</p>
					</div>
				</div>

				<div className="scenario-list">
					{backtestConfigs.length === 0 ? (
						<div className="empty-state">No scenarios. Click Add More + to create one.</div>
					) : (
						backtestConfigs.map((scenario, idx) => (
						<div className="scenario-card" key={scenario.id}>
							<div className="scenario-title-row">
								<h4>Scenario {idx + 1}</h4>
								<div className="scenario-actions">
									<button
										className="ghost-btn"
										onClick={() => loadLatestBacktest(scenario)}
										type="button"
									>
										Load cached
									</button>
									<button
										className="ghost-btn"
										type="button"
										onClick={() => removeScenario(scenario)}
									>
										Remove
									</button>
								</div>
							</div>

							<div className="scenario-input-grid">
								<label className="field-label">
									<span>Window Start</span>
									<input
										type="number"
										min="2"
										placeholder="e.g. 8"
										value={scenario.minWindow}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, minWindow: e.target.value }))
										}
									/>
								</label>
								<label className="field-label">
									<span>Window End</span>
									<input
										type="number"
										min="2"
										placeholder="e.g. 120"
										value={scenario.maxWindow}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, maxWindow: e.target.value }))
										}
									/>
								</label>
								<label className="field-label">
									<span>Sell Days</span>
									<input
										type="number"
										min="1"
										placeholder="e.g. 30"
										value={scenario.holdDays}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, holdDays: e.target.value }))
										}
									/>
								</label>
								<label className="field-label">
									<span>Stop-Loss %</span>
									<input
										type="number"
										min="0"
										step="0.1"
										placeholder="e.g. 2"
										value={scenario.stopLossPct}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, stopLossPct: e.target.value }))
										}
									/>
								</label>
								<label className="field-label">
									<span>Fee/Slippage %</span>
									<input
										type="number"
										min="0"
										step="0.1"
										placeholder="e.g. 0.2"
										value={scenario.transactionCostPct}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, transactionCostPct: e.target.value }))
										}
									/>
								</label>
								<label className="field-label">
									<span>Top N Results</span>
									<input
										type="number"
										min="1"
										placeholder="e.g. 20"
										value={scenario.topN}
										onChange={(e) =>
											updateScenario(scenario.id, (cfg) => ({ ...cfg, topN: e.target.value }))
										}
									/>
								</label>
							</div>

							<div className="scenario-run-row">
								<button className="primary-btn" onClick={() => runBacktest(scenario)} disabled={scenario.loading}>
									{scenario.loading ? "Running..." : "Run Backtest"}
								</button>
							</div>

							{scenario.isStale && (
								<div className="stale-banner">
									{scenario.staleMessage || "Backtest is stale. Please rerun with latest data."}
								</div>
							)}

							<div className="results-table-wrap">
								{!scenario.topWindows?.length ? (
									<div className="empty-state">No results yet for this scenario.</div>
								) : (
									<table className="results-table">
										<thead>
											<tr>
												<th>Window</th>
												<th>Total Return %</th>
												<th>Win Rate %</th>
												<th>Avg Trade %</th>
												<th>Total Trades</th>
												<th>Max Drawdown %</th>
											</tr>
										</thead>
										<tbody>
											{scenario.topWindows.map((item, rowIdx) => (
												<tr key={`${scenario.id}-${item.window}-${rowIdx}`}>
													<td>{item.window}</td>
													<td>{item.total_return_pct}</td>
													<td>{item.win_rate_pct}</td>
													<td>{item.avg_trade_return_pct}</td>
													<td>{item.total_trades}</td>
													<td>{item.max_drawdown_pct}</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>
						</div>
						))
					)}
				</div>

				<div className="add-scenario-row">
					<button
						type="button"
						className="primary-btn"
						onClick={() =>
							setTabData((prev) => ({
								...prev,
								backtestConfigs: [...(prev.backtestConfigs || []), defaultScenario()],
							}))
						}
					>
						Add More +
					</button>
				</div>
			</div>
		</div>
	);
}

