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

<<<<<<< HEAD
    // --- 2. Initialization & Safe DOM Binding ---
    function initDOM() {
        ui.startScreen = document.getElementById("start-screen");
        ui.startGameBtn = document.getElementById("start-game-btn");
        ui.gameContainer = document.getElementById("game-container");
        ui.gameBoard = document.getElementById("game-board");
        ui.guessDisplay = document.getElementById("guess-display");
        ui.keyboardArea = document.getElementById("virtual-keyboard");
        ui.hintBtn = document.getElementById("hint-btn");
        ui.inputContainer = document.getElementById("input-container");
        ui.endEarlyBtn = document.getElementById("end-early-btn");
        ui.timerDisplay = document.getElementById("timer");
        ui.scoreTotalDisplay = document.getElementById("score-total-display");
        ui.scoreBreakdownDisplay = document.getElementById("score-breakdown-display");
        ui.streakIndicator = document.getElementById("streak-indicator");
        ui.modeIndicator = document.getElementById("mode-indicator");
        ui.gameOverSection = document.getElementById("game-over-section");
        ui.finalScoreText = document.getElementById("final-score");
        ui.finalScoreBreakdown = document.getElementById("final-score-breakdown");
        ui.allSolutionsList = document.getElementById("all-solutions-list");
        ui.playAgainBtn = document.getElementById("play-again-btn");

        let hasUIErrors = false;
        Object.entries(ui).forEach(([key, element]) => {
            if (!element) {
                console.error(`[UI Validation Error] Critical element missing: ${key}`);
                hasUIErrors = true;
            }
        });

        if (hasUIErrors) {
            if (ui.startGameBtn) {
                ui.startGameBtn.textContent = "Error: UI Load Failed. Check Console.";
                ui.startGameBtn.style.backgroundColor = "var(--col5)";
            }
            return;
        }

=======
    function init() {
        cacheDOM();
        buildKeyboard();
>>>>>>> v8.1.1
        attachEventListeners();
        loadDictionariesBackground(); 
    }

<<<<<<< HEAD
    // Updated: Fetch on Main Thread, Parse on Worker Thread to avoid CORS issues
    async function loadDictionariesBackground() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            
            // 1. Download the files on the main thread
            const [resCommon, resFull, resExpanded] = await Promise.all([
                fetch(config.commonDictURL + cacheBuster),
                fetch(config.fullDictURL + cacheBuster),
                fetch(config.expandedDictURL + cacheBuster).catch(() => ({ ok: false })) 
            ]);

            if (!resCommon.ok || !resFull.ok) {
                throw new Error("Failed to locate dictionary files. Ensure they are in the same folder.");
            }
            
            const textCommon = await resCommon.text();
            const textFull = await resFull.text();
            let textExpanded = "";
            if (resExpanded.ok) {
                textExpanded = await resExpanded.text();
            }

            // 2. Offload the heavy CPU parsing to the Blob Worker
            const workerCode = `
                self.onmessage = function(e) {
                    try {
                        const { textCommon, textFull, textExpanded } = e.data;
                        
                        const commonWordsList = textCommon.split('\\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
                        const fullArray = textFull.split('\\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
                        const validWordsSetArray = [...commonWordsList, ...fullArray];

                        let bonusBarrierSetArray = commonWordsList;
                        if (textExpanded.length > 0) {
                            const expandedArray = textExpanded.split('\\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
                            bonusBarrierSetArray = [...commonWordsList, ...expandedArray];
                        }

                        self.postMessage({
                            success: true,
                            commonWordsList,
                            validWordsSetArray,
                            bonusBarrierSetArray
                        });
                    } catch (err) {
                        self.postMessage({ success: false, error: err.message });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));

            worker.onmessage = function(e) {
                if (e.data.success) {
                    // Rehydrate Sets on the main thread
                    state.commonWordsList = e.data.commonWordsList;
                    state.validWordsSet = new Set(e.data.validWordsSetArray);
                    state.bonusBarrierSet = new Set(e.data.bonusBarrierSetArray);

                    setupGameMode();
                    ui.modeIndicator.classList.remove("hidden");
                    ui.startGameBtn.disabled = false;
                } else {
                    throw new Error(e.data.error);
                }
            };

            // Send raw text to the worker
            worker.postMessage({ textCommon, textFull, textExpanded });
=======
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
>>>>>>> v8.1.1

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

<<<<<<< HEAD
    // --- 4. Logic Helpers & Dynamic Combat Text ---
    function spawnFCT(text, type, trajectory) {
        const fct = document.createElement("span");
        fct.textContent = text;
        fct.className = `fct fct-${type} fct-traj-${trajectory}`;
        ui.inputContainer.appendChild(fct); 
        setTimeout(() => fct.remove(), 1200);
    }

    function triggerInputError() {
        ui.guessDisplay.classList.add("shake"); 
        setTimeout(() => ui.guessDisplay.classList.remove("shake"), 400); 
    }

    function updateScoreUI() {
        state.scores.total = state.scores.base + state.scores.bonus;
        ui.scoreTotalDisplay.textContent = `Total: ${state.scores.total}`;
        ui.scoreBreakdownDisplay.textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
    }

    function updateHintUI() {
        ui.hintBtn.textContent = `💡 ${state.hints.remaining}`;
        ui.hintBtn.disabled = state.hints.remaining <= 0 || !state.active;
    }

    function resetStreak() {
        state.streak.count = 0; 
        state.streak.isActive = false;
        ui.guessDisplay.classList.remove("streak-active-box"); 
        ui.streakIndicator.classList.add("hidden");
    }

    function resetGameState() {
        state.scores = { base: 0, bonus: 0, total: 0 };
        state.hints.remaining = 3;
        state.targetPools = {};
        state.streak.lastWordTime = 0;
        state.currentGuess = "";
        
        ui.timerDisplay.classList.remove("danger"); 
        updateGuessDisplay();
        resetStreak();
        updateScoreUI();
=======
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
>>>>>>> v8.1.1
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

<<<<<<< HEAD
    // --- 7. Input Handling & Virtual Keyboard ---
    function updateGuessDisplay() {
        if (state.currentGuess.length === 0) {
            ui.guessDisplay.innerHTML = '<span class="guess-placeholder">GUESS...</span>';
        } else {
            ui.guessDisplay.textContent = state.currentGuess;
        }

        state.cachedMiddleTiles.forEach(tile => { 
            tile.textContent = ""; 
            tile.classList.remove("active-typing"); 
        });
        
        if (state.currentGuess.length > 0) {
            const firstL = state.currentGuess[0];
            state.cachedMiddleTiles.forEach(tile => {
                if (tile.dataset.startLetter === firstL) {
                    const colIndex = parseInt(tile.id.split('-')[3]); 
                    if (state.currentGuess[colIndex]) { 
                        tile.textContent = state.currentGuess[colIndex]; 
                        tile.classList.add("active-typing"); 
                    }
                }
            });
            state.cachedActiveRows.forEach(row => {
                if (row.dataset.startLetter === firstL || row.classList.contains('seed-row-wrapper')) {
                    row.classList.remove('dimmed');
                } else { row.classList.add('dimmed'); }
            });
        } else {
            state.cachedActiveRows.forEach(row => row.classList.remove('dimmed'));
        }
    }

    function submitGuess() {
        if (state.currentGuess.length !== 5) return;
        
        const guess = state.currentGuess;
        const startL = guess[0]; 
        const endL = guess[4]; 
        const key = `${startL}${endL}`; 
        const pool = state.targetPools[key];

        if (!pool || pool.validWords.length === 0) {
            spawnFCT("Check letters", "error", "down");
            triggerInputError();
            return;
        }

        if (pool.foundWords.includes(guess)) {
            spawnFCT("Already found", "error", "down");
            triggerInputError();
            return;
        }

        if (!pool.validWords.includes(guess)) {
            resetStreak(); 
            spawnFCT("Not in word list", "error", "down");
            triggerInputError();
            return;
        }

        const now = Date.now();
        const timeSinceLast = now - state.streak.lastWordTime;
        
        if (!state.streak.isActive) {
            if (state.streak.lastWordTime > 0 && timeSinceLast <= 15000) state.streak.count++; 
            else state.streak.count = 1; 
        }
        state.streak.lastWordTime = now;

        if (state.streak.count >= 3 && !state.streak.isActive) {
            state.streak.isActive = true; 
            ui.guessDisplay.classList.add("streak-active-box"); 
            ui.streakIndicator.classList.remove("hidden");
        }

        pool.foundWords.push(guess);
        const multiplier = pool.rows.length; 
        const points = Math.round(1000 / pool.validWords.length) * multiplier;
        state.scores.base += points;

        const isObscure = !state.bonusBarrierSet.has(guess); 
        spawnFCT(`+${points}`, "base", "left");
        
        if (isObscure) {
            state.scores.bonus += 50; 
            setTimeout(() => spawnFCT("+50 ✨", "obscure", "right"), 100); 
        }
        if (state.streak.isActive) {
            state.scores.bonus += 5;
            setTimeout(() => spawnFCT("+5 🔥", "streak", "center"), 200);
        }

        updateScoreUI();
        document.getElementById(`counter-row-${pool.rows[0]}`).textContent = `${pool.foundWords.length}/${pool.validWords.length}`;

        document.querySelectorAll('.hint-card').forEach(card => {
            if (card.dataset.hintWord === guess) card.remove();
        });

        const inlineCard = document.createElement("div");
        inlineCard.className = `inline-word-card ${pool.baseColorClass}`;
        
        if (isObscure) {
            inlineCard.classList.add("obscure-word"); 
            inlineCard.textContent = guess + " ✨";
        } else {
            inlineCard.textContent = guess;
        }
        
        document.getElementById(`inline-words-${pool.rows[0]}`).prepend(inlineCard);

        state.currentGuess = "";
        updateGuessDisplay();
    }

    function handleVirtualKey(keyValue) {
        if (!state.active) return;

        if (keyValue === "ENTER") {
            submitGuess();
        } else if (keyValue === "DELETE") {
            if (state.currentGuess.length > 0) {
                state.currentGuess = state.currentGuess.slice(0, -1);
                updateGuessDisplay();
            }
        } else {
            if (state.currentGuess.length < 5) {
                state.currentGuess += keyValue;
                updateGuessDisplay();
            }
        }
    }

    // --- 8. Event Hooks ---
    function attachEventListeners() {
        ui.hintBtn.addEventListener("click", () => useHint());

        ui.keyboardArea.addEventListener("click", (e) => {
            const keyBtn = e.target.closest('.key');
            if (!keyBtn) return;
            handleVirtualKey(keyBtn.dataset.key);
        });

        document.addEventListener("keydown", (e) => {
            if (!state.active) return;
            const key = e.key.toUpperCase();
            
            if (key === "ENTER") {
                handleVirtualKey("ENTER");
            } else if (key === "BACKSPACE" || key === "DELETE") {
                handleVirtualKey("DELETE");
            } else if (/^[A-Z]$/.test(key)) {
                handleVirtualKey(key);
            }
        });

        ui.startGameBtn.addEventListener("click", () => {
            if (ui.startGameBtn.textContent.includes("Error")) return; 
            
            ui.startScreen.classList.add("hidden"); 
            ui.gameContainer.classList.remove("hidden");
            
            generateBoard(); 
            startTimer();
            
            state.active = true; 
            updateHintUI();
            updateGuessDisplay();
        });

        ui.playAgainBtn.addEventListener("click", () => {
            resetGameState();
            
            ui.gameOverSection.classList.add("hidden"); 
            ui.endEarlyBtn.classList.remove("hidden"); 
            window.scrollTo({ top: 0, behavior: 'smooth' });

            state.daily.isMode = false; 
            ui.modeIndicator.textContent = "Practice Mode"; 
            ui.modeIndicator.className = "mode-practice";
            state.targetWord = state.commonWordsList[Math.floor(Math.random() * state.commonWordsList.length)];
            
            generateBoard(); 
            startTimer();
            
            state.active = true; 
            updateHintUI();
        });
=======
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
>>>>>>> v8.1.1

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

<<<<<<< HEAD
    // --- 9. Timers & End Game ---
=======
>>>>>>> v8.1.1
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
<<<<<<< HEAD
        clearInterval(state.timer.interval); 
        updateTimerDisplay(0); 
        state.active = false; 
        ui.hintBtn.disabled = true; 
        resetStreak(); 
        ui.endEarlyBtn.classList.add("hidden"); 
=======
        clearInterval(state.timer.interval);
        state.active = false;
        resetStreak();
        ui["end-early-btn"].classList.add("hidden");
>>>>>>> v8.1.1
        
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

<<<<<<< HEAD
    // --- 10. Boot Sequence ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDOM);
    } else {
        initDOM();
    }
=======
    return { init };
})();
>>>>>>> v8.1.1

document.addEventListener("DOMContentLoaded", DarnWortler.init);