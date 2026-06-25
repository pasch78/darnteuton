import { KEYBOARD_LAYOUT } from './config.js';
import { state } from './state.js';

// ==========================================================================
// DOM CACHE & VIEW LAYER
// ==========================================================================

export const ui = {};

// Caches row elements to prevent O(n) DOM thrashing on every keystroke
export const boardCache = []; 

export function cacheDOM() {
	const ids = [
		"start-screen", "game-container", "game-board",
		"virtual-keyboard", "end-early-btn", "timer", "timer-progress-bar", 
		"score-total-display", "score-breakdown-display", "mode-indicator", 
		"game-over-modal", "game-over-heading", "final-score", "final-score-breakdown", 
		"all-solutions-list", "practice-tier-group", "start-loading-btn", 
		"start-buttons-group", "start-daily-btn", "start-practice-tier-group",
		"tutorial-panel", "tutorial-message", "start-tutorial-btn"
	];
	
	ids.forEach(id => {
		ui[id] = document.getElementById(id);
		if (!ui[id]) console.warn(`Missing DOM Element: ${id}`);
	});
}

export function buildKeyboard() {
	const frag = document.createDocumentFragment();
	
	KEYBOARD_LAYOUT.forEach(row => {
		const rowDiv = document.createElement("div");
		rowDiv.className = "keyboard-row";
		
		row.forEach(key => {
			const btn = document.createElement("button");
			btn.className = `key ${key.length > 1 ? 'action-key' : ''}`;
			btn.dataset.key = key;
			btn.textContent = key === "DELETE" ? "⌫" : key;
			btn.setAttribute("aria-label", key === "DELETE" ? "Delete last character" : key);
			rowDiv.appendChild(btn);
		});
		frag.appendChild(rowDiv);
	});
	
	ui["virtual-keyboard"].appendChild(frag);
}

export function generateBoard() {
	const letters = state.targetWord.split("");
	const reverseLetters = [...letters].reverse();
	ui["game-board"].innerHTML = ""; 
	boardCache.length = 0; 

	for (let r = 0; r < 5; r++) {
		const startL = letters[r], endL = reverseLetters[r];
		const pool = state.targetPools[`${startL}${endL}`];
		const isDuplicate = pool.rows[0] !== (r + 1); 
		const isDead = pool.validWords.length === 0;
		
		let rowWrapperClass = "row-wrapper active-row";
		if (isDead) rowWrapperClass = "row-wrapper dead-row";
		else if (pool.isObscureRow) rowWrapperClass += " obscure-row";
		
		const startStyleClass = (isDuplicate || isDead) ? "bg-gray" : `bg-col${r + 1}`;
		const endStyleClass = (isDuplicate || isDead) ? "bg-gray" : `bg-col${5 - r}`;
		
		// Securely build the DOM tree 
		const wrapper = document.createElement("div");
		wrapper.className = rowWrapperClass;
		wrapper.dataset.start = startL;
		wrapper.dataset.end = endL;

		const mainDiv = document.createElement("div");
		mainDiv.className = "row-main";
		
		const tilesDiv = document.createElement("div");
		tilesDiv.className = "row-tiles";
		tilesDiv.id = `row-tiles-${r+1}`;

		const leftTile = document.createElement("div");
		leftTile.className = `tile ${startStyleClass} tile-hidden left-col-tile`;
		leftTile.textContent = startL;
		
		const innerTiles = [];
		tilesDiv.appendChild(leftTile);
		for(let i = 1; i <= 3; i++) {
			const innerTile = document.createElement("div");
			innerTile.className = "tile inner-tile";
			innerTile.dataset.pos = i;
			tilesDiv.appendChild(innerTile);
			innerTiles.push(innerTile);
		}

		const rightTile = document.createElement("div");
		rightTile.className = `tile ${endStyleClass} tile-hidden right-col-tile`;
		rightTile.textContent = endL;
		tilesDiv.appendChild(rightTile);

		const counterDiv = document.createElement("div");
		counterDiv.className = "row-counter";
		counterDiv.id = `counter-row-${r+1}`;
		
		let countDisplay = null;
		if (isDead) {
			const span = document.createElement("span");
			span.className = "found-count";
			counterDiv.appendChild(span);
		} else if (isDuplicate) {
			const span = document.createElement("span");
			span.className = "found-count";
			span.style.fontSize = "0.8em";
			span.style.letterSpacing = "-0.5px";
			span.textContent = `🔗 R${pool.rows[0]}`;
			counterDiv.appendChild(span);
		} else {
			countDisplay = document.createElement("span");
			countDisplay.className = "found-count";
			countDisplay.id = `found-count-${r+1}`;
			countDisplay.textContent = "0";
			counterDiv.appendChild(countDisplay);

			const badge = document.createElement("span");
			badge.className = `point-badge ${pool.baseColorClass}`;
			badge.textContent = `+${pool.pointsPerWord} pts`;
			counterDiv.appendChild(badge);
		}

		mainDiv.appendChild(tilesDiv);
		mainDiv.appendChild(counterDiv);

		const inlineDiv = document.createElement("div");
		inlineDiv.className = "inline-words";
		inlineDiv.id = `inline-words-${r+1}`;

		wrapper.appendChild(mainDiv);
		wrapper.appendChild(inlineDiv);
		ui["game-board"].appendChild(wrapper);

		// Cache the node references directly into memory
		boardCache.push({
			wrapper,
			startTile: leftTile,
			innerTiles,
			endTile: rightTile,
			inlineDiv,
			countDisplay,
			startL,
			endL,
			isActive: !isDead
		});
	}
}

