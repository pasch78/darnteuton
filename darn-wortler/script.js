// --- 1. Game State & Online Dictionaries ---
let targetWord = ""; 
let commonWordsList = [];
let validWordsSet = new Set();
let commonWordsSet = new Set(); 

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

const commonDictURL = "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt"; 
const fullDictURL = "https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt"; 

// --- DOM Elements (Strict ID Matching) ---
const startScreen = document.getElementById("start-screen");
const startGameBtn = document.getElementById("start-game-btn");
const gameContainer = document.getElementById("game-container");
const gameBoard = document.getElementById("game-board"); 
const omniBox = document.getElementById("omni-box");
const foundWordsContainer = document.getElementById("found-words-container");
const endEarlyBtn = document.getElementById("end-early-btn"); 

const timerDisplay = document.getElementById("timer");
const scoreTotalDisplay = document.getElementById("score-total-display"); 
const scoreBreakdownDisplay = document.getElementById("score-breakdown-display"); 
const hud = document.getElementById("hud");
const actionNotification = document.getElementById("action-notification"); 
const modeIndicator = document.getElementById("mode-indicator"); 

const gameOverSection = document.getElementById("game-over-section");
const finalScoreText = document.getElementById("final-score");
const finalScoreBreakdown = document.getElementById("final-score-breakdown");
const allSolutionsList = document.getElementById("all-solutions-list");
const playAgainBtn = document.getElementById("play-again-btn");

// --- Centralized DOM Validation ---
// This guarantees we fail fast and loud if the HTML and JS ever fall out of sync.
const criticalUIElements = {
    "start-screen": startScreen,
    "start-game-btn": startGameBtn,
    "game-container": gameContainer,
    "game-board": gameBoard,
    "omni-box": omniBox,
    "end-early-btn": endEarlyBtn,
    "hud": hud,
    "mode-indicator": modeIndicator,
    "game-over-section": gameOverSection,
    "play-again-btn": playAgainBtn
};

for (const [id, element] of Object.entries(criticalUIElements)) {
    if (!element) {
        console.error(`[UI Validation Error] Critical element missing from DOM: id="${id}"`);
    }
}

