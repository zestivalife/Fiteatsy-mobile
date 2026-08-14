import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { persistHealthCalculations } from '../health/health-calculations.repository.js';
import { type HealthMetrics, calculateHealthMetrics } from '../health/health-calculations.service.js';
import { listLatestHealthScores } from '../intelligence/health-scores.repository.js';
import { getConsultantLatestDietPlan, getConsultantNutritionIntelligence } from '../nutrition/nutrition.service.js';
import { getCareCaseByClientId, getHealthProfileByClientId, getNutritionProfileByClientId } from '../platform/platform.store.js';
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

const CONSULTANT_ROLES = new Set(['consultant', 'provider', 'dietician', 'senior_consultant']);
const WORKSPACE_CONTRACT_VERSION = '2026-08-12.fiteatsy-client-workspace.v1';
const WORKSPACE_ALLOWED_SCOPES = [
  'client.identity.read',
  'client.onboarding.read',
  'client.health_profile.read',
  'client.body_metrics.read',
  'client.biomarkers.read',
  'client.reports.read',
  'client.wearables.read',
  'client.timeline.read',
  'client.nutrition_protocol.read'
] as const;
const WORKSPACE_RESTRICTED_SCOPES = [
  'report.binary.read',
  'report.ocr_raw.read',
  'session.token.read',
  'payment.credentials.read'
] as const;

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

const toIsoOrNull = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const freshnessFromTimestamp = (value: string | null) => {
  if (!value) return 'no_data' as const;
  const deltaMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(deltaMs)) return 'no_data' as const;
  if (deltaMs > 1000 * 60 * 60 * 24 * 7) return 'stale' as const;
  return 'fresh' as const;
};

const buildConsentValidation = (account: AuthenticatedAccount) => ({
  status: 'granted' as const,
  model: 'role_scoped_consultant_workspace',
  validatedAt: new Date().toISOString(),
  basis: [
    'authenticated_consultant_session',
    account.authProvider === 'consultant_dashboard' ? 'consultant_dashboard_jwt_bridge' : 'fiteatsy_first_party_session',
    'workspace_route_role_gate'
  ],
  scopes: [...WORKSPACE_ALLOWED_SCOPES],
  restrictedScopes: [...WORKSPACE_RESTRICTED_SCOPES]
});

const buildAssignmentValidation = ({
  account,
  healthProfile,
  careCase
}: {
  account: AuthenticatedAccount;
  healthProfile: Awaited<ReturnType<typeof getHealthProfileByClientId>>;
  careCase: Awaited<ReturnType<typeof getCareCaseByClientId>>;
}) => {
  const assignedConsultantId = careCase?.assignedConsultantId ?? healthProfile?.assignedConsultantId ?? null;
  const assignedMentorId = careCase?.assignedMentorId ?? healthProfile?.assignedMentorId ?? null;
  const matchedRequestAccount = assignedConsultantId != null && assignedConsultantId === account.accountId;
  const status = assignedConsultantId == null
    ? 'unassigned'
    : matchedRequestAccount
      ? 'assigned_to_requestor'
      : 'assigned_to_other';

  return {
    status,
    validatedAt: new Date().toISOString(),
    assignedConsultantId,
    assignedMentorId,
    matchedRequestAccount,
    source: assignedConsultantId || assignedMentorId ? 'source_health_profile_or_care_case' : 'no_source_assignment',
    careCaseStage: careCase?.currentStage ?? null
  };
};

