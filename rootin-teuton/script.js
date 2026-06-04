// --- 1. Game State & Online Dictionaries ---
let targetWord = ""; 
let phase1Answers = [];
let validWordsSet = new Set();
let commonWordsSet = new Set(); 

let currentRow = 0;
let currentTile = 0;
let guesses = [[], [], [], [], [], []];
let isPhase1Active = false; 

const answersURL = "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt"; 
const fullDictURL = "https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt"; 

async function loadDictionaries() {
    try {
        const resAnswers = await fetch(answersURL);
        const textAnswers = await resAnswers.text();
        phase1Answers = textAnswers.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

        const resFull = await fetch(fullDictURL);
        const textFull = await resFull.text();
        const fullArray = textFull.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);
        
        validWordsSet = new Set([...phase1Answers, ...fullArray]);
        commonWordsSet = new Set(phase1Answers); 

        targetWord = phase1Answers[Math.floor(Math.random() * phase1Answers.length)];
        
        isPhase1Active = true;
        initPhase1(); 
    } catch (error) {
        console.error("Dictionary fetch failed.", error);
        alert("Failed to load dictionaries. Please refresh the page.");
    }
}

loadDictionaries();

// --- DOM Elements ---
const wordleGrid = document.getElementById("wordle-grid");
const keyboardVisual = document.getElementById("keyboard-visual"); 
const transitionOverlay = document.getElementById("transition-overlay");
const skipPhase1Btn = document.getElementById("skip-phase1-btn");
const devEndPhase2Btn = document.getElementById("dev-end-phase2-btn"); 

if (skipPhase1Btn) {
    skipPhase1Btn.addEventListener("click", () => {
        if (!isPhase1Active) return;

        const targetArr = targetWord.split("");
        for (let c = 0; c < 5; c++) {
            const tile = document.getElementById(`tile-${currentRow}-${c}`);
            if (tile) {
                tile.textContent = targetArr[c];
                tile.classList.add("correct", "filled");
                updateKeyboardColor(targetArr[c], "correct"); 
            }
        }
        endPhase1();
    });
}

if (devEndPhase2Btn) {
    devEndPhase2Btn.addEventListener("click", () => {
        if (!phase2Active) return;
        timeLeft = 0; 
        updateTimerDisplay(); 
        endPhase2(); 
    });
}

// --- 2. Build the Phase 1 Board & Keyboard ---
function initPhase1() {
    wordleGrid.innerHTML = "";
    for (let r = 0; r < 6; r++) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "wordle-row";
        rowDiv.id = `row-${r}`;
        for (let c = 0; c < 5; c++) {
            const tileDiv = document.createElement("div");
            tileDiv.className = "tile";
            tileDiv.id = `tile-${r}-${c}`;
            rowDiv.appendChild(tileDiv);
        }
        wordleGrid.appendChild(rowDiv);
    }

    const keyboardRows = [
        ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
        ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
        ["Z", "X", "C", "V", "B", "N", "M"]
    ];
    
    keyboardVisual.innerHTML = "";
    keyboardRows.forEach(row => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "keyboard-row";
        row.forEach(letter => {
            const keyDiv = document.createElement("div");
            keyDiv.className = "key";
            keyDiv.id = `key-${letter}`;
            keyDiv.textContent = letter;
            rowDiv.appendChild(keyDiv);
        });
        keyboardVisual.appendChild(rowDiv);
    });
}

// --- 3. Keyboard Input Logic ---
document.addEventListener("keydown", (e) => {
    if (!isPhase1Active) return; 
    
    const key = e.key.toUpperCase();
    if (key === "ENTER") {
        submitGuess();
    } else if (key === "BACKSPACE") {
        removeLetter();
    } else if (/^[A-Z]$/.test(key) && key.length === 1) {
        addLetter(key);
    }
});

function addLetter(letter) {
    if (currentTile < 5 && currentRow < 6) {
        guesses[currentRow][currentTile] = letter;
        const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
        tile.textContent = letter;
        tile.classList.add("filled");
        currentTile++;
    }
}

function removeLetter() {
    if (currentTile > 0) {
        currentTile--;
        guesses[currentRow][currentTile] = "";
        const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
        tile.textContent = "";
        tile.classList.remove("filled");
    }
}

