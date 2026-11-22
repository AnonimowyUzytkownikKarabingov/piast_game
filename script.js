const grid = document.querySelector('.grid');
const scoreDisplay = document.getElementById('score');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const congratsMessage = document.getElementById('congrats-message');
const goAgainBtn = document.getElementById('go-again-btn');
const pickupMessage = document.getElementById('pickup-message');
const timeDisplay = document.getElementById('time');
const vanillaButton = document.getElementById('vanilla-button');
const dlcButton = document.getElementById('dlc-button');

const width = 28;
const height = 25;
const totalSquares = width * height;

// === Tryby gry ===
// 'vanilla' - gra sprzed DLC, 'dlc' - Odyseja Piastowska (klamka, kulosik)
let mode = 'vanilla';
const restartLabels = {
  vanilla: 'Nasraj na nowo',
  dlc: 'Ewka zrób misraki',
};

const specialDotPoints = 2;

// === DLC ===
const klamkaPoints = 10;
const klamkaMaxPickups = 3;
const klamkaVisibleMin = 10000;
const klamkaVisibleMax = 15000;
const klamkaHiddenTime = 5000;

const kulosikPoints = 20;
const kulosikDelayMin = 35000; // 30 s gry + 5..15 s
const kulosikDelayMax = 45000;
const kulosikStepTime = 450;
const kulosikMinSpawnDistance = 12;

let squares = [];
let pacmanIndex = 0;
let score = 0;
let gameRunning = false;
let canMove = true;

let ghosts = [];
let ghostTimers = [];
let dlcTimers = [];
let pickupMessageTimer = null;
let gameStartTime = 0;
let gameClockTimer = null;

let klamkaIndex = -1;
let klamkaPickups = 0;
let klamkaHideTimer = null;
let kulosik = null;
let mamoIndex = -1;

const pressedKeys = new Set();

// === Sound Setup ===
const startSound = new Audio('sounds/startsound.mp3');
const winSound = new Audio('sounds/win.mp3');
const kulosikCatchSound = new Audio('sounds/kulosik.mp3');

function generateLayout() {
  const layout = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (
        r === 0 || r === height - 1 || c === 0 || c === width - 1 ||
        (r % 6 === 0 && c % 5 !== 0)
      ) {
        layout.push(1);
      } else {
        layout.push(0);
      }
    }
  }
  return layout;
}

let layout = generateLayout();

function createBoard() {
  grid.innerHTML = '';
  squares = [];

  for (let i = 0; i < totalSquares; i++) {
    const square = document.createElement('div');
    grid.appendChild(square);
    squares.push(square);

    if (layout[i] === 1) {
      square.classList.add('wall');
    } else {
      square.classList.add('pac-dot');
    }
  }

  const pacDotIndices = squares
    .map((sq, i) => (sq.classList.contains('pac-dot') ? i : -1))
    .filter(i => i !== -1);

  const specialDotsCount = 15;
  const specialDots = new Set();

  while (specialDots.size < specialDotsCount) {
    const randIdx = pacDotIndices[Math.floor(Math.random() * pacDotIndices.length)];
    specialDots.add(randIdx);
  }

  specialDots.forEach(idx => {
    squares[idx].classList.remove('pac-dot');
    squares[idx].classList.add('special-dot');
  });
}

function placePacman() {
  const startIndex = width * Math.floor(height / 2) + Math.floor(width / 2);
  pacmanIndex = startIndex;
  squares[pacmanIndex].classList.add('pacman');
}

function dotsLeft() {
  return squares.some(sq =>
    sq.classList.contains('pac-dot') || sq.classList.contains('special-dot')
  );
}

function showPickupMessage(text) {
  clearTimeout(pickupMessageTimer);
  pickupMessage.textContent = text;
  pickupMessage.classList.add('blink');
  pickupMessageTimer = setTimeout(() => {
    pickupMessage.textContent = '';
    pickupMessage.classList.remove('blink');
  }, 2000);
}

function clearPickupMessage() {
  clearTimeout(pickupMessageTimer);
  pickupMessage.textContent = '';
  pickupMessage.classList.remove('blink');
}

class Ghost {
  constructor(startIndex, className) {
    this.currentIndex = startIndex;
    this.className = className;
    squares[this.currentIndex].classList.add('ghost', this.className);
  }

