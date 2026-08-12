import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { persistHealthCalculations } from '../health/health-calculations.repository.js';
import { type HealthMetrics, calculateHealthMetrics } from '../health/health-calculations.service.js';
import { listLatestHealthScores } from '../intelligence/health-scores.repository.js';
import { getNutritionProfileByClientId } from '../platform/platform.store.js';
import {
  ensureRegisteredClientsForEligibleUsers,
  getConsultantClientSyncDiagnostics,
  getConsultantWearableSummaryForClient,
  getRegisteredConsultantClientProfileContext,
  listConsultantReportSummariesForClient,
  listConsultantTimelineForClient,
  listValidatedBiomarkerSummaryForClient,
  listRegisteredConsultantClients
} from './consultants.repository.js';

const CONSULTANT_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);

export const canAccessConsultantClientApi = (account: AuthenticatedAccount) =>
  CONSULTANT_ROLES.has(account.user.role?.toLowerCase() ?? '');

export const listConsultantClients = async (account: AuthenticatedAccount) => {
  const clientsBackfilled = await ensureRegisteredClientsForEligibleUsers();
  const clients = await listRegisteredConsultantClients();
  const diagnostics = await getConsultantClientSyncDiagnostics();

  console.info('CONSULTANT_CLIENT_SYNC', {
    requestAccountId: account.accountId,
    requestRole: account.user.role ?? null,
    totalUsersFound: diagnostics.totalUsersFound,
    clientsMapped: diagnostics.clientsMapped,
    missingClientMappings: diagnostics.missingClientMappings,
    inactiveClientMappings: diagnostics.inactiveClientMappings,
    activeHealthProfiles: diagnostics.activeHealthProfiles,
    clientsBackfilled,
    usersReturned: clients.length
  });

  return clients;
};

export const getConsultantClientProfile = async (publicClientId: string) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId);
  if (!context) return null;

  const healthMetrics = calculateHealthMetrics(context.calculationInput);
  await persistHealthCalculations(
    { accountId: context.accountId, clientId: context.internalClientId },
    healthMetrics
  );
  const biomarkers = await listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId);

  return {
    ...context.profile,
    healthMetrics,
    biomarkers
  };
};

const availableValue = (metrics: HealthMetrics, type: keyof HealthMetrics) => {
  const metric = metrics[type];
  return metric.status === 'AVAILABLE' ? metric.value : null;
};

const unavailableReason = (metrics: HealthMetrics, type: keyof HealthMetrics) => {
  const metric = metrics[type];
  return metric.status === 'NOT_AVAILABLE' ? metric.reason : null;
};

const buildMacroTargets = (tdee: number | null) => {
  if (tdee == null) return null;
  const calorieTarget = Math.round(tdee);
  const proteinCalories = calorieTarget * 0.25;
  const carbohydrateCalories = calorieTarget * 0.45;
  const fatCalories = calorieTarget * 0.30;
  return {
    caloriesKcal: calorieTarget,
    proteinGrams: Math.round(proteinCalories / 4),
    carbohydrateGrams: Math.round(carbohydrateCalories / 4),
    fatGrams: Math.round(fatCalories / 9),
    distribution: {
      proteinPercent: 25,
      carbohydratePercent: 45,
      fatPercent: 30
    },
    basis: 'Derived from backend TDEE using the default Fiteatsy planning split until a personalized nutrition protocol is assigned.'
  };
};

const buildCompleteness = (profile: Awaited<ReturnType<typeof getNutritionProfileByClientId>>) => {
  if (!profile) {
    return {
      profileCompletionScore: 20,
      onboardingStatus: 'INCOMPLETE',
      missingFields: ['height', 'weight', 'goal', 'activityLevel', 'dietPreference'],
      sectionScores: [],
      aiReady: false
    };
  }

  return {
    profileCompletionScore: profile.completionPercent,
    onboardingStatus: profile.missingFields.length === 0 ? 'COMPLETED' : 'INCOMPLETE',
    missingFields: profile.missingFields,
    sectionScores: profile.sectionScores,
    aiReady: profile.aiReady
  };
};

const buildRecommendations = ({
  completeness,
  reportsCount,
  wearableConnected,
  healthScore
}: {
  completeness: ReturnType<typeof buildCompleteness>;
  reportsCount: number;
  wearableConnected: boolean;
  healthScore: number | null;
}) => {
  const recommendations: Array<{ priority: 'high' | 'medium' | 'low'; title: string; detail: string; action: string }> = [];

  if (completeness.missingFields.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Complete onboarding inputs',
      detail: `Missing fields: ${completeness.missingFields.slice(0, 6).join(', ')}.`,
      action: 'Ask the client to complete their health profile before planning calories or macros.'
    });
  }

  if (reportsCount === 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Await first medical report',
      detail: 'No health reports have been uploaded for this client.',
      action: 'Request a recent lab report before clinical biomarker review.'
    });
  }

  if (!wearableConnected) {
    recommendations.push({
      priority: 'low',
      title: 'Connect wearable data',
      detail: 'No activity, sleep, HRV, or recovery observations are available yet.',
      action: 'Invite the client to connect Apple Health or Google Health Connect.'
    });
  }

  if (healthScore == null) {
    recommendations.push({
      priority: 'medium',
      title: 'Health score pending',
      detail: 'The backend does not yet have enough validated signals to calculate an overall health score.',
      action: 'Collect onboarding, report, and wearable inputs to unlock scoring.'
    });
  }

  return recommendations;
};

