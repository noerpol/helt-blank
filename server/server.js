/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const http = require('http').createServer(app);

// Fælles CORS configuration
const ALLOWED_ORIGINS = ['https://noerpol.github.io', 'http://localhost:3000'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Anvend CORS middleware
app.use(cors(corsOptions));

// Socket.IO setup med samme CORS options
const io = require('socket.io')(http, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Load words
const words = require('./words.json');

// Game sessions
const gameSessions = {};

// Hjælpefunktioner
function selectNewPrompt(gameCode) {
  console.log('Selecting new prompt for game:', gameCode);
  const session = gameSessions[gameCode];
  const allWords = words.words;
  console.log('Available words:', allWords.length);
  
  // Filter ud ord der er blevet brugt
  const availableWords = allWords.filter(word => !session?.usedWords.has(word));
  console.log('Filtered words:', availableWords.length);
  
  if (availableWords.length === 0) {
    console.log('No more words available, resetting used words');
    session.usedWords.clear();
    return allWords[Math.floor(Math.random() * allWords.length)];
  }
  
  const selectedWord = availableWords[Math.floor(Math.random() * availableWords.length)];
  console.log('Selected word:', selectedWord);
  
  if (session) {
    session.usedWords.add(selectedWord);
  }
  
  return selectedWord;
}

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
      console.log('Creating new game session:', gameCode);
      const newPrompt = selectNewPrompt(gameCode);
      console.log('Selected new prompt:', newPrompt);
      gameSessions[gameCode] = {
        players: {},
        currentPrompt: newPrompt,
        roundActive: false,
        usedWords: new Set()
      };
    }

    const session = gameSessions[gameCode];
    console.log('Current session state:', {
      gameCode,
      playersCount: Object.keys(session.players).length,
      currentPrompt: session.currentPrompt
    });
    
    // Check if round is active
    if (Object.values(session.players).some(p => p.answer !== null)) {
      console.log('Round is active, rejecting join');
      socket.emit('error', { message: 'Vent venligst til næste runde' });
      return;
    }

    session.players[socket.id] = {
      name,
      score: 0,
      answer: null
    };

    socket.join(gameCode);
    console.log('Player joined room:', gameCode);
    
    // Send current game state to new player
    socket.emit('newPrompt', {
      prompt: session.currentPrompt,
      players: session.players
    });
    
    // Update all players about the new player
    io.to(gameCode).emit('playerJoined', session.players);
    console.log('Sent game state to players');
  });

  socket.on('submitAnswer', ({ gameCode, answer }) => {
    console.log('Received answer:', { gameCode, socketId: socket.id, answer });
    const session = gameSessions[gameCode];
    if (!session) {
      console.log('No session found for game:', gameCode);
      return;
    }

    session.players[socket.id].answer = answer;
    io.to(gameCode).emit('playerJoined', session.players);
    console.log('Updated player answers');

    // Check if all players have answered
    const allAnswered = Object.values(session.players).every(p => p.answer !== null);
    console.log('All players answered:', allAnswered);
    
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
