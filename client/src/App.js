import React, { useState, useEffect } from 'react';
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
  const [pointChanges, setPointChanges] = useState({});

  useEffect(() => {
    if (!socket) {
      console.log('Initializing new socket connection');
      const newSocket = io('https://helt-blank.onrender.com', {
        transports: ['polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });
      setSocket(newSocket);
      return;
    }

    const handleConnect = () => {
      console.log('Connected to server');
      setMessage('');
      
      // Rejoin game if we were in one
      if (gameCode && name && gameState !== 'init') {
        console.log('Rejoining game after reconnect:', { gameCode, name });
        socket.emit('joinGame', { gameCode, name });
      }
    };

    const handleConnectError = (error) => {
      console.log('Connection Error:', error);
      setMessage('Could not connect to server');
      setIsLoading(false);
    };

    const handleDisconnect = (reason) => {
      console.log('Disconnected:', reason);
      setMessage('Lost connection - trying to reconnect...');
      setIsLoading(false);
    };

    const handleNewPrompt = (data) => {
      console.log('New prompt received:', data);
      if (data && data.prompt) {
        setPrompt(data.prompt);
        if (data.players) {
          setPlayers(data.players);
        }
        setGameState('playing');
        setIsLoading(false);
        setPointChanges({}); // Reset point changes for new round
      } else {
        console.error('Invalid prompt data received:', data);
      }
    };

    const handleRoundResult = (data) => {
      console.log('Round result received:', data);
      if (data) {
        if (data.scores) setScores(data.scores);
        if (data.pointChanges) setPointChanges(data.pointChanges);
        if (data.answers) {
          const newPlayers = { ...players };
          Object.entries(data.answers).forEach(([name, answer]) => {
            Object.values(newPlayers).forEach(player => {
              if (player.name === name) {
                player.answer = answer;
              }
            });
          });
          setPlayers(newPlayers);
        }
      }
    };

    const handleRoundComplete = (data) => {
      console.log('Round complete:', data);
      if (data) {
        if (data.prompt) setPrompt(data.prompt);
        if (data.players) setPlayers(data.players);
        if (data.scores) setScores(data.scores);
        setRoundNumber(prev => prev + 1);
      }
      setAnswer('');
      setIsLoading(false);
    };

    const handlePlayerJoined = (players) => {
      console.log('Players updated:', players);
      if (players) {
        setPlayers(players);
      }
      setIsLoading(false);
    };

    const handleRoundResults = (data) => {
      console.log('Round results:', data);
      setScores(data.scores);
      setPointChanges(data.pointChanges || {});
      setTimeout(() => setPointChanges({}), 2000);
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('newPrompt', handleNewPrompt);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('roundResult', handleRoundResult);
    socket.on('roundComplete', handleRoundComplete);
    socket.on('roundResults', handleRoundResults);
    
    socket.on('error', ({ message }) => {
      console.log('Game error:', message);
      setMessage(message);
      setIsLoading(false);
    });

    socket.on('gameOver', ({ winner, score }) => {
      console.log('Game over:', { winner, score });
      setGameState('ended');
      setWinner({ name: winner, score: score });
      setIsLoading(false);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
      socket.off('newPrompt', handleNewPrompt);
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('roundResult', handleRoundResult);
      socket.off('roundComplete', handleRoundComplete);
      socket.off('roundResults', handleRoundResults);
      socket.off('error');
      socket.off('gameOver');
    };
  }, [socket, gameCode, name, gameState, players]);

  const handleJoinGame = (e) => {
    e.preventDefault();
    if (!socket || !name || !gameCode) return;
    
    console.log('Joining game:', { gameCode, name });
    setIsLoading(true);
    socket.emit('joinGame', { gameCode, name });
  };

  const handleSubmit = (e) => {
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
  };

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

                <ScoreList>
                  <h3>Round {roundNumber}</h3>
                  <p>Current prompt: {prompt}</p>
                  <p>Players in game: {Object.keys(players).length}</p>
                  {Object.keys(scores).length > 0 && (
                    <div>
                      <h4>Scores:</h4>
                      <ul>
                        {Object.entries(scores).map(([name, score]) => (
                          <li key={name}>
                            {name}: {score}
                            {pointChanges[name] > 0 && (
                              <span style={{ 
                                color: pointChanges[name] === 3 ? '#00ff00' : '#ffa500',
                                marginLeft: '8px',
                                fontWeight: 'bold'
                              }}>
                                (+{pointChanges[name]})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </ScoreList>
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
