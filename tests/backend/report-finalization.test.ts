import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeReportAfterIntelligence } from '../../backend/src/modules/reports/reports.routes.js';
import type { ReportAnalysisResult } from '../../backend/src/modules/reports/reports.service.js';

const candidateAnalysis = { marker: 'candidate' } as unknown as ReportAnalysisResult;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

test('report terminal success is invisible until durable intelligence persistence completes', async () => {
  const persistenceBarrier = deferred();
  const events: string[] = [];
  let visibleStatus = 'VALIDATION_COMPLETED';

  const operation = finalizeReportAfterIntelligence({
    analysis: candidateAnalysis,
    attach: async () => {
      events.push('analysis-attached');
      return {
        analysis: candidateAnalysis,
        selectedStatus: 'PUBLISHED',
        error: undefined
      } as any;
    },
    persist: async () => {
      events.push('intelligence-started');
      await persistenceBarrier.promise;
      events.push('intelligence-durable');
      return { observations: [], scores: [] };
    },
    finalize: async (status) => {
      events.push('terminal-transition');
      visibleStatus = status;
      return { status } as any;
    }
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(visibleStatus, 'VALIDATION_COMPLETED');
  assert.deepEqual(events, ['analysis-attached', 'intelligence-started']);

  persistenceBarrier.resolve();
  await operation;

  assert.equal(visibleStatus, 'PUBLISHED');
  assert.deepEqual(events, [
    'analysis-attached',
    'intelligence-started',
    'intelligence-durable',
    'terminal-transition'
  ]);
});

test('report persistence failure cannot produce terminal success', async () => {
  let terminalTransitionAttempted = false;

  await assert.rejects(
    finalizeReportAfterIntelligence({
      analysis: candidateAnalysis,
      attach: async () => ({
        analysis: candidateAnalysis,
        selectedStatus: 'PUBLISHED',
        error: undefined
      } as any),
      persist: async () => {
        throw new Error('synthetic score persistence failure');
      },
      finalize: async () => {
        terminalTransitionAttempted = true;
        return null;
      }
    }),
    /synthetic score persistence failure/
  );

  assert.equal(terminalTransitionAttempted, false);
});
