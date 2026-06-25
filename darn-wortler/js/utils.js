// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

/**
 * Randomly shuffles the elements of an array using the Fisher-Yates algorithm.
 * Returns a new array to avoid mutating the original input.
 * * @param {Array} array - The array to shuffle.
 * @returns {Array} - The newly shuffled array.
 */
export const shuffleArray = (array) => {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
};