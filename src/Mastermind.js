import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// MASTERMIND - Daily Code-Breaking Puzzle
// ============================================================================
// A standalone React component for embedding on your website.
// 
// Usage: import Mastermind from './Mastermind';
//        <Mastermind />
//
// Features:
// - One puzzle per day, resets at midnight UTC
// - Same puzzle for all players globally
// - Progress saved to localStorage
// - Shareable emoji results
// - Accessible colour letters (R/B/G/Y/P/O)
// ============================================================================

// Seeded random number generator (Mulberry32)
const mulberry32 = (seed) => {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

// Game configuration
const COLORS = [
  { name: 'Red', hex: '#ef4444', letter: 'R' },
  { name: 'Blue', hex: '#3b82f6', letter: 'B' },
  { name: 'Green', hex: '#22c55e', letter: 'G' },
  { name: 'Yellow', hex: '#eab308', letter: 'Y' },
  { name: 'Purple', hex: '#a855f7', letter: 'P' },
  { name: 'Orange', hex: '#f97316', letter: 'O' },
];

const CODE_LENGTH = 4;
const MAX_GUESSES = 8;
const LAUNCH_DATE = new Date('2025-01-27T00:00:00Z'); // Set your launch date
const STORAGE_KEY_PREFIX = 'mastermind';

// Generate a secret code using seeded random
const generateSecretCode = (seed) => {
  const random = mulberry32(seed);
  const code = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    code.push(Math.floor(random() * COLORS.length));
  }
  return code;
};

// Calculate feedback pegs for a guess
const calculateFeedback = (guess, secret) => {
  const result = { black: 0, white: 0 };
  const secretCopy = [...secret];
  const guessCopy = [...guess];
  
  // First pass: exact matches (black pegs)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] === secretCopy[i]) {
      result.black++;
      secretCopy[i] = -1;
      guessCopy[i] = -2;
    }
  }
  
  // Second pass: colour matches in wrong position (white pegs)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] >= 0) {
      const idx = secretCopy.indexOf(guessCopy[i]);
      if (idx !== -1) {
        result.white++;
        secretCopy[idx] = -1;
      }
    }
  }
  
  return result;
};

// Date utilities
const getDayNumber = () => {
  const now = new Date();
  const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const utcLaunch = Date.UTC(LAUNCH_DATE.getUTCFullYear(), LAUNCH_DATE.getUTCMonth(), LAUNCH_DATE.getUTCDate());
  return Math.floor((utcNow - utcLaunch) / (1000 * 60 * 60 * 24));
};

