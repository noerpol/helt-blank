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
    session.players[socket.id] = { name, score: 0 };
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
    session.answers[socket.id] = answer;
    console.log(`Svar modtaget fra ${socket.id} i spil ${gameCode}: ${answer}`);

    // Når alle spillere har svaret evaluer runden
    if (Object.keys(session.answers).length === Object.keys(session.players).length) {
      // Tæl antallet af indsendte svar
      const answerFrequencies = {};
      Object.values(session.answers).forEach(ans => {
        answerFrequencies[ans] = (answerFrequencies[ans] || 0) + 1;
      });

      // Beregn point for hver spiller
      const roundResults = {};
      Object.entries(session.answers).forEach(([sockId, ans]) => {
        const count = answerFrequencies[ans] || 0;
        let points = 0;
        if (count === 2) points = 3;
        else if (count >= 3) points = 1;
        session.players[sockId].score += points;
        roundResults[sockId] = { answer: ans, points };
      });

      // Informér alle spillere om resultater og opdateret score
      io.to(gameCode).emit('roundResults', { roundResults, players: session.players });

      // Tjek om nogen har vundet (når score ≥ 25)
      const winners = Object.values(session.players).filter(p => p.score >= 25);
      if (winners.length > 0) {
        io.to(gameCode).emit('gameOver', { winners });
        // Fjern sessionen når spillet er slut
        delete gameSessions[gameCode];
      } else {
        // Start ny runde: nullstil svar og vælg et nyt prompt
        session.answers = {};
        session.currentPrompt = selectNewPrompt(session);
        io.to(gameCode).emit('newPrompt', { prompt: session.currentPrompt });
      }
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
