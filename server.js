// server.js
// Сервер для онлайн-игры "Крестики-нолики" через WebSocket
// Работает с GitHub Pages

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Создаём HTTP-сервер
const server = http.createServer();
// WebSocket-сервер поверх него
const wss = new WebSocket.Server({ server });

// Хранилище комнат
const rooms = {};

// Обработка подключений
wss.on('connection', (ws, req) => {
  // Получаем ID комнаты из URL: /1234
  const { pathname } = url.parse(req.url);
  const roomId = pathname.split('/')[1];

  // Если нет ID — отключаем
  if (!roomId || !/^\d{4}$/.test(roomId)) {
    ws.close();
    return;
  }

  // Если комнаты нет — создаём
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [], // [ws1, ws2]
      board: Array(9).fill(null), // доска
      turn: 'X', // кто ходит
      gameOver: false,
      winner: null
    };
  }

  const room = rooms[roomId];

  // Проверяем, что комната не полна
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({ error: 'Комната полна. Попробуйте другой код.' }));
    ws.close();
    return;
  }

  // Назначаем символ игроку
  const symbol = room.players.length === 0 ? 'X' : 'O';
  room.players.push(ws);
  ws.symbol = symbol;
  ws.roomId = roomId;

  // Отправляем начальное состояние
  ws.send(JSON.stringify({
    type: 'init',
    board: room.board,
    turn: room.turn,
    you: symbol,
    opponentJoined: room.players.length === 2
  }));

  // Если второй игрок присоединился — уведомить первого
  if (room.players.length === 2) {
    room.players[0].send(JSON.stringify({ type: 'opponentJoined' }));
  }

  // Обработка сообщений от клиента
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // Только если игра ещё идёт и это твой ход
      if (room.gameOver || room.turn !== ws.symbol) return;

      // Проверка: клетка пустая?
      if (msg.type === 'move' && typeof msg.index === 'number' && msg.index >= 0 && msg.index <= 8 && room.board[msg.index] === null) {
        // Ставим символ
        room.board[msg.index] = ws.symbol;

        // Проверка победы
        const win = checkWin(room.board, ws.symbol);
        const full = room.board.every(cell => cell !== null);

        if (win) {
          room.gameOver = true;
          room.winner = ws.symbol;
          broadcast(roomId, { type: 'gameOver', winner: ws.symbol, board: room.board });
        } else if (full) {
          room.gameOver = true;
          room.winner = null;
          broadcast(roomId, { type: 'gameOver', winner: null, board: room.board });
        } else {
          // Меняем ход
          room.turn = ws.symbol === 'X' ? 'O' : 'X';
          broadcast(roomId, { type: 'move', board: room.board, turn: room.turn });
        }
      }
    } catch (e) {
      console.error('Ошибка обработки сообщения:', e);
    }
  });

  // Обработка отключения игрока
  ws.on('close', () => {
    const idx = room.players.indexOf(ws);
    if (idx !== -1) {
      room.players.splice(idx, 1);
    }

    // Если остался один игрок — уведомить его
    if (room.players.length === 1) {
      room.players[0].send(JSON.stringify({ type: 'opponentLeft' }));
    }

    // Удаляем комнату, если игроков нет
    if (room.players.length === 0) {
      delete rooms[roomId];
    }
  });
});

// Функция проверки победы
function checkWin(board, player) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  return lines.some(line => line.every(i => board[i] === player));
}

// Функция рассылки всем игрокам в комнате
function broadcast(roomId, message) {
  const room = rooms[roomId];
  if (room) {
    room.players.forEach(player => {
      if (player.readyState === WebSocket.OPEN) {
        player.send(JSON.stringify(message));
      }
    });
  }
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
