/**
 * DARN CLIMATE - Core Application Logic
 * Phase 3 Refactor: ES6 Class Architecture, DOM Caching, & Separation of Concerns
 */

// --- GLOBAL CONFIGURATION ---
const CONFIG = {
	HIST_END_YEAR: 2025,
	PROJ_START_YEAR: 2026,
	PROJ_END_YEAR: 2050,
	METRICS: ['heat', 'muggy', 'dry', 'mosquito', 'rain', 'snow']
};

/**
 * @class DataService
 * @description Handles all external network requests and local JSON fetching.
 */
class DataService {
	constructor() {
		this.cityDatabase = [];
	}

	async initDatabase() {
		try {
			const res = await fetch('./top_cities.json');
			if (!res.ok) throw new Error("Network response was not ok");
			this.cityDatabase = await res.json();
		} catch (err) {
			console.error("Failed to load city database:", err);
		}
	}

	async fetchCityData(slug) {
		const res = await fetch(`./public/cities/${slug}.json`);
		if (!res.ok) {
			throw new Error("Climate timeline unavailable for this location.");
		}
		return await res.json();
	}

	searchCities(query) {
		if (query.length < 2) return [];
		return this.cityDatabase.filter(city => 
			city.city.toLowerCase().includes(query) || 
			(city.admin_name && city.admin_name.toLowerCase().includes(query)) ||
			city.country.toLowerCase().includes(query)
		).slice(0, 5);
	}
}

/**
 * @class ChartManager
 * @description Handles Chart.js instantiation, styling, and rendering logic.
 */
class ChartManager {
	 constructor() {
		 this.instances = {};
		 this.extractThemeColors();
		 this.setupChartDefaults();
	 }
 
	 extractThemeColors() {
		 const rootStyles = getComputedStyle(document.documentElement);
		 this.colors = {
			 heat: rootStyles.getPropertyValue('--col2').trim(),
			 mild: rootStyles.getPropertyValue('--col3').trim(),
			 dry: rootStyles.getPropertyValue('--col4').trim(),
			 cold: rootStyles.getPropertyValue('--col1').trim(),
			 gray: rootStyles.getPropertyValue('--grayed-out').trim(),
			 border: rootStyles.getPropertyValue('--border-color').trim(),
			 muggy: rootStyles.getPropertyValue('--col-muggy').trim(),
			 mosquito: rootStyles.getPropertyValue('--col-mosquito').trim()
		 };
		 this.metricColors = { heat: this.colors.heat, muggy: this.colors.muggy, dry: this.colors.dry, mosquito: this.colors.mosquito, rain: this.colors.mild, snow: this.colors.cold };
	 }
 
	 setupChartDefaults() {
		 Chart.defaults.font.family = "'Play', Arial, sans-serif";
		 Chart.defaults.color = this.colors.gray;
	 }
 
