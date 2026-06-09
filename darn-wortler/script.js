'use strict';

window.onerror = function (msg, url, line) {
    // Updated to use the new loading button ID
    const btn = document.getElementById("start-loading-btn");
    if (btn) {
        btn.textContent = `Crash: ${msg} (Line ${line})`;
        btn.style.backgroundColor = "#a84646"; 
    }
};

const DarnWortler = (function () {
    const config = {
        fullDictURL: "./full.txt",
        expandedDictURL: "./expanded.txt",
        manifestURL: "./tier_manifest.json",
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
        expandedWordsList: [],
        manifest: { easy: [], medium: [], hard: [] },
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
        "final-score", "final-score-breakdown", "all-solutions-list", "practice-tier-group",
        "start-loading-btn", "start-buttons-group", "start-daily-btn", "start-practice-tier-group"
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
            
            const fetchJSON = async (url) => {
                const res = await fetch(url + cacheBuster).catch(() => ({ ok: false }));
                return res.ok ? await res.json() : null;
            };
    
            const [textFull, textExpanded, manifestJSON] = await Promise.all([
                fetchText(config.fullDictURL),
                fetchText(config.expandedDictURL),
                fetchJSON(config.manifestURL)
            ]);
    
            if (!textExpanded || !textFull || !manifestJSON) throw new Error("Missing required assets.");
    
            const parseWords = (text) => text.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
    
            state.expandedWordsList = parseWords(textExpanded);
            const fullArray = parseWords(textFull);
    
            state.validWordsSet = new Set([...state.expandedWordsList, ...fullArray]);
            state.bonusBarrierSet = new Set(state.expandedWordsList); // Obscure words are now those ONLY in full.txt
            state.manifest = manifestJSON;
    
            setupGameMode();
                    ui["mode-indicator"].classList.remove("hidden");
                    ui["start-loading-btn"].classList.add("hidden");
                    ui["start-buttons-group"].classList.remove("hidden");
                    
                } catch (error) {
                    console.error("Dictionary Load Failed:", error);
                    ui["start-loading-btn"].textContent = "Data Error. Refresh to retry.";
                    ui["start-loading-btn"].style.backgroundColor = "#a84646";
                }
            }
    
    /**
     * Generates a deterministic daily seed word based on the Days Since Epoch.
     * Implements a hash to scramble selection and avoid sequential alphabetical days.
     */
    const getDailySeedWord = () => {
        const easyPool = state.manifest.easy;
        if (!easyPool || easyPool.length === 0) throw new Error("Manifest easy pool is empty.");
        
        const idStr = "DW" + state.daily.currentID.toString(); // Salted string
        let hash = 0;
        
        // Bitwise hash algorithm for maximum shuffle
        for (let i = 0; i < idStr.length; i++) {
            hash = Math.imul(31, hash) + idStr.charCodeAt(i) | 0;
        }
    
        const randomizedIndex = Math.abs(hash) % easyPool.length;
        const masterIndex = easyPool[randomizedIndex];
        return state.expandedWordsList[masterIndex];
    };
    
    function setupGameMode() {
        const lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
        if (lastPlayedDaily == state.daily.currentID) {
            // Visually disable the Daily button if already played
            ui["start-daily-btn"].textContent = "DAILY COMPLETED"; // Removed emoji, capitalized
            ui["start-daily-btn"].disabled = true;
            ui["start-daily-btn"].classList.replace("primary-btn", "secondary-btn");
        }
    }
    
    function initDailyMode() {
        state.daily.isMode = true;
        ui["mode-indicator"].textContent = "★ Daily";
        ui["mode-indicator"].className = "mode-daily";
        state.targetWord = getDailySeedWord();
        startGame();
    }
    
    function initPracticeMode(tier) {
        state.daily.isMode = false;
        ui["mode-indicator"].textContent = `Practice: ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        ui["mode-indicator"].className = "mode-practice";
        
        const tierPool = state.manifest[tier];
        const masterIndex = tierPool[Math.floor(Math.random() * tierPool.length)];
        state.targetWord = state.expandedWordsList[masterIndex];
        startGame();
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
                    <div class="row-tiles" id="row-tiles-${r+1}">
                        <div class="tile ${styleClass}">${startL}</div>
                        <div class="tile inner-tile" data-pos="1"></div>
                        <div class="tile inner-tile" data-pos="2"></div>
                        <div class="tile inner-tile" data-pos="3"></div>
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
                    <div class="row-counter" aria-hidden="true"></div>
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

// --- CASCADING REVEAL ENGINE ---
    
    /**
     * Fisher-Yates shuffle utility.
     * Returns a new shuffled array without mutating the original.
     */
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    
    /**
     * Executes the Cascading Reveal engine across all active rows.
     * @param {string} guess - The valid 5-letter word just guessed.
     */
    const triggerCascadeReveal = (guess) => {
    // NEW: Wipe all existing ghost hints from the board before the new sweep
    document.querySelectorAll('.inner-tile.ghost-hint').forEach(tile => {
        tile.textContent = '';
        tile.classList.remove('ghost-hint');
    });
    
    // Extract internal letters: Pos 2, 3, 4
    const masterKey = [guess[1], guess[2], guess[3]];   
    
        Object.values(state.targetPools).forEach(pool => {
                if (pool.validWords.length === pool.foundWords.length) return;
        
                const availableWords = pool.validWords.filter(w => !pool.foundWords.includes(w));
                
                // Phase 1: Master List Scan
                const coreWords = availableWords.filter(w => state.expandedWordsList.includes(w));
                let hintsGenerated = runHintPhase(pool, coreWords, masterKey);
        
                // Phase 2: Obscure Fallback Scan (Contingency Gate)
                if (hintsGenerated === 0) {
                    const obscureWords = availableWords.filter(w => !state.expandedWordsList.includes(w));
                    runHintPhase(pool, obscureWords, masterKey);
                }
            });
        };
    
    /**
     * Runs a single progressive filtering phase of the cascade logic.
     * @returns {number} The number of hints successfully generated.
     */
    const runHintPhase = (pool, wordList, masterKey) => {
        if (wordList.length === 0) return 0;
    
        let workingPool = shuffleArray(wordList);
        let hintsGenerated = 0;
        
        // Tracks which letters to display for data-pos 1, 2, and 3
        const hintsToDisplay = [null, null, null]; 
    
        for (let i = 0; i < 3; i++) {
            const targetLetter = masterKey[i];
            const strIndex = i + 1; // Maps array index 0,1,2 to string index 1,2,3
    
            // Check condition: Does Working Pool contain words with targetLetter in this position?
            const matches = workingPool.filter(w => w[strIndex] === targetLetter);
    
            if (matches.length > 0) {
                // Action: TRUE branch
                workingPool = matches;
                hintsToDisplay[i] = targetLetter;
                hintsGenerated++;
            }
            // Action: FALSE branch -> Proceed with current workingPool unmodified
        }
    
        // Render hints to the DOM for all identical target rows
        if (hintsGenerated > 0) {
            pool.rows.forEach(rowNum => {
                const tiles = document.querySelectorAll(`#row-tiles-${rowNum} .inner-tile`);
                hintsToDisplay.forEach((letter, index) => {
                    if (letter) {
                        tiles[index].textContent = letter;
                        tiles[index].classList.add('ghost-hint');
                    }
                });
            });
        }
    
        return hintsGenerated;
    };
    
    // -------------------------------

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
            
            // --- A/B TEST TOGGLE: Clear hints on invalid guess ---
            // To test the stricter punishment, simply uncomment the block below.
            /*
            document.querySelectorAll('.inner-tile.ghost-hint').forEach(tile => {
                tile.textContent = '';
                tile.classList.remove('ghost-hint');
            });
            */
            // -----------------------------------------------------
        
            // THE FIX: Instantly clear the invalid guess so the player can keep typing
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
        
            // Trigger the cascade engine with the successful guess
            triggerCascadeReveal(guess);
        
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
        
        ui["virtual-keyboard"].addEventListener("click", (e) => {
            const keyBtn = e.target.closest('.key');
            if (keyBtn) processInput(keyBtn.dataset.key);
        });
    
        document.addEventListener("keydown", (e) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                processInput(e.key.toUpperCase());
            }
        });
    
