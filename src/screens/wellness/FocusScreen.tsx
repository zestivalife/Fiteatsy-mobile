import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { ProgressRing } from '../../components/ProgressRing';
import { colors, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';
import { secondsToClock } from '../../utils/time';

type MicroGoal = {
  id: string;
  label: string;
  done: boolean;
};

type FocusTab = 'Sprint' | 'TicTacToe' | 'Reflex';

type CellValue = 'X' | 'O' | null;

const totalSeconds = 15 * 60;
const initialGoals: MicroGoal[] = [
  { id: 'goal-1', label: 'Set one clear outcome for this sprint', done: false },
  { id: 'goal-2', label: 'Mute notifications and close extra tabs', done: false },
  { id: 'goal-3', label: 'Ship one small meaningful task', done: false }
];

const lines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
] as const;

const winnerFromBoard = (board: CellValue[]): CellValue => {
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
};

const randomIndex = () => Math.floor(Math.random() * 9);

const emptyIndexes = (board: CellValue[]): number[] =>
  board
    .map((value, index) => (value === null ? index : -1))
    .filter((index) => index !== -1);

const findWinningMove = (board: CellValue[], symbol: 'X' | 'O'): number | null => {
  for (const [a, b, c] of lines) {
    const line = [board[a], board[b], board[c]];
    const symbolCount = line.filter((item) => item === symbol).length;
    const emptyCount = line.filter((item) => item === null).length;
    if (symbolCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  return null;
};

type MinimaxResult = {
  score: number;
  move: number;
};

const evaluateTerminal = (board: CellValue[], depth: number): number | null => {
  const winner = winnerFromBoard(board);
  if (winner === 'O') {
    return 10 - depth;
  }
  if (winner === 'X') {
    return depth - 10;
  }
  if (emptyIndexes(board).length === 0) {
    return 0;
  }
  return null;
};

const minimax = (board: CellValue[], depth: number, maximizing: boolean): MinimaxResult => {
  const terminal = evaluateTerminal(board, depth);
  if (terminal !== null) {
    return { score: terminal, move: -1 };
  }

  const available = emptyIndexes(board);
  let best: MinimaxResult = {
    score: maximizing ? -Infinity : Infinity,
    move: available[0]
  };

  for (const move of available) {
    const next = [...board];
    next[move] = maximizing ? 'O' : 'X';
    const result = minimax(next, depth + 1, !maximizing);

    if (maximizing) {
      if (result.score > best.score) {
        best = { score: result.score, move };
      }
      continue;
    }

    if (result.score < best.score) {
      best = { score: result.score, move };
    }
  }

  return best;
};

const chooseAiMove = (board: CellValue[]): number => {
  const available = emptyIndexes(board);
  if (available.length === 0) {
    return 0;
  }

  if (available.length === 9) {
    return 4;
  }

  const winning = findWinningMove(board, 'O');
  if (winning !== null) {
    return winning;
  }

  const blocking = findWinningMove(board, 'X');
  if (blocking !== null) {
    return blocking;
  }

  const { move } = minimax(board, 0, true);
  if (move >= 0) {
    return move;
  }

  return available[Math.floor(Math.random() * available.length)];
};

export const FocusScreen = () => {
  const navigation = useNavigation();
  const { setWellness } = useAppContext();
  const [activeTab, setActiveTab] = useState<FocusTab>('Sprint');

  const [running, setRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [focusPoints, setFocusPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [distractionVisible, setDistractionVisible] = useState(false);
  const [goals, setGoals] = useState<MicroGoal[]>(initialGoals);

  const spawnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sprintRewardedRef = useRef(false);
  const reflexRewardedRef = useRef(false);

  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [nextPlayer, setNextPlayer] = useState<'X' | 'O'>('X');
  const [aiThinking, setAiThinking] = useState(false);
  const [xWins, setXWins] = useState(0);
  const [oWins, setOWins] = useState(0);
  const [draws, setDraws] = useState(0);

  const [reflexRunning, setReflexRunning] = useState(false);
  const [reflexTime, setReflexTime] = useState(20);
  const [target, setTarget] = useState<number>(4);
  const [reflexScore, setReflexScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const completed = remainingSeconds <= 0;
  const progress = useMemo(() => remainingSeconds / totalSeconds, [remainingSeconds]);

  const winner = useMemo(() => winnerFromBoard(board), [board]);
  const boardFull = useMemo(() => board.every((cell) => cell !== null), [board]);

  useEffect(() => {
    if (!running || completed) {
      return;
    }

    const tick = setInterval(() => {
      setRemainingSeconds((previous) => {
        const next = Math.max(0, previous - 1);
        if (next !== previous) {
          setFocusPoints((score) => score + 1);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [running, completed]);

  useEffect(() => {
    if (!running || completed || distractionVisible) {
      return;
    }

    const waitMs = 8000 + Math.floor(Math.random() * 7000);
    spawnTimeoutRef.current = setTimeout(() => {
      setDistractionVisible(true);
    }, waitMs);

    return () => {
      if (spawnTimeoutRef.current) {
        clearTimeout(spawnTimeoutRef.current);
      }
    };
  }, [running, completed, distractionVisible]);

  useEffect(() => {
    if (!distractionVisible) {
      return;
    }

    expireTimeoutRef.current = setTimeout(() => {
      setDistractionVisible(false);
      setStreak(0);
      setFocusPoints((score) => Math.max(0, score - 10));
    }, 4500);

    return () => {
      if (expireTimeoutRef.current) {
        clearTimeout(expireTimeoutRef.current);
      }
    };
  }, [distractionVisible]);

  useEffect(() => {
    if (!winner && !boardFull) {
      return;
    }

    if (winner === 'X') {
      setXWins((v) => v + 1);
    } else if (winner === 'O') {
      setOWins((v) => v + 1);
    } else {
      setDraws((v) => v + 1);
    }
  }, [winner, boardFull]);

  useEffect(() => {
    if (!winner) {
      return;
    }

    if (winner === 'X') {
      setWellness((previous) => ({
        ...previous,
        focusMinutes: previous.focusMinutes + 3
      }));
      return;
    }

    if (winner === 'O') {
      setWellness((previous) => ({
        ...previous,
        focusMinutes: Math.max(0, previous.focusMinutes - 1)
      }));
    }
  }, [winner, setWellness]);

  useEffect(() => {
    if (nextPlayer !== 'O' || winner || boardFull) {
      return;
    }

    setAiThinking(true);
    const timer = setTimeout(() => {
      setBoard((previous) => {
        const move = chooseAiMove(previous);
        if (previous[move] !== null) {
          setAiThinking(false);
          setNextPlayer('X');
          return previous;
        }
        const next = [...previous];
        next[move] = 'O';
        return next;
      });
      setAiThinking(false);
      setNextPlayer('X');
    }, 550);

    return () => clearTimeout(timer);
  }, [nextPlayer, winner, boardFull]);

  useEffect(() => {
    if (!reflexRunning || reflexTime <= 0) {
      if (reflexTime === 0) {
        setReflexRunning(false);
        setBestScore((best) => Math.max(best, reflexScore));
        if (!reflexRewardedRef.current) {
          const reflexMinutes = Math.max(1, Math.round(reflexScore / 3));
          setWellness((previous) => ({
            ...previous,
            focusMinutes: previous.focusMinutes + reflexMinutes
          }));
          reflexRewardedRef.current = true;
        }
      }
      return;
    }

    const timer = setInterval(() => {
      setReflexTime((t) => Math.max(0, t - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [reflexRunning, reflexTime, reflexScore, setWellness]);

  useEffect(() => {
    if (!completed || sprintRewardedRef.current) {
      return;
    }

    const doneGoals = goals.filter((goal) => goal.done).length;
    const pointsBonus = Math.floor(focusPoints / 80);
    const streakBonus = Math.min(4, streak);
    const earnedFocusMinutes = 10 + doneGoals * 2 + pointsBonus + streakBonus;

    setWellness((previous) => ({
      ...previous,
      focusMinutes: previous.focusMinutes + earnedFocusMinutes
    }));
    sprintRewardedRef.current = true;
  }, [completed, focusPoints, goals, setWellness, streak]);

  const toggleGoal = (id: string) => {
    setGoals((previous) =>
      previous.map((goal) => {
        if (goal.id !== id) {
          return goal;
        }

        const nextDone = !goal.done;
        setFocusPoints((score) => Math.max(0, score + (nextDone ? 20 : -20)));
        return { ...goal, done: nextDone };
      })
    );
  };

  const handleIgnoreDistraction = () => {
    if (!distractionVisible || !running || completed) {
      return;
    }

    setDistractionVisible(false);
    setStreak((value) => value + 1);
    setFocusPoints((score) => score + 15);
  };

  const resetSession = () => {
    setRunning(false);
    setRemainingSeconds(totalSeconds);
    setFocusPoints(0);
    setStreak(0);
    setDistractionVisible(false);
    setGoals(initialGoals);
    sprintRewardedRef.current = false;
  };

  const tapCell = (index: number) => {
    if (winner || board[index] || nextPlayer !== 'X' || aiThinking) {
      return;
    }

    setBoard((prev) => {
      const next = [...prev];
      next[index] = nextPlayer;
      return next;
    });
    setNextPlayer((p) => (p === 'X' ? 'O' : 'X'));
  };

  const resetBoard = () => {
    setBoard(Array(9).fill(null));
    setNextPlayer('X');
    setAiThinking(false);
  };

  const startReflex = () => {
    setReflexRunning(true);
    setReflexTime(20);
    setReflexScore(0);
    setTarget(randomIndex());
    reflexRewardedRef.current = false;
  };

  const tapReflexTile = (index: number) => {
    if (!reflexRunning || reflexTime <= 0) {
      return;
    }

    if (index === target) {
      setReflexScore((s) => s + 1);
      setTarget(randomIndex());
    }
  };

  const scoreLabel = completed
    ? 'Sprint complete. Great deep work.'
    : streak >= 3
      ? 'Locked in. Keep this momentum.'
      : 'Stay with one task and keep moving.';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppBackButton iconOnly onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Focus</Text>
        <View style={styles.headerGhost} />
      </View>

      <View style={styles.tabRow}>
        {(['Sprint', 'TicTacToe', 'Reflex'] as FocusTab[]).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'TicTacToe' ? 'Tic-Tac-Toe' : tab}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'Sprint' ? (
        <>
          <View style={styles.timerWrap}>
            <ProgressRing progress={progress} size={218} strokeWidth={9} />
            <View style={styles.timerCenter}>
              <Text style={styles.phaseLabel}>{completed ? 'Complete' : 'Deep Work Sprint'}</Text>
              <Text style={styles.time}>{secondsToClock(remainingSeconds)}</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={styles.scoreChip}>
              <Text style={styles.scoreChipText}>Focus Points {focusPoints}</Text>
            </View>
            <View style={styles.scoreChip}>
              <Text style={styles.scoreChipText}>Streak {streak}</Text>
            </View>
          </View>

          <Text style={styles.caption}>{scoreLabel}</Text>

          {distractionVisible ? (
            <View style={styles.distractionCard}>
              <Text style={styles.distractionTitle}>Distraction Alert</Text>
              <Text style={styles.distractionCopy}>A distraction popped up. Tap quickly to stay focused and earn points.</Text>
              <Pressable style={styles.distractionButton} onPress={handleIgnoreDistraction}>
                <Ionicons name="flash-outline" size={16} color={colors.white} />
                <Text style={styles.distractionButtonText}>Ignore Distraction</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.goalList}>
            {goals.map((goal) => (
              <Pressable key={goal.id} style={styles.goalItem} onPress={() => toggleGoal(goal.id)}>
                <Ionicons name={goal.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={goal.done ? colors.success : colors.textMuted} />
                <Text style={styles.goalText}>{goal.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.controls}>
            <Pressable onPress={() => setRunning((previous) => !previous)} style={styles.playButton}>
              <Ionicons name={running ? 'pause' : 'play'} color={colors.white} size={24} />
            </Pressable>

            <Pressable onPress={resetSession} style={styles.resetButton}>
              <Ionicons name="refresh" color={colors.textPrimary} size={20} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {activeTab === 'TicTacToe' ? (
        <View style={styles.gameBlock}>
          <Text style={styles.gameTitle}>Focus Grid Challenge</Text>
          <Text style={styles.gameCopy}>Win 3 in a row while staying present. Alternate turns to reset your brain.</Text>

          <View style={styles.board}>
            {board.map((cell, index) => (
              <Pressable key={index} style={styles.boardCell} onPress={() => tapCell(index)}>
                <Text style={styles.boardCellText}>{cell ?? ''}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.gameStatus}>
            {winner
              ? winner === 'X'
                ? 'Winner: You'
                : 'Winner: AI'
              : boardFull
                ? 'Draw: reset and go again'
                : aiThinking
                  ? 'AI is thinking...'
                  : 'Your turn'}
          </Text>

          <View style={styles.scoreRow}>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>You {xWins}</Text></View>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>AI {oWins}</Text></View>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>Draw {draws}</Text></View>
          </View>

          <Pressable style={styles.resetButton} onPress={resetBoard}>
            <Ionicons name="refresh" color={colors.textPrimary} size={20} />
            <Text style={styles.resetText}>New Round</Text>
          </Pressable>
        </View>
      ) : null}

      {activeTab === 'Reflex' ? (
        <View style={styles.gameBlock}>
          <Text style={styles.gameTitle}>Reflex Focus Tap</Text>
          <Text style={styles.gameCopy}>Tap the glowing tile fast. This trains reaction and keeps your attention sharp.</Text>

          <View style={styles.scoreRow}>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>Time {reflexTime}s</Text></View>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>Score {reflexScore}</Text></View>
            <View style={styles.scoreChip}><Text style={styles.scoreChipText}>Best {bestScore}</Text></View>
          </View>

          <View style={styles.reflexGrid}>
            {Array.from({ length: 9 }).map((_, index) => {
              const active = reflexRunning && reflexTime > 0 && target === index;
              return (
                <Pressable
                  key={index}
                  onPress={() => tapReflexTile(index)}
                  style={[styles.reflexCell, active && styles.reflexCellActive]}
                >
                  <Ionicons name="flash" size={14} color={active ? colors.white : '#939393'} />
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.playButtonWide} onPress={startReflex}>
            <Ionicons name="play" size={18} color={colors.white} />
            <Text style={styles.playWideText}>{reflexRunning ? 'Restart Round' : 'Start 20s Round'}</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4
  },
  title: {
    ...typography.section,
    textAlign: 'left'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  headerGhost: {
    width: 36,
    height: 36
  },
  tabRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8
  },
  tabItem: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#1E1E1E',
    paddingVertical: 8,
    alignItems: 'center'
  },
  tabItemActive: {
    backgroundColor: '#60AF00',
    borderColor: '#60AF00'
  },
  tabText: {
    ...typography.caption,
    color: '#F5E1E1',
    fontSize: 11
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: '700'
  },
  timerWrap: {
    marginTop: 24,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center'
  },
  timerCenter: {
    position: 'absolute',
    alignItems: 'center'
  },
  phaseLabel: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: 2
  },
  time: {
    ...typography.title,
    fontSize: 40,
    lineHeight: 48
  },
  scoreRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  scoreChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scoreChipText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  caption: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 14
  },
  distractionCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C9CFD4',
    backgroundColor: '#1E1E1E',
    padding: 12,
    gap: 8
  },
  distractionTitle: {
    ...typography.bodyStrong,
    color: colors.white
  },
  distractionCopy: {
    ...typography.caption,
    color: '#939393',
    fontSize: 13,
    lineHeight: 18
  },
  distractionButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#60AF00'
  },
  distractionButtonText: {
    ...typography.caption,
    color: colors.white,
    fontSize: 13
  },
  goalList: {
    marginTop: 16,
    gap: 10
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#151515',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  goalText: {
    ...typography.body,
    color: '#F5E1E1',
    flexShrink: 1
  },
  controls: {
    marginTop: 22,
    alignItems: 'center',
    gap: 14,
    marginBottom: 20
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignSelf: 'center',
    marginTop: 12
  },
  resetText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  gameBlock: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#1E1E1E',
    padding: 14
  },
  gameTitle: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  gameCopy: {
    ...typography.caption,
    color: '#939393',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18
  },
  board: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    rowGap: 8
  },
  boardCell: {
    width: '31.5%',
    aspectRatio: 1,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9CFD4',
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  boardCellText: {
    ...typography.title,
    fontSize: 30,
    lineHeight: 30,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false
  },
  gameStatus: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 12
  },
  reflexGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center'
  },
  reflexCell: {
    width: 68,
    height: 68,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9CFD4',
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  reflexCellActive: {
    backgroundColor: '#60AF00',
    borderColor: '#60AF00'
  },
  playButtonWide: {
    marginTop: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#60AF00'
  },
  playWideText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 14
  }
});
