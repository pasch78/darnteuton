import { GAME_DURATION } from './config.js';

// ==========================================================================
// GLOBAL APPLICATION STATE
// ==========================================================================

export const state = {
	targetWord: "",
	currentGuess: "", 
	expandedWordsList: [],
	manifest: { easy: [], medium: [], hard: [] },
	validWordsSet: new Set(),
	bonusBarrierSet: new Set(),
	targetPools: {},
	scores: { base: 0, bonus: 0, total: 0 },
	timer: { interval: null, startTime: 0, endTime: 0, duration: GAME_DURATION },
	active: false, 
	daily: {
		isMode: false,
		// Generates a consistent daily ID based on UTC midnight
		currentID: Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 86400000)
	},
	streak: { count: 0, isActive: false, lastWordTime: 0 },
	isZenMode: false,
	tutorial: { isActive: false, step: 0 }
};