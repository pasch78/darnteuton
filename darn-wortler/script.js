// --- 1. Game State & Online Dictionaries ---
let targetWord = ""; 
let commonWordsList = [];
let validWordsSet = new Set();
let commonWordsSet = new Set(); 
let bonusBarrierSet = new Set(); 

let targetPools = {}; 
let baseScore = 0; let bonusScore = 0; let penaltyScore = 0; let totalScore = 0;
let timerInterval; let timeLeft = 300; let gameActive = false;

let cachedMiddleTiles = []; 
let isDailyMode = false;
let currentDailyID = Math.floor(Date.now() / 86400000); 

let streakCount = 0; let isStreakActive = false; let lastWordTime = 0; 

// NEW: Local relative paths for dictionaries
const commonDictURL = "./common.txt"; 
const fullDictURL = "./full.txt"; 
const expandedDictURL = "./expanded.txt"; 

// --- DOM Elements ---
const startScreen = document.getElementById("start-screen");
const startGameBtn = document.getElementById("start-game-btn");
const gameContainer = document.getElementById("game-container");
const gameBoard = document.getElementById("game-board"); 
const omniBox = document.getElementById("omni-box");
const inputContainer = document.getElementById("input-container");
const endEarlyBtn = document.getElementById("end-early-btn"); 

const timerDisplay = document.getElementById("timer");
const scoreTotalDisplay = document.getElementById("score-total-display"); 
const scoreBreakdownDisplay = document.getElementById("score-breakdown-display"); 
const streakIndicator = document.getElementById("streak-indicator");
const modeIndicator = document.getElementById("mode-indicator"); 

const gameOverSection = document.getElementById("game-over-section");
const finalScoreText = document.getElementById("final-score");
const finalScoreBreakdown = document.getElementById("final-score-breakdown");
const allSolutionsList = document.getElementById("all-solutions-list");
const playAgainBtn = document.getElementById("play-again-btn");

// Centralized Validation
const criticalUIElements = {
    "start-screen": startScreen, "start-game-btn": startGameBtn, "game-container": gameContainer,
    "game-board": gameBoard, "omni-box": omniBox, "input-container": inputContainer,
    "end-early-btn": endEarlyBtn, "mode-indicator": modeIndicator, "streak-indicator": streakIndicator,
    "game-over-section": gameOverSection, "play-again-btn": playAgainBtn
};

for (const [id, element] of Object.entries(criticalUIElements)) {
    if (!element) console.error(`[UI Validation Error] Critical element missing: id="${id}"`);
}

// --- 2. Initialization (Bulletproof Network & Storage) ---
async function loadDictionaries() {
    try {
        // Fetch in parallel locally. 
        const [resCommon, resFull, resExpanded] = await Promise.all([
            fetch(commonDictURL).catch(e => ({ error: true, msg: e.message })),
            fetch(fullDictURL).catch(e => ({ error: true, msg: e.message })),
            fetch(expandedDictURL).catch(e => ({ error: true, msg: e.message }))
        ]);

        // Explicit Check 1: Did the fetch fail entirely?
        if (resCommon.error || resFull.error) {
            throw new Error("Failed to load local dictionaries.");
        }

        // Explicit Check 2: Did the server return a 404 Not Found?
        if (!resCommon.ok || !resFull.ok) {
            throw new Error(`Server returned status: ${resCommon.status}. Ensure TXT files are in the directory.`);
        }

        const textCommon = await resCommon.text();
        commonWordsList = textCommon.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
        if (commonWordsList.length === 0) throw new Error("Parsed dictionary is empty.");

        const textFull = await resFull.text();
        const fullArray = textFull.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
        
        validWordsSet = new Set([...commonWordsList, ...fullArray]);
        commonWordsSet = new Set(commonWordsList); 

        // Check if the expanded dictionary was found
        if (!resExpanded.error && resExpanded.ok) {
            const textExpanded = await resExpanded.text();
            const expandedArray = textExpanded.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
            bonusBarrierSet = new Set([...commonWordsList, ...expandedArray]);
        } else {
            console.warn("Expanded dictionary failed. Falling back to base dictionary for scoring.");
            bonusBarrierSet = new Set(commonWordsList);
        }

        // Safe Local Storage Check
        let lastPlayedDaily = null;
        try {
            lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
        } catch (e) {
            console.warn("LocalStorage blocked (likely strict privacy settings or Incognito mode).");
        }

        if (lastPlayedDaily != currentDailyID) {
            isDailyMode = true;
            modeIndicator.textContent = "★ Daily Challenge";
            modeIndicator.className = "mode-daily";
            targetWord = commonWordsList[currentDailyID % commonWordsList.length];
            startGameBtn.textContent = "Start Daily Challenge";
        } else {
            isDailyMode = false;
            modeIndicator.textContent = "Practice Mode";
            modeIndicator.className = "mode-practice";
            targetWord = commonWordsList[Math.floor(Math.random() * commonWordsList.length)];
            startGameBtn.textContent = "Start Practice Mode";
        }
        
        modeIndicator.classList.remove("hidden");
        startGameBtn.disabled = false;

    } catch (error) {
        // Direct UI Error Reporting
        console.error("Initialization Failed:", error);
        startGameBtn.textContent = "Error: Missing Files. Tap to Retry.";
        startGameBtn.style.backgroundColor = "var(--col5)"; 
        startGameBtn.disabled = false;
        
        startGameBtn.addEventListener("click", () => window.location.reload(), {once: true});
    }
}