  move() {
    const directions = [-1, 1, -width, width];
    let direction = directions[Math.floor(Math.random() * directions.length)];

    const timerId = setInterval(() => {
      if (!gameRunning) {
        clearInterval(timerId);
        return;
      }

      const nextIndex = this.currentIndex + direction;

      // Duch łazi losowo jak wcześniej (nie goni gracza), ale wejście na pole gracza go zabija
      if (nextIndex === pacmanIndex) {
        endGame();
        return;
      }

      if (
        nextIndex >= 0 &&
        nextIndex < squares.length &&
        !squares[nextIndex].classList.contains('wall') &&
        !squares[nextIndex].classList.contains('ghost')
      ) {
        squares[this.currentIndex].classList.remove('ghost', this.className);
        this.currentIndex = nextIndex;
        squares[this.currentIndex].classList.add('ghost', this.className);
      } else {
        direction = directions[Math.floor(Math.random() * directions.length)];
      }
    }, 500);

    ghostTimers.push(timerId);
  }
}

let ghostStartPositions = [
  width * 5 + 5,
  width * 5 + 20,
  width * 10 + 10,
  width * 10 + 17,
  width * 15 + 7,
  width * 15 + 21,
  width * 18 + 8,
  width * 18 + 19,
];

// === DLC: pomocnicze ===
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// setTimeout, który odpala się tylko w trakcie gry i jest czyszczony w stopTimers()
function later(fn, ms) {
  const id = setTimeout(() => {
    if (gameRunning) fn();
  }, ms);
  dlcTimers.push(id);
  return id;
}

function neighbors(i) {
  const result = [];
  if (i % width !== 0) result.push(i - 1);
  if (i % width < width - 1) result.push(i + 1);
  if (i - width >= 0) result.push(i - width);
  if (i + width < totalSquares) result.push(i + width);
  return result;
}

// Odległości (w krokach) od pola start; isBlocked(i) - na pole i nie da się wejść
function distancesFrom(start, isBlocked) {
  const dist = new Array(totalSquares);
  dist[start] = 0;
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    neighbors(cur).forEach(n => {
      if (dist[n] !== undefined || isBlocked(n)) return;
      dist[n] = dist[cur] + 1;
      queue.push(n);
    });
  }
  return dist;
}

function isFreeSquare(i) {
  const sq = squares[i];
  return (
    i !== pacmanIndex &&
    !sq.classList.contains('wall') &&
    !sq.classList.contains('ghost') &&
    !sq.classList.contains('klamka') &&
    !sq.classList.contains('mamo-pomocy')
  );
}

