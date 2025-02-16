/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: ["https://noerpol.github.io", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const wordsFile = 'words.json';
const { words } = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
console.log('Loaded words:', words);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://noerpol.github.io');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Spil-sessioner pr. spilkode – holder styr på spillere, svar, brugte ord og aktuelt prompt
const gameSessions = {};

// Hjælpefunktion: Vælg et nyt prompt uden gentagelse i den aktuelle session
function selectNewPrompt(session) {
  const availableWords = words.filter(word => !session.usedWords.has(word));
  if (availableWords.length === 0) {
    // Nulstil brugte ord, hvis alle ord er blevet vist
    session.usedWords = new Set();
  }
  let word = availableWords[Math.floor(Math.random() * availableWords.length)];
  if (!word) {
    console.log('Advarsel: Ingen ord fundet, anvender standard prompt.');
    word = 'Standard prompt';
  }
  session.usedWords.add(word);
  return word;
}

const MAX_SCORE = 30;

// Fallback til index.html for Single Page Apps
app.get('*', (req, res) => {
  res.sendFile('index.html');
});

app.get('/', (req, res) => {
  res.send('Backend server for Helt Blank');
});

// Socket.io-håndtering
io.on('connection', (socket) => {
  console.log(`Socket forbundet: ${socket.id}`);

  // Spilleren joiner et spil med navn og spilkode
  socket.on('joinGame', ({ gameCode, name }) => {
    // Opret en ny session hvis den ikke findes
    if (!gameSessions[gameCode]) {
      gameSessions[gameCode] = {
        players: {},
        currentPrompt: selectNewPrompt(),
        roundActive: false,
        usedWords: new Set()
      };
    }
    
    const session = gameSessions[gameCode];
    
    // Check om runde er i gang
    const roundInProgress = Object.values(session.players).some(p => p.answer);
    
    if (roundInProgress) {
      socket.emit('error', { message: 'Vent venligst til næste runde' });
      return;
    }
    
    session.players[socket.id] = { 
      name, 
      score: 0, 
      answer: null,
      ready: false
    };
    
    socket.join(gameCode);
    
    // Send current game state
    socket.emit('newPrompt', { 
      prompt: session.currentPrompt,
      players: session.players 
    });
    
    // Notify others
    io.to(gameCode).emit('playerJoined', session.players);
  });

  // Håndter indsendte svar fra spillere
  socket.on('submitAnswer', ({ gameCode, answer }) => {
    console.log(`Modtog svar fra ${socket.id} i spil ${gameCode}: ${answer}`);
    const session = gameSessions[gameCode];
    if (!session) {
      console.error(`Spil session ${gameCode} ikke fundet!`);
      return;
    }

    // Gem svaret for denne spiller
    session.players[socket.id].answer = answer;
    
    // Tæl hvor mange der har svaret
    const totalPlayers = Object.keys(session.players).length;
    const playersAnswered = Object.values(session.players).filter(p => p.answer).length;
    
    console.log(`${playersAnswered} ud af ${totalPlayers} spillere har svaret`);
    
    if (playersAnswered === totalPlayers) {
      // Alle har svaret - beregn point
      const answers = Object.values(session.players).map(p => p.answer);
      
      // Tæl forekomster af hvert svar
      const answerCounts = answers.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});
      
      // Uddel point baseret på matches
      Object.values(session.players).forEach(player => {
        const matches = answerCounts[player.answer];
        if (matches === 2) {
          player.score += 3; // Perfekt match med én anden
        } else if (matches > 2) {
          player.score += 1; // Match med flere
        }
        // Nulstil svar til næste runde
        player.answer = null;
      });
      
      // Check for vinder
      const winner = Object.values(session.players).find(p => p.score >= MAX_SCORE);
      
      if (winner) {
        io.to(gameCode).emit('gameOver', { winner: winner.name, score: winner.score });
      } else {
        // Ny runde - send nyt prompt
        session.currentPrompt = selectNewPrompt(session);
        io.to(gameCode).emit('newPrompt', { 
          prompt: session.currentPrompt,
          players: session.players 
        });
      }
    } else {
      // Ikke alle har svaret endnu - opdater bare spillerstatus
      io.to(gameCode).emit('updatePlayers', session.players);
    }
  });

  // Håndter disconnect, fjern spilleren og opdater de øvrige
  socket.on('disconnect', () => {
    console.log(`Socket frakoblet: ${socket.id}`);
    for (const gameCode in gameSessions) {
      if (gameSessions[gameCode].players[socket.id]) {
        delete gameSessions[gameCode].players[socket.id];
        io.to(gameCode).emit('updateScores', { players: gameSessions[gameCode].players });
      }
    }
  });
});

// Start serveren
const PORT = process.env.PORT || 4000;
http.listen(PORT, () => {
  console.log(`Server kører på port ${PORT}`);
});
