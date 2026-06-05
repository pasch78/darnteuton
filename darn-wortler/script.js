'use strict';

window.onerror = function (msg, url, line) {
    const btn = document.getElementById("start-game-btn");
    if (btn) {
        btn.textContent = `Crash: ${msg} (Line ${line})`;
        btn.style.backgroundColor = "var(--col5)";
    }
};

const DarnWortler = (function () {
    const config = {
        commonDictURL: "./common.txt",
        fullDictURL: "./full.txt",
        expandedDictURL: "./expanded.txt",
        gameDuration: 300,
        keyboardLayout: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE']
        ]
    };

    const state = {
        targetWord: "",
        currentGuess: "", 
        commonWordsList: [],
        validWordsSet: new Set(),
        bonusBarrierSet: new Set(),
        targetPools: {},
        scores: { base: 0, bonus: 0, total: 0 },
        timer: { interval: null, endTime: 0, duration: config.gameDuration },
        active: false,
        daily: {
            isMode: false,
            currentID: Math.floor(new Date().setUTCHours(0,0,0,0) / 86400000)
        },
        streak: { count: 0, isActive: false, lastWordTime: 0 },
        hints: { remaining: 3 }
    };

    const ui = {};

    function init() {
        cacheDOM();
        buildKeyboard();
        attachEventListeners();
        loadDictionaries();
    }

    function cacheDOM() {
        const ids = [
            "start-screen", "start-game-btn", "game-container", "game-board",
            "virtual-keyboard", "end-early-btn", "timer", "score-total-display", 
            "score-breakdown-display", "mode-indicator", "game-over-section", 
            "final-score", "final-score-breakdown", "all-solutions-list", "play-again-btn"
        ];
        
        ids.forEach(id => {
            ui[id] = document.getElementById(id);
            if (!ui[id]) console.warn(`Missing DOM Element: ${id}`);
        });
    }

    async function loadDictionaries() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            
            const fetchText = async (url) => {
                const res = await fetch(url + cacheBuster).catch(() => ({ ok: false }));
                return res.ok ? await res.text() : "";
            };

            const [textCommon, textFull, textExpanded] = await Promise.all([
                fetchText(config.commonDictURL),
                fetchText(config.fullDictURL),
                fetchText(config.expandedDictURL)
            ]);

            if (!textCommon || !textFull) throw new Error("Missing required dictionaries.");

            const parseWords = (text) => text.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

            state.commonWordsList = parseWords(textCommon);
            const fullArray = parseWords(textFull);
            const expandedArray = parseWords(textExpanded);

            state.validWordsSet = new Set([...state.commonWordsList, ...fullArray]);
            state.bonusBarrierSet = new Set([...state.commonWordsList, ...expandedArray]);

            setupGameMode();
            ui["mode-indicator"].classList.remove("hidden");
            ui["start-game-btn"].disabled = false;

        } catch (error) {
            console.error("Dictionary Load Failed:", error);
            ui["start-game-btn"].textContent = "Data Error. Refresh to retry.";
            ui["start-game-btn"].style.backgroundColor = "var(--col5)";
        }
    }

    function setupGameMode() {
        const lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
        
        if (lastPlayedDaily != state.daily.currentID) {
            state.daily.isMode = true;
            ui["mode-indicator"].textContent = "★ Daily";
            ui["mode-indicator"].className = "mode-daily";
            state.targetWord = state.commonWordsList[state.daily.currentID % state.commonWordsList.length];
            ui["start-game-btn"].textContent = "Start Daily Challenge";
        } else {
            setPracticeMode();
        }
    }

    function setPracticeMode() {
        state.daily.isMode = false;
        ui["mode-indicator"].textContent = "Practice";
        ui["mode-indicator"].className = "mode-practice";
        state.targetWord = state.commonWordsList[Math.floor(Math.random() * state.commonWordsList.length)];
        ui["start-game-btn"].textContent = "Start Practice Mode";
    }

    function buildKeyboard() {
        const frag = document.createDocumentFragment();
        
        config.keyboardLayout.forEach(row => {
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

    function generateBoard() {
        const letters = state.targetWord.split("");
        const reverseLetters = [...letters].reverse();
        ui["game-board"].innerHTML = ""; 
        state.targetPools = {};

        const cachedValidWords = Array.from(state.validWordsSet);

        // Pre-calculate target pools
        for (let r = 0; r < 5; r++) {
            const startL = letters[r], endL = reverseLetters[r];
            const key = `${startL}${endL}`; 
            
            if (!state.targetPools[key]) {
                state.targetPools[key] = {
                    validWords: cachedValidWords.filter(w => w.startsWith(startL) && w.endsWith(endL) && w !== state.targetWord),
                    foundWords: [], 
                    hintedWords: {}, 
                    rows: [r + 1], 
                    baseColorClass: `text-col${r + 1}`, 
                    bgColorClass: `bg-col${r + 1}`
                };
            } else { 
                state.targetPools[key].rows.push(r + 1); 
            }
        }

        // Added "SEED" to the ghost counter to visually balance the layout
        let boardHTML = `
            <div class="row-wrapper seed-row-wrapper" data-start="${letters[0]}">
                <div class="row-main">
                    <div class="row-tiles">
                        ${letters.map(l => `<div class="tile bg-col1">${l}</div>`).join('')}
                    </div>
                    <div class="row-counter" aria-hidden="true">SEED</div>
                </div>
            </div>`;

        // Build Game Rows
        for (let r = 0; r < 5; r++) {
            const startL = letters[r], endL = reverseLetters[r];
            const pool = state.targetPools[`${startL}${endL}`];
            const isDuplicate = pool.rows[0] !== (r + 1); 
            const isDead = pool.validWords.length === 0;
            const styleClass = (isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass;
            const counterText = isDead ? "-" : (isDuplicate ? `🔗 ${pool.rows[0]}` : `0/${pool.validWords.length}`);
            const counterClass = (!isDead && !isDuplicate) ? pool.baseColorClass : "";

            boardHTML += `
                <div class="row-wrapper ${isDead ? 'dead-row hidden' : 'active-row'}" data-start="${startL}">
                    <div class="row-main">
                        <div class="row-tiles">
                            <div class="tile ${styleClass}">${startL}</div>
                            <div class="tile"></div>
                            <div class="tile"></div>
                            <div class="tile"></div>
                            <div class="tile ${styleClass}">${endL}</div>
                        </div>
                        <div class="row-counter ${counterClass}" id="counter-row-${r+1}">${counterText}</div>
                    </div>
                    <div class="inline-words" id="inline-words-${r+1}"></div>
                </div>`;
        }

        // Build New Unified Input Row
        boardHTML += `
            <div class="row-wrapper" id="input-row-wrapper">
                <div class="row-main">
                    <div class="row-tiles" id="input-tiles">
                        <div class="tile input-tile"></div>
                        <div class="tile input-tile"></div>
                        <div class="tile input-tile"></div>
                        <div class="tile input-tile"></div>
                        <div class="tile input-tile"></div>
                    </div>
                    <button id="hint-btn" title="Reveal a letter" aria-label="Use Hint">
                        💡
                        <span id="hint-badge">3</span>
                    </button>
                </div>
            </div>`;
        
        ui["game-board"].insertAdjacentHTML('beforeend', boardHTML);
    }

    function updateGuessDisplay() {
        const inputTiles = document.querySelectorAll('#input-tiles .tile');
        
        // Update tiles in the Input Row
        for (let i = 0; i < 5; i++) {
            inputTiles[i].textContent = state.currentGuess[i] || "";
            inputTiles[i].classList.toggle('active-typing', !!state.currentGuess[i]);
        }
        
        // Dimming logic for the grid above
        const activeRows = document.querySelectorAll(".row-wrapper.active-row");
        if (state.currentGuess.length > 0) {
            const firstL = state.currentGuess[0];
            activeRows.forEach(row => {
                row.classList.toggle('dimmed', row.dataset.start !== firstL);
            });
        } else {
            activeRows.forEach(row => row.classList.remove('dimmed'));
        }
    }

    function processInput(key) {
        if (!state.active) return;
        
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

    function submitGuess() {
        if (state.currentGuess.length !== 5) return;
        
        const guess = state.currentGuess;
        const pool = state.targetPools[`${guess[0]}${guess[4]}`];
        const inputWrapper = document.getElementById("input-row-wrapper");

        const triggerError = (msg) => {
            spawnFCT(msg, "error");
            inputWrapper.classList.add("shake");
            setTimeout(() => inputWrapper.classList.remove("shake"), 400);
        };

        if (!pool || pool.validWords.length === 0) return triggerError("Check letters");
        if (pool.foundWords.includes(guess)) return triggerError("Already found");
        if (!pool.validWords.includes(guess)) {
            resetStreak();
            return triggerError("Not in list");
        }

        handleValidGuess(guess, pool);
    }

    function handleValidGuess(guess, pool) {
        manageStreak();
        
        pool.foundWords.push(guess);
        const multiplier = pool.rows.length; 
        const points = Math.round(1000 / pool.validWords.length) * multiplier;
        state.scores.base += points;

        const isObscure = !state.bonusBarrierSet.has(guess); 
        spawnFCT(`+${points}`, "base");
        
        if (isObscure) {
            state.scores.bonus += 50; 
            setTimeout(() => spawnFCT("+50 ✨", "obscure"), 200); 
        }
        
        if (state.streak.isActive) {
            state.scores.bonus += 5;
            setTimeout(() => spawnFCT("+5 🔥", "streak"), 400);
        }

        updateScoreUI();
        document.getElementById(`counter-row-${pool.rows[0]}`).textContent = `${pool.foundWords.length}/${pool.validWords.length}`;

        renderInlineCard(guess, pool, isObscure);

        state.currentGuess = "";
        updateGuessDisplay();
    }

    function renderInlineCard(guess, pool, isObscure) {
        const hints = document.querySelectorAll(`.hint-card[data-word="${guess}"]`);
        hints.forEach(h => h.remove());

        const html = `<div class="inline-word-card ${pool.baseColorClass} ${isObscure ? 'obscure-word' : ''}">${guess}${isObscure ? ' ✨' : ''}</div>`;
        document.getElementById(`inline-words-${pool.rows[0]}`).insertAdjacentHTML('afterbegin', html);
    }

    function manageStreak() {
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
            document.getElementById("input-row-wrapper").classList.add("streak-active");
            spawnFCT("🔥 STREAK ACTIVE", "streak");
        }
    }

    function resetStreak() {
        state.streak.count = 0; 
        state.streak.isActive = false;
        const inputRow = document.getElementById("input-row-wrapper");
        if(inputRow) inputRow.classList.remove("streak-active");
    }

    function useHint() {
        if (!state.active || state.hints.remaining <= 0) return;

        let options = [];
        Object.values(state.targetPools).forEach(p => {
            p.validWords.forEach(w => {
                if (!p.foundWords.includes(w) && (p.hintedWords[w] || []).length < 3) {
                    options.push({ pool: p, word: w });
                }
            });
        });

        if (!options.length) return spawnFCT("No words left!", "error");

        state.hints.remaining--;
        
        const hintBadge = document.getElementById("hint-badge");
        if (hintBadge) hintBadge.textContent = state.hints.remaining;
        
        const hintBtn = document.getElementById("hint-btn");
        if (hintBtn) hintBtn.disabled = state.hints.remaining === 0;

        const { pool, word } = options[Math.floor(Math.random() * options.length)];
        pool.hintedWords[word] = pool.hintedWords[word] || [];
        
        const unrevealed = [1, 2, 3].filter(i => !pool.hintedWords[word].includes(i));
        pool.hintedWords[word].push(unrevealed[Math.floor(Math.random() * unrevealed.length)]);

        const mask = word.split('').map((l, i) => (i === 0 || i === 4 || pool.hintedWords[word].includes(i)) ? l : "_").join(' ');

        let hintCard = document.querySelector(`.hint-card[data-word="${word}"]`);
        if (!hintCard) {
            document.getElementById(`inline-words-${pool.rows[0]}`).insertAdjacentHTML('afterbegin', 
                `<div class="inline-word-card hint-card ${pool.baseColorClass}" data-word="${word}"></div>`);
            hintCard = document.querySelector(`.hint-card[data-word="${word}"]`);
        }
        hintCard.textContent = mask;
    }

    function spawnFCT(text, type) {
        const fct = document.createElement("span");
        fct.textContent = text;
        fct.className = `fct fct-${type}`;
        
        const xOffset = (Math.random() - 0.5) * 60;
        fct.style.left = `calc(50% + ${xOffset}px)`;
        fct.style.top = '-20px';

        const inputWrapper = document.getElementById("input-row-wrapper");
        if(inputWrapper) {
            inputWrapper.style.position = 'relative';
            inputWrapper.appendChild(fct);
        }
        
        setTimeout(() => fct.remove(), 1000);
    }

    function updateScoreUI() {
        state.scores.total = state.scores.base + state.scores.bonus;
        ui["score-total-display"].textContent = `Total: ${state.scores.total}`;
        ui["score-breakdown-display"].textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
    }

    function attachEventListeners() {
        ui["game-board"].addEventListener("click", (e) => {
            const btn = e.target.closest('#hint-btn');
            if (btn && !btn.disabled) useHint();
        });
        
        ui["virtual-keyboard"].addEventListener("click", (e) => {
            const keyBtn = e.target.closest('.key');
            if (keyBtn) processInput(keyBtn.dataset.key);
        });

        document.addEventListener("keydown", (e) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                processInput(e.key.toUpperCase());
            }
        });

        ui["start-game-btn"].addEventListener("click", startGame);
        ui["play-again-btn"].addEventListener("click", resetGame);
        ui["end-early-btn"].addEventListener("click", endGame);
    }

    function startGame() {
        ui["start-screen"].classList.add("hidden");
        ui["game-container"].classList.remove("hidden");
        generateBoard();
        startTimer();
        state.active = true;
        updateGuessDisplay();
    }

    function resetGame() {
        state.scores = { base: 0, bonus: 0, total: 0 };
        state.hints.remaining = 3;
        state.currentGuess = "";
        
        ui["timer"].classList.remove("danger");
        
        updateScoreUI();
        resetStreak();
        
        ui["game-over-section"].classList.add("hidden");
        ui["end-early-btn"].classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setPracticeMode();
        startGame();
    }

    function startTimer() {
        clearInterval(state.timer.interval);
        state.timer.endTime = Date.now() + (config.gameDuration * 1000);
        
        const tick = () => {
            const left = Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000));
            ui["timer"].textContent = `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
            ui["timer"].classList.toggle("danger", left <= 30 && left > 0);
            
            if (state.streak.isActive && Date.now() - state.streak.lastWordTime > 20000) resetStreak();
            else if (!state.streak.isActive && state.streak.count > 0 && Date.now() - state.streak.lastWordTime > 15000) resetStreak();

            if (left <= 0) endGame();
        };
        
        tick();
        state.timer.interval = setInterval(tick, 500);
    }

    function endGame() {
        clearInterval(state.timer.interval);
        state.active = false;
        resetStreak();
        ui["end-early-btn"].classList.add("hidden");
        
        const hintBtn = document.getElementById("hint-btn");
        if(hintBtn) hintBtn.disabled = true;
        
        if (state.daily.isMode) localStorage.setItem("darnWortlerLastDaily", state.daily.currentID);
        
        ui["final-score"].textContent = `Total Score: ${state.scores.total}`;
        ui["final-score-breakdown"].textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
        
        let html = '';
        Object.values(state.targetPools).forEach(p => {
            p.validWords.forEach(w => {
                const found = p.foundWords.includes(w);
                const obscure = !state.bonusBarrierSet.has(w);
                html += `<div class="word-card ${p.baseColorClass} ${found ? 'strikethrough' : ''} ${obscure ? 'obscure-word' : ''}">${w}${obscure ? ' ✨' : ''}</div>`;
            });
        });
        ui["all-solutions-list"].innerHTML = html;
        
        ui["game-over-section"].classList.remove("hidden");
        ui["game-over-section"].scrollIntoView({ behavior: 'smooth' });
    }

    return { init };
})();

document.addEventListener("DOMContentLoaded", DarnWortler.init);