const buildPlanWorkflow = ({
  careCase,
  reportsCount,
  wearableConnected
}: {
  careCase: Awaited<ReturnType<typeof getCareCaseByClientId>>;
  reportsCount: number;
  wearableConnected: boolean;
}) => {
  const currentStage = careCase?.currentStage ?? 'new_client';
  const stageLabels: Record<string, string> = {
    new_client: 'Client Profile',
    health_profile_pending: 'Client Profile',
    blood_report_pending: 'Consultant Review',
    ready_for_consultant: 'Consultant Review',
    consultant_review: 'Consultant Review',
    ai_draft_generated: 'Plan Creation',
    diet_published: 'Plan Creation',
    active_monitoring: 'Client Feedback Loop',
    followup_due: 'Client Feedback Loop',
    program_completed: 'Client Feedback Loop'
  };
  const reviewComplete = ['consultant_review', 'ai_draft_generated', 'diet_published', 'active_monitoring', 'followup_due', 'program_completed'].includes(currentStage);
  const planCreated = ['diet_published', 'active_monitoring', 'followup_due', 'program_completed'].includes(currentStage);
  const feedbackLive = ['active_monitoring', 'followup_due', 'program_completed'].includes(currentStage);
  return {
    currentStage,
    stageLabel: stageLabels[currentStage] ?? 'Client Profile',
    careCaseId: careCase?.id ?? null,
    assignedConsultantId: careCase?.assignedConsultantId ?? null,
    assignedMentorId: careCase?.assignedMentorId ?? null,
    steps: [
      {
        key: 'client_profile',
        label: 'Client Profile',
        status: ['new_client', 'health_profile_pending'].includes(currentStage) ? 'active' : 'completed'
      },
      {
        key: 'consultant_review',
        label: 'Consultant Review',
        status: currentStage === 'consultant_review' || currentStage === 'ready_for_consultant' || currentStage === 'blood_report_pending' ? 'active' : reviewComplete ? 'completed' : 'pending'
      },
      {
        key: 'plan_creation',
        label: 'Plan Creation',
        status: currentStage === 'ai_draft_generated' || currentStage === 'diet_published' ? 'active' : planCreated ? 'completed' : 'pending'
      },
      {
        key: 'client_feedback_loop',
        label: 'Client Feedback Loop',
        status: feedbackLive ? 'active' : 'pending'
      }
    ],
    gates: {
      reportsReady: reportsCount > 0,
      wearableSignalsReady: wearableConnected
    }
  };
};