// --- 2. Initialization ---
async function loadDictionaries() {
    try {
        const resCommon = await fetch(commonDictURL);
        const textCommon = await resCommon.text();
        commonWordsList = textCommon.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

        const resFull = await fetch(fullDictURL);
        const textFull = await resFull.text();
        const fullArray = textFull.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
        
        validWordsSet = new Set([...commonWordsList, ...fullArray]);
        commonWordsSet = new Set(commonWordsList); 

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

// --- 3. Core Engine Functions ---
if (endEarlyBtn) {
    endEarlyBtn.addEventListener("click", () => {
        if (!gameActive) return;
        timeLeft = 0; 
        updateTimerDisplay(); 
        endGame(); 
    });
}

function updateScoreUI() {
    totalScore = baseScore + bonusScore - penaltyScore;
    scoreTotalDisplay.textContent = `Total: ${totalScore}`;
    scoreBreakdownDisplay.textContent = `Base: ${baseScore} | Bonus: ${bonusScore} | Penalty: -${penaltyScore}`;
}

startGameBtn.addEventListener("click", () => {
    startScreen.classList.add("hidden");
    gameContainer.classList.remove("hidden");
    hud.classList.remove("hidden");
    
    generateBoard();
    startTimer();
    
    gameActive = true;
    omniBox.disabled = false;
    omniBox.focus();
});

playAgainBtn.addEventListener("click", () => {
    baseScore = 0;
    bonusScore = 0;
    penaltyScore = 0; 
    timeLeft = 300;
    targetPools = {}; 
    
    updateScoreUI();
    foundWordsContainer.innerHTML = "";
    omniBox.value = "";
    gameOverSection.classList.add("hidden");
    
    if (endEarlyBtn) endEarlyBtn.classList.remove("hidden"); 
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    isDailyMode = false;
    modeIndicator.textContent = "Practice Mode";
    modeIndicator.className = "mode-practice";
    targetWord = commonWordsList[Math.floor(Math.random() * commonWordsList.length)];
    
    generateBoard();
    startTimer();
    gameActive = true;
    omniBox.disabled = false;
    omniBox.focus();
});

// --- 4. Board Generation Logic ---
function generateBoard() {
    const letters = targetWord.split("");
    const reverseLetters = [...letters].reverse();
    
    gameBoard.innerHTML = ""; 

    const seedWrapper = document.createElement("div");
    seedWrapper.className = "row-wrapper seed-row-wrapper";
    
    const seedTilesDiv = document.createElement("div");
    seedTilesDiv.className = "row-tiles";

    for (let i = 0; i < 5; i++) {
        const tile = document.createElement("div");
        tile.className = "tile bg-col1"; 
        tile.textContent = letters[i];
        seedTilesDiv.appendChild(tile);
    }
    
    seedWrapper.appendChild(seedTilesDiv);
    gameBoard.appendChild(seedWrapper);
    
    for (let r = 0; r < 5; r++) {
        const startL = letters[r];
        const endL = reverseLetters[r];
        const key = `${startL}${endL}`; 
        
        if (!targetPools[key]) {
            targetPools[key] = {
                validWords: Array.from(validWordsSet).filter(w => w.startsWith(startL) && w.endsWith(endL)),
                foundWords: [],
                rows: [r + 1], 
                baseColorClass: `text-col${r + 1}`,
                bgColorClass: `bg-col${r + 1}`
            };
        } else {
            targetPools[key].rows.push(r + 1);
        }
    }

    for (let r = 0; r < 5; r++) {
        const startL = letters[r];
        const endL = reverseLetters[r];
        const key = `${startL}${endL}`;
        const pool = targetPools[key];
        
        const isDuplicate = pool.rows[0] !== (r + 1); 
        const isDead = pool.validWords.length === 0;

        const rowWrapper = document.createElement("div");
        rowWrapper.className = "row-wrapper";
        
        if (isDead) {
            rowWrapper.classList.add("dead-row");
        }

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
                
                if (!isDead) {
                    tile.dataset.startLetter = startL;
                }
            }
            tilesDiv.appendChild(tile);
        }
        rowWrapper.appendChild(tilesDiv);

        const progressDiv = document.createElement("div");
        progressDiv.className = "row-progress";
        progressDiv.id = `prog-row-${r+1}`;
        
        if (isDead) {
            progressDiv.textContent = `0 Possible Words`;
            progressDiv.style.color = "var(--grayed-out)";
        } else if (isDuplicate) {
            progressDiv.textContent = `Merged with Row ${pool.rows[0]}`;
            progressDiv.style.color = "var(--grayed-out)";
        } else {
            progressDiv.textContent = `0 / ${pool.validWords.length} Words Found`;
            progressDiv.classList.add(pool.baseColorClass);
        }
        
        rowWrapper.appendChild(progressDiv);
        gameBoard.appendChild(rowWrapper);
    }

    cachedMiddleTiles = Array.from(document.querySelectorAll(".middle-tile"));

    const row1Key = `${targetWord[0]}${targetWord[4]}`;
    const row1Pool = targetPools[row1Key];
    
    if (row1Pool && !row1Pool.foundWords.includes(targetWord)) {
        row1Pool.foundWords.push(targetWord);
        document.getElementById(`prog-row-${row1Pool.rows[0]}`).textContent = `${row1Pool.foundWords.length} / ${row1Pool.validWords.length} Words Found`;

        const card = document.createElement("div");
        card.className = `word-card ${row1Pool.baseColorClass}`;
        card.textContent = targetWord;
        foundWordsContainer.appendChild(card);
    }
}