// --- 4. Guess Validation & Color Coding ---
function submitGuess() {
    if (currentTile !== 5) return; 
    
    const guess = guesses[currentRow].join("");
    if (!validWordsSet.has(guess)) {
        const rowDiv = document.getElementById(`row-${currentRow}`);
        rowDiv.classList.add("shake");
        setTimeout(() => rowDiv.classList.remove("shake"), 400);
        return;
    }
    checkWinCondition(guess);
}

function updateKeyboardColor(letter, status) {
    const keyElement = document.getElementById(`key-${letter}`);
    if (!keyElement) return;
    
    if (keyElement.classList.contains("correct")) return;
    if (keyElement.classList.contains("present") && status === "absent") return;
    
    keyElement.classList.remove("absent", "present", "correct");
    keyElement.classList.add(status);
}

function checkWinCondition(guess) {
    const targetArr = targetWord.split("");
    const guessArr = guess.split("");
    const tileElements = document.getElementById(`row-${currentRow}`).childNodes;
    
    guessArr.forEach((letter, i) => {
        if (letter === targetArr[i]) {
            tileElements[i].classList.add("correct");
            updateKeyboardColor(letter, "correct");
            targetArr[i] = null; 
            guessArr[i] = null;  
        }
    });
    
    guessArr.forEach((letter, i) => {
        if (letter !== null) {
            if (targetArr.includes(letter)) {
                tileElements[i].classList.add("present");
                updateKeyboardColor(letter, "present");
                targetArr[targetArr.indexOf(letter)] = null; 
            } else {
                tileElements[i].classList.add("absent");
                updateKeyboardColor(letter, "absent");
            }
        }
    });
    
    if (guess === targetWord) {
        endPhase1();
    } else {
        currentRow++;
        currentTile = 0;
        if (currentRow > 5) endPhase1(); 
    }
}

// --- 5. Transition to Phase 2 ---
function endPhase1() {
    isPhase1Active = false;
    setTimeout(() => {
        transitionOverlay.classList.remove("hidden");
    }, 1500);
}

// --- 6. Phase 2 State & Setup ---
const targetPools = {}; 
let baseScore = 0;
let bonusScore = 0;
let totalScore = 0;
let timerInterval;
let timeLeft = 300; 
let phase2Active = false;

const phase1Container = document.getElementById("phase1-container");
const phase2Container = document.getElementById("phase2-container");
const startTimerBtn = document.getElementById("start-timer-btn");
const phase2Board = document.getElementById("phase2-board"); 
const omniBox = document.getElementById("omni-box");
const foundWordsContainer = document.getElementById("found-words-container");

const timerDisplay = document.getElementById("timer");
const scoreTotalDisplay = document.getElementById("score-total-display"); 
const scoreBreakdownDisplay = document.getElementById("score-breakdown-display"); 

const hud = document.getElementById("hud");
const actionNotification = document.getElementById("action-notification"); 

// NEW: End Game Elements
const gameOverSection = document.getElementById("game-over-section");
const finalScoreText = document.getElementById("final-score");
const finalScoreBreakdown = document.getElementById("final-score-breakdown");
const allSolutionsList = document.getElementById("all-solutions-list");

// --- 7. Transition Logic ---
if (startTimerBtn) {
    startTimerBtn.addEventListener("click", () => {
        transitionOverlay.classList.add("hidden");
        phase1Container.classList.add("hidden");
        phase2Container.classList.remove("hidden");
        hud.classList.remove("hidden");
        
        generatePhase2Board();
        startTimer();
        
        phase2Active = true;
        omniBox.disabled = false;
        omniBox.focus();
    });
}

