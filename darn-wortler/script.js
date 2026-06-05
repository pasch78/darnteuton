'use strict';

// Global error trap to prevent silent failures during startup
window.onerror = function (msg, url, line) {
    const btn = document.getElementById("start-game-btn");
    if (btn) {
        btn.textContent = `Crash: ${msg} (Line ${line})`;
        btn.style.backgroundColor = "#a84646";
        btn.style.fontSize = "0.9rem";
    }
};

(function () {
    // --- 1. Game State Management ---
    const state = {
        targetWord: "",
        currentGuess: "", 
        commonWordsList: [],
        validWordsSet: new Set(),
        bonusBarrierSet: new Set(),
        targetPools: {},
        scores: { base: 0, bonus: 0, total: 0 },
        timer: { interval: null, endTime: 0, duration: 300 },
        active: false,
        cachedMiddleTiles: [],
        cachedActiveRows: [],
        daily: {
            isMode: false,
            currentID: Math.floor(new Date().setUTCHours(0,0,0,0) / 86400000)
        },
        streak: { count: 0, isActive: false, lastWordTime: 0 },
        hints: { remaining: 3 } 
    };

    const config = {
        commonDictURL: "./common.txt",
        fullDictURL: "./full.txt",
        expandedDictURL: "./expanded.txt",
        gameDuration: 300
    };

    const ui = {};

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

        attachEventListeners();
        loadDictionariesBackground(); 
    }

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

        } catch (error) {
            console.error("Initialization Failed:", error);
            if (ui.startGameBtn) {
                ui.startGameBtn.textContent = "Error: Missing Files. Tap to Retry.";
                ui.startGameBtn.style.backgroundColor = "var(--col5)";
                ui.startGameBtn.disabled = false;
                ui.startGameBtn.addEventListener("click", () => window.location.reload(), { once: true });
            }
        }
    }

    // --- 3. Core Game Mode Selection ---
    function setupGameMode() {
        let lastPlayedDaily = null;
        try { lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily"); } catch (e) {}

        if (lastPlayedDaily != state.daily.currentID) {
            state.daily.isMode = true;
            ui.modeIndicator.textContent = "★ Daily Challenge";
            ui.modeIndicator.className = "mode-daily";
            state.targetWord = state.commonWordsList[state.daily.currentID % state.commonWordsList.length];
            ui.startGameBtn.textContent = "Start Daily Challenge";
        } else {
            state.daily.isMode = false;
            ui.modeIndicator.textContent = "Practice Mode";
            ui.modeIndicator.className = "mode-practice";
            state.targetWord = state.commonWordsList[Math.floor(Math.random() * state.commonWordsList.length)];
            ui.startGameBtn.textContent = "Start Practice Mode";
        }
    }

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
    }

    // --- 5. Board Generation ---
    function generateBoard() {
        const letters = state.targetWord.split("");
        const reverseLetters = [...letters].reverse();
        ui.gameBoard.innerHTML = ""; 

        const fragment = document.createDocumentFragment();

        const seedWrapper = document.createElement("div");
        seedWrapper.className = "row-wrapper seed-row-wrapper";
        seedWrapper.dataset.startLetter = letters[0];
        
        const seedTilesDiv = document.createElement("div");
        seedTilesDiv.className = "row-tiles";

        for (let i = 0; i < 5; i++) {
            const tile = document.createElement("div");
            tile.className = "tile bg-col1"; 
            tile.textContent = letters[i];
            seedTilesDiv.appendChild(tile);
        }
        
        const seedMain = document.createElement("div");
        seedMain.className = "row-main";
        seedMain.appendChild(seedTilesDiv);
        seedWrapper.appendChild(seedMain);
        fragment.appendChild(seedWrapper);
        
        const cachedValidWords = Array.from(state.validWordsSet);

        for (let r = 0; r < 5; r++) {
            const startL = letters[r]; 
            const endL = reverseLetters[r]; 
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

        for (let r = 0; r < 5; r++) {
            const startL = letters[r]; 
            const endL = reverseLetters[r]; 
            const key = `${startL}${endL}`;
            const pool = state.targetPools[key];
            const isDuplicate = pool.rows[0] !== (r + 1); 
            const isDead = pool.validWords.length === 0;

            const rowWrapper = document.createElement("div");
            rowWrapper.className = "row-wrapper";
            rowWrapper.dataset.startLetter = startL;
            if (isDead) rowWrapper.classList.add("dead-row", "hidden");

            const rowMain = document.createElement("div");
            rowMain.className = "row-main";

            const tilesDiv = document.createElement("div");
            tilesDiv.className = "row-tiles";

            for (let c = 0; c < 5; c++) {
                const tile = document.createElement("div"); 
                tile.className = "tile";
                if (c === 0) {
                    tile.textContent = startL; 
                    tile.classList.add((isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass);
                } else if (c === 4) {
                    tile.textContent = endL; 
                    tile.classList.add((isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass);
                } else {
                    tile.classList.add("middle-tile"); 
                    tile.id = `play-tile-${r}-${c}`;
                    if (!isDead) tile.dataset.startLetter = startL;
                }
                tilesDiv.appendChild(tile);
            }
            
            rowMain.appendChild(tilesDiv);

            const counterDiv = document.createElement("div");
            counterDiv.className = "row-counter";
            counterDiv.id = `counter-row-${r+1}`;
            
            if (isDead) counterDiv.textContent = `-`;
            else if (isDuplicate) counterDiv.textContent = `🔗 ${pool.rows[0]}`;
            else {
                counterDiv.textContent = `0/${pool.validWords.length}`;
                counterDiv.classList.add(pool.baseColorClass);
            }
            
            rowMain.appendChild(counterDiv);
            rowWrapper.appendChild(rowMain);

            const inlineWordsDiv = document.createElement("div");
            inlineWordsDiv.className = "inline-words";
            inlineWordsDiv.id = `inline-words-${r+1}`;
            rowWrapper.appendChild(inlineWordsDiv);

            fragment.appendChild(rowWrapper);
        }

        ui.gameBoard.appendChild(fragment); 
        
        state.cachedMiddleTiles = Array.from(document.querySelectorAll(".middle-tile"));
        state.cachedActiveRows = Array.from(document.querySelectorAll('.row-wrapper:not(.hidden)'));
    }

    // --- 6. Hint System Logic ---
    function useHint() {
        if (!state.active || state.hints.remaining <= 0) return;

        let hintableOptions = [];
        Object.values(state.targetPools).forEach(pool => {
            pool.validWords.forEach(word => {
                if (!pool.foundWords.includes(word)) {
                    const revealedIndices = pool.hintedWords[word] || [];
                    if (revealedIndices.length < 3) {
                        hintableOptions.push({ pool, word, revealedIndices });
                    }
                }
            });
        });

        if (hintableOptions.length === 0) {
            spawnFCT("No words left!", "error", "down");
            return;
        }

        state.hints.remaining--;
        updateHintUI(); 

        const selected = hintableOptions[Math.floor(Math.random() * hintableOptions.length)];
        const { pool, word, revealedIndices } = selected;

        const unrevealed = [1, 2, 3].filter(i => !revealedIndices.includes(i));
        const indexToReveal = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        
        pool.hintedWords[word] = [...revealedIndices, indexToReveal];

        let mask = word[0];
        for (let i = 1; i < 4; i++) {
            mask += pool.hintedWords[word].includes(i) ? word[i] : "_";
        }
        mask += word[4];

        const formattedMask = mask.split('').join(' ');

        let hintCard = null;
        document.querySelectorAll('.hint-card').forEach(card => {
            if(card.dataset.hintWord === word) hintCard = card;
        });

        if (!hintCard) {
            hintCard = document.createElement("div");
            hintCard.className = `inline-word-card hint-card ${pool.baseColorClass}`;
            hintCard.dataset.hintWord = word;
            document.getElementById(`inline-words-${pool.rows[0]}`).prepend(hintCard);
        }
        
        hintCard.textContent = formattedMask;
    }

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

        ui.endEarlyBtn.addEventListener("click", () => {
            if (!state.active) return;
            endGame(); 
        });
    }

    // --- 9. Timers & End Game ---
    function startTimer() {
        if (state.timer.interval) clearInterval(state.timer.interval); 
        
        state.timer.endTime = Date.now() + (config.gameDuration * 1000);
        updateTimerDisplay(config.gameDuration);
        
        state.timer.interval = setInterval(() => {
            const timeLeft = Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000));
            
            if (timeLeft <= 30 && timeLeft > 0) {
                ui.timerDisplay.classList.add("danger");
            } else {
                ui.timerDisplay.classList.remove("danger");
            }
            
            const timeSinceLast = Date.now() - state.streak.lastWordTime;
            
            if (state.streak.isActive) { 
                if (timeSinceLast > 20000) resetStreak(); 
            } else if (state.streak.count > 0) { 
                if (timeSinceLast > 15000) resetStreak(); 
            }

            if (timeLeft <= 0) { 
                endGame(); 
            }
            
            updateTimerDisplay(timeLeft);
        }, 500); 
    }

    function updateTimerDisplay(secondsLeft) {
        const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const s = (secondsLeft % 60).toString().padStart(2, '0');
        ui.timerDisplay.textContent = `${m}:${s}`;
    }

    function endGame() {
        clearInterval(state.timer.interval); 
        updateTimerDisplay(0); 
        state.active = false; 
        ui.hintBtn.disabled = true; 
        resetStreak(); 
        ui.endEarlyBtn.classList.add("hidden"); 
        
        try {
            if (state.daily.isMode) localStorage.setItem("darnWortlerLastDaily", state.daily.currentID);
        } catch (e) {}
        
        ui.finalScoreText.textContent = `Total Score: ${state.scores.total}`;
        ui.finalScoreBreakdown.textContent = `Base: ${state.scores.base} | Bonus: ${state.scores.bonus}`;
        
        const fragment = document.createDocumentFragment();

        Object.keys(state.targetPools).forEach(key => {
            const pool = state.targetPools[key];
            pool.validWords.forEach(word => {
                const card = document.createElement("div"); 
                card.className = `word-card ${pool.baseColorClass}`;
                
                const isFound = pool.foundWords.includes(word); 
                const isObscure = !state.bonusBarrierSet.has(word);
                
                if (isFound) card.classList.add("strikethrough");
                if (isObscure) { 
                    card.classList.add("obscure-word"); 
                    card.textContent = word + " ✨"; 
                } else { 
                    card.textContent = word; 
                }
                fragment.appendChild(card);
            });
        });
        
        ui.allSolutionsList.innerHTML = ""; 
        ui.allSolutionsList.appendChild(fragment);

        ui.gameOverSection.classList.remove("hidden"); 
        ui.gameOverSection.scrollIntoView({ behavior: 'smooth' });
    }

    // --- 10. Boot Sequence ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDOM);
    } else {
        initDOM();
    }

})();