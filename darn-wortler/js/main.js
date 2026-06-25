import { state } from './state.js';
import { loadDictionaries } from './api.js';
import { cacheDOM, buildKeyboard, ui } from './dom.js';
import { 
	processInput, endGame, initDailyMode, initPracticeMode, 
	resetGame, initTutorialMode, setupGameMode 
} from './game.js';

// ==========================================================================
// BOOTSTRAP & EVENT ROUTING
// ==========================================================================

window.onerror = function (msg, url, line) {
	const btn = document.getElementById("start-loading-btn");
	if (btn) {
		btn.textContent = `Crash: ${msg} (Line ${line})`;
		btn.style.backgroundColor = "var(--color-error)"; 
	}
};

function attachEventListeners() {
	ui["virtual-keyboard"].addEventListener("click", (e) => {
		const keyBtn = e.target.closest('.key');
		if (keyBtn) processInput(keyBtn.dataset.key);
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Backspace" || e.key === "Delete" || e.key === " ") {
			e.preventDefault(); 
		}
		if (!e.ctrlKey && !e.metaKey && !e.altKey) {
			processInput(e.key.toUpperCase());
		}
	});

	ui["end-early-btn"].addEventListener("click", endGame);
	ui["start-daily-btn"].addEventListener("click", initDailyMode);
	
	ui["start-practice-tier-group"].addEventListener("click", (e) => {
		const tierBtn = e.target.closest('.tier-btn');
		if (tierBtn) initPracticeMode(tierBtn.dataset.tier, 'start');
	});

	ui["practice-tier-group"].addEventListener("click", (e) => {
		const tierBtn = e.target.closest('.tier-btn');
		if (tierBtn) resetGame(tierBtn.dataset.tier);
	});
	
	if (ui["start-tutorial-btn"]) {
		ui["start-tutorial-btn"].addEventListener("click", initTutorialMode);
	}
}

async function init() {
	cacheDOM();
	buildKeyboard();
	attachEventListeners();
	
	const result = await loadDictionaries();

	if (result.success) {
		const urlParams = new URLSearchParams(window.location.search);
		const needsTutorial = !localStorage.getItem("hasSeenTutorial") || urlParams.get('tutorial') === 'true';

		ui["mode-indicator"].classList.remove("hidden");
		ui["start-loading-btn"].classList.add("hidden");
		ui["start-buttons-group"].classList.remove("hidden");

		if (needsTutorial) {
			initTutorialMode();
		} else {
			setupGameMode();
		}
	} else {
		ui["start-loading-btn"].textContent = "Data Error. Refresh to retry.";
		ui["start-loading-btn"].style.backgroundColor = "var(--color-error)";
	}
}

document.addEventListener("DOMContentLoaded", init);