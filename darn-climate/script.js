document.addEventListener('DOMContentLoaded', () => {
	const inputForm = document.getElementById('input-form');
	const analyzeBtn = document.getElementById('analyze-btn');
	const resetBtn = document.getElementById('reset-btn');
	const errorDisplay = document.getElementById('error-display');
	const dashboard = document.getElementById('dashboard');
	
	const locationInput = document.getElementById('location-input');
	const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
	const unitToggle = document.getElementById('unit-toggle');
	
	let chartInstances = {};
	let selectedLocation = null; 
	let debounceTimeout = null;

	// State memory for instant tab switching
	let activeDashboardData = null;
	let activeBirthYear = null;
	let activeIsMetric = false;

	const rootStyles = getComputedStyle(document.documentElement);
	const colorHeat = rootStyles.getPropertyValue('--col2').trim();
	const colorMild = rootStyles.getPropertyValue('--col3').trim();
	const colorDry  = rootStyles.getPropertyValue('--col4').trim();
	const colorCold = rootStyles.getPropertyValue('--col1').trim();
	const colorGray = rootStyles.getPropertyValue('--grayed-out').trim();
	const colorBorder = rootStyles.getPropertyValue('--border-color').trim();
	const colorMuggy = rootStyles.getPropertyValue('--col-muggy').trim();
	const colorMosquito = rootStyles.getPropertyValue('--col-mosquito').trim();

	Chart.defaults.font.family = "'Play', Arial, sans-serif";
	Chart.defaults.color = colorGray;

	// --- 1. GLOBAL CITY GEOLOCATION AUTOCOMPLETE ENGINE ---
	locationInput.addEventListener('input', () => {
		clearTimeout(debounceTimeout);
		const query = locationInput.value.trim();
		
		if (query.length < 3) {
			autocompleteDropdown.classList.add('hidden');
			return;
		}

		debounceTimeout = setTimeout(async () => {
			try {
				const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
				const data = await res.json();
				
				if (!data.results || data.results.length === 0) {
					autocompleteDropdown.classList.add('hidden');
					return;
				}

				autocompleteDropdown.innerHTML = '';
				data.results.forEach(city => {
					const div = document.createElement('div');
					div.className = 'autocomplete-item';
					const region = city.admin1 ? `${city.admin1}, ` : '';
					div.innerText = `${city.name}, ${region}${city.country}`;
					
					div.addEventListener('click', () => {
						locationInput.value = div.innerText;
						selectedLocation = {
							lat: city.latitude,
							lon: city.longitude,
							displayName: `${city.name}, ${city.country}`
						};
						autocompleteDropdown.classList.add('hidden');
					});
					autocompleteDropdown.appendChild(div);
				});
				autocompleteDropdown.classList.remove('hidden');
			} catch (e) {
				console.error("Geocoding fetch bottleneck encountered:", e);
			}
		}, 300); 
	});

	document.addEventListener('click', (e) => {
		if (e.target !== locationInput) {
			autocompleteDropdown.classList.add('hidden');
		}
	});

	// --- 2. SCENARIO TAB LISTENERS ---
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			e.target.classList.add('active');
			const selectedScenario = e.target.getAttribute('data-scenario');
			
			if (activeDashboardData) {
				renderDashboardCharts(activeDashboardData, activeBirthYear, selectedScenario, activeIsMetric);
			}
		});
	});

	// --- 3. INPUT SUBMISSION CONTROLLER ---
	inputForm.addEventListener('submit', async (e) => {
		e.preventDefault();

		const birthYear = parseInt(document.getElementById('birth-year').value.trim());
		const currentYear = new Date().getFullYear(); 
		const isMetric = unitToggle.checked;

		if (!selectedLocation) {
			return showError("Please select a valid hometown from the dropdown list suggestions.");
		}
		if (!birthYear || birthYear < 1920 || birthYear > (currentYear - 6)) {
			return showError(`Please enter a birth year between 1920 and ${currentYear - 6}.`);
		}

		showError("");
		analyzeBtn.disabled = true;
		analyzeBtn.innerText = "Crunching historical and future data...";

		const unitSuffix = isMetric ? 'metric' : 'imperial';
		const cacheKey = `darn_sim_v4_${selectedLocation.lat}_${selectedLocation.lon}_${birthYear}_${unitSuffix}`;
		const cachedData = localStorage.getItem(cacheKey);

		activeBirthYear = birthYear;
		activeIsMetric = isMetric;

		if (cachedData) {
			try {
				const parsedCache = JSON.parse(cachedData);
				activeDashboardData = parsedCache;
				displayDashboard(parsedCache.displayName, parsedCache, birthYear, isMetric);
				return;
			} catch (err) {
				localStorage.removeItem(cacheKey);
			}
		}

		try {
			const histStart = birthYear - 2;
			const tempUnit = isMetric ? 'celsius' : 'fahrenheit';
			const precipUnit = isMetric ? 'mm' : 'inch';
			
			// Parallel Fetching: History (Archive) + Future (CMIP6 Models)
			const baseArchiveApi = `https://archive-api.open-meteo.com/v1/archive?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum&timezone=auto&temperature_unit=${tempUnit}&precipitation_unit=${precipUnit}`;
			const baseClimateApi = `https://climate-api.open-meteo.com/v1/climate?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum&models=MPI_ESM1_2_XR&start_date=2016-01-01&end_date=2050-12-31&temperature_unit=${tempUnit}&precipitation_unit=${precipUnit}`;
			
			const [dataResHist, dataResFuture] = await Promise.all([
				fetch(`${baseArchiveApi}&start_date=${histStart}-01-01&end_date=2025-12-31`),
				fetch(baseClimateApi)
			]);
			
			if (dataResHist.status === 429 || dataResFuture.status === 429) {
				throw new Error("Database server catching its breath! Please wait 1 minute and hit generate again.");
			}

			const rawHist = await dataResHist.json();
			const rawFuture = await dataResFuture.json();

			if (rawHist.error || rawFuture.error || !rawHist.daily || !rawFuture.daily) {
				throw new Error("Climate timeline unavailable for these coordinates.");
			}

			// Parse timelines
			// Parse timelines
			const histYearly = aggregateYearlyData(rawHist.daily, isMetric);
			const rawModelYearly = aggregateYearlyData(rawFuture.daily, isMetric);
			
			// --- DELTA METHOD BIAS CORRECTION ---
			// 1. Calculate the average offset between real history and the model over a 10-year reference overlap (2016-2025)
			const metrics = ['heat', 'muggy', 'dry', 'mosquito', 'rain', 'snow'];
			const offsets = {};
			let sfHistSum = 0, sfModelSum = 0, ffHistSum = 0, ffModelSum = 0, fCount = 0;
			
			// 1A. Calculate Volume Offsets
			metrics.forEach(metric => {
				let histSum = 0, modelSum = 0, count = 0;
				for (let y = 2016; y <= 2025; y++) {
					if (histYearly[y] && rawModelYearly[y]) {
						histSum += histYearly[y][metric];
						modelSum += rawModelYearly[y][metric];
						count++;
					}
				}
				offsets[metric] = count > 0 ? (histSum / count) - (modelSum / count) : 0;
			});
			
			// 1B. Calculate Frost Date (DOY) Offsets
			for (let y = 2016; y <= 2025; y++) {
				if (histYearly[y] && rawModelYearly[y] && histYearly[y].springFrost > 0 && rawModelYearly[y].springFrost > 0) {
					sfHistSum += histYearly[y].springFrost;
					sfModelSum += rawModelYearly[y].springFrost;
					ffHistSum += histYearly[y].fallFrost;
					ffModelSum += rawModelYearly[y].fallFrost;
					fCount++;
				}
			}
			const sfOffset = fCount > 0 ? (sfHistSum / fCount) - (sfModelSum / fCount) : 0;
			const ffOffset = fCount > 0 ? (ffHistSum / fCount) - (ffModelSum / fCount) : 0;
			
			// 2. Apply offsets to correct the future projections (2026 - 2050)
			const futureYearlyBase = {};
			for (let y = 2026; y <= 2050; y++) {
				if (rawModelYearly[y]) {
					futureYearlyBase[y] = {};
					metrics.forEach(metric => {
						futureYearlyBase[y][metric] = Math.max(0, rawModelYearly[y][metric] + offsets[metric]);
					});
					// Safely pass through and adjust the frost dates
					futureYearlyBase[y].springFrost = rawModelYearly[y].springFrost > 0 ? Math.max(1, Math.round(rawModelYearly[y].springFrost + sfOffset)) : 0;
					futureYearlyBase[y].fallFrost = rawModelYearly[y].fallFrost > 0 ? Math.min(365, Math.round(rawModelYearly[y].fallFrost + ffOffset)) : 0;
				}
			}
			
			// Generate divergent SSP scenarios
			const scenarios = generateScenarios(futureYearlyBase);

			const payloadToCache = { displayName: selectedLocation.displayName, histYearly, scenarios };
			activeDashboardData = payloadToCache;
			localStorage.setItem(cacheKey, JSON.stringify(payloadToCache));

			displayDashboard(selectedLocation.displayName, payloadToCache, birthYear, isMetric);

		} catch (err) {
			showError(err.message || "A network error occurred fetching information.");
		} finally {
			analyzeBtn.disabled = false;
			analyzeBtn.innerText = "Generate Baseline";
		}
	});

	resetBtn.addEventListener('click', () => {
		dashboard.classList.add('hidden');
		inputForm.classList.remove('hidden');
		activeDashboardData = null;
	});

	// --- 4. SSP SCENARIO SIMULATOR ---
	function generateScenarios(baseFuture) {
		const ssp126 = {}, ssp245 = {}, ssp585 = {};
		for (const [yearStr, data] of Object.entries(baseFuture)) {
			const y = parseInt(yearStr);
			const progression = (y - 2025) / 25;
			
			ssp585[y] = { ...data }; 
			ssp245[y] = {
				heat: Math.max(0, data.heat - (data.heat * 0.15 * progression)),
				muggy: Math.max(0, data.muggy - (data.muggy * 0.15 * progression)),
				dry: data.dry, rain: data.rain, snow: data.snow, mosquito: data.mosquito,
				springFrost: data.springFrost, fallFrost: data.fallFrost // Prevent data loss
			};
			ssp126[y] = {
				heat: Math.max(0, data.heat - (data.heat * 0.40 * progression)),
				muggy: Math.max(0, data.muggy - (data.muggy * 0.40 * progression)),
				dry: data.dry, rain: data.rain, snow: data.snow, mosquito: data.mosquito,
				springFrost: data.springFrost, fallFrost: data.fallFrost // Prevent data loss
			};
		}
		return { ssp126, ssp245, ssp585 };
	}

	// --- 5. DASHBOARD & UI INITIALIZATION ---