function randomFreeSquare(filter = () => true) {
  const free = [];
  for (let i = 0; i < totalSquares; i++) {
    if (isFreeSquare(i) && filter(i)) free.push(i);
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
}

// === DLC: klamka ===
// Leży na polu przez 10-15 s, znika na 5 s i wraca; można ją zebrać 3 razy na grę.
// Kropka pod klamką zostaje i jest zjadana razem z klamką.
function scheduleKlamka(delay) {
  later(showKlamka, delay);
}

function showKlamka() {
  klamkaIndex = randomFreeSquare();
  if (klamkaIndex === -1) {
    scheduleKlamka(klamkaHiddenTime);
    return;
  }
  squares[klamkaIndex].classList.add('klamka');
  klamkaHideTimer = later(hideKlamka, randomBetween(klamkaVisibleMin, klamkaVisibleMax));
}

function hideKlamka() {
  squares[klamkaIndex].classList.remove('klamka');
  klamkaIndex = -1;
  scheduleKlamka(klamkaHiddenTime);
}

function pickUpKlamka() {
  clearTimeout(klamkaHideTimer);
  squares[klamkaIndex].classList.remove('klamka', 'pac-dot', 'special-dot');
  klamkaIndex = -1;
  klamkaPickups++;
  score += klamkaPoints;
  showPickupMessage(`Klamka ojebana!!! +${klamkaPoints}`);
  if (klamkaPickups < klamkaMaxPickups) {
    scheduleKlamka(klamkaHiddenTime);
  }
}

// === DLC: kulosik ===
// Pojawia się raz na grę, 35-45 s po starcie, daleko od gracza, i go goni.
// Razem z nim pojawia się kafelek MAMO POMOCY, który go usuwa.
function isBlockedForKulosik(i) {
  const sq = squares[i];
  return sq.classList.contains('wall') ||
    (sq.classList.contains('ghost') && i !== kulosik.index);
}

function spawnKulosik() {
  const dist = distancesFrom(pacmanIndex, i => squares[i].classList.contains('wall'));
  let index = randomFreeSquare(i => dist[i] >= kulosikMinSpawnDistance);
  if (index === -1) index = randomFreeSquare();
  if (index === -1) return;

  kulosik = { index, timer: null };
  squares[index].classList.add('ghost', 'kulosik');
  kulosik.timer = setInterval(moveKulosik, kulosikStepTime);
  ghostTimers.push(kulosik.timer);

  mamoIndex = randomFreeSquare();
  if (mamoIndex !== -1) {
    squares[mamoIndex].classList.add('mamo-pomocy');
  }
}

function moveKulosik() {
  if (!gameRunning || !kulosik) return;

  const dist = distancesFrom(pacmanIndex, isBlockedForKulosik);
  let next = -1;
  neighbors(kulosik.index).forEach(n => {
    if (dist[n] === undefined) return;
    if (next === -1 || dist[n] < dist[next]) next = n;
  });
  if (next === -1) return;

  if (next === pacmanIndex) {
    endGame(true, true);
    return;
  }

  squares[kulosik.index].classList.remove('ghost', 'kulosik');
  kulosik.index = next;
  squares[kulosik.index].classList.add('ghost', 'kulosik');
}

function pickUpMamo() {
  squares[mamoIndex].classList.remove('mamo-pomocy', 'pac-dot', 'special-dot');
  mamoIndex = -1;
  if (kulosik) {
    clearInterval(kulosik.timer);
    squares[kulosik.index].classList.remove('ghost', 'kulosik');
    kulosik = null;
  }
  score += kulosikPoints;
  showPickupMessage(`Kulosik przecwelony przez bagiety +${kulosikPoints}`);
}

function startDlc() {
  klamkaIndex = -1;
  klamkaPickups = 0;
  kulosik = null;
  mamoIndex = -1;
  scheduleKlamka(klamkaHiddenTime);
  later(spawnKulosik, randomBetween(kulosikDelayMin, kulosikDelayMax));
}

function stopTimers() {
  ghostTimers.forEach(timer => clearInterval(timer));
  ghostTimers = [];
  dlcTimers.forEach(timer => clearTimeout(timer));
  dlcTimers = [];
  clearInterval(gameClockTimer);
}

// === Czas gry ===
function updateClock() {
  const seconds = Math.floor((Date.now() - gameStartTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  timeDisplay.textContent = `Czas: ${m}:${s}`;
}

function startClock() {
  gameStartTime = Date.now();
  updateClock();
  gameClockTimer = setInterval(updateClock, 250);
}

function setMode(newMode) {
  mode = newMode;
  restartButton.textContent = restartLabels[mode];
  vanillaButton.classList.toggle('active', mode === 'vanilla');
  dlcButton.classList.toggle('active', mode === 'dlc');
}

function startGame() {
  if (gameRunning) return;

  startSound.play(); // ▶️ Play start sound

  gameRunning = true;
  canMove = true;
  pressedKeys.clear();
  score = 0;
  scoreDisplay.textContent = `Smak: ${score}`;
  clearPickupMessage();

  createBoard();
  placePacman();

  ghosts.forEach(g => squares[g.currentIndex].classList.remove('ghost', g.className));
  ghosts = [];
  stopTimers();

  ghostStartPositions.forEach((pos, i) => {
    const ghost = new Ghost(pos, `ghost-${i}`);
    ghosts.push(ghost);
    ghost.move();
  });

  if (mode === 'dlc') {
    startDlc();
  }

  startClock();

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('keyup', handleKeyup);
}

function restartGame() {
  if (gameRunning) {
    endGame(false);
  }

  startSound.play(); // ▶️ Play start sound

  congratsMessage.style.display = 'none';
  startGame();
}

function endGame(showAlert = true, caughtByKulosik = false) {
  gameRunning = false;
  stopTimers();
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('keyup', handleKeyup);

  if (!showAlert) return;

  if (caughtByKulosik) {
    // alert() wstrzymuje stronę, więc pokazujemy go dopiero, gdy dźwięk ruszy
    // (albo od razu, jeśli pliku dźwięku jeszcze nie ma)
    const finalScore = score;
    kulosikCatchSound.currentTime = 0;
    kulosikCatchSound.play()
      .catch(() => {})
      .finally(() => alert(`HIPIS KURWA PRZECWELONA\nZjedzona sraka: ${finalScore}`));
  } else {
    alert(`Ajjj Ewa niepocieszona, nie zjadles calej sraki! Zjedzona sraka: ${score}`);
  }
}

function pauseGameForWin() {
  winSound.play(); // ▶️ Play win sound

  gameRunning = false;
  stopTimers();
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('keyup', handleKeyup);

  congratsMessage.style.display = 'block';
}

goAgainBtn.addEventListener('click', () => {
  congratsMessage.style.display = 'none';
  restartGame();
});

const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

function handleKeydown(e) {
  // Strzałki sterują grą, nie przewijają strony
  if (arrowKeys.includes(e.key)) e.preventDefault();

  if (!gameRunning || !canMove || pressedKeys.has(e.key)) return;

  pressedKeys.add(e.key);
  canMove = false;

  let nextIndex = pacmanIndex;

  switch (e.key) {
    case 'ArrowLeft':
      if (
        pacmanIndex % width !== 0 &&
        !squares[pacmanIndex - 1].classList.contains('wall')
      ) {
        nextIndex = pacmanIndex - 1;
      }
      break;
    case 'ArrowRight':
      if (
        pacmanIndex % width < width - 1 &&
        !squares[pacmanIndex + 1].classList.contains('wall')
      ) {
        nextIndex = pacmanIndex + 1;
      }
      break;
    case 'ArrowUp':
      if (
        pacmanIndex - width >= 0 &&
        !squares[pacmanIndex - width].classList.contains('wall')
      ) {
        nextIndex = pacmanIndex - width;
      }
      break;
    case 'ArrowDown':
      if (
        pacmanIndex + width < squares.length &&
        !squares[pacmanIndex + width].classList.contains('wall')
      ) {
        nextIndex = pacmanIndex + width;
      }
      break;
    default:
      canMove = true;
      return;
  }

  if (nextIndex === pacmanIndex) {
    canMove = true;
    return;
  }

  if (squares[nextIndex].classList.contains('ghost')) {
    endGame(true, squares[nextIndex].classList.contains('kulosik'));
    return;
  }

  squares[pacmanIndex].classList.remove('pacman');
  pacmanIndex = nextIndex;
  squares[pacmanIndex].classList.add('pacman');

  const square = squares[pacmanIndex];
  if (square.classList.contains('klamka')) {
    pickUpKlamka();
  } else if (square.classList.contains('mamo-pomocy')) {
    pickUpMamo();
  } else if (square.classList.contains('special-dot')) {
    score += specialDotPoints;
    square.classList.remove('special-dot');
    if (mode === 'dlc') {
      showPickupMessage(`Gazowane szambo wypite! +${specialDotPoints}`);
    }
  } else if (square.classList.contains('pac-dot')) {
    score += 1;
    square.classList.remove('pac-dot');
  }

  scoreDisplay.textContent = `Smak: ${score}`;

  // Wygrana po zjedzeniu wszystkich kropek (w vanilli to dokładnie 550 pkt, jak wcześniej)
  if (!dotsLeft()) {
    pauseGameForWin();
    return;
  }

  if (squares[pacmanIndex].classList.contains('ghost')) {
    endGame();
  }

  setTimeout(() => {
    canMove = true;
  }, 100);
}

function handleKeyup(e) {
  pressedKeys.delete(e.key);
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', restartGame);
vanillaButton.addEventListener('click', () => {
  setMode('vanilla');
  restartGame();
});
dlcButton.addEventListener('click', () => {
  setMode('dlc');
  restartGame();
});

// Po kliknięciu przycisk traci fokus, żeby spacja/Enter nie restartowały gry
document.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => button.blur());
});
