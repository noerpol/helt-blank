/*
  server.js – Backend til "Helt Blank"
  Denne fil konfigurerer Express-serveren, der:
    • Loader ordlisten fra words.json.
    • Håndterer realtime-spilflow via Socket.io.
*/

require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const OpenAI = require('openai');
const words = require('./words.json');

const app = express();
const httpServer = createServer(app);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure CORS
app.use(cors());

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling']
});

const MIN_PLAYERS = parseInt(process.env.MIN_PLAYERS) || 3;
const games = new Map();
const aiPlayers = new Map();

// AI player names
const AI_NAMES = [
  'Robot Ross', 'AI Alice', 'Digital Dave', 
  'Cyber Charlie', 'Bot Bob', 'Virtual Vera'
];

// Get random AI name
function getRandomAIName(gameCode) {
  const usedNames = Array.from(aiPlayers.get(gameCode) || []).map(ai => ai.name);
  const availableNames = AI_NAMES.filter(name => !usedNames.includes(name));
  return availableNames[Math.floor(Math.random() * availableNames.length)];
}

// Get random prompt from words.json
function getRandomPrompt() {
  const categories = Object.keys(words);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const wordsList = words[category];
  const word = wordsList[Math.floor(Math.random() * wordsList.length)];
  console.log('Valgte prompt-ordet:', word, 'fra kategori:', category);
  return word;
}

// Generate AI response using OpenAI
async function generateAIResponse(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: "Du er en spiller i et dansk ordassociationsspil. Din opgave er at:\n" +
                "1. Se et ord (f.eks. 'hund')\n" +
                "2. Svare med ét ord du associerer med det ord\n" +
                "3. Tænke på hvad andre spillere sandsynligvis ville associere med ordet\n" +
                "4. Vælge almindelige og letforståelige associationer\n" +
                "5. Målet er at matche præcis én anden spillers svar\n" +
                `6. Din spillerstil er: ${Math.random() > 0.5 ? 
                  'Kreativ - vælg mindre oplagte, men stadig forståelige associationer som 1-2 andre måske vil vælge' : 
                  'Strategisk - vælg associationer der er lidt uventede, men som en anden spiller måske også vil tænke på'}`
      }, {
        role: "user",
        content: `Du får ordet "${prompt}". Hvilket ord associerer du med det? VIGTIGT: Svar KUN med ét ord, ingen forklaring. Vær kreativ og undgå det mest oplagte svar.`
      }],
      max_tokens: 10,
      temperature: 1.0
    });
    
    return completion.choices[0].message.content.trim().split(' ')[0];
  } catch (error) {
    console.error('OpenAI API Error:', error);
    // Hvis API fejler, vælg et tilfældigt ord fra en anden kategori som backup
    const categories = Object.keys(words);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const wordsList = words[category];
    return wordsList[Math.floor(Math.random() * wordsList.length)];
  }
}

// Add AI player to game
async function addAIPlayer(gameCode) {
  if (!aiPlayers.has(gameCode)) {
    aiPlayers.set(gameCode, new Set());
  }

  const aiName = getRandomAIName(gameCode);
  if (!aiName) return; // No more AI names available

  const aiPlayer = {
    id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: aiName,
    isAI: true,
    score: 0,
    answer: null
  };

  aiPlayers.get(gameCode).add(aiPlayer);
  const game = games.get(gameCode);
  if (game) {
    game.players[aiPlayer.id] = aiPlayer;
    io.to(gameCode).emit('playerJoined', game.players);
  }
}

// Remove AI player from game
function removeAIPlayer(gameCode) {
  const ais = aiPlayers.get(gameCode);
  if (ais && ais.size > 0) {
    const aiToRemove = Array.from(ais)[ais.size - 1];
    ais.delete(aiToRemove);
    const game = games.get(gameCode);
    if (game) {
      delete game.players[aiToRemove.id];
      io.to(gameCode).emit('playerJoined', game.players);
    }
  }
}

// Manage AI players count
function manageAIPlayers(gameCode) {
  const game = games.get(gameCode);
  if (!game) return;

  const totalPlayers = Object.keys(game.players).length;
  const aiCount = Array.from(aiPlayers.get(gameCode) || []).length;
  const humanCount = totalPlayers - aiCount;

  if (totalPlayers < MIN_PLAYERS) {
    // Add AI players until we reach MIN_PLAYERS
    const aiNeeded = MIN_PLAYERS - totalPlayers;
    for (let i = 0; i < aiNeeded; i++) {
      addAIPlayer(gameCode);
    }
  } else if (humanCount >= MIN_PLAYERS && aiCount > 0) {
    // Remove AI players if we have enough human players
    removeAIPlayer(gameCode);
  }
}

// Submit AI answers
async function submitAIAnswers(gameCode, prompt) {
  const ais = aiPlayers.get(gameCode);
  if (!ais) return;

  for (const ai of ais) {
    if (!games.get(gameCode)) return; // Game might have ended
    
    const answer = await generateAIResponse(prompt);
    if (answer) {
      const game = games.get(gameCode);
      game.players[ai.id].answer = answer;
      io.to(gameCode).emit('playerJoined', game.players);
      
      // Check if all players have answered
      checkAllAnswered(gameCode);
    }
  }
}

