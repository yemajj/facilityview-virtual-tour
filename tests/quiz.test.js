import { describe, it, expect } from 'vitest';
import { checkNodeQuizDecision, calcQuizScore } from '../virtual-tour-utils.js';

const QUIZ = { question: 'What is X?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'X is A.' };

function makeNodes(specs) {
  return specs.map((spec, i) => ({
    id: 'N' + String(i + 1).padStart(2, '0'),
    name: `Node ${i + 1}`,
    quiz: spec.hasQuiz ? { ...QUIZ } : null
  }));
}

// ── checkNodeQuizDecision ─────────────────────────────────────────────────────

describe('checkNodeQuizDecision', () => {
  it('returns show_quiz when node has an unanswered quiz', () => {
    const nodes = makeNodes([{ hasQuiz: true }, { hasQuiz: false }]);
    expect(checkNodeQuizDecision(nodes, 0, {}, false)).toBe('show_quiz');
  });

  it('returns nothing when quiz is already answered and not at last node', () => {
    const nodes = makeNodes([{ hasQuiz: true }, { hasQuiz: false }]);
    const answered = { N01: { correct: true, selectedIdx: 0, correctIdx: 0 } };
    expect(checkNodeQuizDecision(nodes, 0, answered, false)).toBe('nothing');
  });

  it('returns show_score when quiz already answered and at last node', () => {
    const nodes = makeNodes([{ hasQuiz: true }]); // single node = last
    const answered = { N01: { correct: true, selectedIdx: 0, correctIdx: 0 } };
    expect(checkNodeQuizDecision(nodes, 0, answered, false)).toBe('show_score');
  });

  it('returns nothing when no quiz on node and not at last node', () => {
    const nodes = makeNodes([{ hasQuiz: false }, { hasQuiz: false }]);
    expect(checkNodeQuizDecision(nodes, 0, {}, false)).toBe('nothing');
  });

  it('returns show_score when no quiz, at last node, and answers exist', () => {
    const nodes = makeNodes([{ hasQuiz: true }, { hasQuiz: false }]);
    const answered = { N01: { correct: true, selectedIdx: 0, correctIdx: 0 } };
    // At node 1 (last), which has no quiz
    expect(checkNodeQuizDecision(nodes, 1, answered, false)).toBe('show_score');
  });

  it('returns nothing when no quiz, at last node, but no answers exist yet', () => {
    const nodes = makeNodes([{ hasQuiz: false }]);
    expect(checkNodeQuizDecision(nodes, 0, {}, false)).toBe('nothing');
  });

  it('returns nothing when results already shown (quizResultsShown = true)', () => {
    const nodes = makeNodes([{ hasQuiz: false }]);
    const answered = { N01: { correct: true, selectedIdx: 0, correctIdx: 0 } };
    expect(checkNodeQuizDecision(nodes, 0, answered, true)).toBe('nothing');
  });

  it('returns nothing when quiz answered, at last node, but results already shown', () => {
    const nodes = makeNodes([{ hasQuiz: true }]);
    const answered = { N01: { correct: false, selectedIdx: 1, correctIdx: 0 } };
    expect(checkNodeQuizDecision(nodes, 0, answered, true)).toBe('nothing');
  });

  it('returns show_quiz for unanswered quiz at last node', () => {
    // Last node has quiz, not yet answered → show the quiz first
    const nodes = makeNodes([{ hasQuiz: true }]);
    expect(checkNodeQuizDecision(nodes, 0, {}, false)).toBe('show_quiz');
  });

  it('handles missing node gracefully (out-of-range index)', () => {
    const nodes = makeNodes([{ hasQuiz: false }]);
    const result = checkNodeQuizDecision(nodes, 99, {}, false);
    expect(result).toBe('nothing');
  });
});

// ── calcQuizScore ─────────────────────────────────────────────────────────────

describe('calcQuizScore', () => {
  function makeQuizNodes(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: 'N' + String(i + 1).padStart(2, '0'),
      name: `Node ${i + 1}`,
      quiz: { ...QUIZ }
    }));
  }

  it('returns 100% when all quiz nodes are answered correctly', () => {
    const nodes = makeQuizNodes(3);
    const answered = {
      N01: { correct: true }, N02: { correct: true }, N03: { correct: true }
    };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 3, total: 3, pct: 100 });
  });

  it('returns 0% when all quiz nodes are answered incorrectly', () => {
    const nodes = makeQuizNodes(2);
    const answered = {
      N01: { correct: false }, N02: { correct: false }
    };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 0, total: 2, pct: 0 });
  });

  it('calculates partial score and rounds to nearest integer', () => {
    const nodes = makeQuizNodes(3);
    const answered = {
      N01: { correct: true }, N02: { correct: false }, N03: { correct: true }
    };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 2, total: 3, pct: 67 });
  });

  it('returns 0/0/0 when no nodes have quizzes', () => {
    const nodes = [{ id: 'N01', quiz: null }, { id: 'N02', quiz: null }];
    expect(calcQuizScore(nodes, {})).toEqual({ correct: 0, total: 0, pct: 0 });
  });

  it('returns 0/0/0 on empty nodes array', () => {
    expect(calcQuizScore([], {})).toEqual({ correct: 0, total: 0, pct: 0 });
  });

  it('counts only quiz nodes, ignoring non-quiz nodes', () => {
    const nodes = [
      { id: 'N01', quiz: { ...QUIZ } },
      { id: 'N02', quiz: null },           // no quiz
      { id: 'N03', quiz: { ...QUIZ } }
    ];
    const answered = { N01: { correct: true }, N03: { correct: false } };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 1, total: 2, pct: 50 });
  });

  it('returns 0 correct when quizAnswered is empty (nothing answered yet)', () => {
    const nodes = makeQuizNodes(3);
    expect(calcQuizScore(nodes, {})).toEqual({ correct: 0, total: 3, pct: 0 });
  });

  it('handles single correct answer — 100%', () => {
    const nodes = makeQuizNodes(1);
    const answered = { N01: { correct: true } };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 1, total: 1, pct: 100 });
  });

  it('handles single wrong answer — 0%', () => {
    const nodes = makeQuizNodes(1);
    const answered = { N01: { correct: false } };
    expect(calcQuizScore(nodes, answered)).toEqual({ correct: 0, total: 1, pct: 0 });
  });

  it('does not over-count correct answers when quizAnswered has more entries than quiz nodes', () => {
    // Only nodes with a quiz should be counted toward the score.
    // N02 has no quiz, so its quizAnswered entry must not affect correct/pct.
    const nodes = [
      { id: 'N01', quiz: { ...QUIZ } }, // has a quiz
      { id: 'N02', quiz: null }          // no quiz
    ];
    const quizAnswered = {
      N01: { correct: true },  // quiz node — counts
      N02: { correct: true }   // non-quiz node — must not count
    };
    const result = calcQuizScore(nodes, quizAnswered);
    expect(result.total).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.pct).toBe(100);
  });
});
