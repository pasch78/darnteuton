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

	Chart.defaults.font.family = "'Helvetica Neue', Arial, sans-serif";
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

		// --- 1. LOCAL STORAGE CACHE CHECK ---
		const cacheKey = `darn_climate_${zip}_${birthYear}`;
		const cachedData = localStorage.getItem(cacheKey);

		if (cachedData) {
			try {
				const parsedCache = JSON.parse(cachedData);
				console.log("🚀 Serving climate data from browser local cache!");
				displayDashboard(parsedCache.city, parsedCache.state, parsedCache.yearlyData, birthYear, recentStartYear, recentEndYear);
				return; // Stop execution here, we are done!
			} catch (e) {
				localStorage.removeItem(cacheKey); // Wipe corrupted cache if parsing fails
			}
		}

		try {
			// 2. Geocode Location
			const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
			if (!geoRes.ok) throw new Error("Could not find that Zip Code.");
			const geoData = await geoRes.json();
			const lat = geoData.places[0].latitude;
			const lon = geoData.places[0].longitude;
			const city = geoData.places[0]['place name'];
			const state = geoData.places[0]['state abbreviation'];

			// 3. Fetch Continuous Climate Timeline Data
			const histStart = birthYear - 2;
			const baseApi = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=apparent_temperature_max,temperature_2m_min,precipitation_sum,snowfall_sum&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch`;
			
			const dataRes = await fetch(`${baseApi}&start_date=${histStart}-01-01&end_date=${recentEndYear}-12-31`);
			
			// --- 2. GRACEFUL RATE LIMIT INTERCEPTION ---
			if (dataRes.status === 429) {
				throw new Error("Server catching its breath! Requesting decades of daily records triggers a rate-limit. Please wait 1–2 minutes and click generate again.");
			}

			const rawData = await dataRes.json();
			if (rawData.error || !rawData.daily) throw new Error("Climate data unavailable for this location.");

			// 4. Aggregate into Yearly Performance Structures
			const yearlyData = aggregateYearlyData(rawData.daily);

			// --- 3. SAVE TO LOCAL STORAGE CACHE ---
			const payloadToCache = { city, state, yearlyData };
			localStorage.setItem(cacheKey, JSON.stringify(payloadToCache));

			// 5. Process and Display
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

	// Factored out dashboard population so it can be cleanly fed by the API or the Cache
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
			renderChart("heat", yearsArr, [
				{ label: "Yearly Count", data: heatArr, color: colorHeat, dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}

		// Muggy Night Module
		renderCard("muggy", labelHist, labelRecent, Math.round(histMetrics.muggy), Math.round(recentMetrics.muggy), " nights");
		if(histMetrics.muggy > 0 || recentMetrics.muggy > 0) {
			const trend = calculateLinearRegression(yearsArr, muggyArr);
			renderChart("muggy", yearsArr, [
				{ label: "Yearly Count", data: muggyArr, color: rootStyles.getPropertyValue('--col-muggy').trim(), dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}
		
		// Dry Spell Module
		renderCard("dry", labelHist, labelRecent, Math.round(histMetrics.dry), Math.round(recentMetrics.dry), " days");
		if(histMetrics.dry > 0 || recentMetrics.dry > 0) {
			const trend = calculateLinearRegression(yearsArr, dryArr);
			renderChart("dry", yearsArr, [
				{ label: "Longest Streak", data: dryArr, color: colorDry, dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}

		// Mosquito Module
		renderCard("mosquito", labelHist, labelRecent, Math.round(histMetrics.mosquito), Math.round(recentMetrics.mosquito), " days");
		if(histMetrics.mosquito > 0 || recentMetrics.mosquito > 0) {
			const trend = calculateLinearRegression(yearsArr, mosquitoArr);
			renderChart("mosquito", yearsArr, [
				{ label: "Yearly Count", data: mosquitoArr, color: rootStyles.getPropertyValue('--col-mosquito').trim(), dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}
		
		// Heavy Rain Module
		renderCard("rain", labelHist, labelRecent, Math.round(histMetrics.rain), Math.round(recentMetrics.rain), " days");
		if(histMetrics.rain > 0 || recentMetrics.rain > 0) {
			const trend = calculateLinearRegression(yearsArr, rainArr);
			renderChart("rain", yearsArr, [
				{ label: "Yearly Count", data: rainArr, color: colorMild, dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}

		// Snow Module
		renderCard("snow", labelHist, labelRecent, Math.round(histMetrics.snow), Math.round(recentMetrics.snow), " days");
		if(histMetrics.snow > 0 || recentMetrics.snow > 0) {
			const trend = calculateLinearRegression(yearsArr, snowArr);
			renderChart("snow", yearsArr, [
				{ label: "Yearly Count", data: snowArr, color: colorCold, dashed: false },
				{ label: "Long-term Trend", data: trend, color: colorGray, dashed: true }
			]);
		}

		// Frost Module
		const cardFrost = document.getElementById('card-frost');
		if (histMetrics.hasFrost || recentMetrics.hasFrost) {
			cardFrost.classList.remove('hidden');
			document.getElementById('year1-label-frost').innerText = labelHist;
			document.getElementById('year2-label-frost').innerText = labelRecent;
			document.getElementById('val1-frost').innerHTML = `${formatDOY(histMetrics.springFrost)}<br>to<br>${formatDOY(histMetrics.fallFrost)}`;
			document.getElementById('val2-frost').innerHTML = `${formatDOY(recentMetrics.springFrost)}<br>to<br>${formatDOY(recentMetrics.fallFrost)}`;
		} else {
			cardFrost.classList.add('hidden');
		}

		inputSection.classList.add('hidden');
		dashboard.classList.remove('hidden');
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
			document.getElementById(`year1-label-${id}`).innerText = label1;
			document.getElementById(`year2-label-${id}`).innerText = label2;
			document.getElementById(`val1-${id}`).innerText = val1 + suffix;
			document.getElementById(`val2-${id}`).innerText = val2 + suffix;
		}
	}

	function renderChart(id, labels, datasets) {
		const canvas = document.getElementById(`canvas-${id}`);
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		
		if (chartInstances[id]) {
			chartInstances[id].destroy();
		}

		const chartDatasets = datasets.map(ds => ({
			label: ds.label,
			data: ds.data,
			borderColor: ds.borderColor || ds.color,
			backgroundColor: ds.color,
			borderWidth: ds.dashed ? 1.5 : 2,
			borderDash: ds.dashed ? [5, 5] : [],
			pointRadius: 0,
			pointHoverRadius: ds.dashed ? 0 : 5, 
			tension: ds.dashed ? 0 : 0.2 
		}));

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
						labels: { boxWidth: 12, boxHeight: 2, font: { size: 10 } }
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