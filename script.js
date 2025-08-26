const grid = document.querySelector('.grid');
const scoreDisplay = document.getElementById('score');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');

const width = 28;
const height = 25;
const totalSquares = width * height;

let squares = [];
let pacmanIndex = 0;
let score = 0;
let gameRunning = false;
let canMove = true;

let ghosts = [];
let ghostTimers = [];

const pressedKeys = new Set();

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

      if (
        nextIndex >= 0 &&
        nextIndex < squares.length &&
        !squares[nextIndex].classList.contains('wall') &&
        !squares[nextIndex].classList.contains('ghost') &&
        !squares[nextIndex].classList.contains('pacman')
      ) {
        squares[this.currentIndex].classList.remove('ghost', this.className);
        this.currentIndex = nextIndex;
        squares[this.currentIndex].classList.add('ghost', this.className);
      } else {
        direction = directions[Math.floor(Math.random() * directions.length)];
      }

      if (this.currentIndex === pacmanIndex) {
        endGame();
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

function startGame() {
  if (gameRunning) return;

  gameRunning = true;
  canMove = true;
  score = 0;
  scoreDisplay.textContent = `Score: ${score}`;

  createBoard();
  placePacman();

  ghosts.forEach(g => squares[g.currentIndex].classList.remove('ghost', g.className));
  ghosts = [];
  ghostTimers.forEach(timer => clearInterval(timer));
  ghostTimers = [];

  ghostStartPositions.forEach((pos, i) => {
    const ghost = new Ghost(pos, `ghost-${i}`);
    ghosts.push(ghost);
    ghost.move();
  });

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('keyup', handleKeyup);
}

function restartGame() {
  if (gameRunning) {
    endGame(false);
  }
  startGame();
}

function endGame(showAlert = true) {
  gameRunning = false;
  ghostTimers.forEach(timer => clearInterval(timer));
  ghostTimers = [];
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('keyup', handleKeyup);

  if (showAlert) {
    alert(`Ajjj Ewa niepocieszona, nie zjadles calej sraki! Zjedzona sraka: ${score}`);
  }
}

function handleKeydown(e) {
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
    endGame();
    return;
  }

  squares[pacmanIndex].classList.remove('pacman');
  pacmanIndex = nextIndex;
  squares[pacmanIndex].classList.add('pacman');

  if (squares[pacmanIndex].classList.contains('special-dot')) {
    score += 2;
    squares[pacmanIndex].classList.remove('special-dot');
  } else if (squares[pacmanIndex].classList.contains('pac-dot')) {
    score += 1;
    squares[pacmanIndex].classList.remove('pac-dot');
  }

  scoreDisplay.textContent = `Score: ${score}`;

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