	 renderChart(id, labels, datasets, minYear, globalMax) {
		 const canvas = document.getElementById(`canvas-${id}`);
		 if (!canvas) return;
 
		 const chartDatasets = datasets.map(ds => {
			 let baseConfig = { label: ds.label, data: ds.data, borderColor: ds.color, backgroundColor: ds.color, tension: 0.2, spanGaps: true };
			 if (ds.type === 'dots') {
				 baseConfig.showLine = false; baseConfig.pointRadius = 3; baseConfig.pointHoverRadius = 5; baseConfig.backgroundColor = ds.color + '40'; baseConfig.borderColor = 'transparent'; 
			 } else if (ds.type === 'solid') {
				 baseConfig.borderWidth = 3; baseConfig.pointRadius = 0; baseConfig.pointHoverRadius = 4; baseConfig.tension = 0.4; 
			 } else if (ds.type === 'dashed') {
				 baseConfig.borderWidth = 3; baseConfig.borderDash = [5, 5]; baseConfig.pointRadius = 0; baseConfig.pointHoverRadius = 4; baseConfig.tension = 0.4; baseConfig.backgroundColor = 'transparent';
			 }
			 return baseConfig;
		 });
 
		 if (this.instances[id]) {
			 this.instances[id].data.labels = labels;
			 this.instances[id].data.datasets = chartDatasets;
			 this.instances[id].options.scales.y.max = Math.ceil(globalMax * 1.1); // 10% headroom
			 this.instances[id].update();
			 return; 
		 }
 
		 const ctx = canvas.getContext('2d');
		 this.instances[id] = new Chart(ctx, {
			 type: 'line',
			 data: { labels: labels, datasets: chartDatasets },
			 options: {
				 responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
				 plugins: {
					 legend: { display: true, position: 'top', labels: { boxWidth: 12, boxHeight: 2, font: { size: 10 }, usePointStyle: true } },
					 tooltip: { backgroundColor: 'rgba(62, 49, 40, 0.9)' }
				 },
				 scales: {
					 // X AND Y AXES ARE NOW PERMANENTLY LOCKED
					 x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } }, min: minYear, max: CONFIG.PROJ_END_YEAR },
					 y: { grid: { color: this.colors.border }, beginAtZero: true, max: Math.ceil(globalMax * 1.1), ticks: { font: { size: 10 } } }
				 }
			 },
			 plugins: [this.getFutureShadingPlugin()]
		 });
	 }
 
	 getFutureShadingPlugin() {
		 const borderColor = this.colors.border;
		 return {
			 id: 'futureShading',
			 beforeDraw: chart => {
				 // FIX: Find the array index for the year 2026 first
				 const xIndex = chart.data.labels.findIndex(l => l === CONFIG.PROJ_START_YEAR);
				 if (xIndex === -1) return;
				 
				 const xAxis = chart.scales.x;
				 const yAxis = chart.scales.y;
				 // Use the index to grab the correct pixel coordinate
				 const xPixel = xAxis.getPixelForValue(xIndex);
				 
				 if (xPixel > xAxis.right || xPixel < xAxis.left) return;
				 
				 const ctx = chart.ctx;
				 ctx.save();
				 
				 // Draw permanent background box for 2026-2050
				 ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
				 ctx.fillRect(xPixel, yAxis.top, xAxis.right - xPixel, yAxis.bottom - yAxis.top);
				 
				 // Draw dashed starting line at 2026
				 ctx.beginPath();
				 ctx.moveTo(xPixel, yAxis.top);
				 ctx.lineTo(xPixel, yAxis.bottom);
				 ctx.lineWidth = 1;
				 ctx.strokeStyle = borderColor;
				 ctx.setLineDash([3, 3]);
				 ctx.stroke();
				 ctx.restore();
			 }
		 };
	 }
 }
/**
 * @class UIController
 * @description Handles all DOM caching, event listeners, and direct DOM manipulation.
 */
class UIController {
	constructor(appInstance) {
		this.app = appInstance;
		this.cacheDOM();
		this.bindEvents();
		this.setupScrollObserver(); // NEW
	}
	
	// ... [keep cacheDOM and bindEvents the same] ...
	
