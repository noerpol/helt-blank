/*
  App.js – Hovedkomponenten for "Helt Blank"
  Denne komponent håndterer:
    • Input-formular til indtastning af navn og spilkode for at join'e spillet
    • Visning af det aktuelle prompt
    • Indsendelse af svar og visning af runderesultater samt opdatering af scores
*/

import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import styled, { createGlobalStyle, ThemeProvider } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import '@fontsource/roboto';

const safeObjectValues = (obj) => {
  try {
    return Object.values(obj || {});
  } catch (error) {
    console.error('Fejl i object values:', error);
    return [];
  }
};

const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    background: #000000;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    min-height: 100vh;
    overflow-x: hidden;
  }

  ::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

const theme = {
  colors: {
    background: '#000000',
    surface: '#1c1c1e',
    primary: '#0A84FF',
    secondary: '#64D2FF',
    text: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.6)',
    error: '#FF453A'
  }
};

const Container = styled.div`
  min-height: 100vh;
  background: ${props => props.theme.colors.background};
  display: flex;
  flex-direction: column;
`;

const Header = styled(motion.header)`
  padding: 2rem;
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
`;

const HeaderContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(to right, ${props => props.theme.colors.primary}, ${props => props.theme.colors.secondary});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Score = styled.div`
  font-size: 1.2rem;
  color: ${props => props.theme.colors.textSecondary};
  span {
    color: ${props => props.theme.colors.primary};
    font-weight: 600;
  }
`;

const Main = styled.main`
  max-width: 1200px;
  margin: 7rem auto 2rem;
  padding: 0 2rem;
  width: 100%;
  flex: 1;
`;

const Input = styled.input`
  width: 100%;
  padding: 1rem 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: ${props => props.theme.colors.text};
  font-size: 2rem;
  margin: 1rem 0;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-bottom-color: ${props => props.theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
  }
`;

const Button = styled(motion.button)`
  background: ${props => props.theme.colors.primary};
  color: #ffffff;
  border: none;
  padding: 1rem 2rem;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  opacity: ${props => props.disabled ? 0.5 : 1};

  &:disabled {
    cursor: not-allowed;
  }
`;

const PromptDisplay = styled(motion.div)`
  font-size: 3rem;
  font-weight: 700;
  margin: 2rem 0;
  text-align: center;
  background: linear-gradient(to right, ${props => props.theme.colors.primary}, ${props => props.theme.colors.secondary});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
`;

const PlayersList = styled(motion.div)`
  margin-top: 3rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
`;

const PlayerCard = styled(motion.div)`
  background: ${props => props.hasAnswered ? '#e8f5e9' : 'rgba(255, 255, 255, 0.05)'};
  padding: 1rem;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);

  h3 {
    color: ${props => props.theme.colors.text};
    margin-bottom: 0.5rem;
  }

  p {
    color: ${props => props.theme.colors.primary};
  }
`;

const Message = styled(motion.div)`
  color: ${props => props.theme.colors.textSecondary};
  text-align: center;
  margin: 1rem 0;
`;

const Timer = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  margin: 1rem 0;
  color: ${props => props.timeLeft <= 5 ? 'red' : 'black'};
