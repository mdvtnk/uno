const socket = io();
let currentRoomId = null;
let currentHand = [];
let selectedColor = null;

// Перевод названий карт действия
const cardTranslations = {
    'skip': '🚫',
    'reverse': '🔄',
    'draw2': '+2',
    'wild': '🎨',
    'wild_draw4': '+4'
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

function startNewGame() {
    socket.emit('startNewGame', currentRoomId);
}

function exitRoom() {
    socket.emit('exitRoom', currentRoomId);
}

socket.on('roomCreated', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('roomId').textContent = `ID комнаты: ${roomId}`;
    document.getElementById('readyButton').style.display = 'block';
    showLobby();
});

socket.on('joinedRoom', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('roomId').textContent = `ID комнаты: ${roomId}`;
    document.getElementById('readyButton').style.display = 'block';
    showLobby();
});

socket.on('error', (message) => {
    document.getElementById('message').textContent = message;
});

socket.on('updatePlayers', (players) => {
    const playersDiv = document.getElementById('players');
    playersDiv.innerHTML = 'Игроки:<br>' + players.map(p => `${p.nickname} ${p.ready ? '(Готов)' : ''}`).join('<br>');
});

socket.on('gameStarted', ({ players, currentCard, currentPlayer, nextPlayer }) => {
    showGameArea();
    updateGameState({ players, currentCard, currentPlayer, nextPlayer });
});

socket.on('gameState', ({ players, currentCard, currentPlayer, nextPlayer, canPlayDrawnCard }) => {
    updateGameState({ players, currentCard, currentPlayer, nextPlayer, canPlayDrawnCard });
});

socket.on('updateHand', (hand) => {
    currentHand = hand;
    renderHand();
});

socket.on('gameOver', ({ winner }) => {
    document.getElementById('message').textContent = `Игра окончена! Победитель: ${winner}`;
    document.getElementById('gameOverButtons').style.display = 'block'; // Показываем кнопки
});

socket.on('showGameOverOptions', () => {
    document.getElementById('gameOverButtons').style.display = 'block'; // Показываем кнопки при окончании игры
});

socket.on('returnToLobby', () => {
    showLobby();
});

socket.on('returnToMainMenu', () => {
    currentRoomId = null;
    currentHand = [];
    document.getElementById('roomId').textContent = '';
    document.getElementById('readyButton').style.display = 'none';
    document.getElementById('players').innerHTML = '';
    document.getElementById('message').textContent = '';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('gameOverButtons').style.display = 'none';
});

function showLobby() {
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('gameOverButtons').style.display = 'none';
    document.getElementById('message').textContent = '';
}

function showGameArea() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('gameOverButtons').style.display = 'none';
}

function updateGameState({ players, currentCard, currentPlayer, nextPlayer, canPlayDrawnCard }) {
    const playersListDiv = document.getElementById('playersList');
    playersListDiv.innerHTML = 'Игроки:<br>' + players.map(p => `${p.nickname}: ${p.cardCount} карт`).join('<br>');
    const discardPileDiv = document.getElementById('discard-pile');
    const cardText = currentCard.value in cardTranslations ? cardTranslations[currentCard.value] : currentCard.value;
    discardPileDiv.textContent = cardText;
    discardPileDiv.className = `card ${currentCard.color}`;
    const currentPlayerNickname = players.find(p => p.id === currentPlayer).nickname;
    const nextPlayerNickname = players.find(p => p.id === nextPlayer).nickname;
    document.getElementById('message').textContent = `Ход игрока: ${currentPlayerNickname} -> ${nextPlayerNickname}`;
    if (canPlayDrawnCard) {
        document.getElementById('message').textContent += ' (Можете сыграть взятую карту)';
    }
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