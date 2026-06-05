document.addEventListener('DOMContentLoaded', () => {
	const analyzeBtn = document.getElementById('analyze-btn');
	const resetBtn = document.getElementById('reset-btn');
	const errorDisplay = document.getElementById('error-display');
	const dashboard = document.getElementById('dashboard');
	const inputSection = document.getElementById('input-section');
	
	let chartInstances = {};

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

	analyzeBtn.addEventListener('click', async () => {
		const zip = document.getElementById('zip-code').value.trim();
		const birthYear = parseInt(document.getElementById('birth-year').value.trim());
		const currentYear = new Date().getFullYear();
		const recentEndYear = currentYear - 1; 
		const recentStartYear = currentYear - 5; 

		if (!/^\d{5}$/.test(zip)) return showError("Please enter a valid 5-digit US Zip Code.");
		if (!birthYear || birthYear < 1945 || birthYear > (currentYear - 6)) {
			return showError(`Please enter a birth year between 1945 and ${currentYear - 6}.`);
		}

		showError("");
		analyzeBtn.disabled = true;
		analyzeBtn.innerText = "Crunching decades of data...";

		const cacheKey = `darn_climate_${zip}_${birthYear}`;
		const cachedData = localStorage.getItem(cacheKey);

		if (cachedData) {
			try {
				const parsedCache = JSON.parse(cachedData);
				console.log("🚀 Serving climate data from browser local cache!");
				displayDashboard(parsedCache.city, parsedCache.state, parsedCache.yearlyData, birthYear, recentStartYear, recentEndYear);
				return; 
			} catch (e) {
				localStorage.removeItem(cacheKey); 
			}
		}

		try {
			// 1. Geocode Location
			const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
			if (!geoRes.ok) throw new Error("Could not find that Zip Code.");
			const geoData = await geoRes.json();
			const lat = geoData.places[0].latitude;
			const lon = geoData.places[0].longitude;
			const city = geoData.places[0]['place name'];
			const state = geoData.places[0]['state abbreviation'];

			// 2. Fetch Continuous Climate Timeline Data
			const histStart = birthYear - 2;
			const baseApi = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=apparent_temperature_max,temperature_2m_min,precipitation_sum,snowfall_sum&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch`;
			
			const dataRes = await fetch(`${baseApi}&start_date=${histStart}-01-01&end_date=${recentEndYear}-12-31`);
			
			if (dataRes.status === 429) {
				throw new Error("Server catching its breath! Requesting decades of daily records triggers a rate-limit. Please wait 1–2 minutes and click generate again.");
			}

			const rawData = await dataRes.json();
			if (rawData.error || !rawData.daily) throw new Error("Climate data unavailable for this location.");

			// 3. Aggregate into Yearly Performance Structures
			const yearlyData = aggregateYearlyData(rawData.daily);

			// 4. Save to Local Storage Cache
			const payloadToCache = { city, state, yearlyData };
			localStorage.setItem(cacheKey, JSON.stringify(payloadToCache));

			// 5. Process and Display Dashboard Content
			displayDashboard(city, state, yearlyData, birthYear, recentStartYear, recentEndYear);

		} catch (err) {
			showError(err.message || "An error occurred fetching data.");
		} finally {
			analyzeBtn.disabled = false;
			analyzeBtn.innerText = "Generate Baseline";
		}
	});

	resetBtn.addEventListener('click', () => {
		dashboard.classList.add('hidden');
		inputSection.classList.remove('hidden');
	});

	function displayDashboard(city, state, yearlyData, birthYear, recentStartYear, recentEndYear) {
		const histStart = birthYear - 2;
		document.getElementById('location-display').innerText = `Data for ${city}, ${state}`;

		const histMetrics = getAverages(yearlyData, histStart, histStart + 4);
		const recentMetrics = getAverages(yearlyData, recentStartYear, recentEndYear);

		const labelHist = `~${birthYear}`;
		const labelRecent = `~${recentEndYear - 2}`; 
		
		const yearsArr = Object.keys(yearlyData).map(Number);
		const heatArr = yearsArr.map(y => yearlyData[y].heat);
		const muggyArr = yearsArr.map(y => yearlyData[y].muggy);
		const dryArr  = yearsArr.map(y => yearlyData[y].dry);
		const mosquitoArr = yearsArr.map(y => yearlyData[y].mosquito);
		const rainArr = yearsArr.map(y => yearlyData[y].rain);
		const snowArr = yearsArr.map(y => yearlyData[y].snow);
		
		// Heat Module
		renderCard("heat", labelHist, labelRecent, Math.round(histMetrics.heat), Math.round(recentMetrics.heat), " days");
		if(histMetrics.heat > 0 || recentMetrics.heat > 0) {
			const trend = calculateLinearRegression(yearsArr, heatArr);
			const rolling = calculateRollingAverage(heatArr, 5);
			renderChart("heat", yearsArr, [
				{ label: "Annual Data (Weather)", data: heatArr, color: colorHeat, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorHeat, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}

		// Muggy Night Module
		renderCard("muggy", labelHist, labelRecent, Math.round(histMetrics.muggy), Math.round(recentMetrics.muggy), " nights");
		if(histMetrics.muggy > 0 || recentMetrics.muggy > 0) {
			const trend = calculateLinearRegression(yearsArr, muggyArr);
			const rolling = calculateRollingAverage(muggyArr, 5);
			renderChart("muggy", yearsArr, [
				{ label: "Annual Data (Weather)", data: muggyArr, color: colorMuggy, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorMuggy, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}
		
		// Dry Spell Module
		renderCard("dry", labelHist, labelRecent, Math.round(histMetrics.dry), Math.round(recentMetrics.dry), " days");
		if(histMetrics.dry > 0 || recentMetrics.dry > 0) {
			const trend = calculateLinearRegression(yearsArr, dryArr);
			const rolling = calculateRollingAverage(dryArr, 5);
			renderChart("dry", yearsArr, [
				{ label: "Annual Data (Weather)", data: dryArr, color: colorDry, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorDry, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}

		// Mosquito Module
		renderCard("mosquito", labelHist, labelRecent, Math.round(histMetrics.mosquito), Math.round(recentMetrics.mosquito), " days");
		if(histMetrics.mosquito > 0 || recentMetrics.mosquito > 0) {
			const trend = calculateLinearRegression(yearsArr, mosquitoArr);
			const rolling = calculateRollingAverage(mosquitoArr, 5);
			renderChart("mosquito", yearsArr, [
				{ label: "Annual Data (Weather)", data: mosquitoArr, color: colorMosquito, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorMosquito, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}
		
		// Heavy Rain Module
		renderCard("rain", labelHist, labelRecent, Math.round(histMetrics.rain), Math.round(recentMetrics.rain), " days");
		if(histMetrics.rain > 0 || recentMetrics.rain > 0) {
			const trend = calculateLinearRegression(yearsArr, rainArr);
			const rolling = calculateRollingAverage(rainArr, 5);
			renderChart("rain", yearsArr, [
				{ label: "Annual Data (Weather)", data: rainArr, color: colorMild, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorMild, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}

		// Snow Module
		renderCard("snow", labelHist, labelRecent, Math.round(histMetrics.snow), Math.round(recentMetrics.snow), " days");
		if(histMetrics.snow > 0 || recentMetrics.snow > 0) {
			const trend = calculateLinearRegression(yearsArr, snowArr);
			const rolling = calculateRollingAverage(snowArr, 5);
			renderChart("snow", yearsArr, [
				{ label: "Annual Data (Weather)", data: snowArr, color: colorCold, type: 'dots' },
				{ label: "5-Year Average (Climate)", data: rolling, color: colorCold, type: 'rolling' },
				{ label: "Long-term Trend", data: trend, color: colorGray, type: 'trend' }
			]);
		}

		// --- OVERHAULED OPTION 1: SLIDER TIMELINE IMPLEMENTATION ---
		const cardFrost = document.getElementById('card-frost');
		if (histMetrics.hasFrost || recentMetrics.hasFrost) {
			cardFrost.classList.remove('hidden');
			
			// Inject Title Rows
			document.getElementById('timeline-label-hist').innerText = labelHist;
			document.getElementById('timeline-label-recent').innerText = labelRecent;

			// Calculate Total Frost-Free Days
			const durationHist = Math.round(recentMetrics.fallFrost) - Math.round(recentMetrics.springFrost); // Fall DOY minus Spring DOY
			const durationRecent = Math.round(recentMetrics.fallFrost) - Math.round(recentMetrics.springFrost);
			
			// Adjusting fallback calculation logic if entries lack distinct frost occurrences (e.g. tropical climates)
			const getDurationDays = (spring, fall) => (spring && fall) ? Math.round(fall - spring) : 365;
			document.getElementById('frost-duration-hist').innerText = `${getDurationDays(histMetrics.springFrost, histMetrics.fallFrost)} growing days`;
			document.getElementById('frost-duration-recent').innerText = `${getDurationDays(recentMetrics.springFrost, recentMetrics.fallFrost)} growing days`;

			// Render Split Dates Above Slider
			document.getElementById('hist-date-start').innerText = formatDOY(histMetrics.springFrost);
			document.getElementById('hist-date-end').innerText = formatDOY(histMetrics.fallFrost);
			document.getElementById('recent-date-start').innerText = formatDOY(recentMetrics.springFrost);
			document.getElementById('recent-date-end').innerText = formatDOY(recentMetrics.fallFrost);

			// Render Percentage Segment Width Layouts Natively
			applyTrackSegments("hist", histMetrics.springFrost, histMetrics.fallFrost);
			applyTrackSegments("recent", recentMetrics.springFrost, recentMetrics.fallFrost);
		} else {
			cardFrost.classList.add('hidden');
		}

		inputSection.classList.add('hidden');
		dashboard.classList.remove('hidden');
	}

	function applyTrackSegments(prefix, springDOY, fallDOY) {
		const totalDays = 365;
		let leftPct = 0, midPct = 100, rightPct = 0;

		if (springDOY && fallDOY) {
			leftPct = (springDOY / totalDays) * 100;
			rightPct = ((totalDays - fallDOY) / totalDays) * 100;
			midPct = 100 - leftPct - rightPct;
		} else if (!springDOY && !fallDOY) {
			// Zero frost days discovered all year
			leftPct = 0;
			midPct = 100;
			rightPct = 0;
		}

		document.getElementById(`${prefix}-seg-left`).style.width = `${leftPct}%`;
		document.getElementById(`${prefix}-seg-mid`).style.width = `${midPct}%`;
		document.getElementById(`${prefix}-seg-right`).style.width = `${rightPct}%`;
	}

	function aggregateYearlyData(daily) {
		const yearly = {};
		let currentDOY = 1;
		let currentDryStreak = 0;

		for (let i = 0; i < daily.time.length; i++) {
			const dateStr = daily.time[i];
			if (!dateStr || dateStr.length < 4) continue; 
			
			const year = parseInt(dateStr.substring(0, 4));
			
			if (!yearly[year]) {
				yearly[year] = { heat: 0, dry: 0, rain: 0, snow: 0, springFrost: 0, fallFrost: 0, muggy: 0, mosquito: 0 };
				currentDOY = 1;
				currentDryStreak = 0;
			}

			const appMaxT = daily.apparent_temperature_max[i];
			const minT = daily.temperature_2m_min[i];
			const precip = daily.precipitation_sum[i];
			const snow = daily.snowfall_sum[i]; 

			if (appMaxT !== null && appMaxT >= 90) yearly[year].heat++;
			if (precip !== null && precip > 1.0) yearly[year].rain++;
			if (snow !== null && snow >= 1.0) yearly[year].snow++;

			if (precip !== null && precip < 0.01) {
				currentDryStreak++;
				if (currentDryStreak > yearly[year].dry) yearly[year].dry = currentDryStreak;
			} else if (precip !== null && precip >= 0.01) {
				currentDryStreak = 0;
			}

			if (minT !== null && minT >= 70) yearly[year].muggy++;

			if (appMaxT !== null && appMaxT >= 70 && appMaxT <= 95) {
				let rainedRecently = false;
				for (let lookback = 1; lookback <= 3; lookback++) {
					const historicalIdx = i - lookback;
					if (historicalIdx >= 0 && daily.precipitation_sum[historicalIdx] !== null && daily.precipitation_sum[historicalIdx] >= 0.01) {
						rainedRecently = true;
						break;
					}
				}
				if (rainedRecently) yearly[year].mosquito++;
			}

			if (minT !== null && minT < 32) {
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

	function renderCard(id, label1, label2, val1, val2, suffix) {
		const card = document.getElementById(`card-${id}`);
		if (val1 === 0 && val2 === 0) {
			card.classList.add('hidden'); 
		} else {
			card.classList.remove('hidden');
			document.getElementById(`val1-${id}`).innerText = val1 + suffix;
			document.getElementById(`val2-${id}`).innerText = val2 + suffix;
			
			// Safeguard logic mapping matching V2 structure
			const year1El = document.getElementById(`year1-label-${id}`);
			const year2El = document.getElementById(`year2-label-${id}`);
			if(year1El) year1El.innerText = label1;
			if(year2El) year2El.innerText = label2;
		}
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
				tension: 0.2
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
			}

			return baseConfig;
		});

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
						labels: { 
							boxWidth: 12, 
							boxHeight: 2, 
							font: { size: 10 },
							usePointStyle: true 
						}
					},
					tooltip: { backgroundColor: 'rgba(62, 49, 40, 0.9)' }
				},
				scales: {
					x: {
						grid: { display: false },
						ticks: { maxTicksLimit: 6, font: { size: 10 } }
					},
					y: {
						grid: { color: colorBorder },
						beginAtZero: true,
						ticks: { font: { size: 10 } }
					}
				}
			}
		});
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