`;

const gameOverStyle = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: 'rgba(0,0,0,0.9)',
  padding: '2rem',
  borderRadius: '1rem',
  textAlign: 'center',
  zIndex: 1000
};

function App() {
  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState({});
  const [gameState, setGameState] = useState('lobby');
  const [winner, setWinner] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (answer.trim() && gameCode && socket) {
      socket.emit('submitAnswer', { gameCode, answer: answer.trim() });
      setAnswer('');
      setIsLoading(true);
    }
  }, [answer, gameCode, socket]);

  useEffect(() => {
    if (socket?.connected) {
      console.log('Already connected, skipping socket initialization');
      return;
    }

    const newSocket = io('https://helt-blank.onrender.com', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
    
    const handleConnect = () => {
      console.log('Connected to server');
      setMessage('');
    };

    const handleConnectError = (error) => {
      console.error('Connection Error:', error);
      setMessage('Forbindelsesfejl - prøver igen...');
    };

    const handleDisconnect = (reason) => {
      console.log('Disconnected:', reason);
      setMessage('Mistet forbindelse - prøver at genoprette...');
    };

    const handleNewPrompt = ({ prompt, players }) => {
      console.log('Received new prompt:', { prompt, playersCount: Object.keys(players).length });
      setPrompt(prompt);
      setPlayers(players);
      setIsLoading(false);
      setMessage('');
      setGameState('playing');
    };

    const handlePlayerJoined = (players) => {
      console.log('Players updated:', Object.keys(players).length);
      setPlayers(players);
      setIsLoading(false);
    };

    const handleRoundResult = ({ players, roundWinners }) => {
      console.log('Round result:', { playersCount: Object.keys(players).length, winnersCount: roundWinners.length });
      setPlayers(players);
      setIsLoading(false);
      if (roundWinners.includes(newSocket?.id)) {
        setScore(prev => prev + (roundWinners.length === 2 ? 3 : 1));
      }
    };

    // Tilføj event listeners
    newSocket.on('connect', handleConnect);
    newSocket.on('connect_error', handleConnectError);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('newPrompt', handleNewPrompt);
    newSocket.on('playerJoined', handlePlayerJoined);
    newSocket.on('roundResult', handleRoundResult);
    
    newSocket.on('error', ({ message }) => {
      console.log('Received error:', message);
      setMessage(message);
      setIsLoading(false);
    });

    newSocket.on('gameOver', ({ winner, score }) => {
      console.log('Game over:', { winner, score });
      setGameState('ended');
      setWinner({ name: winner, score });
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.off('connect', handleConnect);
        newSocket.off('connect_error', handleConnectError);
        newSocket.off('disconnect', handleDisconnect);
        newSocket.off('newPrompt', handleNewPrompt);
        newSocket.off('playerJoined', handlePlayerJoined);
        newSocket.off('roundResult', handleRoundResult);
        newSocket.removeAllListeners('error');
        newSocket.removeAllListeners('gameOver');
        newSocket.close();
      }
    };
  }, [socket?.connected]);

  useEffect(() => {
    let timer = null;
    
    const startTimer = () => {
      setTimeLeft(15);
      timer = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timer);
            if (socket?.id && players[socket.id]?.answer === null) {
              handleSubmit({ preventDefault: () => {} });
            }
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    };

    if (prompt && !winner && gameState === 'playing') {
      startTimer();
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [prompt, winner, gameState, socket?.id, players, handleSubmit]);

  const joinGame = (e) => {
    e.preventDefault();
    if (name && gameCode) {
      console.log('Sender joinGame med:', { name, gameCode });
      socket.emit('joinGame', { name, gameCode });
      setGameState('lobby');
      setIsLoading(true);
    }
  };

  const handleStartGame = () => {
    if (players && Object.values(players || {}).every(player => player?.ready)) {
      socket.emit('startGame', { gameCode });
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Container>
        <Header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
        >
          <HeaderContent>
            <Logo>Helt Blank</Logo>
            {gameState === 'lobby' && (
              <Score>Score: <span>{score}</span></Score>
            )}
          </HeaderContent>
        </Header>

        <Main>
          {message && (
            <Message
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {message}
            </Message>
          )}

          <AnimatePresence mode="wait">
            {gameState === 'ended' && (
              <div style={gameOverStyle}>
                <h2> {winner.name} vandt! </h2>
                <p>Med {winner.score} point</p>
                <button 
                  onClick={() => {
                    setGameState('lobby');
                    setWinner(null);
                  }}
                  style={{ marginTop: '1rem' }}
                >
                  Spil igen
                </button>
              </div>
            )}
            {gameState === 'lobby' ? (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <form onSubmit={joinGame}>
                  <Input
                    type="text"
                    placeholder="Dit navn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <Input
                    type="text"
                    placeholder="Spilkode"
                    value={gameCode}
                    onChange={(e) => setGameCode(e.target.value)}
                    required
                  />
                  <Button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Start spil
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="game"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Timer timeLeft={timeLeft}>
                  {timeLeft} sekunder
                </Timer>
                <PromptDisplay
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {isLoading ? "..." : prompt}
                </PromptDisplay>

                <form onSubmit={handleSubmit}>
                  <Input
                    type="text"
                    placeholder="Dit svar..."
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Send
                  </Button>
                </form>

                <Button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartGame}
                >
                  Start spillet
                </Button>
                <PlayersList>
                  {safeObjectValues(players).map((player) => (
                    <PlayerCard 
                      key={player.id}
                      hasAnswered={Boolean(player.answer)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <h3>{player.name}</h3>
                      <p>{player.score} point</p>
                    </PlayerCard>
                  ))}
                </PlayersList>
              </motion.div>
            )}
          </AnimatePresence>
        </Main>
      </Container>
    </ThemeProvider>
  );
}

export default App;
