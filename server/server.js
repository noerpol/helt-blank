/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// CORS konfiguration
const corsOptions = {
  origin: ['https://noerpol.github.io', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Socket.io setup med samme CORS options
const io = require('socket.io')(http, {
  cors: corsOptions,
  transports: ['polling', 'websocket'],
  pingTimeout: 10000,
  pingInterval: 5000
});

// Load words
const words = require('./words.json');

// Game sessions
const gameSessions = {};

// Helper function to select new prompt
const selectNewPrompt = (gameCode) => {
  const session = gameSessions[gameCode];
  if (!session) return '';
  
  const unusedWords = words.filter(word => !session.usedWords.has(word));
  if (unusedWords.length === 0) {
    session.usedWords.clear();
    return words[Math.floor(Math.random() * words.length)];
  }
  
  const word = unusedWords[Math.floor(Math.random() * unusedWords.length)];
  session.usedWords.add(word);
  return word;
};

// Socket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    // Cleanup player from all game sessions
    for (const gameCode in gameSessions) {
      if (gameSessions[gameCode].players[socket.id]) {
        delete gameSessions[gameCode].players[socket.id];
        io.to(gameCode).emit('playerJoined', gameSessions[gameCode].players);
      }
    }
  });

  socket.on('joinGame', ({ gameCode, name }) => {
    console.log('Join game request:', { gameCode, name, socketId: socket.id });
    
    if (!gameSessions[gameCode]) {
      gameSessions[gameCode] = {
        players: {},
        currentPrompt: selectNewPrompt(gameCode),
        roundActive: false,
        usedWords: new Set()
      };
    }

    const session = gameSessions[gameCode];
    
    // Check if round is active
    if (Object.values(session.players).some(p => p.answer !== null)) {
      socket.emit('error', { message: 'Vent venligst til næste runde' });
      return;
    }

    session.players[socket.id] = {
      name,
      score: 0,
      answer: null
    };

    socket.join(gameCode);
    
    io.to(gameCode).emit('playerJoined', session.players);
    socket.emit('newPrompt', {
      prompt: session.currentPrompt,
      players: session.players
    });
  });

  socket.on('submitAnswer', ({ gameCode, answer }) => {
    const session = gameSessions[gameCode];
    if (!session) return;

    session.players[socket.id].answer = answer;
    io.to(gameCode).emit('playerJoined', session.players);

    // Check if all players have answered
    const allAnswered = Object.values(session.players).every(p => p.answer !== null);
    if (allAnswered) {
      calculateScores(gameCode);
    }
  });
});

function calculateScores(gameCode) {
  const session = gameSessions[gameCode];
  if (!session) return;

  const answers = {};
  Object.entries(session.players).forEach(([id, player]) => {
    const answer = player.answer?.toLowerCase().trim();
    if (!answer) return;
    
    if (!answers[answer]) {
      answers[answer] = [];
    }
    answers[answer].push(id);
  });

  const roundWinners = [];
  Object.entries(answers).forEach(([answer, players]) => {
    if (players.length === 2) {
      players.forEach(id => {
        session.players[id].score += 3;
        roundWinners.push(id);
      });
    } else if (players.length > 2) {
      players.forEach(id => {
        session.players[id].score += 1;
        roundWinners.push(id);
      });
    }
  });

  // Check for game over
  const gameWinner = Object.entries(session.players).find(([_, player]) => player.score >= 30);
  if (gameWinner) {
    io.to(gameCode).emit('gameOver', {
      winner: session.players[gameWinner[0]].name,
      score: session.players[gameWinner[0]].score
    });
    delete gameSessions[gameCode];
    return;
  }

  // Start new round
  session.currentPrompt = selectNewPrompt(gameCode);
  Object.values(session.players).forEach(p => p.answer = null);
  
  io.to(gameCode).emit('roundResult', {
    players: session.players,
    roundWinners
  });

  io.to(gameCode).emit('newPrompt', {
    prompt: session.currentPrompt,
    players: session.players
  });
}

// Fjern de problematiske route handlers
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// app.get('/', (req, res) => {
//   res.send('Backend server for Helt Blank');
// });

const PORT = process.env.PORT || 4000;
http.listen(PORT, () => {
  console.log(`Server kører på port ${PORT}`);
});
