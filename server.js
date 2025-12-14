// server.js — с поддержкой "глобальной" комнаты
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Одна комната для всех: "global"
let globalRoom = {
  players: [],
  board: Array(9).fill(null),
  turn: 'X',
  gameOver: false,
  winner: null
};

wss.on('connection', (ws, req) => {
  const roomId = 'global'; // всегда одна комната
  const room = globalRoom;

  // Если комната полна
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({ error: 'Комната полна. Попробуйте позже.' }));
    ws.close();
    return;
  }

  const symbol = room.players.length === 0 ? 'X' : 'O';
  room.players.push(ws);
  ws.symbol = symbol;
  ws.roomId = roomId;

  // Если игра уже завершена — сбросить (новый раунд с новыми игроками)
  if (room.gameOver && room.players.length === 1) {
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.gameOver = false;
    room.winner = null;
  }

  ws.send(JSON.stringify({
    type: 'init',
    board: room.board,
    turn: room.turn,
    you: symbol,
    opponentJoined: room.players.length === 2
  }));

  if (room.players.length === 2) {
    room.players[0].send(JSON.stringify({ type: 'opponentJoined' }));
  }

  ws.on('message', (data) => {
    if (room.gameOver || room.players.length < 2) return;

    try {
      const msg = JSON.parse(data);
      if (msg.type === 'move' && room.turn === ws.symbol && room.board[msg.index] === null) {
        room.board[msg.index] = ws.symbol;

        const win = checkWin(room.board, ws.symbol);
        const full = room.board.every(c => c !== null);

        if (win) {
          room.gameOver = true;
          room.winner = ws.symbol;
          broadcast(room, { type: 'gameOver', winner: ws.symbol, board: room.board });
        } else if (full) {
          room.gameOver = true;
          room.winner = null;
          broadcast(room, { type: 'gameOver', winner: null, board: room.board });
        } else {
          room.turn = ws.symbol === 'X' ? 'O' : 'X';
          broadcast(room, { type: 'move', board: room.board, turn: room.turn });
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    const idx = room.players.indexOf(ws);
    if (idx !== -1) room.players.splice(idx, 1);

    if (room.players.length === 1) {
      room.players[0].send(JSON.stringify({ type: 'opponentLeft' }));
      // Не удаляем комнату — ждём нового игрока
    }
    // Если игроков нет — комната остаётся, но будет сброшена при следующем первом игроке
  });
});

function checkWin(board, player) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  return lines.some(l => l.every(i => board[i] === player));
}

function broadcast(room, msg) {
  room.players.forEach(p => {
    if (p.readyState === WebSocket.OPEN) {
      p.send(JSON.stringify(msg));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Глобальная комната готова на порту ${PORT}`);
});