const buildProvenance = ({
  healthProfile,
  nutritionProfile,
  reports,
  biomarkers,
  wearableSummary,
  timeline,
  healthScores,
  careCase,
  lastSyncedAt
}: {
  healthProfile: Awaited<ReturnType<typeof getHealthProfileByClientId>>;
  nutritionProfile: Awaited<ReturnType<typeof getNutritionProfileByClientId>>;
  reports: Array<{ updatedAt: string; uploadedAt: string }>;
  biomarkers: Array<{ testDate: string; previousTestDate: string | null }>;
  wearableSummary: { lastSyncedAt: string | null; connected: boolean; dataSources: string[]; recordsCount: number };
  timeline: Array<{ timestamp: string; source: string }>;
  healthScores: Array<{ calculatedAtISO?: string | null; scoreType?: string }>;
  careCase: Awaited<ReturnType<typeof getCareCaseByClientId>>;
  lastSyncedAt: string;
}) => {
  const healthProfileUpdatedAt = healthProfile?.updatedAtISO ?? null;
  const nutritionUpdatedAt = nutritionProfile?.updatedAtISO ?? null;
  const latestReportAt = reports[0]?.updatedAt ?? reports[0]?.uploadedAt ?? null;
  const latestTimelineAt = timeline[0]?.timestamp ?? null;
  const latestScoreAt = healthScores
    .map((score) => score.calculatedAtISO ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const sources = [
    {
      key: 'client_account',
      sourceType: 'account',
      lastUpdatedAt: null,
      freshness: 'fresh',
      fields: ['name', 'email', 'mobile', 'registrationDate', 'status']
    },
    {
      key: 'health_profile',
      sourceType: 'health_profile',
      lastUpdatedAt: healthProfileUpdatedAt,
      freshness: freshnessFromTimestamp(healthProfileUpdatedAt),
      fields: ['demographics', 'body_composition', 'lifestyle', 'medical_history', 'nutrition_preferences']
    },
    {
      key: 'nutrition_profile',
      sourceType: 'nutrition_profile',
      lastUpdatedAt: nutritionUpdatedAt,
      freshness: freshnessFromTimestamp(nutritionUpdatedAt),
      fields: ['completionPercent', 'readinessScore', 'sectionScores', 'missingFields']
    },
    {
      key: 'care_case',
      sourceType: 'care_case',
      lastUpdatedAt: careCase?.updatedAtISO ?? null,
      freshness: freshnessFromTimestamp(careCase?.updatedAtISO ?? null),
      fields: ['currentStage', 'assignedConsultantId', 'assignedMentorId']
    },
    {
      key: 'reports',
      sourceType: 'reports',
      lastUpdatedAt: latestReportAt,
      freshness: freshnessFromTimestamp(latestReportAt),
      fields: ['reportDate', 'labName', 'processingStatus']
    },
    {
      key: 'biomarkers',
      sourceType: 'biomarkers',
      lastUpdatedAt: biomarkers[0]?.testDate ? new Date(biomarkers[0].testDate).toISOString() : null,
      freshness: biomarkers.length ? 'fresh' : 'no_data',
      fields: ['name', 'value', 'unit', 'referenceRange', 'trend']
    },
    {
      key: 'wearables',
      sourceType: 'wearables',
      lastUpdatedAt: wearableSummary.lastSyncedAt,
      freshness: freshnessFromTimestamp(wearableSummary.lastSyncedAt),
      fields: ['metricType', 'latestValue', 'unit', 'sourceProvider']
    },
    {
      key: 'timeline',
      sourceType: 'timeline',
      lastUpdatedAt: latestTimelineAt,
      freshness: freshnessFromTimestamp(latestTimelineAt),
      fields: ['type', 'title', 'detail', 'timestamp', 'source']
    },
    {
      key: 'health_scores',
      sourceType: 'health_scores',
      lastUpdatedAt: latestScoreAt,
      freshness: freshnessFromTimestamp(latestScoreAt),
      fields: ['scoreType', 'scoreValue', 'scoreBand']
    }
  ];

  const sourceFreshness = sources.map((item) => item.freshness);
  const freshness = sourceFreshness.includes('stale')
    ? 'stale'
    : sourceFreshness.includes('fresh')
      ? 'fresh'
      : freshnessFromTimestamp(lastSyncedAt);

  return {
    contractVersion: WORKSPACE_CONTRACT_VERSION,
    producer: 'fiteatsy-backend',
    sourceOfTruth: 'fiteatsy-production-database',
    lastSyncedAt,
    freshness,
    staleSources: sources.filter((item) => item.freshness === 'stale').map((item) => item.key),
    sources
  };
};

export const getConsultantClientWorkspace = async (
  publicClientId: string,
  account: AuthenticatedAccount
) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId);
  if (!context) return null;

  const owner = { accountId: context.accountId, clientId: context.internalClientId };
  const [healthProfile, nutritionProfile, careCase, reports, biomarkers, wearableSummary, timeline, healthScores] = await Promise.all([
    getHealthProfileByClientId(context.internalClientId),
    getNutritionProfileByClientId(context.internalClientId),
    getCareCaseByClientId(context.internalClientId),
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
    healthProfile?.updatedAtISO ?? context.profile.healthProfile.lastHealthUpdate,
    nutritionProfile?.updatedAtISO ?? null,
    careCase?.updatedAtISO ?? null,
    wearableSummary.lastSyncedAt,
    reports[0]?.updatedAt,
    biomarkers[0]?.testDate ? new Date(biomarkers[0].testDate).toISOString() : null,
    healthScores
      .map((score) => score.calculatedAtISO ?? null)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  ].filter(Boolean).map((value) => new Date(String(value)).getTime()).filter((value) => Number.isFinite(value));
  const lastSyncedAt = lastSyncedCandidates.length ? new Date(Math.max(...lastSyncedCandidates)).toISOString() : context.profile.client.registrationDate;

  const planWorkflow = buildPlanWorkflow({
    careCase,
    reportsCount: reports.length,
    wearableConnected: wearableSummary.connected
  });
  const assignmentValidation = buildAssignmentValidation({
    account,
    healthProfile,
    careCase
  });
  const consentValidation = buildConsentValidation(account);
  const provenance = buildProvenance({
    healthProfile,
    nutritionProfile,
    reports,
    biomarkers,
    wearableSummary,
    timeline,
    healthScores,
    careCase,
    lastSyncedAt
  });
  const [nutritionIntelligencePayload, latestDietPlan] = await Promise.all([
    getConsultantNutritionIntelligence(publicClientId),
    getConsultantLatestDietPlan(publicClientId),
  ]);

  return {
    contract: {
      version: WORKSPACE_CONTRACT_VERSION,
      producer: 'fiteatsy-backend',
      canonicalRoute: '/v1/clients/{id}/workspace',
      consultantRoute: '/v1/consultants/clients/{id}/workspace'
    },
    access: {
      requestAccountId: account.accountId,
      requestRole: account.user.role ?? null,
      authProvider: account.authProvider,
      consentValidation,
      assignmentValidation,
      allowedScopes: [...WORKSPACE_ALLOWED_SCOPES],
      restrictedScopes: [...WORKSPACE_RESTRICTED_SCOPES]
    },
    client: context.profile.client,
    profile: {
      ...context.profile.client,
      profileCompleted: context.profile.healthProfile.profileCompleted
    },
    onboarding: context.profile.onboarding,
    healthProfile: healthProfile
      ? {
          ...healthProfile,
          assignedConsultantId: healthProfile.assignedConsultantId ?? careCase?.assignedConsultantId ?? null,
          assignedMentorId: healthProfile.assignedMentorId ?? careCase?.assignedMentorId ?? null
        }
      : null,
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
      activityScore: scoreByType.get('active_performance') ?? scoreByType.get('activity') ?? null,
      sleepScore: scoreByType.get('energy_balance') ?? scoreByType.get('sleep') ?? null,
      calmScore: scoreByType.get('stress_resilience') ?? scoreByType.get('calm') ?? null,
      recoveryScore: scoreByType.get('recovery') ?? null,
      nourishmentScore: scoreByType.get('nourishment') ?? scoreByType.get('nutrition') ?? null,
      bodySupportScore: scoreByType.get('body_support') ?? scoreByType.get('clinical') ?? null,
      physicalWellnessIndex: scoreByType.get('physical_wellness_index') ?? overallScore,
      overallScore
    },
    nutritionProtocol: {
      readinessScore: nutritionProfile?.readinessScore ?? 0,
      workflowStage: planWorkflow.currentStage,
      workflowLabel: planWorkflow.stageLabel,
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
    nutritionIntelligence: nutritionIntelligencePayload?.intelligence ?? null,
    nutritionSnapshot: nutritionIntelligencePayload?.nutritionSnapshot ?? null,
    dietPlan:
      latestDietPlan == null
        ? null
        : {
            plan: latestDietPlan.plan,
            version: latestDietPlan.version,
            templateVersion: latestDietPlan.plan.templateVersion,
            currentLifecycle: latestDietPlan.version.lifecycleStatus,
            currentVersionNumber: latestDietPlan.version.versionNumber,
            sourceSnapshot: latestDietPlan.version.sourceSnapshot,
            contentSummary: latestDietPlan.version.contentSummary,
            content: latestDietPlan.version.content,
          },
    planWorkflow,
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
        nutritionProfile ? 'nutrition_profile' : null,
        careCase ? 'care_case' : null,
        reports.length ? 'reports' : null,
        biomarkers.length ? 'biomarkers' : null,
        wearableSummary.connected ? 'wearables' : null,
        healthScores.length ? 'health_scores' : null
      ].filter(Boolean),
      completenessScore: completeness.profileCompletionScore,
      freshness: provenance.freshness,
      staleSources: provenance.staleSources
    },
    provenance,
    sourceMetadata: {
      sourceProduct: 'Fiteatsy',
      sourceClientRef: context.profile.client.id,
      sourceAccountRef: context.accountId,
      internalClientRef: context.internalClientId,
      generatedAt: new Date().toISOString(),
      lastProfileUpdateAt: toIsoOrNull(healthProfile?.updatedAtISO ?? null),
      lastReportUpdateAt: reports[0]?.updatedAt ?? null,
      lastWearableSyncAt: wearableSummary.lastSyncedAt,
      lastTimelineEventAt: timeline[0]?.timestamp ?? null,
      lastHealthScoreAt: provenance.sources.find((item) => item.key === 'health_scores')?.lastUpdatedAt ?? null
    }
  };
};