loadDictionaries();

// --- 3. FCT & Engine Logic ---
if (endEarlyBtn) {
    endEarlyBtn.addEventListener("click", () => {
        if (!gameActive) return;
        timeLeft = 0; updateTimerDisplay(); endGame(); 
    });
}

function spawnFCT(text, type, trajectory) {
    const fct = document.createElement("span");
    fct.textContent = text;
    fct.className = `fct fct-${type} fct-traj-${trajectory}`;
    inputContainer.appendChild(fct);
    setTimeout(() => { fct.remove(); }, 1200);
}

function updateScoreUI() {
    totalScore = baseScore + bonusScore - penaltyScore;
    scoreTotalDisplay.textContent = `Total: ${totalScore}`;
    scoreBreakdownDisplay.textContent = `Base: ${baseScore} | Bonus: ${bonusScore} | Penalty: -${penaltyScore}`;
}

function resetStreak() {
    streakCount = 0; isStreakActive = false;
    omniBox.classList.remove("streak-active-box"); streakIndicator.classList.add("hidden");
}

startGameBtn.addEventListener("click", (e) => {
    if (startGameBtn.textContent.includes("Error")) return; 
    
    startScreen.classList.add("hidden"); gameContainer.classList.remove("hidden");
    generateBoard(); startTimer();
    gameActive = true; omniBox.disabled = false; omniBox.focus();
});

playAgainBtn.addEventListener("click", () => {
    baseScore = 0; bonusScore = 0; penaltyScore = 0; timeLeft = 300; targetPools = {}; 
    resetStreak(); lastWordTime = 0; updateScoreUI();
    omniBox.value = ""; gameOverSection.classList.add("hidden"); endEarlyBtn.classList.remove("hidden"); 
    window.scrollTo({ top: 0, behavior: 'smooth' });

    isDailyMode = false; modeIndicator.textContent = "Practice Mode"; modeIndicator.className = "mode-practice";
    targetWord = commonWordsList[Math.floor(Math.random() * commonWordsList.length)];
    
    generateBoard(); startTimer();
    gameActive = true; omniBox.disabled = false; omniBox.focus();
});

