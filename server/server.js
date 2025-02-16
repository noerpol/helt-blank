/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Serverer de byggede statiske filer fra React-appen.
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Tillad CORS fra alle origins i produktion, eller specifik origin i udvikling
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? '*'
  : ["http://localhost:3000", "http://localhost:3001"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Læs ordlisten fra words.json
const wordsFile = path.join(__dirname, 'words.json');
const { words } = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
console.log('Loaded words:', words);

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

// Server de statiske filer – forventer at React-appen er bygget i ../client/build
app.use(express.static(path.join(__dirname, '../client/build')));

// Fallback til index.html for Single Page Apps
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Socket.io-håndtering
io.on('connection', (socket) => {
  console.log(`Socket forbundet: ${socket.id}`);

  // Spilleren joiner et spil med navn og spilkode
  socket.on('joinGame', ({ name, gameCode }) => {
    // Opret en ny session hvis den ikke findes
    if (!gameSessions[gameCode]) {
      gameSessions[gameCode] = {
        players: {},
        answers: {},
        usedWords: new Set(),
        currentPrompt: null
      };
    }
    const session = gameSessions[gameCode];
    // Gem spillerinformation
    session.players[socket.id] = { name, score: 0, currentAnswer: '' };
    socket.join(gameCode);
    console.log(`${name} joined game ${gameCode}`);

    // Start spilrunden hvis der ikke allerede er et prompt
    if (!session.currentPrompt) {
      session.currentPrompt = selectNewPrompt(session);
      console.log('Sending newPrompt:', session.currentPrompt);
    }
    // Send nuværende prompt til spilleren
    socket.emit('newPrompt', { prompt: session.currentPrompt });
    io.to(gameCode).emit('updateScores', { players: session.players });
  });

  // Håndter indsendte svar fra spillere
  socket.on('submitAnswer', ({ gameCode, answer }) => {
    const session = gameSessions[gameCode];
    if (!session) return;
    const player = session.players[socket.id];
    const matches = Object.values(session.players).filter(p => 
      p.id !== socket.id && 
      p.currentAnswer?.toLowerCase() === answer.toLowerCase()
    );

    let points = 0;
    if(matches.length === 1) points = 3;
    else if(matches.length > 1) points = 1;

    player.score += points;
    player.currentAnswer = answer;

    const winner = Object.values(session.players).find(p => p.score >= MAX_SCORE);
    
    if(winner) {
      io.to(gameCode).emit('gameOver', { winner: winner.name, score: winner.score });
      Object.values(session.players).forEach(p => {
        p.score = 0;
        p.currentAnswer = '';
      });
    } else {
      io.to(gameCode).emit('scoreUpdate', session.players);
      session.currentPrompt = selectNewPrompt(session);
      console.log(`Sender nyt prompt: ${session.currentPrompt} til spil ${gameCode}`);
      io.to(gameCode).emit('newPrompt', { 
        prompt: session.currentPrompt,
        players: session.players 
      });
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
server.listen(PORT, () => {
  console.log(`Server kører på port ${PORT}`);
});
