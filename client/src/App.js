import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import styled, { ThemeProvider, createGlobalStyle } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';

// Theme configuration
const theme = {
  colors: {
    primary: '#0A84FF',
    secondary: '#64D2FF',
    background: '#000000',
    text: '#ffffff',
    error: '#FF453A'
  }
};

// Styled components
const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    overflow-x: hidden;
  }

  body, html {
    height: 100%;
    margin: 0;
  }

  #root {
    height: 100%;
  }
`;

const Container = styled.div`
  min-height: 100vh;
  background: ${props => props.theme.colors.background};
  padding: 20px;
`;

const Header = styled(motion.header)`
  padding: 20px;
  margin-bottom: 40px;
`;

const HeaderContent = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const Logo = styled.h1`
  color: ${props => props.theme.colors.primary};
  margin: 0;
`;

const Main = styled.main`
  max-width: 600px;
  margin: 0 auto;
`;

const Message = styled.div`
  padding: 10px;
  margin-bottom: 20px;
  background: ${props => props.theme.colors.error};
  color: white;
  border-radius: 4px;
  text-align: center;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

const Button = styled(motion.button)`
  width: 100%;
  padding: 10px;
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PromptDisplay = styled(motion.div)`
  font-size: 24px;
  color: ${props => props.theme.colors.primary};
  text-align: center;
  margin: 20px 0;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
`;

const PlayersList = styled.div`
  margin-top: 20px;
`;

const PlayerCard = styled(motion.div)`
  padding: 15px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  ${props => props.hasAnswered && `
    border: 1px solid ${props.theme.colors.primary};
  `}
`;

const PlayerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const PlayerName = styled.span`
  font-weight: bold;
`;

const PlayerAnswer = styled.span`
  color: ${props => props.theme.colors.primary};
  font-style: italic;
`;

const GameStatus = styled.div`
  text-align: center;
  margin-bottom: 20px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  
  span {
    color: ${props => props.theme.colors.secondary};
    font-weight: bold;
  }
`;

const ScoreList = styled.div`
  margin-top: 20px;
`;

// App component
const App = () => {
  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [answer, setAnswer] = useState('');
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [players, setPlayers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [gameState, setGameState] = useState('init');
  const [winner, setWinner] = useState(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [scores, setScores] = useState({});

  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if (!answer.trim() || !gameCode || !socket || !name) return;

    console.log('Submitting answer:', { gameCode, answer: answer.trim(), name });
    socket.emit('submitAnswer', {
      gameCode,
      answer: answer.trim(),
      name
    });
    setAnswer('');
    setIsLoading(true);
  }, [answer, gameCode, socket, name]);

  const handleJoinGame = useCallback((e) => {
    e.preventDefault();
    if (name && gameCode) {
      console.log('Sender joinGame med:', { name, gameCode });
      socket.emit('joinGame', { gameCode, name });
      setIsLoading(true);
    }
  }, [name, gameCode, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('Connected to server');
      setMessage('');
      
      // Rejoin game if we were in one
      if (gameCode && name) {
        console.log('Rejoining game after reconnect:', { gameCode, name });
        socket.emit('joinGame', { gameCode, name });
      }
    };

    const handleConnectError = (error) => {
      console.log('Connection Error:', error);
      setMessage('Could not connect to server');
    };

    const handleDisconnect = (reason) => {
      console.log('Disconnected:', reason);
      setMessage('Lost connection - trying to reconnect...');
    };

    const handleNewPrompt = ({ prompt, players }) => {
      console.log('Received new prompt:', { prompt, playersCount: Object.keys(players).length });
      setPrompt(prompt);
      setPlayers(players);
      setIsLoading(false);
      setMessage('');
      
      // Kun øg rundenummer hvis vi allerede er i gang med spillet
      if (gameState === 'playing') {
        setRoundNumber(prev => prev + 1);
      } else {
        setGameState('playing');
      }
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
    };

    const handleRoundComplete = (data) => {
      console.log('Round complete:', data);
      setScores(data.scores);
      if (data.winner) {
        setWinner(data.winner);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('newPrompt', handleNewPrompt);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('roundResult', handleRoundResult);
    socket.on('roundComplete', handleRoundComplete);
    
    socket.on('error', ({ message }) => {
      console.log('Received error:', message);
      setMessage(message);
      setIsLoading(false);
    });

    socket.on('gameOver', ({ winner, score }) => {
      console.log('Game over:', { winner, score });
      setGameState('ended');
      setWinner({ name: winner, score });
    });

    return () => {
      if (socket) {
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleConnectError);
        socket.off('disconnect', handleDisconnect);
        socket.off('newPrompt', handleNewPrompt);
        socket.off('playerJoined', handlePlayerJoined);
        socket.off('roundResult', handleRoundResult);
        socket.off('roundComplete', handleRoundComplete);
        socket.removeAllListeners('error');
        socket.removeAllListeners('gameOver');
        socket.close();
      }
    };
  }, [socket, gameCode, name, gameState]);

  useEffect(() => {
    if (socket?.connected) {
      console.log('Already connected, skipping socket initialization');
      return;
    }

    const newSocket = io('https://helt-blank.onrender.com', {
      transports: ['polling']
    });

    setSocket(newSocket);
  }, [socket?.connected]);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Container>
        <Header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
        >
          <HeaderContent>
            <Logo>Helt Blank</Logo>
          </HeaderContent>
        </Header>

        <Main>
          {message && (
            <Message>
              {message}
            </Message>
          )}

          <AnimatePresence mode="wait">
            {gameState === 'init' ? (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <form onSubmit={handleJoinGame}>
                  <Input
                    type="text"
                    placeholder="Dit navn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                  />
                  <Input
                    type="text"
                    placeholder="Spilkode"
                    value={gameCode}
                    onChange={(e) => setGameCode(e.target.value)}
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Join spil
                  </Button>
                </form>
              </motion.div>
            ) : gameState === 'playing' ? (
              <motion.div
                key="game"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <GameStatus>
                  Runde <span>{roundNumber}</span>
                </GameStatus>
                
                <PromptDisplay
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {prompt || 'Venter på prompt...'}
                </PromptDisplay>

                <form onSubmit={handleSubmit}>
                  <Input
                    type="text"
                    placeholder="Dit svar"
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
                    Send svar
                  </Button>
                </form>

                <PlayersList>
                  {Object.entries(players).map(([id, player]) => (
                    <PlayerCard 
                      key={id}
                      hasAnswered={player.answer !== null}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <PlayerInfo>
                        <PlayerName>{player.name}</PlayerName>
                        {player.answer !== null && (
                          <PlayerAnswer>
                            {gameState === 'roundEnd' ? player.answer : 'Har svaret'}
                          </PlayerAnswer>
                        )}
                      </PlayerInfo>
                    </PlayerCard>
                  ))}
                </PlayersList>

                {gameState === 'playing' && (
                  <ScoreList>
                    <h3>Round {roundNumber}</h3>
                    <p>Current prompt: {prompt}</p>
                    <p>Players in game: {Object.keys(players).length}</p>
                    {scores.length > 0 && (
                      <div>
                        <h4>Scores:</h4>
                        <ul>
                          {scores.map((score, index) => (
                            <li key={index}>{score.name}: {score.score}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </ScoreList>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="gameover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h2>{winner?.name} vandt!</h2>
                <p>Med {winner?.score} point</p>
                <Button
                  onClick={() => window.location.reload()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Spil igen
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Main>
      </Container>
    </ThemeProvider>
  );
};

export default App;