	setupScrollObserver() {
		// Triggers when 15% of the card enters the viewport
		const options = { root: null, rootMargin: '0px', threshold: 0.15 };
		this.observer = new IntersectionObserver((entries, observer) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					observer.unobserve(entry.target); // Only animate once
				}
			});
		}, options);
	}

	cacheDOM() {
		// Forms & Inputs
		this.dom = {
			inputForm: document.getElementById('input-form'),
			locationInput: document.getElementById('location-input'),
			autocompleteDropdown: document.getElementById('autocomplete-dropdown'),
			birthYear: document.getElementById('birth-year'),
			unitToggle: document.getElementById('unit-toggle'),
			analyzeBtn: document.getElementById('analyze-btn'),
			resetBtn: document.getElementById('reset-btn'),
			revealFutureBtn: document.getElementById('reveal-future-btn'),
			errorDisplay: document.getElementById('error-display')
		};

		// Dashboard Containers
		this.dashboard = {
			main: document.getElementById('dashboard'),
			locationDisplay: document.getElementById('location-display'),
			heroSummary: document.getElementById('hero-summary'),
			progressionContainer: document.getElementById('progression-container'),
			scenarioContainer: document.querySelector('.scenario-container')
		};

		// Tab Buttons
		this.tabs = document.querySelectorAll('.tab-btn');
	}

	bindEvents() {
		// Form Submission
		this.dom.inputForm.addEventListener('submit', (e) => {
			e.preventDefault();
			this.app.handleAnalyzeRequest();
		});

		// Reset App
		this.dom.resetBtn.addEventListener('click', () => {
			this.dashboard.main.classList.add('hidden');
			this.dom.inputForm.classList.remove('hidden');
			this.app.resetState();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});

		// Autocomplete Input
		this.dom.locationInput.addEventListener('input', () => {
			const query = this.dom.locationInput.value.trim().toLowerCase();
			this.app.handleSearchQuery(query);
		});

		// Close autocomplete when clicking outside
		document.addEventListener('click', (e) => {
			if (e.target !== this.dom.locationInput) {
				this.hideAutocomplete();
			}
		});

		// Future Reveal
		if (this.dom.revealFutureBtn) {
			this.dom.revealFutureBtn.addEventListener('click', () => {
				this.dashboard.main.setAttribute('data-step', 'future');
				this.dashboard.progressionContainer.classList.add('hidden');
				this.dom.resetBtn.classList.remove('hidden');
				this.app.refreshCharts();
				
				// Best Practice: Target the static element immediately above the sticky container
				// This forces the browser to reliably scroll the document to the top of the narrative.
				this.dashboard.heroSummary.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}

		// Scenario Tabs
		this.tabs.forEach(btn => {
			btn.addEventListener('click', (e) => {
				this.tabs.forEach(b => b.classList.remove('active'));
				e.target.classList.add('active');
				this.app.refreshCharts();
			});
		});
	}

	// --- Autocomplete UI ---
	renderAutocomplete(results) {
		if (results.length === 0) {
			this.hideAutocomplete();
			return;
		}

		this.dom.autocompleteDropdown.innerHTML = '';
		results.forEach(city => {
			const div = document.createElement('div');
			div.className = 'autocomplete-item';
			const region = city.admin_name ? `${city.admin_name}, ` : '';
			div.innerText = `${city.city}, ${region}${city.country}`;
			
			div.addEventListener('click', () => {
				this.dom.locationInput.value = div.innerText;
				this.app.setSelectedLocation(city.slug, div.innerText);
				this.hideAutocomplete();
			});
			this.dom.autocompleteDropdown.appendChild(div);
		});
		this.dom.autocompleteDropdown.classList.remove('hidden');
	}

	hideAutocomplete() {
		this.dom.autocompleteDropdown.classList.add('hidden');
	}

	// --- Error Handling UI ---
	showError(msg) {
		if (msg) {
			this.dom.errorDisplay.innerText = msg;
			this.dom.errorDisplay.classList.remove('hidden');
		} else {
			this.dom.errorDisplay.classList.add('hidden');
		}
	}

	setLoadingState(isLoading) {
		this.dom.analyzeBtn.disabled = isLoading;
		this.dom.analyzeBtn.innerText = isLoading ? "Loading local climate data..." : "Generate Climate Timeline";
	}

	// --- Dashboard Render Methods ---
	getActiveScenario() {
		const activeTab = document.querySelector('.tab-btn.active');
		return activeTab ? activeTab.getAttribute('data-scenario') : 'ssp245';
	}

	getStep() {
		return this.dashboard.main.getAttribute('data-step') || 'history';
	}

	showDashboard(locationName, birthYear, dataPayload, isMetric) {
		this.dashboard.locationDisplay.innerText = `Data for ${locationName}`;
		this.updateDescriptionLabels(isMetric, dataPayload.thresholds);
		this.renderHeroSummary(locationName, birthYear, dataPayload, isMetric);
	
		this.tabs.forEach(b => b.classList.remove('active'));
		document.querySelector('[data-scenario="ssp245"]').classList.add('active');
		
		this.dashboard.main.setAttribute('data-step', 'history');
		if (this.dashboard.progressionContainer) this.dashboard.progressionContainer.classList.remove('hidden');
		this.dom.resetBtn.classList.add('hidden');
	
		this.dom.inputForm.classList.add('hidden');
		this.dashboard.main.classList.remove('hidden');
	
		// NEW: Reset and observe all metric cards for scrollytelling
		document.querySelectorAll('.metric-card').forEach(card => {
			card.classList.remove('is-visible');
			// If it's already hidden via 'display: none', remove that first
			card.classList.remove('hidden'); 
			this.observer.observe(card);
		});
	}

	renderHeroSummary(locationName, birthYear, data, isMetric) {
		const histStart = birthYear - 2;
		const pastMetrics = ClimateUtils.getAverages(data.histYearly, histStart, histStart + 4);
		const recentMetrics = ClimateUtils.getAverages(data.histYearly, CONFIG.HIST_END_YEAR - 4, CONFIG.HIST_END_YEAR);
		
		const pastHeat = Math.round(pastMetrics.heat);
		const recentHeat = Math.round(recentMetrics.heat);
		
		const heatC = data.thresholds?.heat_celsius || 32.0;
		const heatF = ClimateUtils.celsiusToFahrenheit(heatC);
		const threshText = isMetric ? `${heatC.toFixed(1)}°C` : `${heatF}°F`;
		
		let directionVerb = "climbed to";
		let strategyPivotPhrase = "what else has changed and what the future might bring.";
		
		if (recentHeat < pastHeat) {
			directionVerb = "dropped to";
			strategyPivotPhrase = "how this trend is projected to pivot over the rest of your lifetime.";
		} else if (recentHeat === pastHeat) {
			directionVerb = "remained steady at";
		}
		
		this.dashboard.heroSummary.innerHTML = `Since you were born in <strong>${birthYear}</strong>, the climate in <strong>${locationName.split(',')[0]}</strong> has already shifted. During your childhood, you experienced an average of <strong>${pastHeat} days</strong> a year over ${threshText}. Today, that average has ${directionVerb} <strong>${recentHeat} days</strong>. Scroll down to see ${strategyPivotPhrase}`;
	}

	updateDescriptionLabels(isMetric, thresholds) {
		const heatC = thresholds?.heat_celsius || 32.0;
		const muggyC = thresholds?.muggy_celsius || 21.0;

		const heatF = ClimateUtils.celsiusToFahrenheit(heatC);
		const muggyF = ClimateUtils.celsiusToFahrenheit(muggyC);

		document.getElementById('label-thresh-heat').innerText = isMetric ? `${heatC.toFixed(1)}°C` : `${heatF}°F`;
		document.getElementById('label-thresh-muggy').innerText = isMetric ? `${muggyC.toFixed(1)}°C` : `${muggyF}°F`;
		
		document.getElementById('label-thresh-dry').innerText = isMetric ? "1 mm" : "0.04 inches";
		document.getElementById('label-thresh-mosq-min').innerText = isMetric ? "21°C" : "70°F";
		document.getElementById('label-thresh-mosq-max').innerText = isMetric ? "35°C" : "95°F";
		document.getElementById('label-thresh-rain').innerText = isMetric ? "25 mm" : "1 inch";
		document.getElementById('label-thresh-snow').innerText = isMetric ? "25 mm" : "1 inch";
	}

	renderCard(id, label1, label2, label3, val1, val2, val3, suffix) {
		const card = document.getElementById(`card-${id}`);
		if (!card) return;
		
		if (val1 === 0 && val2 === 0 && val3 === 0) {
			card.classList.add('hidden'); 
		} else {
			card.classList.remove('hidden');
			document.getElementById(`val1-${id}`).innerText = val1 + suffix;
			document.getElementById(`val2-${id}`).innerText = val2 + suffix;
			document.getElementById(`val3-${id}`).innerText = val3 + suffix;
			
			const year1El = document.getElementById(`year1-label-${id}`);
			const year2El = document.getElementById(`year2-label-${id}`);
			const year3El = document.getElementById(`year3-label-${id}`);
			
			if(year1El) year1El.innerText = label1;
			if(year2El) year2El.innerText = label2;
			if(year3El) year3El.innerText = label3;

			const subtitleEl = document.getElementById(`impact-${id}`);
			if (subtitleEl) {
				subtitleEl.innerText = ClimateUtils.buildImpactString(id, val1, val3);
			}
		}
	}
}

/**
 * @class App
 * @description The core orchestrator linking Data, UI, and Charts.
 */
class App {
	constructor() {
		this.dataService = new DataService();
		this.chartManager = new ChartManager();
		this.ui = new UIController(this);
		
		// App State
		this.state = {
			activeData: null,
			selectedLocation: null,
			birthYear: null,
			isMetric: false
		};

		this.init();
	}

	async init() {
		await this.dataService.initDatabase();
	}

	resetState() {
		this.state.activeData = null;
		// Maintain location selection for UX convenience, but reset hard data
	}

	setSelectedLocation(slug, displayName) {
		this.state.selectedLocation = { slug, displayName };
	}

	handleSearchQuery(query) {
		const results = this.dataService.searchCities(query);
		this.ui.renderAutocomplete(results);
	}

	async handleAnalyzeRequest() {
		const birthYear = parseInt(this.ui.dom.birthYear.value.trim());
		const isMetric = this.ui.dom.unitToggle.checked;
		const locationInputVal = this.ui.dom.locationInput.value;

		if (!this.state.selectedLocation || this.state.selectedLocation.displayName !== locationInputVal) {
			return this.ui.showError("We couldn't find that exact location. To maintain high data fidelity, we currently only track global capitals and major US cities. Try typing the major city closest to you!");
		}
		if (!birthYear || birthYear < 1940 || birthYear > 2020) {
			return this.ui.showError("Please enter a year between 1940 and 2020. Our historical weather observations do not extend reliably before 1940.");
		}

		this.ui.showError("");
		this.ui.setLoadingState(true);

		this.state.birthYear = birthYear;
		this.state.isMetric = isMetric;

		try {
			const cityData = await this.dataService.fetchCityData(this.state.selectedLocation.slug);
			this.state.activeData = cityData;
			
			this.ui.showDashboard(
				this.state.selectedLocation.displayName, 
				this.state.birthYear, 
				this.state.activeData, 
				this.state.isMetric
			);
			
			this.refreshCharts();

		} catch (err) {
			this.ui.showError(err.message || "An error occurred fetching information.");
		} finally {
			this.ui.setLoadingState(false);
		}
	}
	calculateGlobalMax(metricKey, data, birthYear) {
		let maxVal = 0;
		for(let y = birthYear - 2; y <= CONFIG.HIST_END_YEAR; y++) {
			if (data.histYearly[y] && data.histYearly[y][metricKey] > maxVal) maxVal = data.histYearly[y][metricKey];
		}
		['ssp126', 'ssp245', 'ssp585'].forEach(scen => {
			for(let y = CONFIG.PROJ_START_YEAR; y <= CONFIG.PROJ_END_YEAR; y++) {
				if (data.scenarios[scen][y] && data.scenarios[scen][y][metricKey] > maxVal) maxVal = data.scenarios[scen][y][metricKey];
			}
		});
		return maxVal;
	}
	refreshCharts() {
		if (!this.state.activeData) return;
	
		const scenario = this.ui.getActiveScenario();
		const currentStep = this.ui.getStep();
		const data = this.state.activeData;
		const birthYear = this.state.birthYear;
		const histStart = birthYear - 2;
	
		const histMetrics = ClimateUtils.getAverages(data.histYearly, histStart, histStart + 4);
		const recentMetrics = ClimateUtils.getAverages(data.histYearly, CONFIG.HIST_END_YEAR - 4, CONFIG.HIST_END_YEAR);
		const futureMetrics = ClimateUtils.getAverages(data.scenarios[scenario], CONFIG.PROJ_END_YEAR - 4, CONFIG.PROJ_END_YEAR); 
	
		const lHist = `~${birthYear}`;
		const lRecent = `~${CONFIG.HIST_END_YEAR}`;
		const lFuture = `~${CONFIG.PROJ_END_YEAR}`;
	
		this.ui.renderCard("heat", lHist, lRecent, lFuture, Math.round(histMetrics.heat), Math.round(recentMetrics.heat), Math.round(futureMetrics.heat), " days");
		this.ui.renderCard("muggy", lHist, lRecent, lFuture, Math.round(histMetrics.muggy), Math.round(recentMetrics.muggy), Math.round(futureMetrics.muggy), " nights");
		this.ui.renderCard("dry", lHist, lRecent, lFuture, Math.round(histMetrics.dry), Math.round(recentMetrics.dry), Math.round(futureMetrics.dry), " days");
		this.ui.renderCard("mosquito", lHist, lRecent, lFuture, Math.round(histMetrics.mosquito), Math.round(recentMetrics.mosquito), Math.round(futureMetrics.mosquito), " days");
		this.ui.renderCard("rain", lHist, lRecent, lFuture, Math.round(histMetrics.rain), Math.round(recentMetrics.rain), Math.round(futureMetrics.rain), " days");
		this.ui.renderCard("snow", lHist, lRecent, lFuture, Math.round(histMetrics.snow), Math.round(recentMetrics.snow), Math.round(futureMetrics.snow), " days");
	
		CONFIG.METRICS.forEach(metricKey => {
			const arrays = this.buildMetricArrays(metricKey, scenario);
			const hasData = arrays.histRaw.some(v => v > 0) || arrays.futRaw.some(v => v > 0);
			const color = this.chartManager.metricColors[metricKey];
			// Calculate the global max to lock the Y-Axis height
			const globalMax = this.calculateGlobalMax(metricKey, data, birthYear);
	
			if (hasData) {
				let datasets = [];
				if (currentStep === 'future') {
					datasets = [
						{ label: "Annual Reality", data: arrays.histRaw, color: color, type: 'dots' },
						{ label: "Climate Trend", data: arrays.histRoll10, color: color, type: 'solid' },
						{ label: "Future Reality", data: arrays.futRaw, color: this.chartManager.colors.gray, type: 'dots' },
						{ label: "Future Trend", data: arrays.futTrend, color: this.chartManager.colors.gray, type: 'dashed' }
					];
				} else {
					datasets = [
						{ label: "Annual Reality", data: arrays.histRaw, color: color, type: 'dots' },
						{ label: "Climate Trend", data: arrays.histRoll10, color: color, type: 'solid' }
					];
				}
				// Render chart with locked axes
				this.chartManager.renderChart(metricKey, arrays.allYears, datasets, histStart, globalMax);
			}
		});
	}

	buildMetricArrays(metricKey, activeScenario) {
		const allYears = [];
		for (let y = this.state.birthYear - 2; y <= CONFIG.PROJ_END_YEAR; y++) {
			allYears.push(y);
		}
	
		const arrays = {
			allYears,
			histRaw: [], histRoll10: [],
			futRaw: [], futTrend: []
		};

		allYears.forEach(y => {
			if (y <= CONFIG.HIST_END_YEAR) {
				const hData = this.state.activeData.histYearly[y];
				arrays.histRaw.push(hData ? hData[metricKey] : null);
				arrays.histRoll10.push(hData ? hData[`${metricKey}_roll10`] : null);
				
				arrays.futRaw.push(null);
				arrays.futTrend.push(null);
			} else {
				const fData = this.state.activeData.scenarios[activeScenario][y];
				arrays.futRaw.push(fData ? fData[metricKey] : null);
				arrays.futTrend.push(fData ? fData[`${metricKey}_trend`] : null);

				arrays.histRaw.push(null);
				arrays.histRoll10.push(null);
			}
		});

		// Anchor the trendline perfectly to the last historical smoothed data point
		const boundaryIdx = allYears.indexOf(CONFIG.HIST_END_YEAR);
		if (boundaryIdx !== -1) {
			arrays.futTrend[boundaryIdx] = arrays.histRoll10[boundaryIdx]; 
		}

		return arrays;
	}
}

// Bootstrap application once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	window.darnClimateApp = new App();
});