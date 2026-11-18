import { buildCandidateStarOrbRuntimeWindow } from './candidate-star-orb-runtime.js';
import { loadStarOrbRuntimeInputs } from './star-orb-runtime-loader.js';
import { createHealthScores } from './health-scores.repository.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';

export const candidateValidationEnabled = () =>
  process.env.NODE_ENV !== 'production' && process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED === 'true';

export async function calculatePersistedCandidateStarOrb(
  authenticatedUserId: string,
  throughHealthDay: string,
  context: { tenantId: string; timezone: string }
) {
  if (!candidateValidationEnabled()) throw new Error('CANDIDATE_VALIDATION_DISABLED');
  const inputs = await loadStarOrbRuntimeInputs(authenticatedUserId, throughHealthDay, context);
  const window = buildCandidateStarOrbRuntimeWindow(inputs, throughHealthDay);
  return {
    ...window,
    ownerScope: { tenantId: inputs.owner.tenantId },
    sourceCoverage: inputs.sourceCoverage
  };
}

// Authenticated production wellness projection. This reuses the established
// Star Orb runtime and ownership-scoped repositories; the candidate route
// remains isolated for diagnostics.
export async function calculatePersistedStarOrb(
  authenticatedUserId: string,
  throughHealthDay: string,
  context: { tenantId: string; timezone: string }
) {
  const inputs = await loadStarOrbRuntimeInputs(authenticatedUserId, throughHealthDay, context);
  return buildCandidateStarOrbRuntimeWindow(inputs, throughHealthDay);
}

export async function recalculateAndPersistStarOrb(
  owner: ClientOwnershipContext,
  throughHealthDay: string,
  context: { tenantId: string; timezone: string }
) {
  const inputs=await loadStarOrbRuntimeInputs(owner.accountId,throughHealthDay,context);
  const window=buildCandidateStarOrbRuntimeWindow(inputs,throughHealthDay);
  const confidence={LOW:.33,MODERATE:.66,HIGH:1} as const;
  const scoreTypes=['activity','sleep','nourishment','calm','mind','recovery'] as const;
  await createHealthScores(owner,window.days.flatMap(day=>scoreTypes.map(scoreType=>{
    const result=day[scoreType];
    return {scoreType,scoreValue:result.score,
      scoreStatus:result.score==null?'insufficient_data' as const:result.status==='STALE'?'stale' as const:'calculated' as const,
      confidence:confidence[result.confidence],calculationVersion:result.methodologyVersion,healthDay:day.healthDay,
      inputSummary:{wellnessState:result.status,componentCoverage:result.componentCoverage,inputsUsed:result.inputsUsed,
        inputsMissing:result.inputsMissing,contributingFactors:result.contributingFactors,inputFreshness:result.inputFreshness}}
  })));
  return window;
}
