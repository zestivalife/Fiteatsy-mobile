export type Pss10ResultSummaryInput = {
  rawScore: number;
  maxScore: number;
  completedAtISO: string;
  instrumentVersion: string;
  scoringVersion: string;
};

export type Pss10DraftSummaryInput = {
  id: string;
  startedAtISO: string;
  responses: Array<{ itemId: string; selectedValue: number }>;
};

export type Pss10StressContext = {
  available: boolean;
  score: number | null;
  maxScore: number | null;
  previousScore: number | null;
  change: number | null;
  completedAtISO: string | null;
  instrumentVersion: string | null;
  scoringVersion: string | null;
  hasDraft: boolean;
  draftAnsweredCount: number;
  draftStartedAtISO: string | null;
};

export const buildPss10StressContext = ({
  latestResult,
  previousResult,
  draft
}: {
  latestResult: Pss10ResultSummaryInput | null;
  previousResult: Pss10ResultSummaryInput | null;
  draft: Pss10DraftSummaryInput | null;
}): Pss10StressContext => ({
  available: latestResult !== null,
  score: latestResult?.rawScore ?? null,
  maxScore: latestResult?.maxScore ?? null,
  previousScore: previousResult?.rawScore ?? null,
  change: latestResult && previousResult ? latestResult.rawScore - previousResult.rawScore : null,
  completedAtISO: latestResult?.completedAtISO ?? null,
  instrumentVersion: latestResult?.instrumentVersion ?? null,
  scoringVersion: latestResult?.scoringVersion ?? null,
  hasDraft: draft !== null,
  draftAnsweredCount: draft?.responses.length ?? 0,
  draftStartedAtISO: draft?.startedAtISO ?? null
});

export const formatPss10Change = (change: number | null) => {
  if (change == null) return null;
  if (change === 0) return 'No change';
  return `${change < 0 ? '↓' : '↑'} ${Math.abs(change)} pts`;
};

export const formatPss10RelativeSummary = (change: number | null) => {
  if (change == null) return null;
  if (change === 0) return 'No change from your previous assessment';
  const direction = change < 0 ? 'lower' : 'higher';
  return `${Math.abs(change)} points ${direction} than your previous assessment`;
};

export const formatPss10ShortDate = (iso: string | null, locale?: string) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(date);
};

export const daysSincePss10Completion = (completedAtISO: string | null, now = new Date()) => {
  if (!completedAtISO) return null;
  const completedAt = new Date(completedAtISO);
  if (Number.isNaN(completedAt.getTime())) return null;
  const elapsedMs = now.getTime() - completedAt.getTime();
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
};

export const formatPss10Staleness = (completedAtISO: string | null, now = new Date()) => {
  const days = daysSincePss10Completion(completedAtISO, now);
  if (days == null) return null;
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Last assessment: 1 day ago';
  return `Last assessment: ${days} days ago`;
};

export const formatPss10DateSummary = (completedAtISO: string | null, locale?: string, now = new Date()) => {
  const shortDate = formatPss10ShortDate(completedAtISO, locale);
  const staleness = formatPss10Staleness(completedAtISO, now);
  if (!shortDate && !staleness) return null;
  if (!shortDate) return staleness;
  if (!staleness || staleness === 'Updated today') return `Updated ${shortDate}`;
  return `${shortDate} • ${staleness}`;
};

export const formatPss10LastChecked = (completedAtISO: string | null, locale?: string, now = new Date()) => {
  const shortDate = formatPss10ShortDate(completedAtISO, locale);
  const days = daysSincePss10Completion(completedAtISO, now);
  if (days == null) return null;
  if (days >= 7) {
    return `Last checked ${days} days ago`;
  }
  return shortDate ? `Last checked ${shortDate}` : null;
};
