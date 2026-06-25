import { GAME_DURATION } from './config.js';
import { state } from './state.js';
import { shuffleArray } from './utils.js';
import { 
	ui, generateBoard, runIntroAnimation, updateGuessDisplay, 
	spawnFCT, renderInlineCard, updateScoreUI, updateZenCompletionBar, 
	applyHintPhaseDisplay, clearGhostHints, triggerErrorShake, updateFoundCount
} from './dom.js';

// ==========================================================================
// CORE GAME LOGIC & CONTROLLER
// ==========================================================================

export const getDailySeedWord = () => {
	const easyPool = state.manifest.easy;
	if (!easyPool || easyPool.length === 0) throw new Error("Manifest easy pool is empty.");
	
	const idStr = "DW" + state.daily.currentID.toString();
	let hash = 0;
	
	for (let i = 0; i < idStr.length; i++) {
		hash = Math.imul(31, hash) + idStr.charCodeAt(i) | 0;
	}

	const randomizedIndex = Math.abs(hash) % easyPool.length;
	const masterIndex = easyPool[randomizedIndex];
	return state.expandedWordsList[masterIndex];
};

export function setupGameMode() {
	const lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
	if (lastPlayedDaily == state.daily.currentID) {
		ui["start-daily-btn"].textContent = "DAILY COMPLETED";
		ui["start-daily-btn"].disabled = true;
		ui["start-daily-btn"].classList.replace("primary-btn", "secondary-btn");
	}
}

export function initDailyMode() {
	state.daily.isMode = true;
	state.isZenMode = false; 
	ui["mode-indicator"].textContent = "★ Daily";
	ui["mode-indicator"].className = "mode-daily";
	state.targetWord = getDailySeedWord();
	startGame();
}