function displayDashboard(locationName, dataPayload, birthYear, isMetric) {
		document.getElementById('location-display').innerText = `Data for ${locationName}`;
	
		updateDescriptionLabels(isMetric);
	
		// Reset tabs to default state (Current Path)
		document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
		document.querySelector('[data-scenario="ssp245"]').classList.add('active');
	
		// Pass execution directly to the dynamic chart engine
		renderDashboardCharts(dataPayload, birthYear, 'ssp245', isMetric);
	
		inputForm.classList.add('hidden');
		dashboard.classList.remove('hidden');
	}

	function updateDescriptionLabels(isMetric) {
		document.getElementById('label-thresh-heat').innerText = isMetric ? "32°C" : "90°F";
		document.getElementById('label-thresh-muggy').innerText = isMetric ? "21°C" : "70°F";
		document.getElementById('label-thresh-dry').innerText = isMetric ? "0.25 mm" : "0.01 inches";
		document.getElementById('label-thresh-mosq-min').innerText = isMetric ? "21°C" : "70°F";
		document.getElementById('label-thresh-mosq-max').innerText = isMetric ? "35°C" : "95°F";
		document.getElementById('label-thresh-rain').innerText = isMetric ? "25 mm" : "1 inch";
		document.getElementById('label-thresh-snow').innerText = isMetric ? "25 mm" : "1 inch";
		document.getElementById('label-thresh-frost').innerText = isMetric ? "0°C" : "32°F";
	}

	function applyTrackSegments(prefix, springDOY, fallDOY) {
		const totalDays = 365;
		let leftPct = 0, midPct = 100, rightPct = 0;

		if (springDOY && fallDOY) {
			leftPct = (springDOY / totalDays) * 100;
			rightPct = ((totalDays - fallDOY) / totalDays) * 100;
			midPct = 100 - leftPct - rightPct;
		}
		document.getElementById(`${prefix}-seg-left`).style.width = `${leftPct}%`;
		document.getElementById(`${prefix}-seg-mid`).style.width = `${midPct}%`;
		document.getElementById(`${prefix}-seg-right`).style.width = `${rightPct}%`;
	}

	// --- 6. CHART RENDERING & SEAMLESS ARRAY LINKING ---
	function buildMetricArrays(metricKey, activeScenario) {
		const allYears = [];
		for(let y = activeBirthYear - 2; y <= 2050; y++) allYears.push(y);

		const histData = allYears.map(y => y <= 2025 && activeDashboardData.histYearly[y] ? activeDashboardData.histYearly[y][metricKey] : null);
		const futureData = allYears.map(y => y >= 2026 && activeDashboardData.scenarios[activeScenario][y] ? activeDashboardData.scenarios[activeScenario][y][metricKey] : null);
		
		const trend = calculateLinearRegression(allYears.filter(y => y <= 2025), histData.filter(v => v !== null));
		const paddedTrend = allYears.map(y => y <= 2025 ? trend.shift() : null);
		
		const rollingHist = calculateRollingAverage(histData.filter(v => v !== null), 5);
		const paddedRollingHist = allYears.map(y => y <= 2025 ? rollingHist.shift() : null);
		
		const rollingFuture = calculateRollingAverage(futureData.filter(v => v !== null), 5);
		// To connect the lines visually, overlap the last historical point
		const lastHistVal = paddedRollingHist.slice().reverse().find(v => v !== null);
		const paddedRollingFuture = allYears.map(y => {
			if (y === 2025) return lastHistVal;
			if (y >= 2026) return rollingFuture.shift();
			return null;
		});

		return { allYears, histData, paddedRollingHist, paddedTrend, paddedRollingFuture };
	}

	function renderDashboardCharts(data, birthYear, scenario, isMetric) {
		// 1. Calculate Dynamic UI Averages
		const histStart = birthYear - 2;
		const histMetrics = getAverages(data.histYearly, histStart, histStart + 4);
		const recentMetrics = getAverages(data.histYearly, 2021, 2025);
		const futureMetrics = getAverages(data.scenarios[scenario], 2046, 2050); 
	
		const lHist = `~${birthYear}`;
		const lRecent = `~2025`;
		const lFuture = `~2050`;
	
		// 2. Render Cards with 3 Data Points
		renderCard("heat", lHist, lRecent, lFuture, Math.round(histMetrics.heat), Math.round(recentMetrics.heat), Math.round(futureMetrics.heat), " days");
		renderCard("muggy", lHist, lRecent, lFuture, Math.round(histMetrics.muggy), Math.round(recentMetrics.muggy), Math.round(futureMetrics.muggy), " nights");
		renderCard("dry", lHist, lRecent, lFuture, Math.round(histMetrics.dry), Math.round(recentMetrics.dry), Math.round(futureMetrics.dry), " days");
		renderCard("mosquito", lHist, lRecent, lFuture, Math.round(histMetrics.mosquito), Math.round(recentMetrics.mosquito), Math.round(futureMetrics.mosquito), " days");
		renderCard("rain", lHist, lRecent, lFuture, Math.round(histMetrics.rain), Math.round(recentMetrics.rain), Math.round(futureMetrics.rain), " days");
		renderCard("snow", lHist, lRecent, lFuture, Math.round(histMetrics.snow), Math.round(recentMetrics.snow), Math.round(futureMetrics.snow), " days");
	
		// 3. Render Dynamic Frost Sliders
		const cardFrost = document.getElementById('card-frost');
		if (histMetrics.hasFrost || recentMetrics.hasFrost || futureMetrics.hasFrost) {
			cardFrost.classList.remove('hidden');
			document.getElementById('timeline-label-hist').innerText = lHist;
			document.getElementById('timeline-label-recent').innerText = lRecent;
			document.getElementById('timeline-label-future').innerText = lFuture;
	
			const getDurationDays = (spring, fall) => (spring && fall) ? Math.round(fall - spring) : 365;
			document.getElementById('frost-duration-hist').innerText = `${getDurationDays(histMetrics.springFrost, histMetrics.fallFrost)} growing days`;
			document.getElementById('frost-duration-recent').innerText = `${getDurationDays(recentMetrics.springFrost, recentMetrics.fallFrost)} growing days`;
			document.getElementById('frost-duration-future').innerText = `${getDurationDays(futureMetrics.springFrost, futureMetrics.fallFrost)} growing days`;
	
			document.getElementById('hist-date-start').innerText = formatDOY(histMetrics.springFrost);
			document.getElementById('hist-date-end').innerText = formatDOY(histMetrics.fallFrost);
			document.getElementById('recent-date-start').innerText = formatDOY(recentMetrics.springFrost);
			document.getElementById('recent-date-end').innerText = formatDOY(recentMetrics.fallFrost);
			document.getElementById('future-date-start').innerText = formatDOY(futureMetrics.springFrost);
			document.getElementById('future-date-end').innerText = formatDOY(futureMetrics.fallFrost);
	
			applyTrackSegments("hist", histMetrics.springFrost, histMetrics.fallFrost);
			applyTrackSegments("recent", recentMetrics.springFrost, recentMetrics.fallFrost);
			applyTrackSegments("future", futureMetrics.springFrost, futureMetrics.fallFrost);
		} else {
			cardFrost.classList.add('hidden');
		}
	
		// 4. Render the Charts (Note the colorGray swap for the projection layer)
		const metrics = [
			{ key: "heat", color: colorHeat },
			{ key: "muggy", color: colorMuggy },
			{ key: "dry", color: colorDry },
			{ key: "mosquito", color: colorMosquito },
			{ key: "rain", color: colorMild },
			{ key: "snow", color: colorCold }
		];
	
		metrics.forEach(m => {
			const arrays = buildMetricArrays(m.key, scenario);
			const hasData = arrays.histData.some(v => v > 0) || arrays.paddedRollingFuture.some(v => v > 0);
			
			if (hasData) {
				renderChart(m.key, arrays.allYears, [
					{ label: "Annual Data (Past)", data: arrays.histData, color: m.color, type: 'dots' },
					{ label: "5-Year Average", data: arrays.paddedRollingHist, color: m.color, type: 'rolling' },
					{ label: "Historical Trend", data: arrays.paddedTrend, color: colorGray, type: 'trend' },
					{ label: "Future Projection", data: arrays.paddedRollingFuture, color: colorGray, type: 'projection' }
				]);
			}
		});
	}

	function renderChart(id, labels, datasets) {
		const canvas = document.getElementById(`canvas-${id}`);
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		
		if (chartInstances[id]) {
			chartInstances[id].destroy();
		}

		const chartDatasets = datasets.map(ds => {
			let baseConfig = {
				label: ds.label,
				data: ds.data,
				borderColor: ds.color,
				backgroundColor: ds.color,
				tension: 0.2,
				spanGaps: true
			};

			if (ds.type === 'dots') {
				baseConfig.showLine = false;
				baseConfig.pointRadius = 3;
				baseConfig.pointHoverRadius = 5;
				baseConfig.backgroundColor = ds.color + '60'; 
				baseConfig.borderColor = 'transparent'; 
			} else if (ds.type === 'rolling') {
				baseConfig.borderWidth = 3;
				baseConfig.pointRadius = 0;
				baseConfig.pointHoverRadius = 4;
				baseConfig.tension = 0.4; 
			} else if (ds.type === 'trend') {
				baseConfig.borderWidth = 1.5;
				baseConfig.borderDash = [5, 5];
				baseConfig.pointRadius = 0;
				baseConfig.pointHoverRadius = 0;
				baseConfig.tension = 0; 
			} else if (ds.type === 'projection') {
				baseConfig.borderWidth = 3;
				baseConfig.borderDash = [8, 5]; 
				baseConfig.pointRadius = 0;
				baseConfig.pointHoverRadius = 4;
				baseConfig.tension = 0.4;
				baseConfig.borderColor = ds.color;
				baseConfig.backgroundColor = 'transparent';
			}
			return baseConfig;
		});

		// Visual vertical line plugin for 'Present Day' boundary
		const futureShadingPlugin = {
			id: 'futureShading',
			beforeDraw: chart => {
				const xIndex = chart.data.labels.findIndex(l => l === 2026);
				if (xIndex === -1) return;
				const xAxis = chart.scales.x;
				const yAxis = chart.scales.y;
				const xPixel = xAxis.getPixelForValue(xIndex);
				const ctx = chart.ctx;
				
				ctx.save();
				// Draw light grey background shading for future projection
				ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
				ctx.fillRect(xPixel, yAxis.top, xAxis.right - xPixel, yAxis.bottom - yAxis.top);
				
				// Draw vertical dashed boundary line
				ctx.beginPath();
				ctx.moveTo(xPixel, yAxis.top);
				ctx.lineTo(xPixel, yAxis.bottom);
				ctx.lineWidth = 1;
				ctx.strokeStyle = colorBorder;
				ctx.setLineDash([3, 3]);
				ctx.stroke();
				ctx.restore();
			}
		};

		chartInstances[id] = new Chart(ctx, {
			type: 'line',
			data: { labels: labels, datasets: chartDatasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: { 
						display: true, 
						position: 'top',
						labels: { boxWidth: 12, boxHeight: 2, font: { size: 10 }, usePointStyle: true }
					},
					tooltip: { backgroundColor: 'rgba(62, 49, 40, 0.9)' }
				},
				scales: {
					x: {
						grid: { display: false },
						ticks: { maxTicksLimit: 8, font: { size: 10 } }
					},
					y: {
						grid: { color: colorBorder },
						beginAtZero: true,
						ticks: { font: { size: 10 } }
					}
				}
			},
			plugins: [futureShadingPlugin]
		});
	}

	// --- 7. COMPUTATION ENGINE ---
	function aggregateYearlyData(daily, isMetric) {
		const yearly = {};
		let currentDOY = 1;
		let currentDryStreak = 0;

		const tHeat = isMetric ? 32 : 90;
		const tMuggy = isMetric ? 21 : 70;
		const tDry = isMetric ? 0.25 : 0.01;
		const tMosqMin = isMetric ? 21 : 70;
		const tMosqMax = isMetric ? 35 : 95;
		const tRain = isMetric ? 25 : 1.0;
		const tSnow = isMetric ? 25 : 1.0;
		const tFrost = isMetric ? 0 : 32;

		for (let i = 0; i < daily.time.length; i++) {
			const dateStr = daily.time[i];
			if (!dateStr || dateStr.length < 4) continue; 
			
			const year = parseInt(dateStr.substring(0, 4));
			
			if (!yearly[year]) {
				yearly[year] = { heat: 0, dry: 0, rain: 0, snow: 0, springFrost: 0, fallFrost: 0, muggy: 0, mosquito: 0 };
				currentDOY = 1;
				currentDryStreak = 0;
			}

			// Safely falls back to the raw CMIP6 temperature if apparent temperature is missing
			const maxT = daily.temperature_2m_max[i];
			const minT = daily.temperature_2m_min[i];
			const precip = daily.precipitation_sum[i];
			const snow = daily.snowfall_sum[i]; 

			if (maxT !== null && maxT >= tHeat) yearly[year].heat++;
			if (precip !== null && precip > tRain) yearly[year].rain++;
			if (snow !== null && snow >= tSnow) yearly[year].snow++;

			if (precip !== null && precip < tDry) {
				currentDryStreak++;
				if (currentDryStreak > yearly[year].dry) yearly[year].dry = currentDryStreak;
			} else if (precip !== null && precip >= tDry) {
				currentDryStreak = 0;
			}

			if (minT !== null && minT >= tMuggy) yearly[year].muggy++;

			if (maxT !== null && maxT >= tMosqMin && maxT <= tMosqMax) {
				let rainedRecently = false;
				for (let lookback = 1; lookback <= 3; lookback++) {
					const historicalIdx = i - lookback;
					if (historicalIdx >= 0 && daily.precipitation_sum[historicalIdx] !== null && daily.precipitation_sum[historicalIdx] >= tDry) {
						rainedRecently = true;
						break;
					}
				}
				if (rainedRecently) yearly[year].mosquito++;
			}

			if (minT !== null && minT < tFrost) {
				if (currentDOY < 180) yearly[year].springFrost = currentDOY; 
				if (currentDOY >= 180 && yearly[year].fallFrost === 0) yearly[year].fallFrost = currentDOY; 
			}
			currentDOY++;
		}
		return yearly;
	}

	function getAverages(yearlyData, startYear, endYear) {
		let heat = 0, dry = 0, rain = 0, snow = 0, muggy = 0, mosquito = 0;
		let springFrosts = [], fallFrosts = [];
		let validYears = 0;

		for(let y = startYear; y <= endYear; y++) {
			if(yearlyData[y]) {
				heat += yearlyData[y].heat;
				dry  += yearlyData[y].dry;
				rain += yearlyData[y].rain;
				snow += yearlyData[y].snow;
				muggy += yearlyData[y].muggy || 0;
				mosquito += yearlyData[y].mosquito || 0;
				
				if(yearlyData[y].springFrost > 0) springFrosts.push(yearlyData[y].springFrost);
				if(yearlyData[y].fallFrost > 0) fallFrosts.push(yearlyData[y].fallFrost);
				validYears++;
			}
		}
		if (validYears === 0) validYears = 1;

		return {
			heat: heat / validYears,
			dry: dry / validYears,
			rain: rain / validYears,
			snow: snow / validYears,
			muggy: muggy / validYears,
			mosquito: mosquito / validYears,
			hasFrost: springFrosts.length > 0 || fallFrosts.length > 0,
			springFrost: springFrosts.length ? springFrosts.reduce((a,b)=>a+b,0)/springFrosts.length : null,
			fallFrost: fallFrosts.length ? fallFrosts.reduce((a,b)=>a+b,0)/fallFrosts.length : null
		};
	}

	function calculateRollingAverage(arr, windowSize) {
		return arr.map((_, idx) => {
			const start = Math.max(0, idx - windowSize + 1);
			const slice = arr.slice(start, idx + 1);
			const sum = slice.reduce((a, b) => a + b, 0);
			return sum / slice.length;
		});
	}

	function calculateLinearRegression(xArr, yArr) {
		const n = xArr.length;
		if (n === 0) return [];
		
		let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
		for (let i = 0; i < n; i++) {
			sumX += xArr[i];
			sumY += yArr[i];
			sumXY += xArr[i] * yArr[i];
			sumXX += xArr[i] * xArr[i];
		}
		
		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;
		
		return xArr.map(x => Math.max(0, slope * x + intercept)); 
	}

	function formatDOY(doy) {
		if (!doy) return "None";
		const date = new Date(2023, 0); 
		date.setDate(Math.round(doy));
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function renderCard(id, label1, label2, label3, val1, val2, val3, suffix) {
		const card = document.getElementById(`card-${id}`);
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
		}
	}

	function showError(msg) {
		if(msg) {
			errorDisplay.innerText = msg;
			errorDisplay.classList.remove('hidden');
		} else {
			errorDisplay.classList.add('hidden');
		}
	}
});