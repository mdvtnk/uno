const socket = io();
let currentRoomId = null;
let currentHand = [];
let selectedColor = null;

// Перевод названий карт действия
const cardTranslations = {
    'skip': 'Пропуск хода',
    'reverse': 'Смена направления',
    'draw2': 'Взять 2',
    'wild': 'Смена цвета',
    'wild_draw4': 'Взять 4 + смена'
};

function createRoom() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) {
        document.getElementById('message').textContent = 'Введите никнейм!';
        return;
    }
    socket.emit('createRoom', nickname);
}

function joinRoom() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!nickname) {
        document.getElementById('message').textContent = 'Введите никнейм!';
        return;
    }
    if (!roomId) {
        document.getElementById('message').textContent = 'Введите ID комнаты!';
        return;
    }
    socket.emit('joinRoom', { roomId, nickname });
}

function playerReady() {
    socket.emit('playerReady', currentRoomId);
}

socket.on('roomCreated', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('roomId').textContent = `ID комнаты: ${roomId}`;
    document.getElementById('readyButton').style.display = 'block';
});

socket.on('joinedRoom', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('roomId').textContent = `ID комнаты: ${roomId}`;
    document.getElementById('readyButton').style.display = 'block';
});

socket.on('error', (message) => {
    document.getElementById('message').textContent = message;
});

socket.on('updatePlayers', (players) => {
    const playersDiv = document.getElementById('players');
    playersDiv.innerHTML = 'Игроки:<br>' + players.map(p => `${p.nickname} ${p.ready ? '(Готов)' : ''}`).join('<br>');
});

socket.on('gameStarted', ({ players, currentCard, currentPlayer }) => {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    updateGameState({ players, currentCard, currentPlayer });
});

socket.on('gameState', ({ players, currentCard, currentPlayer }) => {
    updateGameState({ players, currentCard, currentPlayer });
});

socket.on('updateHand', (hand) => {
    currentHand = hand;
    renderHand();
});

socket.on('gameOver', ({ winner }) => {
    document.getElementById('message').textContent = `Игра окончена! Победитель: ${winner}`;
});

function updateGameState({ players, currentCard, currentPlayer }) {
    const playersListDiv = document.getElementById('playersList');
    playersListDiv.innerHTML = 'Игроки:<br>' + players.map(p => `${p.nickname}: ${p.cardCount} карт`).join('<br>');
    const discardPileDiv = document.getElementById('discard-pile');
    const cardText = currentCard.value in cardTranslations ? cardTranslations[currentCard.value] : currentCard.value;
    discardPileDiv.textContent = cardText;
    discardPileDiv.className = `card ${currentCard.color}`;
    const currentPlayerNickname = players.find(p => p.id === currentPlayer).nickname;
    document.getElementById('message').textContent = `Ход игрока: ${currentPlayerNickname}`;
}

function renderHand() {
    const playerHandDiv = document.getElementById('player-hand');
    playerHandDiv.innerHTML = '';
    currentHand.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${card.color}`;
        const cardText = card.value in cardTranslations ? cardTranslations[card.value] : card.value;
        cardDiv.textContent = cardText;
        cardDiv.addEventListener('click', () => playCard(index));
        playerHandDiv.appendChild(cardDiv);
    });
}

function getColorName(color) {
    const colorNames = {
        'red': 'Красный',
        'blue': 'Синий',
        'green': 'Зеленый',
        'yellow': 'Желтый',
        'wild': 'Универсальная'
    };
    return colorNames[color] || color;
}

function playCard(index) {
    const card = currentHand[index];
    if (card.color === 'wild') {
        document.getElementById('colorPicker').style.display = 'block';
    } else {
        socket.emit('playCard', { roomId: currentRoomId, card });
    }
}

function selectColor(color) {
    selectedColor = color;
    const card = currentHand.find(c => c.color === 'wild');
    socket.emit('playCard', { roomId: currentRoomId, card, selectedColor });
    document.getElementById('colorPicker').style.display = 'none';
}

document.getElementById('draw-pile').addEventListener('click', () => {
    socket.emit('drawCard', currentRoomId);
});