// --- 8. Phase 2 Generation Logic ---
function generatePhase2Board() {
    const letters = targetWord.split("");
    const reverseLetters = [...letters].reverse();
    
    phase2Board.innerHTML = ""; 
    
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

        const rowWrapper = document.createElement("div");
        rowWrapper.className = "phase2-row-wrapper";

        const tilesDiv = document.createElement("div");
        tilesDiv.className = "phase2-row-tiles";

        for (let c = 0; c < 5; c++) {
            const tile = document.createElement("div");
            tile.className = "tile";
            
            if (c === 0) {
                tile.textContent = startL;
                tile.classList.add(isDuplicate ? "bg-gray" : pool.bgColorClass);
            } else if (c === 4) {
                tile.textContent = endL;
                tile.classList.add(isDuplicate ? "bg-gray" : pool.bgColorClass);
            }
            tilesDiv.appendChild(tile);
        }
        rowWrapper.appendChild(tilesDiv);

        const progressDiv = document.createElement("div");
        progressDiv.className = "phase2-progress";
        progressDiv.id = `prog-row-${r+1}`;
        
        if (isDuplicate) {
            progressDiv.textContent = `Merged with Row ${pool.rows[0]}`;
            progressDiv.style.color = "var(--grayed-out)";
        } else {
            progressDiv.textContent = `0 / ${pool.validWords.length} Words Found`;
            progressDiv.classList.add(pool.baseColorClass);
        }
        
        rowWrapper.appendChild(progressDiv);
        phase2Board.appendChild(rowWrapper);
    }

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

// --- 9. The Omni-Box Input Logic ---
if (omniBox) {
    omniBox.addEventListener("keydown", (e) => {
        if (!phase2Active || e.key !== "Enter") return;
        
        const guess = omniBox.value.toUpperCase().trim();
        omniBox.value = ""; 
        
        if (guess.length !== 5) return;

        const startL = guess[0];
        const endL = guess[4];
        const key = `${startL}${endL}`;
        const pool = targetPools[key];

        if (!pool || pool.validWords.length === 0) {
            showAction("Missing Constraint: -5s", -5, "penalty");
            shakeInput();
            return;
        }

        if (pool.foundWords.includes(guess)) {
            shakeInput();
            return;
        }

        if (!pool.validWords.includes(guess)) {
            showAction("Fake Word: -10s", -10, "penalty");
            shakeInput();
            return;
        }

        const isObscure = !commonWordsSet.has(guess);
        pool.foundWords.push(guess);
        
        const points = Math.round(1000 / pool.validWords.length);
        baseScore += points;

        if (isObscure) {
            bonusScore += 50;
            showAction("Rare Word! +50 pts", 0, "bonus");
        }
        
        totalScore = baseScore + bonusScore;
        
        scoreTotalDisplay.textContent = `Total: ${totalScore}`;
        scoreBreakdownDisplay.textContent = `Base: ${baseScore} | Bonus: ${bonusScore}`;

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

function showAction(message, secondsChange, type) {
    timeLeft += secondsChange; 
    if (timeLeft < 0) timeLeft = 0;
    
    actionNotification.textContent = message;
    actionNotification.className = type === "penalty" ? "action-penalty" : "action-bonus";
    actionNotification.classList.remove("hidden");
    
    setTimeout(() => actionNotification.classList.add("hidden"), 1500);
    
    updateTimerDisplay();
}

// --- 10. The Timer & Game Over Logic ---
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            timeLeft = 0;
            endPhase2();
        }
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
}

function endPhase2() {
    clearInterval(timerInterval);
    phase2Active = false;
    omniBox.disabled = true;
    if (devEndPhase2Btn) devEndPhase2Btn.classList.add("hidden");
    
    // Final UI Updates
    finalScoreText.textContent = `Total Score: ${totalScore}`;
    finalScoreBreakdown.textContent = `Base: ${baseScore} | Bonus: ${bonusScore}`;
    
    allSolutionsList.innerHTML = ""; // Clear out any old data

    Object.keys(targetPools).forEach(key => {
        const pool = targetPools[key];
        
        pool.validWords.forEach(word => {
            const card = document.createElement("div");
            card.className = `word-card ${pool.baseColorClass}`;
            
            const isFound = pool.foundWords.includes(word);
            const isObscure = !commonWordsSet.has(word);

            // Apply Strikethrough if the player found it
            if (isFound) {
                card.classList.add("strikethrough");
            }
            
            // Apply Golden Flair if it is a rare word
            if (isObscure) {
                card.classList.add("obscure-word");
                card.textContent = word + " ✨";
            } else {
                card.textContent = word;
            }
            
            allSolutionsList.appendChild(card);
        });
    });
    
    // Reveal the section and scroll down to it naturally
    gameOverSection.classList.remove("hidden");
    gameOverSection.scrollIntoView({ behavior: 'smooth' });
}
