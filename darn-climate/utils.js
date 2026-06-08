/**
 * @class ClimateUtils
 * @description Pure utility functions for mathematical conversions, data averaging, and string formatting.
 * Contains no DOM manipulation or application state.
 */
class ClimateUtils {
	
	/**
	 * Converts Celsius to Fahrenheit.
	 * @param {number} c - Temperature in Celsius.
	 * @returns {number} Temperature in Fahrenheit, rounded to the nearest integer.
	 */
	static celsiusToFahrenheit(c) {
		return Math.round((c * 9 / 5) + 32);
	}

	/**
	 * Calculates the average metrics over a specific time window.
	 * @param {Object} yearlyData - The dictionary of yearly historical or future data.
	 * @param {number} startYear - The beginning of the rolling window.
	 * @param {number} endYear - The end of the rolling window.
	 * @returns {Object} An object containing the averaged metrics.
	 */
	static getAverages(yearlyData, startYear, endYear) {
		let totals = { heat: 0, dry: 0, rain: 0, snow: 0, muggy: 0, mosquito: 0 };
		let validYears = 0;

		for (let y = startYear; y <= endYear; y++) {
			if (yearlyData && yearlyData[y]) {
				totals.heat += yearlyData[y].heat || 0;
				totals.dry += yearlyData[y].dry || 0;
				totals.rain += yearlyData[y].rain || 0;
				totals.snow += yearlyData[y].snow || 0;
				totals.muggy += yearlyData[y].muggy || 0;
				totals.mosquito += yearlyData[y].mosquito || 0;
				validYears++;
			}
		}
		
		// Prevent division by zero
		if (validYears === 0) validYears = 1;

		return {
			heat: totals.heat / validYears,
			dry: totals.dry / validYears,
			rain: totals.rain / validYears,
			snow: totals.snow / validYears,
			muggy: totals.muggy / validYears,
			mosquito: totals.mosquito / validYears
		};
	}

	/**
	 * Formats a raw number of days into a human-readable duration string.
	 * @param {number} days - Number of days.
	 * @returns {string} Human-readable time string (e.g., "about 2 weeks").
	 */
	static formatTimeDuration(days) {
		if (days >= 28) {
			const months = Math.round(days / 30);
			return `${months} month${months > 1 ? 's' : ''}`;
		}
		if (days >= 14) return `${Math.round(days / 7)} weeks`;
		if (days >= 7) return `over a week`;
		return `${days} day${days > 1 ? 's' : ''}`;
	}

	/**
	 * Generates the contextual impact subtitle comparing past to future.
	 * Note: This was extracted from `updateImpactSubtitle` and stripped of DOM manipulation.
	 * @param {string} metricId - The ID of the metric (e.g., 'heat', 'dry').
	 * @param {number} pastVal - The historical average.
	 * @param {number} futureVal - The projected future average.
	 * @returns {string} The formatted impact statement, or an empty string if no change.
	 */
	static buildImpactString(metricId, pastVal, futureVal) {
		const delta = Math.round(futureVal - pastVal);
		if (delta === 0) return "";
	
		const isIncrease = delta > 0;
		const absDelta = Math.abs(delta);
		const timeStr = this.formatTimeDuration(absDelta);
	
		const actionText = isIncrease ? "about" : "a loss of about";
		const extraWord = isIncrease ? "extra " : "";
	
		const contexts = {
			"heat": isIncrease 
			? `Expect roughly ${timeStr} more of these exceptionally warm days each year.` 
			: `Expect roughly ${timeStr} fewer of these exceptionally warm days each year.`,
			"muggy": isIncrease 
			? `Expect roughly ${timeStr} more unusually warm nights each year.` 
			: `Expect roughly ${timeStr} fewer unusually warm nights each year.`,
			"dry": isIncrease
			? `The longest stretch of days without rain extends by ${timeStr}.`
			: `The longest stretch of days without rain shortens by ${timeStr}.`,
			
			// Fixed the variable name here:
			"mosquito": isIncrease
			? `The window for ideal mosquito breeding conditions expands by ${timeStr}.`
			: `The window for ideal mosquito breeding conditions shrinks by ${timeStr}.`,
			
			"rain": `Expect ${actionText} ${timeStr} of ${extraWord}extreme heavy rainfall.`,
			"snow": `Expect ${actionText} ${timeStr} of fresh snow.` 
		};
	
		return contexts[metricId] || "";
	}
}