const getFormattedDate = () => {
  const now = new Date();
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const getTimeUntilNextPuzzle = () => {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
};

// Storage utilities
const getTodayKey = () => {
  const now = new Date();
  return `${STORAGE_KEY_PREFIX}-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
};

const saveProgress = (data) => {
  try {
    localStorage.setItem(getTodayKey(), JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {}
};

const getStoredProgress = () => {
  try {
    const data = localStorage.getItem(getTodayKey());
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// Clipboard utility
const copyToClipboard = async (text, onSuccess, onError) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      onSuccess();
      return;
    }
  } catch {}
  
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    onSuccess();
  } catch {
    onError();
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

const Mastermind = () => {
  const [secretCode, setSecretCode] = useState([]);
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [message, setMessage] = useState('');
  const [startTime, setStartTime] = useState(null);
  const [displayTime, setDisplayTime] = useState('0:00');
  const [countdown, setCountdown] = useState('');
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [storedResult, setStoredResult] = useState(null);
  const containerRef = React.useRef(null);

  const dayNumber = getDayNumber();
  const formattedDate = getFormattedDate();

  // Timer
  useEffect(() => {
    if (gameOver || !startTime) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      setDisplayTime(`${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, gameOver]);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => setCountdown(getTimeUntilNextPuzzle()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Send height to parent for iframe resizing
  useEffect(() => {
    const sendHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight;
        window.parent.postMessage({
          type: 'RESIZE_IFRAME',
          game: 'mastermind',
          height: height
        }, '*');
      }
    };
    
    sendHeight();
    const resizeObserver = new ResizeObserver(sendHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [gameOver, won, guesses]);

  // Initialize game
  const initializeGame = useCallback(() => {
    const seed = dayNumber * 1000 + 777;
    const code = generateSecretCode(seed);
    setSecretCode(code);
    setGuesses([]);
    setCurrentGuess([]);
    
    const stored = getStoredProgress();
    if (stored?.completed) {
      setAlreadyCompleted(true);
      setStoredResult(stored);
      setGameOver(true);
      setWon(stored.won);
      setDisplayTime(stored.time);
      setGuesses(stored.guesses || []);
      setMessage(stored.won ? 'Already completed today!' : 'Already attempted today!');
    } else {
      setAlreadyCompleted(false);
      setStoredResult(null);
      setGameOver(false);
      setWon(false);
      setStartTime(Date.now());
      setDisplayTime('0:00');
      setMessage('Crack the code!');
    }
  }, [dayNumber]);

  useEffect(() => { initializeGame(); }, [initializeGame]);

  const addColorToGuess = (colorIndex) => {
    if (gameOver || currentGuess.length >= CODE_LENGTH) return;
    setCurrentGuess([...currentGuess, colorIndex]);
  };

  const removeLastColor = () => {
    if (gameOver || currentGuess.length === 0) return;
    setCurrentGuess(currentGuess.slice(0, -1));
  };

  const submitGuess = () => {
    if (gameOver || currentGuess.length !== CODE_LENGTH) return;
    
    const feedback = calculateFeedback(currentGuess, secretCode);
    const newGuess = { colors: currentGuess, feedback };
    const newGuesses = [...guesses, newGuess];
    setGuesses(newGuesses);
    setCurrentGuess([]);
    
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const timeString = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    
    if (feedback.black === CODE_LENGTH) {
      setDisplayTime(timeString);
      setWon(true);
      setGameOver(true);
      setMessage('Code cracked!');
      saveProgress({ completed: true, won: true, time: timeString, guessCount: newGuesses.length, guesses: newGuesses });
      
      // Send result to parent window (Webflow)
      window.parent.postMessage({
        type: 'GAME_COMPLETE',
        game: 'mastermind',
        data: {
          completed: true,
          time_seconds: seconds,
          guesses_used: newGuesses.length,
          difficulty: 'Standard'
        }
      }, '*');
    } else if (newGuesses.length >= MAX_GUESSES) {
      setDisplayTime(timeString);
      setGameOver(true);
      setMessage('Out of guesses!');
      saveProgress({ completed: true, won: false, time: timeString, guessCount: newGuesses.length, guesses: newGuesses });
      
      // Send result to parent window (Webflow)
      window.parent.postMessage({
        type: 'GAME_COMPLETE',
        game: 'mastermind',
        data: {
          completed: false,
          time_seconds: seconds,
          guesses_used: newGuesses.length,
          difficulty: 'Standard'
        }
      }, '*');
    }
  };

  const generateShareText = () => {
    const resultGuesses = storedResult?.guesses || guesses;
    const wasWon = storedResult?.won ?? won;
    
    let text = `🎯 Mastermind · ${formattedDate}\n`;
    
    resultGuesses.forEach(guess => {
      const colorEmojis = guess.colors.map(c => ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠'][c]).join('');
      const pegs = '⚫'.repeat(guess.feedback.black) + '⚪'.repeat(guess.feedback.white) + '·'.repeat(CODE_LENGTH - guess.feedback.black - guess.feedback.white);
      text += `${colorEmojis} ${pegs}\n`;
    });
    
    text += wasWon ? `\n✅ Solved in ${resultGuesses.length}/${MAX_GUESSES}!` : `\n❌ Failed`;
    text += ` | ⏱️ ${displayTime}`;
    
    return text;
  };

  const handleCopy = () => {
    copyToClipboard(
      generateShareText(),
      () => {
        setMessage('Copied to clipboard!');
        setTimeout(() => setMessage(won ? 'Code cracked!' : 'Out of guesses!'), 2000);
      },
      () => setMessage('Could not copy')
    );
  };

  const resetPuzzle = () => {
    if (alreadyCompleted) return;
    setGuesses([]);
    setCurrentGuess([]);
    setGameOver(false);
    setWon(false);
    setStartTime(Date.now());
    setDisplayTime('0:00');
    setMessage('Crack the code!');
  };

  // Styles
  const styles = {
    container: {
      padding: 16,
      maxWidth: 400,
      margin: '0 auto',
      userSelect: 'none',
      backgroundColor: '#faf6e7',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    },
    header: { textAlign: 'center', marginBottom: 16 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4, color: '#000' },
    subtitle: { color: '#666', fontSize: 14 },
    message: { fontSize: 14, marginTop: 8, fontWeight: 600, color: '#ff0000' },
    statsRow: { display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 16, fontSize: 14 },
    statBadge: { backgroundColor: 'rgba(0,0,0,0.08)', color: '#000', padding: '6px 12px', borderRadius: 6, fontWeight: 500 },
    dateBadge: { backgroundColor: '#ff0000', color: '#fff', padding: '6px 12px', borderRadius: 6, fontWeight: 600 },
    guessRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
    pegContainer: { display: 'flex', gap: 4 },
    colorPeg: (hex) => ({
      width: 40, height: 40, borderRadius: '50%', backgroundColor: hex,
      border: '2px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 'bold', fontSize: 14, textShadow: '0 1px 2px rgba(0,0,0,0.5)'
    }),
    emptyPeg: {
      width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.1)',
      border: '2px dashed rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#999', fontWeight: 'bold', fontSize: 14
    },
    feedbackBox: {
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3,
      padding: 6, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 6
    },
    feedbackPeg: (color) => ({
      width: 12, height: 12, borderRadius: '50%', backgroundColor: color, border: '1px solid rgba(0,0,0,0.3)'
    }),
    colorButton: (hex) => ({
      width: 44, height: 44, borderRadius: '50%', backgroundColor: hex,
      border: '3px solid rgba(0,0,0,0.2)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 'bold', fontSize: 14, textShadow: '0 1px 2px rgba(0,0,0,0.5)'
    }),
    button: (disabled, primary) => ({
      padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      backgroundColor: primary ? (disabled ? 'rgba(255,0,0,0.3)' : '#ff0000') : (disabled ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.1)'),
      color: primary ? '#fff' : (disabled ? '#999' : '#000')
    }),
    banner: (success) => ({
      backgroundColor: success ? '#ff0000' : '#000', borderRadius: 12, padding: 20, marginBottom: 16, textAlign: 'center'
    }),
    countdownBox: {
      backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 12, marginBottom: 16,
      border: '1px solid rgba(0,0,0,0.1)', textAlign: 'center'
    },
    sharePreview: {
      padding: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, fontSize: 12,
      marginBottom: 12, whiteSpace: 'pre-wrap', textAlign: 'left', color: '#000', border: '1px solid rgba(0,0,0,0.1)'
    },
    rules: { marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.15)' },
    ruleText: { fontSize: 12, color: '#444', lineHeight: 1.6 },
    legend: { display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12, fontSize: 12, color: '#666' },
    legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
    legendDot: (color) => ({ width: 14, height: 14, backgroundColor: color, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.3)' })
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Mastermind</h2>
        <p style={styles.subtitle}>Crack the 4-colour code</p>
        <p style={styles.message}>{message}</p>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <span style={styles.statBadge}>⏱️ {displayTime}</span>
        <span style={styles.statBadge}>{guesses.length}/{MAX_GUESSES}</span>
        <span style={styles.dateBadge}>{formattedDate}</span>
      </div>

      {/* Previous guesses */}
      <div style={{ marginBottom: 16 }}>
        {guesses.map((guess, idx) => (
          <div key={idx} style={styles.guessRow}>
            <div style={styles.pegContainer}>
              {guess.colors.map((colorIdx, i) => (
                <div key={i} style={styles.colorPeg(COLORS[colorIdx].hex)}>
                  {COLORS[colorIdx].letter}
                </div>
              ))}
            </div>
            <div style={styles.feedbackBox}>
              {[...Array(CODE_LENGTH)].map((_, i) => {
                let color = '#e5e5e5';
                if (i < guess.feedback.black) color = '#000';
                else if (i < guess.feedback.black + guess.feedback.white) color = '#fff';
                return <div key={i} style={styles.feedbackPeg(color)} />;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Current guess */}
      {!gameOver && (
        <div style={{ marginBottom: 16 }}>
          <div style={styles.guessRow}>
            <div style={styles.pegContainer}>
              {[...Array(CODE_LENGTH)].map((_, i) => (
                currentGuess[i] !== undefined ? (
                  <div key={i} style={styles.colorPeg(COLORS[currentGuess[i]].hex)}>
                    {COLORS[currentGuess[i]].letter}
                  </div>
                ) : (
                  <div key={i} style={styles.emptyPeg}>?</div>
                )
              ))}
            </div>
            <div style={{ width: 42 }} />
          </div>
        </div>
      )}

      {/* Secret code reveal on loss */}
      {gameOver && !won && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>The code was:</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            {secretCode.map((colorIdx, i) => (
              <div key={i} style={styles.colorPeg(COLORS[colorIdx].hex)}>
                {COLORS[colorIdx].letter}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Colour picker */}
      {!gameOver && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            {COLORS.map((color, idx) => (
              <button key={idx} onClick={() => addColorToGuess(idx)} style={styles.colorButton(color.hex)}>
                {color.letter}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button onClick={removeLastColor} disabled={currentGuess.length === 0} style={styles.button(currentGuess.length === 0, false)}>
              ← Delete
            </button>
            <button onClick={submitGuess} disabled={currentGuess.length !== CODE_LENGTH} style={styles.button(currentGuess.length !== CODE_LENGTH, true)}>
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Game controls */}
      {!gameOver ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={resetPuzzle} style={styles.button(false, false)}>Reset</button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={styles.banner(won)}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{won ? '🎉' : '😔'}</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>
              {alreadyCompleted ? (won ? 'Already Completed!' : 'Already Attempted!') : (won ? 'Code Cracked!' : 'Out of Guesses!')}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 }}>
              {won ? `Solved in ${storedResult?.guessCount || guesses.length}/${MAX_GUESSES} guesses` : 'Better luck tomorrow!'}
            </div>
          </div>
          
          <div style={styles.countdownBox}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Next puzzle in</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>{countdown}</div>
          </div>
          
          <pre style={styles.sharePreview}>{generateShareText()}</pre>
          
          <button onClick={handleCopy} style={{ ...styles.button(false, false), backgroundColor: '#000', color: '#fff' }}>
            📋 Share Result
          </button>
        </div>
      )}

      {/* Rules */}
      <div style={styles.rules}>
        <p style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 8 }}>How to play:</p>
        <div style={styles.ruleText}>
          <p>• Select 4 colours to make a guess</p>
          <p>• ⚫ Black peg = correct colour in correct position</p>
          <p>• ⚪ White peg = correct colour in wrong position</p>
          <p>• Crack the code in {MAX_GUESSES} guesses or less!</p>
        </div>
        <div style={styles.legend}>
          <span style={styles.legendItem}><span style={styles.legendDot('#000')} /> Exact</span>
          <span style={styles.legendItem}><span style={styles.legendDot('#fff')} /> Wrong spot</span>
          <span style={styles.legendItem}><span style={styles.legendDot('#e5e5e5')} /> No match</span>
        </div>
      </div>
    </div>
  );
};

export default Mastermind;
