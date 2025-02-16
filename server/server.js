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
const POINTS_TO_WIN = 25;  // Changed from 30 to 25
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
function getRandomPrompt(gameCode) {
  const game = games.get(gameCode);
  if (!game) return null;

  // Initialize usedWords if not exists
  if (!game.usedWords) {
    game.usedWords = new Set();
  }

  const categories = Object.keys(words);
  let word = null;
  let attempts = 0;
  const maxAttempts = 50; // Prevent infinite loop

  while (attempts < maxAttempts) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const wordsList = words[category];
    const candidate = wordsList[Math.floor(Math.random() * wordsList.length)];
    
    if (!game.usedWords.has(candidate)) {
      word = candidate;
      game.usedWords.add(word);
      break;
    }
    attempts++;
  }

  // If we couldn't find a new word, reset the used words and try again
  if (!word) {
    game.usedWords.clear();
    const category = categories[Math.floor(Math.random() * categories.length)];
    const wordsList = words[category];
    word = wordsList[Math.floor(Math.random() * wordsList.length)];
    game.usedWords.add(word);
  }

  console.log('Valgte prompt-ordet:', word, 'fra pulje af', game.usedWords.size, 'brugte ord');
  return word;
}

// Generate AI response using OpenAI
async function generateAIResponse(prompt, aiPlayer) {
  try {
    // Each AI has its own personality and temperature
    const personality = aiPlayer.name === 'Robot Ross' ? 
      'Kreativ og uventet - vælg overraskende, men stadig relevante associationer' :
      'Strategisk og eftertænksom - vælg associationer der er gennemtænkte og som andre måske også vil vælge';
    
    const temperature = aiPlayer.name === 'Robot Ross' ? 1.2 : 0.8;

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
                `6. Din spillerstil er: ${personality}`
      }, {
        role: "user",
        content: `Du får ordet "${prompt}". Hvilket ord associerer du med det? VIGTIGT: Svar KUN med ét ord, ingen forklaring.`
      }],
      max_tokens: 10,
      temperature: temperature
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

  // Submit answers with a small delay between each AI to make it more natural
  for (const ai of ais) {
    if (!games.get(gameCode)) return; // Game might have ended
    
    // Random delay between 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const answer = await generateAIResponse(prompt, ai);
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
    const winner = Object.values(game.players).find(p => p.score >= POINTS_TO_WIN);
    
    // Reset answers and send new prompt
    Object.values(game.players).forEach(p => p.answer = null);
    game.currentPrompt = getRandomPrompt(gameCode);
    
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
  Object.values(game.players).forEach(player => {
    const answer = player.answer.toLowerCase();
    if (!answerGroups[answer]) {
      answerGroups[answer] = [];
    }
    answerGroups[answer].push(player);
  });

  // Calculate points
  const pointChanges = {};
  Object.values(game.players).forEach(player => {
    pointChanges[player.name] = 0;
  });

  Object.values(answerGroups).forEach(group => {
    if (group.length === 2) {
      // Exactly 2 players matched - 3 points each
      group.forEach(player => {
        game.players[player.id].score += 3;
        pointChanges[player.name] = 3;
      });
    } else if (group.length > 2) {
      // More than 2 players matched - 1 point each
      group.forEach(player => {
        game.players[player.id].score += 1;
        pointChanges[player.name] = 1;
      });
    }
  });

  // Check for winner
  let winner = null;
  Object.values(game.players).forEach(player => {
    if (player.score >= POINTS_TO_WIN) {
      winner = { name: player.name, score: player.score };
    }
  });

  // Prepare scores object
  const scores = {};
  Object.values(game.players).forEach(player => {
    scores[player.name] = player.score;
  });

  // Send results to all players
  io.to(gameCode).emit('roundResult', { 
    scores,
    pointChanges,
    answers: Object.fromEntries(
      Object.values(game.players).map(p => [p.name, p.answer])
    )
  });

  if (winner) {
    // Game over
    io.to(gameCode).emit('gameOver', winner);
    games.delete(gameCode);
    aiPlayers.delete(gameCode);
  } else {
    // Start new round
    resetRound(gameCode);
  }
}

function resetRound(gameCode) {
  const game = games.get(gameCode);
  if (!game) return;

  Object.values(game.players).forEach(player => {
    player.answer = null;
  });

  game.currentPrompt = getRandomPrompt(gameCode);
  io.to(gameCode).emit('newPrompt', {
    prompt: game.currentPrompt,
    playersCount: Object.keys(game.players).length
  });

  submitAIAnswers(gameCode, game.currentPrompt);
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
          currentPrompt: getRandomPrompt(data.gameCode),
          usedWords: new Set()
        };
        games.set(data.gameCode, game);
      }

      // Remove old socket ID if this player is reconnecting
      Object.entries(game.players).forEach(([oldSocketId, player]) => {
        if (player.name === data.name) {
          console.log(`Player ${data.name} reconnecting, updating socket ID from ${oldSocketId} to ${socket.id}`);
          delete game.players[oldSocketId];
        }
      });

      // Add the player with new socket ID
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
        playersCount: Object.keys(game.players).length
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

      // Find player by name if socket ID doesn't match
      let player = game.players[socket.id];
      if (!player) {
        const playerEntry = Object.entries(game.players).find(([_, p]) => p.name === data.name);
        if (playerEntry) {
          console.log(`Found player ${data.name} with different socket ID, updating from ${playerEntry[0]} to ${socket.id}`);
          player = playerEntry[1];
          delete game.players[playerEntry[0]];
          game.players[socket.id] = player;
          player.id = socket.id;
        }
      }

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
