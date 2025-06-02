const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Статические файлы
app.use(express.static('public'));

// Состояние игры для каждой комнаты
const rooms = {};

// Создание колоды
const colors = ['red', 'blue', 'green', 'yellow'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
const wildCards = ['wild', 'wild_draw4'];

function createDeck() {
    const deck = [];
    colors.forEach(color => {
        values.forEach(value => {
            deck.push({ color, value });
            if (value !== '0') deck.push({ color, value });
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: 'wild' });
        deck.push({ color: 'wild', value: 'wild_draw4' });
    }
    return deck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Обработка подключений
io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Создание новой комнаты
    socket.on('createRoom', (nickname) => {
        const roomId = uuidv4();
        rooms[roomId] = {
            players: [{ id: socket.id, nickname, hand: [], ready: false }],
            deck: shuffle(createDeck()),
            discardPile: [],
            currentCard: null,
            currentPlayer: 0,
            direction: 1,
            gameStarted: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    // Присоединение к комнате
    socket.on('joinRoom', ({ roomId, nickname }) => {
        if (rooms[roomId] && rooms[roomId].players.length < 4 && !rooms[roomId].gameStarted) {
            rooms[roomId].players.push({ id: socket.id, nickname, hand: [], ready: false });
            socket.join(roomId);
            socket.emit('joinedRoom', roomId);
            io.to(roomId).emit('updatePlayers', rooms[roomId].players.map(p => ({ id: p.id, nickname: p.nickname, ready: p.ready })));
        } else {
            socket.emit('error', 'Комната недоступна или заполнена');
        }
    });

    // Игрок готов
    socket.on('playerReady', (roomId) => {
        const room = rooms[roomId];
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = true;
            io.to(roomId).emit('updatePlayers', room.players.map(p => ({ id: p.id, nickname: p.nickname, ready: p.ready })));
            if (room.players.length >= 2 && room.players.every(p => p.ready)) {
                startGame(roomId);
            }
        }
    });

    // Старт игры
    function startGame(roomId) {
        const room = rooms[roomId];
        room.gameStarted = true;
        room.players.forEach(player => {
            player.hand = [];
            for (let i = 0; i < 7; i++) {
                player.hand.push(room.deck.pop());
            }
        });
        room.discardPile.push(room.deck.pop());
        room.currentCard = room.discardPile[room.discardPile.length - 1];
        io.to(roomId).emit('gameStarted', {
            players: room.players.map(p => ({ id: p.id, nickname: p.nickname, cardCount: p.hand.length })),
            currentCard: room.currentCard,
            currentPlayer: room.players[room.currentPlayer].id,
            nextPlayer: room.players[(room.currentPlayer + room.direction + room.players.length) % room.players.length].id
        });
        room.players.forEach(player => {
            io.to(player.id).emit('updateHand', player.hand);
        });
    }

    // Ход игрока
    socket.on('playCard', ({ roomId, card, selectedColor }) => {
        const room = rooms[roomId];
        if (room.players[room.currentPlayer].id !== socket.id) {
            socket.emit('error', 'Не ваш ход!');
            return;
        }
        const player = room.players[room.currentPlayer];
        const cardIndex = player.hand.findIndex(c => c.color === card.color && c.value === card.value);
        if (cardIndex === -1 || !canPlayCard(card, room.currentCard)) {
            socket.emit('error', 'Недопустимаяreleased карта!');
            return;
        }
        player.hand.splice(cardIndex, 1);
        room.discardPile.push(card);
        room.currentCard = card;
        if (card.color === 'wild') {
            room.currentCard.color = selectedColor || colors[Math.floor(Math.random() * colors.length)];
        }

        let nextPlayer = (room.currentPlayer + room.direction + room.players.length) % room.players.length;
        if (card.value === 'skip') {
            nextPlayer = (nextPlayer + room.direction + room.players.length) % room.players.length;
        } else if (card.value === 'reverse') {
            room.direction *= -1;
            nextPlayer = (room.currentPlayer + room.direction + room.players.length) % room.players.length;
        } else if (card.value === 'draw2') {
            room.players[nextPlayer].hand.push(...room.deck.splice(-2));
            nextPlayer = (nextPlayer + room.direction + room.players.length) % room.players.length;
        } else if (card.value === 'wild_draw4') {
            room.players[nextPlayer].hand.push(...room.deck.splice(-4));
            nextPlayer = (nextPlayer + room.direction + room.players.length) % room.players.length;
        }

        if (player.hand.length === 0) {
            io.to(roomId).emit('gameOver', { winner: player.nickname });
            delete rooms[roomId];
            return;
        }

        room.currentPlayer = nextPlayer;
        io.to(roomId).emit('gameState', {
            players: room.players.map(p => ({ id: p.id, nickname: p.nickname, cardCount: p.hand.length })),
            currentCard: room.currentCard,
            currentPlayer: room.players[room.currentPlayer].id,
            nextPlayer: room.players[(room.currentPlayer + room.direction + room.players.length) % room.players.length].id
        });
        room.players.forEach(player => {
            io.to(player.id).emit('updateHand', player.hand);
        });
    });

    // Взять карту
    socket.on('drawCard', (roomId) => {
        const room = rooms[roomId];
        if (room.players[room.currentPlayer].id !== socket.id) {
            socket.emit('error', 'Не ваш ход!');
            return;
        }
        if (room.deck.length > 0) {
            const drawnCard = room.deck.pop();
            room.players[room.currentPlayer].hand.push(drawnCard);
            const canPlayDrawnCard = canPlayCard(drawnCard, room.currentCard);
            io.to(roomId).emit('gameState', {
                players: room.players.map(p => ({ id: p.id, nickname: p.nickname, cardCount: p.hand.length })),
                currentCard: room.currentCard,
                currentPlayer: room.players[room.currentPlayer].id,
                nextPlayer: room.players[(room.currentPlayer + room.direction + room.players.length) % room.players.length].id,
                canPlayDrawnCard: canPlayDrawnCard
            });
            room.players.forEach(player => {
                io.to(player.id).emit('updateHand', player.hand);
            });
            if (!canPlayDrawnCard) {
                room.currentPlayer = (room.currentPlayer + room.direction + room.players.length) % room.players.length;
                io.to(roomId).emit('gameState', {
                    players: room.players.map(p => ({ id: p.id, nickname: p.nickname, cardCount: p.hand.length })),
                    currentCard: room.currentCard,
                    currentPlayer: room.players[room.currentPlayer].id,
                    nextPlayer: room.players[(room.currentPlayer + room.direction + room.players.length) % room.players.length].id
                });
            }
        } else {
            socket.emit('error', 'Колода пуста!');
        }
    });

    // Проверка валидности карты
    function canPlayCard(card, currentCard) {
        return card.color === currentCard.color || card.value === currentCard.value || card.color === 'wild';
    }

    // Отключение игрока
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('updatePlayers', room.players.map(p => ({ id: p.id, nickname: p.nickname, ready: p.ready })));
                if (room.players.length === 0) {
                    delete rooms[roomId];
                }
            }
        }
        console.log(`Игрок отключился: ${socket.id}`);
    });
});

server.listen(3000, () => {
    console.log('Сервер запущен на http://localhost:3000');
});