// --- 5. Omni-Box Input Logic ---
if (omniBox) {
    omniBox.addEventListener("input", () => {
        if (!gameActive) return;
        const guess = omniBox.value.toUpperCase().trim();
        
        cachedMiddleTiles.forEach(tile => {
            tile.textContent = "";
            tile.classList.remove("active-typing"); 
        });
        
        if (guess.length > 0) {
            const firstLetter = guess[0];
            cachedMiddleTiles.forEach(tile => {
                if (tile.dataset.startLetter === firstLetter) {
                    const colIndex = parseInt(tile.id.split('-')[3]); 
                    if (guess[colIndex]) {
                        tile.textContent = guess[colIndex];
                        tile.classList.add("active-typing"); 
                    }
                }
            });
        }
    });

    omniBox.addEventListener("keydown", (e) => {
        if (!gameActive || e.key !== "Enter") return;
        
        const guess = omniBox.value.toUpperCase().trim();
        
        omniBox.value = ""; 
        cachedMiddleTiles.forEach(tile => {
            tile.textContent = "";
            tile.classList.remove("active-typing"); 
        });

        if (guess.length !== 5) return;

        const startL = guess[0];
        const endL = guess[4];
        const key = `${startL}${endL}`;
        const pool = targetPools[key];

        if (!pool || pool.validWords.length === 0) {
            shakeInput();
            return;
        }

        if (pool.foundWords.includes(guess)) {
            shakeInput();
            return;
        }

        if (!pool.validWords.includes(guess)) {
            penaltyScore += 10; 
            updateScoreUI();
            showAction("-10 pts (Fake Word)", "penalty");
            shakeInput();
            return;
        }

        const isObscure = !commonWordsSet.has(guess);
        pool.foundWords.push(guess);
        
        const multiplier = pool.rows.length;
        const points = Math.round(1000 / pool.validWords.length) * multiplier;
        baseScore += points;

        if (isObscure) {
            bonusScore += 50; 
            showAction("+50 pts (Rare Word!)", "bonus");
        }
        
        updateScoreUI();

        document.getElementById(`prog-row-${pool.rows[0]}`).textContent = `${pool.foundWords.length} / ${pool.validWords.length} Words Found`;

        const card = document.createElement("div");
        card.className = `word-card ${pool.baseColorClass}`;
        
        if (isObscure) {
            card.classList.add("obscure-word");
            card.textContent = guess + " ✨";
        } else {
            card.textContent = guess;
        }
        
        foundWordsContainer.appendChild(card);
    });
}

function shakeInput() {
    omniBox.classList.add("shake");
    setTimeout(() => omniBox.classList.remove("shake"), 400);
}

function showAction(message, type) {
    actionNotification.textContent = message;
    actionNotification.className = type === "penalty" ? "action-penalty" : "action-bonus";
    actionNotification.classList.remove("hidden");
    
    setTimeout(() => actionNotification.classList.add("hidden"), 1500);
}

// --- 6. The Timer & Game Over Logic ---
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            timeLeft = 0;
            endGame();
        }
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
}

function endGame() {
    clearInterval(timerInterval);
    gameActive = false;
    omniBox.disabled = true;
    
    if (endEarlyBtn) endEarlyBtn.classList.add("hidden"); 
    
    if (isDailyMode) {
        localStorage.setItem("darnWortlerLastDaily", currentDailyID);
    }
    
    finalScoreText.textContent = `Total Score: ${totalScore}`;
    finalScoreBreakdown.textContent = `Base: ${baseScore} | Bonus: ${bonusScore} | Penalty: -${penaltyScore}`;
    
    allSolutionsList.innerHTML = ""; 

    Object.keys(targetPools).forEach(key => {
        const pool = targetPools[key];
        
        pool.validWords.forEach(word => {
            const card = document.createElement("div");
            card.className = `word-card ${pool.baseColorClass}`;
            
            const isFound = pool.foundWords.includes(word);
            const isObscure = !commonWordsSet.has(word);

            if (isFound) card.classList.add("strikethrough");
            
            if (isObscure) {
                card.classList.add("obscure-word");
                card.textContent = word + " ✨";
            } else {
                card.textContent = word;
            }
            
            allSolutionsList.appendChild(card);
        });
    });
    
    gameOverSection.classList.remove("hidden");
    gameOverSection.scrollIntoView({ behavior: 'smooth' });
}
