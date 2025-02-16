/*
  App.js – Hovedkomponenten for "Helt Blank"
  Denne komponent håndterer:
    • Input-formular til indtastning af navn og spilkode for at join'e spillet
    • Visning af det aktuelle prompt
    • Indsendelse af svar og visning af runderesultater samt opdatering af scores
*/

import React, { useState, useEffect } from 'react';
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

const AppContainer = styled.div`
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

const MainContent = styled.main`
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
  background: rgba(255, 255, 255, 0.05);
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
  const [joined, setJoined] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState({});
  const [gameState, setGameState] = useState('lobby');
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    const newSocket = io('https://helt-blank.onrender.com');
    setSocket(newSocket);

    newSocket.on('newPrompt', ({ prompt, players }) => {
      setPrompt(prompt);
      setPlayers(players);
      setAnswer('');
      setIsLoading(false);
    });

    newSocket.on('updateScores', ({ players }) => {
      console.log('Modtog scores:', players);
      setPlayers(players);
      if (players[newSocket.id]) {
        setScore(players[newSocket.id].score);
      }
    });

    newSocket.on('message', (msg) => {
      console.log('Modtog besked:', msg);
      setMessage(msg);
    });

    newSocket.on('gameOver', ({ winner, score }) => {
      setGameState('ended');
      setWinner({ name: winner, score });
    });

    return () => newSocket.close();
  }, []);

  const joinGame = (e) => {
    e.preventDefault();
    if (name && gameCode) {
      console.log('Sender joinGame med:', { name, gameCode });
      socket.emit('joinGame', { name, gameCode });
      setJoined(true);
      setIsLoading(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (answer.trim() && gameCode) {
      console.log('Sender svar:', answer.trim());
      socket.emit('submitAnswer', { gameCode, answer: answer.trim() });
      setAnswer(''); // Nulstil inputfelt
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
      <AppContainer>
        <Header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
        >
          <HeaderContent>
            <Logo>Helt Blank</Logo>
            {joined && (
              <Score>Score: <span>{score}</span></Score>
            )}
          </HeaderContent>
        </Header>

        <MainContent>
          <AnimatePresence mode="wait">
            {gameState === 'ended' && (
              <div style={gameOverStyle}>
                <h2>🏆 {winner.name} vandt! 🏆</h2>
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
            {!joined ? (
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

                {message && (
                  <Message
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {message}
                  </Message>
                )}

                <PlayersList>
                  {safeObjectValues(players).map((player) => (
                    <PlayerCard
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <h3>{player.name}</h3>
                      <p>{player.score} point</p>
                    </PlayerCard>
                  ))}
                </PlayersList>
                <Button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartGame}
                >
                  Start spillet
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </MainContent>
      </AppContainer>
    </ThemeProvider>
  );
}

export default App;
