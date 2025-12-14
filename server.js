// server.js
// Онлайн-сервер для крестиков-ноликов: автоматическое подключение без кода
// Все игроки попадают в одну глобальную комнату

const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Единственная комната для всех
let room = {
  players: [],        // [player1, player2]
  board: Array(9).fill(null),
  turn: 'X',
  gameOver: false,
  winner: null
};

wss.on('connection', (ws) => {
  // Если в комнате уже 2 игрока — отклоняем нового
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({
      error: "Комната полна. Попробуйте позже."
    }));
    ws.close();
    return;
  }

  // Определяем символ игрока
  const symbol = room.players.length === 0 ? 'X' : 'O';
  room.players.push(ws);
  ws.symbol = symbol;

  // Если комната была в состоянии "игра окончена", сбрасываем всё при новом первом игроке
  if (room.players.length === 1 && room.gameOver) {
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.gameOver = false;
    room.winner = null;
  }

  // Сообщаем игроку его статус
  ws.send(JSON.stringify({
    type: 'init',
    board: room.board,
    turn: room.turn,
    you: symbol,
    opponentJoined: room.players.length === 2
  }));

  // Уведомляем первого игрока, что пришёл второй
  if (room.players.length === 2) {
    room.players[0].send(JSON.stringify({ type: 'opponentJoined' }));
  }

  // Обработка ходов
  ws.on('message', (data) => {
    // Игнорируем, если игра окончена или игроков меньше двух
    if (room.gameOver || room.players.length < 2) return;

    try {
      const msg = JSON.parse(data);
      if (
        msg.type === 'move' &&
        typeof msg.index === 'number' &&
        msg.index >= 0 && msg.index <= 8 &&
        room.turn === ws.symbol &&
        room.board[msg.index] === null
      ) {
        // Делаем ход
        room.board[msg.index] = ws.symbol;

        // Проверка победы
        const win = checkWin(room.board, ws.symbol);
        const full = room.board.every(cell => cell !== null);

        if (win) {
          room.gameOver = true;
          room.winner = ws.symbol;
          broadcast({ type: 'gameOver', winner: ws.symbol, board: room.board });
        } else if (full) {
          room.gameOver = true;
          room.winner = null;
          broadcast({ type: 'gameOver', winner: null, board: room.board });
        } else {
          // Передаём ход
          room.turn = ws.symbol === 'X' ? 'O' : 'X';
          broadcast({ type: 'move', board: room.board, turn: room.turn });
        }
      }
    } catch (e) {
      console.error('Ошибка обработки хода:', e);
    }
  });

  // Обработка отключения игрока
  ws.on('close', () => {
    const index = room.players.indexOf(ws);
    if (index !== -1) {
      room.players.splice(index, 1);
    }

    // Если остался один игрок — уведомить его
    if (room.players.length === 1) {
      room.players[0].send(JSON.stringify({ type: 'opponentLeft' }));
    }
    // Если игроков нет — комната остаётся, но будет сброшена при следующем заходе первого игрока
  });
});

// Проверка победы
function checkWin(board, player) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  return lines.some(line => line.every(i => board[i] === player));
}

// Отправка сообщения обоим игрокам
function broadcast(message) {
  room.players.forEach(player => {
    if (player.readyState === WebSocket.OPEN) {
      player.send(JSON.stringify(message));
    }
  });
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен. Глобальная комната готова на порту ${PORT}`);
});