function checkAllAnswered(gameCode) {
  console.log('Checking if all players answered');
  const game = games.get(gameCode);
  if (!game) {
    console.log('Game not found:', gameCode);
    return;
  }

  console.log('Current game state:', {
    players: Object.keys(game.players).length,
    answers: Object.values(game.players).filter(p => p.answer !== null).length
  });

  const allAnswered = Object.values(game.players).every(player => player.answer !== null);
  
  if (allAnswered) {
    console.log('All players have answered, calculating scores');
    
    // Group answers
    const answerGroups = {};
    Object.values(game.players).forEach(player => {
      const answer = player.answer.toLowerCase();
      if (!answerGroups[answer]) {
        answerGroups[answer] = [];
      }
      answerGroups[answer].push(player);
    });

    console.log('Answer groups:', answerGroups);

    // Award points
    Object.values(answerGroups).forEach(group => {
      if (group.length === 2) {
        group.forEach(player => {
          player.score += 3;
          console.log(`Player ${player.name} gets 3 points`);
        });
      } else if (group.length > 2) {
        group.forEach(player => {
          player.score += 1;
          console.log(`Player ${player.name} gets 1 point`);
        });
      }
    });

    // Check for winner
    const winner = Object.values(game.players).find(p => p.score >= 30);
    
    // Reset answers and send new prompt
    Object.values(game.players).forEach(p => p.answer = null);
    game.currentPrompt = getRandomPrompt();
    
    io.to(gameCode).emit('roundComplete', {
      scores: Object.values(game.players).map(p => ({ name: p.name, score: p.score })),
      winner: winner ? winner.name : null
    });

    io.to(gameCode).emit('newPrompt', {
      prompt: game.currentPrompt,
      playersCount: Object.keys(game.players).length
    });

    console.log('New round started with prompt:', game.currentPrompt);
    
    // Submit AI answers for the new round
    submitAIAnswers(gameCode, game.currentPrompt);
  }
}

function calculateRoundResults(gameCode) {
  const game = games.get(gameCode);
  if (!game) return;

  // Group answers
  const answerGroups = {};
  Object.entries(game.players).forEach(([id, player]) => {
    const answer = player.answer.toLowerCase();
    if (!answerGroups[answer]) {
      answerGroups[answer] = [];
    }
    answerGroups[answer].push(id);
  });

  // Find matches (answers with exactly 2 players)
  const roundWinners = [];
  Object.entries(answerGroups).forEach(([answer, players]) => {
    if (players.length === 2) {
      roundWinners.push(...players);
      // Award 3 points to each player in the pair
      players.forEach(id => {
        game.players[id].score += 3;
      });
    } else if (players.length > 2) {
      // Award 1 point to players who matched with more than one other
      players.forEach(id => {
        game.players[id].score += 1;
      });
    }
  });

  // Reset answers
  Object.values(game.players).forEach(player => {
    player.answer = null;
  });

  // Check for game winner
  const winners = Object.entries(game.players)
    .filter(([_, player]) => player.score >= 30)
    .sort((a, b) => b[1].score - a[1].score);

  if (winners.length > 0) {
    // Game over - all players with the highest score win
    const highestScore = winners[0][1].score;
    const actualWinners = winners.filter(([_, player]) => player.score === highestScore);
    
    actualWinners.forEach(([_, winner]) => {
      io.to(gameCode).emit('gameOver', {
        winner: winner.name,
        score: winner.score
      });
    });
    
    // Clean up game
    games.delete(gameCode);
    aiPlayers.delete(gameCode);
  } else {
    // Continue game with new prompt
    io.to(gameCode).emit('roundResult', {
      players: game.players,
      roundWinners
    });

    const newPrompt = getRandomPrompt();
    game.currentPrompt = newPrompt;
    
    setTimeout(() => {
      io.to(gameCode).emit('newPrompt', {
        prompt: newPrompt,
        players: game.players
      });
      // Submit AI answers for the new prompt
      submitAIAnswers(gameCode, newPrompt);
    }, 3000);
  }
}

// Error handling for the server
httpServer.on('error', (error) => {
  console.error('Server error:', error);
});

io.on('error', (error) => {
  console.error('Socket.IO error:', error);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('joinGame', (data) => {
    console.log('Join game request:', data);
    try {
      let game = games.get(data.gameCode);
      
      if (!game) {
        game = {
          players: {},
          currentPrompt: getRandomPrompt()
        };
        games.set(data.gameCode, game);
      }

      // Add the new player
      game.players[socket.id] = {
        id: socket.id,
        name: data.name,
        score: 0,
        answer: null
      };

      socket.join(data.gameCode);
      
      // Manage AI players after adding new human player
      manageAIPlayers(data.gameCode);

      io.to(data.gameCode).emit('playerJoined', game.players);
      socket.emit('newPrompt', {
        prompt: game.currentPrompt,
        players: game.players
      });

      // Submit AI answers if this is a new game
      if (Object.keys(game.players).length <= MIN_PLAYERS) {
        submitAIAnswers(data.gameCode, game.currentPrompt);
      }
    } catch (error) {
      console.error('Error in joinGame:', error);
    }
  });

  socket.on('submitAnswer', (data) => {
    console.log('Answer submitted:', data);
    try {
      const game = games.get(data.gameCode);
      if (!game) {
        console.log('Game not found:', data.gameCode);
        return;
      }

      const player = game.players[socket.id];
      if (!player) {
        console.log('Player not found:', socket.id);
        return;
      }

      if (player.answer === null) {
        player.answer = data.answer;
        console.log(`Player ${player.name} submitted answer: ${data.answer}`);
        io.to(data.gameCode).emit('playerJoined', game.players);
        
        // Check if all players have answered
        checkAllAnswered(data.gameCode);
      } else {
        console.log(`Player ${player.name} already submitted an answer`);
      }
    } catch (error) {
      console.error('Error in submitAnswer:', error);
    }
  });
});

// Process error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const port = process.env.PORT || 4000;
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