export function initPracticeMode(tier, sourceMenu = 'start') {
	state.daily.isMode = false;
	
	const modeRadios = document.getElementsByName(sourceMenu === 'start' ? 'practiceModeStart' : 'practiceModeEnd');
	for (let radio of modeRadios) {
		if (radio.checked) {
			state.isZenMode = (radio.value === 'zen');
			break;
		}
	}

	const modeText = state.isZenMode ? "Zen" : "Timed";
	ui["mode-indicator"].textContent = `${modeText}: ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
	ui["mode-indicator"].className = "mode-practice";
	
	const tierPool = state.manifest[tier];
	const masterIndex = tierPool[Math.floor(Math.random() * tierPool.length)];
	state.targetWord = state.expandedWordsList[masterIndex];
	startGame();
}

export function initTutorialMode() {
	state.daily.isMode = false;
	state.isZenMode = true; 
	state.tutorial.isActive = true;
	state.tutorial.step = 1;
	
	ui["mode-indicator"].textContent = "Tutorial";
	ui["mode-indicator"].className = "mode-tutorial";
	
	state.targetWord = "SHARE"; 
	startGame();
}

export function advanceTutorial() {
	const panel = ui["tutorial-panel"];
	const msg = ui["tutorial-message"];
	
	if (state.tutorial.step === 1) {
		panel.classList.remove("hidden");
		document.body.classList.add("tutorial-active");
		
		const firstRow = document.querySelector('.row-wrapper[data-start="S"][data-end="E"]');
		if (firstRow) firstRow.classList.add("spotlight");
		
		msg.textContent = "Welcome! The outer letters are locked. Type S-P-I-C-E to find a valid word.";
		
	} else if (state.tutorial.step === 2) {
		const firstRow = document.querySelector('.row-wrapper[data-start="S"][data-end="E"]');
		if (firstRow) firstRow.classList.remove("spotlight");
		
		const fifthRow = document.querySelector('.row-wrapper[data-start="E"][data-end="S"]');
		if (fifthRow) fifthRow.classList.add("spotlight");
		
		msg.textContent = "Nice! Correct guesses reveal hints (faded letters) in other rows. Type E-P-I-C-S using the new hints.";
		
	} else if (state.tutorial.step === 3) {
		document.body.classList.remove("tutorial-active");
		const fifthRow = document.querySelector('.row-wrapper[data-start="E"][data-end="S"]');
		if (fifthRow) fifthRow.classList.remove("spotlight");
		
		msg.textContent = "Great job! Row 1 now has more hints. Try guessing SPINE, SPIRE, or something new like SLATE. Finish the puzzle, or click 'End Game' below.";
		
		state.tutorial.isActive = false; 
		localStorage.setItem("hasSeenTutorial", "true");
		
		setTimeout(() => {
			panel.classList.add("hidden");
		}, 12000); 
	}
}

export function prepareTargetPools() {
	const letters = state.targetWord.split("");
	const reverseLetters = [...letters].reverse();
	state.targetPools = {};

	const cachedValidWords = Array.from(state.validWordsSet);

	for (let r = 0; r < 5; r++) {
		const startL = letters[r], endL = reverseLetters[r];
		const key = `${startL}${endL}`; 
		
		if (!state.targetPools[key]) {
			const validWords = cachedValidWords.filter(w => w.startsWith(startL) && w.endsWith(endL));
			const commonWords = validWords.filter(w => state.bonusBarrierSet.has(w));
			
			state.targetPools[key] = {
				validWords: validWords,
				commonWords: commonWords,
				foundWords: [], 
				foundCommonCount: 0,
				rows: [r + 1], 
				baseColorClass: "", 
				pointsPerWord: 0,
				isObscureRow: false
			};
		} else { 
			state.targetPools[key].rows.push(r + 1); 
		}
	}

	Object.values(state.targetPools).forEach(pool => {
		if (pool.validWords.length === 0) return; 

		let basePoints = 0;

		if (pool.commonWords.length === 0) {
			pool.isObscureRow = true;
			const obscureWordsLength = pool.validWords.length;
			basePoints = 300 + Math.round(250 / obscureWordsLength);
			pool.pointsPerWord = basePoints * pool.rows.length;
			pool.baseColorClass = "point-badge-bonus"; 
		} else {
			basePoints = 20 + Math.round(250 / pool.commonWords.length);
			pool.pointsPerWord = basePoints * pool.rows.length;
			
			if (basePoints <= 35) pool.baseColorClass = "point-badge-low"; 
			else if (basePoints >= 60) pool.baseColorClass = "point-badge-high"; 
			else pool.baseColorClass = "point-badge-medium"; 
		}
	});
}

export function processInput(key) {
	if (!state.active) return;
	
	if (state.tutorial.isActive) {
		let expectedWord = "";
		if (state.tutorial.step === 1) expectedWord = "SPICE";
		else if (state.tutorial.step === 2) expectedWord = "EPICS";
		
		if (expectedWord) {
			if (key === "ENTER") {
				if (state.currentGuess !== expectedWord) return; 
			} else if (key !== "DELETE" && key !== "BACKSPACE") {
				if (key !== expectedWord[state.currentGuess.length]) return; 
			}
		}
	}
	
	if (key === "ENTER") {
		submitGuess();
	} else if (key === "DELETE" || key === "BACKSPACE") {
		state.currentGuess = state.currentGuess.slice(0, -1);
		updateGuessDisplay();
	} else if (/^[A-Z]$/.test(key) && state.currentGuess.length < 5) {
		state.currentGuess += key;
		updateGuessDisplay();
	}
}

export function submitGuess() {
	if (state.currentGuess.length !== 5) return;
	
	const guess = state.currentGuess;
	const pool = state.targetPools[`${guess[0]}${guess[4]}`];

	const triggerError = (msg) => {
		spawnFCT(msg, "error");
		triggerErrorShake();
		state.currentGuess = "";
		updateGuessDisplay();
	};

	if (!pool || pool.validWords.length === 0) return triggerError("Check letters");
	if (pool.foundWords.includes(guess)) return triggerError("Already found");
	if (!pool.validWords.includes(guess)) {
		resetStreak();
		return triggerError("Not in list");
	}

	handleValidGuess(guess, pool);
}

export function handleValidGuess(guess, pool) {
	if (!state.isZenMode) manageStreak();
	
	pool.foundWords.push(guess);
	state.scores.base += pool.pointsPerWord;

	const isObscure = !state.bonusBarrierSet.has(guess); 
	
	if (!isObscure) pool.foundCommonCount++;
	
	spawnFCT(`+${pool.pointsPerWord}`, "base");
	
	if (isObscure) {
		state.scores.bonus += 50; 
		setTimeout(() => spawnFCT("+50 ✦", "obscure"), 200); 
	}
	
	if (state.streak.isActive && !state.isZenMode) {
		state.scores.bonus += 25;
		setTimeout(() => spawnFCT("+25 🔥", "streak"), 400);
	}

	state.scores.total = state.scores.base + state.scores.bonus;
	updateScoreUI();
	updateZenCompletionBar(); 
	
	updateFoundCount(pool.rows[0], pool.foundWords.length);
	renderInlineCard(guess, pool.rows[0], isObscure);
	triggerCascadeReveal(guess);
	
	if (state.tutorial.isActive) {
		if (state.tutorial.step === 1 && guess === "SPICE") {
			state.tutorial.step = 2;
			advanceTutorial();
		} else if (state.tutorial.step === 2 && guess === "EPICS") {
			state.tutorial.step = 3;
			advanceTutorial();
		}
	}

	state.currentGuess = "";
	updateGuessDisplay();
}

export function manageStreak() {
	const now = Date.now();
	if (!state.streak.isActive) {
		if (state.streak.lastWordTime > 0 && (now - state.streak.lastWordTime) <= 15000) {
			state.streak.count++;
		} else {
			state.streak.count = 1;
		}
	}
	state.streak.lastWordTime = now;

	if (state.streak.count >= 3 && !state.streak.isActive) {
		state.streak.isActive = true; 
		ui["game-board"].classList.add("streak-active");
		spawnFCT("🔥 STREAK ACTIVE", "streak");
	}
}

export function resetStreak() {
	state.streak.count = 0; 
	state.streak.isActive = false;
	if(ui["game-board"]) ui["game-board"].classList.remove("streak-active");
}

export const runHintPhase = (pool, wordList, masterKey) => {
	if (wordList.length === 0) return 0;

	let workingPool = shuffleArray(wordList);
	let hintsGenerated = 0;
	const hintsToDisplay = [null, null, null]; 

	for (let i = 0; i < 3; i++) {
		const targetLetter = masterKey[i];
		const strIndex = i + 1; 
		const matches = workingPool.filter(w => w[strIndex] === targetLetter);

		if (matches.length > 0) {
			workingPool = matches;
			hintsToDisplay[i] = targetLetter;
			hintsGenerated++;
		}
	}

	if (hintsGenerated > 0) {
		applyHintPhaseDisplay(hintsToDisplay, pool.rows);
	}
	return hintsGenerated;
};

export const triggerCascadeReveal = (guess) => {
	clearGhostHints();
	
	const masterKey = [guess[1], guess[2], guess[3]];   
	
	Object.values(state.targetPools).forEach(pool => {
		if (pool.validWords.length === pool.foundWords.length) return;
		const availableWords = pool.validWords.filter(w => !pool.foundWords.includes(w));
		const coreWords = availableWords.filter(w => state.expandedWordsList.includes(w));
		
		let hintsGenerated = runHintPhase(pool, coreWords, masterKey);

		if (hintsGenerated === 0) {
			const obscureWords = availableWords.filter(w => !state.expandedWordsList.includes(w));
			runHintPhase(pool, obscureWords, masterKey);
		}
	});
};

export function startGame() {
	ui["start-screen"].close(); 
	ui["game-container"].classList.remove("hidden");
	
	prepareTargetPools();
	generateBoard();
	state.active = false;
	
	// --- BUG FIX: Pre-set timer text before the animation blocks ---
	if (state.isZenMode) {
		ui["timer"].textContent = "00:00";
	} else {
		const mins = String(Math.floor(GAME_DURATION / 60)).padStart(2, '0');
		const secs = String(GAME_DURATION % 60).padStart(2, '0');
		ui["timer"].textContent = `${mins}:${secs}`;
	}
	// --------------------------------------------------------------
	
	runIntroAnimation(() => {
		startTimer();
		state.active = true;
		updateGuessDisplay();
		
		if (state.tutorial.isActive) {
			advanceTutorial();
		}
	});
}

export function resetGame(selectedTier) {
	state.scores = { base: 0, bonus: 0, total: 0 };
	state.currentGuess = "";
	ui["timer"].classList.remove("danger");
	if(ui["timer-progress-bar"]) ui["timer-progress-bar"].classList.remove("danger");
	
	state.scores.total = 0;
	updateScoreUI();
	resetStreak();
	
	ui["game-over-modal"].close(); 
	ui["end-early-btn"].classList.remove("hidden");
	window.scrollTo({ top: 0, behavior: 'smooth' });

	initPracticeMode(selectedTier, 'end');
}

export function startTimer() {
	clearInterval(state.timer.interval);
	state.timer.startTime = Date.now();
	state.timer.endTime = state.timer.startTime + (GAME_DURATION * 1000);
	
	if (ui["timer-progress-bar"]) {
		ui["timer-progress-bar"].style.width = state.isZenMode ? "0%" : "100%";
	}

	const tick = () => {
		if (state.isZenMode) {
			const elapsedSeconds = Math.floor((Date.now() - state.timer.startTime) / 1000);
			ui["timer"].textContent = `${String(Math.floor(elapsedSeconds/60)).padStart(2,'0')}:${String(elapsedSeconds%60).padStart(2,'0')}`;
		} else {
			const left = Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000));
			
			ui["timer"].textContent = `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
			
			const percentage = (left / GAME_DURATION) * 100;
			if (ui["timer-progress-bar"]) ui["timer-progress-bar"].style.width = `${percentage}%`;

			const inDanger = left <= 30 && left > 0;
			ui["timer"].classList.toggle("danger", inDanger);
			if (ui["timer-progress-bar"]) ui["timer-progress-bar"].classList.toggle("danger", inDanger);
			
			if (state.streak.isActive && Date.now() - state.streak.lastWordTime > 20000) resetStreak();
			else if (!state.streak.isActive && state.streak.count > 0 && Date.now() - state.streak.lastWordTime > 15000) resetStreak();

			if (left <= 0) endGame();
		}
	};
	
	tick();
	state.timer.interval = setInterval(tick, 500);
}

export function endGame() {
	clearInterval(state.timer.interval);
	state.active = false;
	resetStreak();
	ui["end-early-btn"].classList.add("hidden");
	
	ui["game-over-heading"].textContent = state.isZenMode ? "Session Complete!" : "Time's Up!";
	
	if (state.daily.isMode) localStorage.setItem("darnWortlerLastDaily", state.daily.currentID);
	
	ui["final-score"].textContent = `Total Score: ${state.scores.total}`;
	ui["final-score-breakdown"].textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
	
	// Securely build the all-solutions list without innerHTML string parsing
	ui["all-solutions-list"].innerHTML = "";
	Object.values(state.targetPools).forEach(p => {
		p.validWords.forEach(w => {
			const found = p.foundWords.includes(w);
			const obscure = !state.bonusBarrierSet.has(w);
			
			const card = document.createElement("div");
			card.className = "word-card";
			if (found) card.classList.add("strikethrough");
			if (obscure) card.classList.add("obscure-word");
			
			card.textContent = `${w}${obscure ? ' ✦' : ''}`;
			ui["all-solutions-list"].appendChild(card);
		});
	});
	
	ui["game-over-modal"].showModal();
}