export const getConsultantClientWorkspace = async (publicClientId: string) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId);
  if (!context) return null;

  const owner = { accountId: context.accountId, clientId: context.internalClientId };
  const [nutritionProfile, reports, biomarkers, wearableSummary, timeline, healthScores] = await Promise.all([
    getNutritionProfileByClientId(context.internalClientId),
    listConsultantReportSummariesForClient(context.internalClientId, context.accountId),
    listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId),
    getConsultantWearableSummaryForClient(context.internalClientId, context.accountId),
    listConsultantTimelineForClient(context.internalClientId, context.accountId),
    listLatestHealthScores(owner)
  ]);
  const healthMetrics = calculateHealthMetrics(context.calculationInput);
  await persistHealthCalculations(owner, healthMetrics);

  const tdee = availableValue(healthMetrics, 'tdee');
  const macroTargets = buildMacroTargets(tdee);
  const overallScore = healthScores.find((score) => score.scoreType === 'overall') ?? null;
  const scoreByType = new Map(healthScores.map((score) => [score.scoreType, score]));
  const completeness = buildCompleteness(nutritionProfile);
  const lastSyncedCandidates = [
    context.profile.healthProfile.lastHealthUpdate,
    wearableSummary.lastSyncedAt,
    reports[0]?.updatedAt,
    timeline[0]?.timestamp
  ].filter(Boolean).map((value) => new Date(String(value)).getTime()).filter((value) => Number.isFinite(value));
  const lastSyncedAt = lastSyncedCandidates.length ? new Date(Math.max(...lastSyncedCandidates)).toISOString() : context.profile.client.registrationDate;

  return {
    client: context.profile.client,
    profile: {
      ...context.profile.client,
      profileCompleted: context.profile.healthProfile.profileCompleted
    },
    onboarding: context.profile.onboarding,
    healthMetrics,
    bodyMetrics: {
      bmi: availableValue(healthMetrics, 'bmi'),
      bmiCategory: healthMetrics.bmi.category,
      bmr: availableValue(healthMetrics, 'bmr'),
      tdee,
      targetHeartRate: healthMetrics.targetHeartRate.status === 'AVAILABLE' ? healthMetrics.targetHeartRate.values : null,
      bodyFat: availableValue(healthMetrics, 'bodyFat'),
      unavailableReasons: {
        bmi: unavailableReason(healthMetrics, 'bmi'),
        bmr: unavailableReason(healthMetrics, 'bmr'),
        tdee: unavailableReason(healthMetrics, 'tdee'),
        targetHeartRate: unavailableReason(healthMetrics, 'targetHeartRate'),
        bodyFat: unavailableReason(healthMetrics, 'bodyFat')
      }
    },
    biomarkers,
    reports,
    wearableSummary,
    recoveryMetrics: {
      activityScore: scoreByType.get('activity') ?? null,
      sleepScore: scoreByType.get('sleep') ?? null,
      calmScore: scoreByType.get('calm') ?? null,
      recoveryScore: scoreByType.get('recovery') ?? null,
      overallScore
    },
    nutritionProtocol: {
      readinessScore: nutritionProfile?.readinessScore ?? 0,
      completionPercent: nutritionProfile?.completionPercent ?? completeness.profileCompletionScore,
      aiReady: nutritionProfile?.aiReady ?? false,
      missingFields: completeness.missingFields,
      calorieTarget: macroTargets?.caloriesKcal ?? null,
      macroTargets,
      hydrationTargetLiters: context.calculationInput.weightKg ? Number(Math.max(2, context.calculationInput.weightKg * 0.035).toFixed(1)) : null,
      unavailableReasons: {
        calorieTarget: tdee == null ? unavailableReason(healthMetrics, 'tdee') : null,
        macroTargets: macroTargets == null ? unavailableReason(healthMetrics, 'tdee') : null,
        hydrationTargetLiters: context.calculationInput.weightKg ? null : 'Weight is required.'
      }
    },
    recommendations: buildRecommendations({
      completeness,
      reportsCount: reports.length,
      wearableConnected: wearableSummary.connected,
      healthScore: overallScore?.scoreValue ?? null
    }),
    timeline,
    completeness,
    syncMetadata: {
      lastSyncedAt,
      dataSource: 'Fiteatsy production database',
      dataSources: [
        'account',
        context.profile.healthProfile.profileCompleted ? 'health_profile' : null,
        reports.length ? 'reports' : null,
        biomarkers.length ? 'biomarkers' : null,
        wearableSummary.connected ? 'wearables' : null,
        healthScores.length ? 'health_scores' : null
      ].filter(Boolean),
      completenessScore: completeness.profileCompletionScore
    }
  };
};
