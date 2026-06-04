// --- 1. Game State & Online Dictionaries ---
let targetWord = ""; 
let commonWordsList = [];
let validWordsSet = new Set();
let commonWordsSet = new Set(); 
let bonusBarrierSet = new Set(); 

let targetPools = {}; 
let baseScore = 0;
let bonusScore = 0;
let penaltyScore = 0; 
let totalScore = 0;
let timerInterval;
let timeLeft = 300; 
let gameActive = false;

let cachedMiddleTiles = []; 

let isDailyMode = false;
let currentDailyID = Math.floor(Date.now() / 86400000); 

let streakCount = 0;
let isStreakActive = false;
let lastWordTime = 0; 

const commonDictURL = "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt"; 
const fullDictURL = "https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt"; 
const expandedDictURL = "https://raw.githubusercontent.com/charlesreid1/five-letter-words/master/sgb-words.txt"; 

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

// --- 2. Initialization ---
async function loadDictionaries() {
    try {
        const resCommon = await fetch(commonDictURL);
        commonWordsList = (await resCommon.text()).split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

        const resFull = await fetch(fullDictURL);
        const fullArray = (await resFull.text()).split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
        
        const resExpanded = await fetch(expandedDictURL);
        const expandedArray = (await resExpanded.text()).split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

        validWordsSet = new Set([...commonWordsList, ...fullArray]);
        commonWordsSet = new Set(commonWordsList); 
        bonusBarrierSet = new Set([...commonWordsList, ...expandedArray]);

        const lastPlayedDaily = localStorage.getItem("darnWortlerLastDaily");
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
        console.error("Dictionary fetch failed.", error);
        alert("Failed to load dictionaries. Please refresh the page.");
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
    
    // Garbage collection timed to the longest CSS animation
    setTimeout(() => { fct.remove(); }, 1200);
}

function updateScoreUI() {
    totalScore = baseScore + bonusScore - penaltyScore;
    scoreTotalDisplay.textContent = `Total: ${totalScore}`;
    scoreBreakdownDisplay.textContent = `Base: ${baseScore} | Bonus: ${bonusScore} | Penalty: -${penaltyScore}`;
}

function resetStreak() {
    streakCount = 0;
    isStreakActive = false;
    omniBox.classList.remove("streak-active-box");
    streakIndicator.classList.add("hidden");
}

startGameBtn.addEventListener("click", () => {
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
    
    // NEW: The Ghost Counter to align the Seed Row perfectly
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
        } else {
            targetPools[key].rows.push(r + 1);
        }
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

        // Valid Word Logic
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
        
        // Spawn Dynamic Base FCT (Shoots Left)
        spawnFCT(`+${points}`, "base", "left");
        
        if (isObscure) {
            bonusScore += 50; 
            setTimeout(() => spawnF