// --- 4. Board Generation ---
function generateBoard() {
    const letters = targetWord.split("");
    const reverseLetters = [...letters].reverse();
    gameBoard.innerHTML = ""; 

    const seedWrapper = document.createElement("div");
    seedWrapper.className = "row-wrapper seed-row-wrapper";
    seedWrapper.dataset.startLetter = letters[0];
    
    const seedTilesDiv = document.createElement("div");
    seedTilesDiv.className = "row-tiles";

    for (let i = 0; i < 5; i++) {
        const tile = document.createElement("div");
        tile.className = "tile bg-col1"; tile.textContent = letters[i];
        seedTilesDiv.appendChild(tile);
    }
    
    const seedMain = document.createElement("div");
    seedMain.className = "row-main";
    seedMain.appendChild(seedTilesDiv);
    
    const ghostCounter = document.createElement("div");
    ghostCounter.className = "row-counter ghost-counter";
    seedMain.appendChild(ghostCounter);

    seedWrapper.appendChild(seedMain);
    gameBoard.appendChild(seedWrapper);
    
    for (let r = 0; r < 5; r++) {
        const startL = letters[r]; const endL = reverseLetters[r]; const key = `${startL}${endL}`; 
        if (!targetPools[key]) {
            targetPools[key] = {
                validWords: Array.from(validWordsSet).filter(w => w.startsWith(startL) && w.endsWith(endL)),
                foundWords: [], rows: [r + 1], baseColorClass: `text-col${r + 1}`, bgColorClass: `bg-col${r + 1}`
            };
        } else { targetPools[key].rows.push(r + 1); }
    }

    for (let r = 0; r < 5; r++) {
        const startL = letters[r]; const endL = reverseLetters[r]; const key = `${startL}${endL}`;
        const pool = targetPools[key];
        const isDuplicate = pool.rows[0] !== (r + 1); const isDead = pool.validWords.length === 0;

        const rowWrapper = document.createElement("div");
        rowWrapper.className = "row-wrapper";
        rowWrapper.dataset.startLetter = startL;
        if (isDead) rowWrapper.classList.add("dead-row");

        const rowMain = document.createElement("div");
        rowMain.className = "row-main";

        const tilesDiv = document.createElement("div");
        tilesDiv.className = "row-tiles";

        for (let c = 0; c < 5; c++) {
            const tile = document.createElement("div"); tile.className = "tile";
            if (c === 0) {
                tile.textContent = startL; tile.classList.add((isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass);
            } else if (c === 4) {
                tile.textContent = endL; tile.classList.add((isDuplicate || isDead) ? "bg-gray" : pool.bgColorClass);
            } else {
                tile.classList.add("middle-tile"); tile.id = `play-tile-${r}-${c}`;
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

        gameBoard.appendChild(rowWrapper);
    }

    cachedMiddleTiles = Array.from(document.querySelectorAll(".middle-tile"));
}

// --- 5. Omni-Box Input & Spotlight Logic ---
if (omniBox) {
    omniBox.addEventListener("input", () => {
        if (!gameActive) return;
        const guess = omniBox.value.toUpperCase().trim();
        
        cachedMiddleTiles.forEach(tile => { tile.textContent = ""; tile.classList.remove("active-typing"); });
        
        const allRows = document.querySelectorAll('.row-wrapper');
        if (guess.length > 0) {
            const firstL = guess[0];
            cachedMiddleTiles.forEach(tile => {
                if (tile.dataset.startLetter === firstL) {
                    const colIndex = parseInt(tile.id.split('-')[3]); 
                    if (guess[colIndex]) { tile.textContent = guess[colIndex]; tile.classList.add("active-typing"); }
                }
            });
            allRows.forEach(row => {
                if (row.dataset.startLetter === firstL || row.classList.contains('dead-row') || row.classList.contains('seed-row-wrapper')) {
                    row.classList.remove('dimmed');
                } else { row.classList.add('dimmed'); }
            });
        } else {
            allRows.forEach(row => row.classList.remove('dimmed'));
        }
    });

    omniBox.addEventListener("keydown", (e) => {
        if (!gameActive || e.key !== "Enter") return;
        
        const guess = omniBox.value.toUpperCase().trim();
        omniBox.value = ""; 
        cachedMiddleTiles.forEach(tile => { tile.textContent = ""; tile.classList.remove("active-typing"); });
        document.querySelectorAll('.row-wrapper').forEach(row => row.classList.remove('dimmed'));

        if (guess.length !== 5) return;

        const startL = guess[0]; const endL = guess[4]; const key = `${startL}${endL}`; const pool = targetPools[key];

        if (!pool || pool.validWords.length === 0 || pool.foundWords.includes(guess)) {
            omniBox.classList.add("shake"); setTimeout(() => omniBox.classList.remove("shake"), 400); return;
        }

        if (!pool.validWords.includes(guess)) {
            resetStreak(); penaltyScore += 10; updateScoreUI();
            spawnFCT("-10", "penalty", "down");
            omniBox.classList.add("shake"); setTimeout(() => omniBox.classList.remove("shake"), 400); return;
        }

        const now = Date.now();
        const timeSinceLast = now - lastWordTime;
        
        if (!isStreakActive) {
            if (lastWordTime > 0 && timeSinceLast <= 6000) streakCount++; else streakCount = 1; 
        }
        lastWordTime = now;

        if (streakCount >= 3 && !isStreakActive) {
            isStreakActive = true; omniBox.classList.add("streak-active-box"); streakIndicator.classList.remove("hidden");
        }

        pool.foundWords.push(guess);
        const multiplier = pool.rows.length; const points = Math.round(1000 / pool.validWords.length) * multiplier;
        baseScore += points;

        const isObscure = !bonusBarrierSet.has(guess); 
        
        spawnFCT(`+${points}`, "base", "left");
        
        if (isObscure) {
            bonusScore += 50; 
            setTimeout(() => spawnFCT("+50 ✨", "obscure", "right"), 100); 
        }
        if (isStreakActive) {
            bonusScore += 5;
            setTimeout(() => spawnFCT("+5 🔥", "streak", "center"), 200);
        }

        updateScoreUI();

        document.getElementById(`counter-row-${pool.rows[0]}`).textContent = `${pool.foundWords.length}/${pool.validWords.length}`;

        const inlineCard = document.createElement("div");
        inlineCard.className = `inline-word-card ${pool.baseColorClass}`;
        if (isObscure) {
            inlineCard.classList.add("obscure-word"); inlineCard.textContent = guess + " ✨";
        } else {
            inlineCard.textContent = guess;
        }
        
        document.getElementById(`inline-words-${pool.rows[0]}`).appendChild(inlineCard);
    });
}

// --- 6. Timer & Game Over ---
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        const timeSinceLast = Date.now() - lastWordTime;
        
        if (isStreakActive) { if (timeSinceLast > 12000) resetStreak(); } 
        else if (streakCount > 0) { if (timeSinceLast > 6000) resetStreak(); }

        if (timeLeft <= 0) { timeLeft = 0; endGame(); }
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
}

function endGame() {
    clearInterval(timerInterval); gameActive = false; omniBox.disabled = true; resetStreak(); 
    if (endEarlyBtn) endEarlyBtn.classList.add("hidden"); 
    
    try {
        if (isDailyMode) localStorage.setItem("darnWortlerLastDaily", currentDailyID);
    } catch (e) {
        console.warn("Could not save daily status. LocalStorage is blocked.");
    }
    
    finalScoreText.textContent = `Total Score: ${totalScore}`;
    finalScoreBreakdown.textContent = `Base: ${baseScore} | Bonus: ${bonusScore} | Penalty: -${penaltyScore}`;
    allSolutionsList.innerHTML = ""; 

    Object.keys(targetPools).forEach(key => {
        const pool = targetPools[key];
        pool.validWords.forEach(word => {
            const card = document.createElement("div"); card.className = `word-card ${pool.baseColorClass}`;
            const isFound = pool.foundWords.includes(word); const isObscure = !bonusBarrierSet.has(word);
            if (isFound) card.classList.add("strikethrough");
            if (isObscure) { card.classList.add("obscure-word"); card.textContent = word + " ✨"; } 
            else { card.textContent = word; }
            allSolutionsList.appendChild(card);
        });
    });
    
    gameOverSection.classList.remove("hidden"); gameOverSection.scrollIntoView({ behavior: 'smooth' });
}
