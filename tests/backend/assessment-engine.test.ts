import test from 'node:test';
import assert from 'node:assert/strict';
import { getPss10Interpretation, pss10Items } from '../../backend/src/modules/assessments/assessment-definitions.js';
import { scorePss10 } from '../../backend/src/modules/assessments/assessment-scoring.js';

const answerAll = (selectedValue: 0 | 1 | 2 | 3 | 4) =>
  pss10Items.map((item) => ({ itemId: item.id, selectedValue }));

test('PSS-10 scoring handles all zero responses with reverse-scored items', () => {
  const result = scorePss10(answerAll(0));
  assert.equal(result.rawScore, 16);
  assert.equal(result.maxScore, 40);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q04')?.normalizedScore, 4);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q05')?.normalizedScore, 4);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q07')?.normalizedScore, 4);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q08')?.normalizedScore, 4);
});

test('PSS-10 scoring handles all four responses with reverse-scored items', () => {
  const result = scorePss10(answerAll(4));
  assert.equal(result.rawScore, 24);
  assert.equal(result.maxScore, 40);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q04')?.normalizedScore, 0);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q05')?.normalizedScore, 0);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q07')?.normalizedScore, 0);
  assert.equal(result.itemScores.find((item) => item.itemId === 'PSS10_Q08')?.normalizedScore, 0);
});

test('PSS-10 scoring returns deterministic mixed fixture total', () => {
  const result = scorePss10([
    { itemId: 'PSS10_Q01', selectedValue: 0 },
    { itemId: 'PSS10_Q02', selectedValue: 1 },
    { itemId: 'PSS10_Q03', selectedValue: 2 },
    { itemId: 'PSS10_Q04', selectedValue: 3 },
    { itemId: 'PSS10_Q05', selectedValue: 4 },
    { itemId: 'PSS10_Q06', selectedValue: 0 },
    { itemId: 'PSS10_Q07', selectedValue: 1 },
    { itemId: 'PSS10_Q08', selectedValue: 2 },
    { itemId: 'PSS10_Q09', selectedValue: 3 },
    { itemId: 'PSS10_Q10', selectedValue: 4 }
  ]);
  assert.equal(result.rawScore, 16);
  assert.equal(result.rawScore >= 0, true);
  assert.equal(result.rawScore <= 40, true);
});

test('PSS-10 scoring rejects incomplete assessment responses', () => {
  assert.throws(
    () => scorePss10(answerAll(2).slice(0, 9)),
    /requires responses for all 10 items/
  );
});

test('PSS-10 interpretation uses exact product boundaries', () => {
  assert.equal(getPss10Interpretation(0).label, 'Low stress');
  assert.equal(getPss10Interpretation(13).label, 'Low stress');
  assert.equal(getPss10Interpretation(14).label, 'Moderate stress');
  assert.equal(getPss10Interpretation(26).label, 'Moderate stress');
  assert.equal(getPss10Interpretation(27).label, 'High perceived stress');
  assert.equal(getPss10Interpretation(40).label, 'High perceived stress');
  assert.throws(() => getPss10Interpretation(-1), /outside the expected/);
  assert.throws(() => getPss10Interpretation(41), /outside the expected/);
});

test('PSS-10 response values stay within the five-level scale', () => {
  assert.throws(() => scorePss10([
    ...answerAll(2).slice(0, 9),
    { itemId: 'PSS10_Q10', selectedValue: -1 as 0 | 1 | 2 | 3 | 4 }
  ]), /outside|expected|Invalid/);
  assert.throws(() => scorePss10([
    ...answerAll(2).slice(0, 9),
    { itemId: 'PSS10_Q10', selectedValue: 5 as 0 | 1 | 2 | 3 | 4 }
  ]), /outside|expected|Invalid/);
});