export function updateGuessDisplay() {
	const guess = state.currentGuess;
	const firstL = guess[0] || "";

	// Iterate through memory cache instead of DOM tree
	boardCache.forEach(row => {
		if (!row.isActive) return;

		// Reset state
		row.wrapper.classList.remove('dimmed');
		row.startTile.classList.remove('active-typing');
		row.endTile.style.color = "";
		row.endTile.textContent = row.endL;
		row.endTile.classList.remove('active-typing');

		row.innerTiles.forEach((tile, i) => {
			if (!tile.classList.contains('ghost-hint') || guess.length > i + 1) {
				tile.textContent = tile.dataset.hint || ""; 
			}
			tile.classList.remove('active-typing');
		});

		if (guess.length > 0) {
			if (row.startL !== firstL) {
				row.wrapper.classList.add('dimmed');
			} else {
				row.startTile.classList.add('active-typing');
				
				for (let i = 1; i < 4; i++) {
					if (guess[i]) {
						row.innerTiles[i-1].textContent = guess[i];
						row.innerTiles[i-1].classList.add('active-typing');
					}
				}
				
				if (guess.length === 5) {
					row.endTile.textContent = guess[4];
					row.endTile.classList.add('active-typing');
					if (guess[4] !== row.endL) {
						row.endTile.style.color = "var(--color-error)";
					}
				}
			}
		}
	});
}

export function runIntroAnimation(onComplete) {
	let delay = 0;
	const delayStep = 100;

	boardCache.forEach(row => {
		setTimeout(() => {
			row.startTile.classList.remove('tile-hidden');
			row.startTile.classList.add('tile-pop');
		}, delay);
		delay += delayStep;
	});

	[...boardCache].reverse().forEach(row => {
		setTimeout(() => {
			row.endTile.classList.remove('tile-hidden');
			row.endTile.classList.add('tile-pop');
		}, delay);
		delay += delayStep;
	});

	setTimeout(onComplete, delay + 200); 
}

export function spawnFCT(text, type) {
	const fct = document.createElement("span");
	fct.textContent = text;
	fct.className = `fct fct-${type}`;
	
	const xOffset = (Math.random() - 0.5) * 60;
	fct.style.left = `calc(50% + ${xOffset}px)`;
	fct.style.top = '-20px';

	const activeContainer = document.querySelector(".row-wrapper.active-row:not(.dimmed)") || ui["game-board"];
	if (activeContainer) {
		activeContainer.style.position = 'relative';
		activeContainer.appendChild(fct);
	}
	
	setTimeout(() => fct.remove(), 1000);
}

export function renderInlineCard(guess, rowNum, isObscure) {
	const rowObj = boardCache[rowNum - 1]; 
	if(!rowObj) return;

	const hints = Array.from(rowObj.inlineDiv.children).filter(el => el.textContent.includes(guess));
	hints.forEach(h => h.remove());

	const card = document.createElement("div");
	card.className = `inline-word-card ${isObscure ? 'obscure-word' : ''}`;
	card.textContent = `${guess}${isObscure ? ' ✦' : ''}`;
	
	rowObj.inlineDiv.insertBefore(card, rowObj.inlineDiv.firstChild);
	
	try {
		rowObj.inlineDiv.scrollTo({ left: 0, behavior: 'smooth' });
	} catch (error) {
		rowObj.inlineDiv.scrollLeft = 0; 
	}
}

export function updateScoreUI() {
	ui["score-total-display"].textContent = `Total: ${state.scores.total}`;
	ui["score-breakdown-display"].textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
}

export function updateZenCompletionBar() {
	if (!state.isZenMode || !ui["timer-progress-bar"]) return;
	
	let totalCommonTarget = 0;
	let totalCommonFound = 0;
	
	Object.values(state.targetPools).forEach(pool => {
		totalCommonTarget += pool.commonWords.length;
		totalCommonFound += pool.foundCommonCount;
	});
	
	if (totalCommonTarget > 0) {
		const percentage = (totalCommonFound / totalCommonTarget) * 100;
		ui["timer-progress-bar"].style.width = `${Math.min(percentage, 100)}%`;
	}
}

export function applyHintPhaseDisplay(hintsToDisplay, rows) {
	rows.forEach(rowNum => {
		const rowObj = boardCache[rowNum - 1];
		if(!rowObj) return;
		
		hintsToDisplay.forEach((letter, index) => {
			if (letter) {
				const tile = rowObj.innerTiles[index];
				tile.textContent = letter;
				tile.dataset.hint = letter; 
				tile.classList.add('ghost-hint');
			}
		});
	});
}

export function clearGhostHints() {
	boardCache.forEach(row => {
		row.innerTiles.forEach(tile => {
			if(tile.classList.contains('ghost-hint')) {
				tile.textContent = '';
				tile.dataset.hint = '';
				tile.classList.remove('ghost-hint');
			}
		});
	});
}

export function triggerErrorShake() {
	if (navigator.vibrate) navigator.vibrate(100);
	boardCache.forEach(row => {
		if (row.isActive && !row.wrapper.classList.contains("dimmed")) {
			row.wrapper.classList.add("shake");
			setTimeout(() => row.wrapper.classList.remove("shake"), 400);
		}
	});
}

export function updateFoundCount(rowNum, count) {
	const rowObj = boardCache[rowNum - 1];
	if (rowObj && rowObj.countDisplay) {
		rowObj.countDisplay.textContent = count;
	}
}