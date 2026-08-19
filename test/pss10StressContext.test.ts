import {
  buildPss10StressContext,
  daysSincePss10Completion,
  formatPss10DateSummary,
  formatPss10LastChecked,
  formatPss10Change,
  formatPss10RelativeSummary,
  formatPss10Staleness
} from '../src/utils/pss10StressContext';

const latest = {
  rawScore: 18,
  maxScore: 40,
  completedAtISO: '2026-08-19T07:00:00.000Z',
  instrumentVersion: 'pss10-development-placeholder-v1',
  scoringVersion: 'pss10-scoring-v1'
};

const previous = {
  rawScore: 22,
  maxScore: 40,
  completedAtISO: '2026-08-01T07:00:00.000Z',
  instrumentVersion: 'pss10-development-placeholder-v1',
  scoringVersion: 'pss10-scoring-v1'
};

describe('PSS-10 stress context', () => {
  it('connects latest completed result and previous score without changing Stress Recovery scoring', () => {
    const context = buildPss10StressContext({
      latestResult: latest,
      previousResult: previous,
      draft: null
    });

    expect(context).toMatchObject({
      available: true,
      score: 18,
      maxScore: 40,
      previousScore: 22,
      change: -4,
      completedAtISO: latest.completedAtISO,
      instrumentVersion: latest.instrumentVersion,
      scoringVersion: latest.scoringVersion,
      hasDraft: false
    });
    expect(formatPss10Change(context.change)).toBe('↓ 4 pts');
    expect(formatPss10RelativeSummary(context.change)).toBe('4 points lower than your previous assessment');
  });

  it('shows higher PSS-10 score as an increase in perceived stress', () => {
    const context = buildPss10StressContext({
      latestResult: { ...latest, rawScore: 24 },
      previousResult: { ...previous, rawScore: 18 },
      draft: null
    });

    expect(context.change).toBe(6);
    expect(formatPss10Change(context.change)).toBe('↑ 6 pts');
    expect(formatPss10RelativeSummary(context.change)).toBe('6 points higher than your previous assessment');
  });

  it('excludes draft responses from Home score context', () => {
    const context = buildPss10StressContext({
      latestResult: null,
      previousResult: null,
      draft: {
        id: 'draft-session',
        startedAtISO: '2026-08-19T06:00:00.000Z',
        responses: [
          { itemId: 'PSS10_Q01', selectedValue: 4 },
          { itemId: 'PSS10_Q02', selectedValue: 4 }
        ]
      }
    });

    expect(context.available).toBe(false);
    expect(context.score).toBeNull();
    expect(context.change).toBeNull();
    expect(context.hasDraft).toBe(true);
    expect(context.draftAnsweredCount).toBe(2);
  });

  it('keeps no-result state from rendering a fake 0 of 40 score', () => {
    const context = buildPss10StressContext({
      latestResult: null,
      previousResult: null,
      draft: null
    });

    expect(context.available).toBe(false);
    expect(context.score).toBeNull();
    expect(context.maxScore).toBeNull();
    expect(context.previousScore).toBeNull();
    expect(context.change).toBeNull();
  });

  it('reports assessment age without daily score decay', () => {
    const now = new Date('2026-08-19T12:00:00.000Z');

    expect(daysSincePss10Completion('2026-07-18T12:00:00.000Z', now)).toBe(32);
    expect(formatPss10Staleness('2026-07-18T12:00:00.000Z', now)).toBe('Last assessment: 32 days ago');
    expect(formatPss10Staleness(latest.completedAtISO, now)).toBe('Updated today');
    expect(formatPss10DateSummary(latest.completedAtISO, 'en-GB', now)).toBe('Updated 19 Aug');
    expect(formatPss10DateSummary('2026-07-18T12:00:00.000Z', 'en-GB', now)).toBe('18 Jul • Last assessment: 32 days ago');
    expect(formatPss10LastChecked(latest.completedAtISO, 'en-GB', now)).toBe('Last checked 19 Aug');
    expect(formatPss10LastChecked('2026-07-18T12:00:00.000Z', 'en-GB', now)).toBe('Last checked 32 days ago');
  });
});
