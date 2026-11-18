import { buildCandidateStarOrbRuntimeWindow } from './candidate-star-orb-runtime.js';
import { loadStarOrbRuntimeInputs } from './star-orb-runtime-loader.js';

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