ui["end-early-btn"].addEventListener("click", endGame);
            ui["start-daily-btn"].addEventListener("click", initDailyMode);
            
            // Event delegation for Start Screen practice buttons
            ui["start-practice-tier-group"].addEventListener("click", (e) => {
                const tierBtn = e.target.closest('.tier-btn');
                if (tierBtn) initPracticeMode(tierBtn.dataset.tier);
            });
        
            // Event delegation for End Screen practice buttons
            ui["practice-tier-group"].addEventListener("click", (e) => {
                const tierBtn = e.target.closest('.tier-btn');
                if (tierBtn) resetGame(tierBtn.dataset.tier);
            });
        }
        
        function startGame() {
            ui["start-screen"].classList.add("hidden");
            ui["game-container"].classList.remove("hidden");
            generateBoard();
            startTimer();
            state.active = true;
            updateGuessDisplay();
        }
        
        function resetGame(selectedTier) {
            state.scores = { base: 0, bonus: 0, total: 0 };
            state.currentGuess = "";
            ui["timer"].classList.remove("danger");
            updateScoreUI();
            resetStreak();
            
            ui["game-over-section"].classList.add("hidden");
            ui["end-early-btn"].classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: 'smooth' });
        
            initPracticeMode(selectedTier);
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

    return { init, state };
})();

document.addEventListener("DOMContentLoaded", DarnWortler.init);
