'use strict';

// Global error handler updated to use CSS variables
window.onerror = function (msg, url, line) {
    const btn = document.getElementById("start-loading-btn");
    if (btn) {
        btn.textContent = `Crash: ${msg} (Line ${line})`;
        btn.style.backgroundColor = "var(--color-error)"; 
    }
};

const DarnWortler = (function () {
    const config = {
        fullDictURL: "./full.txt",
        expandedDictURL: "./expanded.txt",
        manifestURL: "./tier_manifest.json",
        gameDuration: 300, // 5 minutes
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
        // Removed input row IDs, relying purely on the game board now
        const ids = [
            "start-screen", "game-container", "game-board",
            "virtual-keyboard", "end-early-btn", "timer", "timer-progress-bar", 
            "score-total-display", "score-breakdown-display", "mode-indicator", 
            "game-over-modal", "final-score", "final-score-breakdown", 
            "all-solutions-list", "practice-tier-group", "start-loading-btn", 
            "start-buttons-group", "start-daily-btn", "start-practice-tier-group"
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
            state.bonusBarrierSet = new Set(state.expandedWordsList);
            state.manifest = manifestJSON;
    
            setupGameMode();
            ui["mode-indicator"].classList.remove("hidden");
            ui["start-loading-btn"].classList.add("hidden");
            ui["start-buttons-group"].classList.remove("hidden");
            
        } catch (error) {
            console.error("Dictionary Load Failed:", error);
            ui["start-loading-btn"].textContent = "Data Error. Refresh to retry.";
            ui["start-loading-btn"].style.backgroundColor = "var(--color-error)";
        }
    }
    
    const getDailySeedWord = () => {
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
    
    function setupGameMode() {
        const lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
        if (lastPlayedDaily == state.daily.currentID) {
            ui["start-daily-btn"].textContent = "DAILY COMPLETED";
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

        let boardHTML = `
            <div class="row-wrapper seed-row-wrapper" data-start="${letters[0]}">
                <div class="row-main">
                    <div class="row-tiles">
                        ${letters.map(l => `<div class="tile bg-col1">${l}</div>`).join('')}
                    </div>
                    <div class="row-counter" aria-hidden="true">SEED</div>
                </div>
            </div>`;

        // Build Game Target Rows
        for (let r = 0; r < 5; r++) {
            const startL = letters[r], endL = reverseLetters[r];
            const pool = state.targetPools[`${startL}${endL}`];
            const isDuplicate = pool.rows[0] !== (r + 1); 
            const isDead = pool.validWords.length === 0;
            const styleClass = (isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass;
            const counterText = isDead ? "-" : (isDuplicate ? `🔗 ${pool.rows[0]}` : `0/${pool.validWords.length}`);
            const counterClass = (!isDead && !isDuplicate) ? pool.baseColorClass : "";

            // Added data-end attribute for overwrite logic, removed hidden from dead rows
            boardHTML += `
                <div class="row-wrapper ${isDead ? 'dead-row' : 'active-row'}" data-start="${startL}" data-end="${endL}">
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

        ui["game-board"].insertAdjacentHTML('beforeend', boardHTML);
    }

    function updateGuessDisplay() {
        const activeRows = document.querySelectorAll(".row-wrapper.active-row");
        
        // Step 1: Reset all rows to their default visual state
        activeRows.forEach(row => {
            row.classList.remove('dimmed');
            const innerTiles = row.querySelectorAll('.inner-tile');
            const endTile = row.querySelectorAll('.tile')[4]; // The 5th tile
            
            // Restore ghost hints or clear typing
            innerTiles.forEach((tile, i) => {
                if (!tile.classList.contains('ghost-hint') || state.currentGuess.length > i + 1) {
                    tile.textContent = tile.dataset.hint || ""; 
                }
                tile.classList.remove('active-typing');
            });
            
            // Restore the original end letter and style
            if (endTile) {
                endTile.textContent = row.dataset.end;
                endTile.style.color = ""; 
                endTile.classList.remove('active-typing');
            }
        });
    
        if (state.currentGuess.length === 0) return;
    
        // Step 2: Mirror typing into matching rows
        const firstL = state.currentGuess[0];
        
        activeRows.forEach(row => {
            if (row.dataset.start !== firstL) {
                row.classList.add('dimmed');
            } else {
                const innerTiles = row.querySelectorAll('.inner-tile');
                const endTile = row.querySelectorAll('.tile')[4];
                
                // Mirror middle letters (Index 1, 2, 3)
                for (let i = 1; i < 4; i++) {
                    if (state.currentGuess[i]) {
                        innerTiles[i-1].textContent = state.currentGuess[i];
                        innerTiles[i-1].classList.add('active-typing');
                    }
                }
                
                // Mirror the 5th letter & evaluate
                if (state.currentGuess.length === 5) {
                    endTile.textContent = state.currentGuess[4];
                    endTile.classList.add('active-typing');
                    
                    // If it doesn't match the required end letter, turn it red
                    if (state.currentGuess[4] !== row.dataset.end) {
                        endTile.style.color = "var(--color-error)";
                    }
                }
            }
        });
    }

    // --- CASCADING REVEAL ENGINE ---
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    
    const triggerCascadeReveal = (guess) => {
        // Wipe existing hints before a new sweep
        document.querySelectorAll('.inner-tile.ghost-hint').forEach(tile => {
            tile.textContent = '';
            tile.dataset.hint = '';
            tile.classList.remove('ghost-hint');
        });
        
        const masterKey = [guess[1], guess[2], guess[3]];   
        
        Object.values(state.targetPools).forEach(pool => {
            if (pool.validWords.length === pool.foundWords.length) return;
    
            const availableWords = pool.validWords.filter(w => !pool.foundWords.includes(w));
            
            // Phase 1: Core Words
            const coreWords = availableWords.filter(w => state.expandedWordsList.includes(w));
            let hintsGenerated = runHintPhase(pool, coreWords, masterKey);
    
            // Phase 2: Obscure Fallback
            if (hintsGenerated === 0) {
                const obscureWords = availableWords.filter(w => !state.expandedWordsList.includes(w));
                runHintPhase(pool, obscureWords, masterKey);
            }
        });
    };
    
    const runHintPhase = (pool, wordList, masterKey) => {
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
            pool.rows.forEach(rowNum => {
                const tiles = document.querySelectorAll(`#row-tiles-${rowNum} .inner-tile`);
                hintsToDisplay.forEach((letter, index) => {
                    if (letter) {
                        tiles[index].textContent = letter;
                        tiles[index].dataset.hint = letter; // Store so updateGuessDisplay can restore it
                        tiles[index].classList.add('ghost-hint');
                    }
                });
            });
        }
        return hintsGenerated;
    };

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
    
        const triggerError = (msg) => {
            spawnFCT(msg, "error");
            
            if (navigator.vibrate) navigator.vibrate(100);

            // Redirect error shake to matching rows directly on the board
            document.querySelectorAll(".row-wrapper.active-row:not(.dimmed)").forEach(row => {
                row.classList.add("shake");
                setTimeout(() => row.classList.remove("shake"), 400);
            });
            
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
        triggerCascadeReveal(guess);
    
        state.currentGuess = "";
        updateGuessDisplay();
    }

    function renderInlineCard(guess, pool, isObscure) {
        const hints = document.querySelectorAll(`.hint-card[data-word="${guess}"]`);
        hints.forEach(h => h.remove());
    
        const html = `<div class="inline-word-card ${pool.baseColorClass} ${isObscure ? 'obscure-word' : ''}">${guess}${isObscure ? ' ✨' : ''}</div>`;
        
        const container = document.getElementById(`inline-words-${pool.rows[0]}`);
        container.insertAdjacentHTML('afterbegin', html);
        
        try {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } catch (error) {
            container.scrollLeft = 0; 
        }
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
            ui["game-board"].classList.add("streak-active");
            spawnFCT("🔥 STREAK ACTIVE", "streak");
        }
    }

    function resetStreak() {
        state.streak.count = 0; 
        state.streak.isActive = false;
        if(ui["game-board"]) ui["game-board"].classList.remove("streak-active");
    }

    function spawnFCT(text, type) {
        const fct = document.createElement("span");
        fct.textContent = text;
        fct.className = `fct fct-${type}`;
        
        const xOffset = (Math.random() - 0.5) * 60;
        fct.style.left = `calc(50% + ${xOffset}px)`;
        fct.style.top = '-20px';

        // Spawn text on the currently active row, falling back to the board
        const activeContainer = document.querySelector(".row-wrapper.active-row:not(.dimmed)") || ui["game-board"];
        if (activeContainer) {
            activeContainer.style.position = 'relative';
            activeContainer.appendChild(fct);
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
            if (tierBtn) initPracticeMode(tierBtn.dataset.tier);
        });
    
        ui["practice-tier-group"].addEventListener("click", (e) => {
            const tierBtn = e.target.closest('.tier-btn');
            if (tierBtn) resetGame(tierBtn.dataset.tier);
        });
    }
        
    function startGame() {
        ui["start-screen"].close(); 
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
        if(ui["timer-progress-bar"]) ui["timer-progress-bar"].classList.remove("danger");
        
        updateScoreUI();
        resetStreak();
        
        ui["game-over-modal"].close(); 
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
            
            const percentage = (left / config.gameDuration) * 100;
            if (ui["timer-progress-bar"]) ui["timer-progress-bar"].style.width = `${percentage}%`;

            const inDanger = left <= 30 && left > 0;
            ui["timer"].classList.toggle("danger", inDanger);
            if (ui["timer-progress-bar"]) ui["timer-progress-bar"].classList.toggle("danger", inDanger);
            
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
        
        ui["game-over-modal"].showModal();
    }

    return { init, state };
})();

document.addEventListener("DOMContentLoaded", DarnWortler.init);