/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

const express = require('express');
const http = require('http');
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
const wordsFile = 'words.json';
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
    session.players[socket.id] = { name, score: 0, answer: null };
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
server.listen(PORT, () => {
  console.log(`Server kører på port ${PORT}`);
});
