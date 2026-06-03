// --- 1. Game State & Online Dictionaries ---
let targetWord = ""; 
let phase1Answers = [];
let validWordsSet = new Set();

let currentRow = 0;
let currentTile = 0;
let guesses = [[], [], [], [], [], []];
let isPhase1Active = false; 

// Correct GitHub GIST raw URLs for the official lists
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

// --- Dev Cheat: Skip Phase 1 ---
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

// --- Dev Cheat: Skip Phase 2 ---
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
    // Build Grid
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

    // Build Visual Keyboard
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

// Helper: Update Keyboard visual states
function updateKeyboardColor(letter, status) {
    const keyElement = document.getElementById(`key-${letter}`);
    if (!keyElement) return;
    
    // Prevent downgrading a green/yellow key
    if (keyElement.classList.contains("correct")) return;
    if (keyElement.classList.contains("present") && status === "absent") return;
    
    keyElement.classList.remove("absent", "present", "correct");
    keyElement.classList.add(status);
}

function checkWinCondition(guess) {
    const targetArr = targetWord.split("");
    const guessArr = guess.split("");
    const tileElements = document.getElementById(`row-${currentRow}`).childNodes;
    
    // First Pass: Green
    guessArr.forEach((letter, i) => {
        if (letter === targetArr[i]) {
            tileElements[i].classList.add("correct");
            updateKeyboardColor(letter, "correct");
            targetArr[i] = null; 
            guessArr[i] = null;  
        }
    });
    
    // Second Pass: Yellow/Gray
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
    
    // Check End State
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
let score = 0;
let timerInterval;
let timeLeft = 300; 
let phase2Active = false;

// UI Elements for Phase 2
const phase1Container = document.getElementById("phase1-container");
const phase2Container = document.getElementById("phase2-container");
const startTimerBtn = document.getElementById("start-timer-btn");
const grid5x5 = document.getElementById("grid-5x5");
const targetRow = document.getElementById("target-row");
const progressRow = document.getElementById("progress-row");
const omniBox = document.getElementById("omni-box");
const foundWordsContainer = document.getElementById("found-words-container");
const timerDisplay = document.getElementById("timer");
const scoreDisplay = document.getElementById("score");
const hud = document.getElementById("hud");
const penaltyNotification = document.getElementById("penalty-notification");

// Modal Elements
const gameOverModal = document.getElementById("game-over-modal");
const finalScoreText = document.getElementById("final-score");
const missedWordsList = document.getElementById("missed-words-list");

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
    
    for (let c = 0; c < 5; c++) {
        const startL = letters[c];
        const endL = reverseLetters[c];
        const key = `${startL}${endL}`; 
        
        if (!targetPools[key]) {
            targetPools[key] = {
                validWords: Array.from(validWordsSet).filter(w => w.startsWith(startL) && w.endsWith(endL)),
                foundWords: [],
                columns: [c + 1], 
                baseColorClass: `text-col${c + 1}` 
            };
        } else {
            targetPools[key].columns.push(c + 1);
        }
    }

    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const tile = document.createElement("div");
            tile.className = `tile col-${c+1}`;
            
            const startL = letters[c];
            const endL = reverseLetters[c];
            const key = `${startL}${endL}`;
            const pool = targetPools[key];
            const isDuplicate = pool.columns[0] !== (c + 1); 

            if (r === 0) {
                tile.textContent = startL;
                if (isDuplicate) {
                    tile.style.backgroundColor = `var(--grayed-out)`;
                    tile.style.borderColor = `var(--grayed-out)`;
                    tile.style.color = "white";
                } else {
                    tile.style.backgroundColor = `var(--col${c+1})`;
                    tile.style.borderColor = `var(--col${c+1})`;
                    tile.style.color = "white";
                }
            } else if (r === 4) {
                tile.textContent = endL;
                if (isDuplicate) {
                    tile.style.backgroundColor = `var(--grayed-out)`;
                    tile.style.borderColor = `var(--grayed-out)`;
                    tile.style.color = "white";
                } else {
                    tile.style.backgroundColor = `var(--col${c+1})`;
                    tile.style.borderColor = `var(--col${c+1})`;
                    tile.style.color = "white";
                }
            }
            grid5x5.appendChild(tile);
        }
    }

    for (let c = 0; c < 5; c++) {
        const startL = letters[c];
        const endL = reverseLetters[c];
        const key = `${startL}${endL}`;
        const pool = targetPools[key];
        const isDuplicate = pool.columns[0] !== (c + 1);
        
        const targetDiv = document.createElement("div");
        const progressDiv = document.createElement("div");
        progressDiv.id = `prog-col-${c+1}`;
        
        if (isDuplicate) {
            targetDiv.textContent = "-";
            targetDiv.style.color = "var(--grayed-out)";
            progressDiv.textContent = "-";
            progressDiv.style.color = "var(--grayed-out)";
        } else if (pool.validWords.length === 0) {
            targetDiv.textContent = "0";
            progressDiv.textContent = "0";
        } else {
            targetDiv.textContent = pool.validWords.length;
            progressDiv.textContent = "0";
            progressDiv.className = pool.baseColorClass;
        }
        
        targetRow.appendChild(targetDiv);
        progressRow.appendChild(progressDiv);
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
            applyPenalty(5, "Missing Constraint: -5s");
            shakeInput();
            return;
        }

        if (pool.foundWords.includes(guess)) {
            shakeInput();
            return;
        }

        if (!pool.validWords.includes(guess)) {
            applyPenalty(10, "Fake Word: -10s");
            shakeInput();
            return;
        }

        pool.foundWords.push(guess);
        
        const points = Math.round(100 / pool.validWords.length);
        score += points;
        if (score > 500) score = 500; 
        scoreDisplay.textContent = `Score: ${score}`;

        document.getElementById(`prog-col-${pool.columns[0]}`).textContent = pool.foundWords.length;

        const card = document.createElement("div");
        card.className = `word-card ${pool.baseColorClass}`;
        card.textContent = guess;
        foundWordsContainer.appendChild(card);
    });
}

function shakeInput() {
    omniBox.classList.add("shake");
    setTimeout(() => omniBox.classList.remove("shake"), 400);
}

function applyPenalty(seconds, message) {
    timeLeft -= seconds;
    if (timeLeft < 0) timeLeft = 0;
    
    penaltyNotification.textContent = message;
    penaltyNotification.classList.remove("hidden");
    setTimeout(() => penaltyNotification.classList.add("hidden"), 1500);
    
    updateTimerDisplay();
}

// --- 10. The Timer & Game Over ---
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
    
    finalScoreText.textContent = `Total Score: ${score} / 500`;
    
    Object.keys(targetPools).forEach(key => {
        const pool = targetPools[key];
        pool.validWords.forEach(word => {
            if (!pool.foundWords.includes(word)) {
                const card = document.createElement("div");
                card.className = `word-card ${pool.baseColorClass}`;
                card.style.opacity = "0.6"; 
                card.textContent = word;
                missedWordsList.appendChild(card);
            }
        });
    });
    
    gameOverModal.classList.remove("hidden");
}
