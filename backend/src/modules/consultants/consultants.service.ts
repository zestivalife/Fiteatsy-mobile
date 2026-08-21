import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { persistHealthCalculations } from '../health/health-calculations.repository.js';
import { type HealthMetrics, calculateHealthMetrics } from '../health/health-calculations.service.js';
import { listLatestHealthScores } from '../intelligence/health-scores.repository.js';
import {
  acknowledgeMedicationExceptionForConsultant,
  getActiveMedicationExceptionsForOwner,
  getMedicationException,
  getMedicationExceptionsForOwner,
  getMedicationMonitoringForOwner
} from '../medications/medications.service.js';
import type { MedicationExceptionRecord } from '../medications/medication-exceptions.repository.js';
import { getConsultantLatestDietPlan, getConsultantNutritionIntelligence } from '../nutrition/nutrition.service.js';
import {
  getAssessmentResultById,
  getLatestAssessmentResult,
  listAssessmentResults
} from '../assessments/assessments.repository.js';
import { getCareCaseByClientId, getHealthProfileByClientId, getNutritionProfileByClientId } from '../platform/platform.store.js';
import { getFoodPreferenceProfile } from '../nutrition/food-preferences.service.js';
import {
  ensureRegisteredClientsForEligibleUsers,
  getConsultantClientSyncDiagnostics,
  getConsultantWearableSummaryForClient,
  getRegisteredConsultantClientProfileContext,
  listAssignedConsultantClientContexts,
  listConsultantReportSummariesForClient,
  listConsultantTimelineForClient,
  listValidatedBiomarkerSummaryForClient,
  listRegisteredConsultantClients
} from './consultants.repository.js';

const CONSULTANT_ROLES = new Set(['consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor']);
const WORKSPACE_CONTRACT_VERSION = '2026-08-12.fiteatsy-client-workspace.v1';
const WORKSPACE_ALLOWED_SCOPES = [
  'client.identity.read',
  'client.onboarding.read',
  'client.health_profile.read',
  'client.body_metrics.read',
  'client.biomarkers.read',
  'client.reports.read',
  'client.wearables.read',
  'client.medications.read',
  'client.assessments.read',
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

const professionalTypeForAccount = (account: AuthenticatedAccount) => account.user.role?.toLowerCase() === 'practitioner' ? 'PRACTITIONER' : account.user.role?.toLowerCase() === 'mentor' ? 'MENTOR' : 'CONSULTANT';

export const listConsultantClients = async (account: AuthenticatedAccount) => {
  const clientsBackfilled = await ensureRegisteredClientsForEligibleUsers();
  const clients = await listRegisteredConsultantClients(account.accountId, professionalTypeForAccount(account));
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

export const getConsultantClientProfile = async (publicClientId: string, account: AuthenticatedAccount) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId, account.accountId, professionalTypeForAccount(account));
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

const foodPreferenceStatus = (foodPreferences: Awaited<ReturnType<typeof getFoodPreferenceProfile>>) => {
  if (!foodPreferences?.updatedAtISO) return 'NOT_SET' as const;
  const hasValues = Object.values(foodPreferences.profile).some((value) => Array.isArray(value) ? value.length > 0 : value != null);
  return hasValues ? 'COMPLETE' as const : 'INCOMPLETE' as const;
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
  careCase,
  cap003Assigned = false
}: {
  account: AuthenticatedAccount;
  healthProfile: Awaited<ReturnType<typeof getHealthProfileByClientId>>;
  careCase: Awaited<ReturnType<typeof getCareCaseByClientId>>;
  cap003Assigned?: boolean;
}) => {
  const assignedConsultantId = careCase?.assignedConsultantId ?? healthProfile?.assignedConsultantId ?? null;
  const assignedMentorId = careCase?.assignedMentorId ?? healthProfile?.assignedMentorId ?? null;
  const matchedRequestAccount = assignedConsultantId != null && assignedConsultantId === account.accountId;
  const status = cap003Assigned
    ? 'assigned_to_requestor'
    : assignedConsultantId == null
    ? 'unassigned'
    : matchedRequestAccount
      ? 'assigned_to_requestor'
      : 'assigned_to_other';

  return {
    status,
    validatedAt: new Date().toISOString(),
    assignedConsultantId,
    assignedMentorId,
    matchedRequestAccount: cap003Assigned || matchedRequestAccount,
    source: cap003Assigned ? 'cap003_professional_assignment' : assignedConsultantId || assignedMentorId ? 'source_health_profile_or_care_case' : 'no_source_assignment',
    careCaseStage: careCase?.currentStage ?? null
  };
};

const severityRank: Record<string, number> = {
  ATTENTION: 0,
  WATCH: 1,
  INFO: 2
};

const exceptionTypeLabels: Record<string, string> = {
  REPEATED_MISSED_DOSES: 'Repeated missed doses',
  LOW_7_DAY_ADHERENCE: 'Low 7-day adherence',
  ADHERENCE_DROP: 'Adherence drop',
  CONSECUTIVE_UNRESOLVED_DOSES: 'Consecutive unresolved doses'
};

const mapMedicationExceptionForConsultant = (
  exception: MedicationExceptionRecord,
  client?: { id: string; name: string; email?: string | null; mobileNumberMasked?: string | null }
) => ({
  id: exception.id,
  clientId: client?.id ?? null,
  clientName: client?.name ?? 'Client',
  clientEmail: client?.email ?? null,
  clientMobileMasked: client?.mobileNumberMasked ?? null,
  type: exception.type,
  typeLabel: exceptionTypeLabels[exception.type] ?? exception.type,
  severity: exception.severity,
  status: exception.status,
  detectedAt: exception.detectedAt,
  acknowledgedAt: exception.acknowledgedAt,
  resolvedAt: exception.resolvedAt,
  ruleVersion: exception.ruleVersion,
  title: exception.title,
  summary: exception.summary,
  evidence: exception.evidence,
  actions: {
    canAcknowledge: exception.status === 'OPEN',
    canCreateFollowUp: exception.status !== 'RESOLVED',
    canViewMedication: true
  }
});

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

const resolveAssignedClientMedicationAccess = async (publicClientId: string, account: AuthenticatedAccount) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId, account.accountId, professionalTypeForAccount(account));
  if (!context) return null;
  const [healthProfile, careCase] = await Promise.all([
    getHealthProfileByClientId(context.internalClientId),
    getCareCaseByClientId(context.internalClientId)
  ]);
  const assignmentValidation = buildAssignmentValidation({ account, healthProfile, careCase, cap003Assigned: true });
  if (assignmentValidation.status !== 'assigned_to_requestor') {
    return {
      status: 'forbidden' as const,
      context,
      assignmentValidation
    };
  }
  return {
    status: 'allowed' as const,
    context,
    assignmentValidation
  };
};

const resolveAssignedClientAssessmentAccess = async (publicClientId: string, account: AuthenticatedAccount) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId, account.accountId, professionalTypeForAccount(account));
  if (!context) return null;
  const [healthProfile, careCase] = await Promise.all([
    getHealthProfileByClientId(context.internalClientId),
    getCareCaseByClientId(context.internalClientId)
  ]);
  const assignmentValidation = buildAssignmentValidation({ account, healthProfile, careCase, cap003Assigned: true });
  return {
    context,
    assignmentValidation,
    allowed: assignmentValidation.status === 'assigned_to_requestor'
  };
};

const assessmentChange = (latest: Awaited<ReturnType<typeof getLatestAssessmentResult>>['result'], previous: Awaited<ReturnType<typeof getLatestAssessmentResult>>['previousResult']) =>
  latest && previous ? latest.rawScore - previous.rawScore : null;

const consultantAssessmentAccess = (account: AuthenticatedAccount, assignmentValidation: ReturnType<typeof buildAssignmentValidation>) => ({
  requestAccountId: account.accountId,
  requestRole: account.user.role ?? null,
  assignmentValidation,
  readOnly: true
});

export const getConsultantClientAssessmentSummary = async (
  publicClientId: string,
  account: AuthenticatedAccount
) => {
  const access = await resolveAssignedClientAssessmentAccess(publicClientId, account);
  if (!access) return null;
  if (!access.allowed) {
    return { error: 'CLIENT_ASSESSMENT_ACCESS_DENIED' as const, assignmentValidation: access.assignmentValidation };
  }

  const owner = { accountId: access.context.accountId, clientId: access.context.internalClientId };
  const [latest, history] = await Promise.all([
    getLatestAssessmentResult(owner),
    listAssessmentResults(owner, 100)
  ]);
  return {
    client: access.context.profile.client,
    access: consultantAssessmentAccess(account, access.assignmentValidation),
    assessment: {
      assessmentType: 'PSS10',
      latest: latest.result,
      previous: latest.previousResult,
      change: assessmentChange(latest.result, latest.previousResult),
      history
    }
  };
};

export const getConsultantClientAssessmentResult = async (
  publicClientId: string,
  resultId: string,
  account: AuthenticatedAccount
) => {
  const access = await resolveAssignedClientAssessmentAccess(publicClientId, account);
  if (!access) return null;
  if (!access.allowed) {
    return { error: 'CLIENT_ASSESSMENT_ACCESS_DENIED' as const, assignmentValidation: access.assignmentValidation };
  }

  const result = await getAssessmentResultById(
    { accountId: access.context.accountId, clientId: access.context.internalClientId },
    resultId
  );
  return result
    ? {
        client: access.context.profile.client,
        access: consultantAssessmentAccess(account, access.assignmentValidation),
        result
      }
    : null;
};

export const getConsultantClientMedicationMonitoring = async (
  publicClientId: string,
  account: AuthenticatedAccount
) => {
  const access = await resolveAssignedClientMedicationAccess(publicClientId, account);
  if (!access) return null;
  if (access.status === 'forbidden') {
    return {
      error: 'CLIENT_MEDICATION_ACCESS_DENIED' as const,
      assignmentValidation: access.assignmentValidation
    };
  }
  const owner = { accountId: access.context.accountId, clientId: access.context.internalClientId };
  return {
    client: access.context.profile.client,
    access: {
      requestAccountId: account.accountId,
      requestRole: account.user.role ?? null,
      assignmentValidation: access.assignmentValidation,
      readOnly: true
    },
    medicationMonitoring: await getMedicationMonitoringForOwner(owner)
  };
};

export const listConsultantMedicationExceptions = async (account: AuthenticatedAccount) => {
  await ensureRegisteredClientsForEligibleUsers();
  const assignedClients = await listAssignedConsultantClientContexts(account.accountId);
  const exceptionsByClient = await Promise.all(
    assignedClients.map(async (client) => {
      const owner = { accountId: client.accountId, clientId: client.internalClientId };
      const exceptions = await getActiveMedicationExceptionsForOwner(owner);
      return {
        client,
        exceptions
      };
    })
  );

  const exceptions = exceptionsByClient
    .flatMap(({ client, exceptions: clientExceptions }) =>
      clientExceptions.map((exception) => mapMedicationExceptionForConsultant(exception, {
        id: client.publicClientId,
        name: client.name,
        email: client.email,
        mobileNumberMasked: client.mobileNumberMasked
      }))
    )
    .sort((left, right) => {
      const severityDelta = (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9);
      if (severityDelta !== 0) return severityDelta;
      const dateDelta = new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime();
      if (dateDelta !== 0) return dateDelta;
      return left.clientName.localeCompare(right.clientName);
    });

  const clientsRequiringAttention = new Set(exceptions.filter((item) => item.status === 'OPEN').map((item) => item.clientId)).size;
  const byType = exceptions.reduce<Record<string, number>>((counts, exception) => {
    counts[exception.type] = (counts[exception.type] ?? 0) + 1;
    return counts;
  }, {});
  const bySeverity = exceptions.reduce<Record<string, number>>((counts, exception) => {
    counts[exception.severity] = (counts[exception.severity] ?? 0) + 1;
    return counts;
  }, {});
  const byStatus = exceptions.reduce<Record<string, number>>((counts, exception) => {
    counts[exception.status] = (counts[exception.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    summary: {
      clientsRequiringAttention,
      activeExceptionCount: exceptions.length,
      byType,
      bySeverity,
      byStatus,
      ruleVersion: 'medication-exceptions-v1',
      generatedAt: new Date().toISOString()
    },
    exceptions
  };
};

export const getConsultantClientMedicationExceptions = async (
  publicClientId: string,
  account: AuthenticatedAccount
) => {
  const access = await resolveAssignedClientMedicationAccess(publicClientId, account);
  if (!access) return null;
  if (access.status === 'forbidden') {
    return {
      error: 'CLIENT_MEDICATION_ACCESS_DENIED' as const,
      assignmentValidation: access.assignmentValidation
    };
  }
  const owner = { accountId: access.context.accountId, clientId: access.context.internalClientId };
  const exceptions = await getMedicationExceptionsForOwner(owner);
  return {
    client: access.context.profile.client,
    access: {
      requestAccountId: account.accountId,
      requestRole: account.user.role ?? null,
      assignmentValidation: access.assignmentValidation,
      readOnly: true
    },
    exceptions: exceptions.map((exception) => mapMedicationExceptionForConsultant(exception, {
      id: access.context.profile.client.id,
      name: access.context.profile.client.name,
      email: access.context.profile.client.email,
      mobileNumberMasked: access.context.profile.client.mobileNumberMasked
    }))
  };
};

export const getConsultantMedicationExceptionDetail = async (
  exceptionId: string,
  account: AuthenticatedAccount
) => {
  const exception = await getMedicationException(exceptionId);
  if (!exception) return null;
  const assignedClients = await listAssignedConsultantClientContexts(account.accountId);
  const matchedClient = assignedClients.find((client) =>
    client.internalClientId === exception.clientId && client.accountId === exception.userId
  );
  if (!matchedClient) {
    return {
      error: 'CLIENT_MEDICATION_ACCESS_DENIED' as const
    };
  }
  return mapMedicationExceptionForConsultant(exception, {
    id: matchedClient.publicClientId,
    name: matchedClient.name,
    email: matchedClient.email,
    mobileNumberMasked: matchedClient.mobileNumberMasked
  });
};

export const acknowledgeConsultantMedicationException = async (
  exceptionId: string,
  account: AuthenticatedAccount
) => {
  const detail = await getConsultantMedicationExceptionDetail(exceptionId, account);
  if (!detail || ('error' in detail)) return detail;
  const acknowledged = await acknowledgeMedicationExceptionForConsultant(exceptionId, account.accountId);
  if (!acknowledged) return null;
  return {
    exception: mapMedicationExceptionForConsultant(acknowledged, {
      id: detail.clientId ?? '',
      name: detail.clientName,
      email: detail.clientEmail,
      mobileNumberMasked: detail.clientMobileMasked
    })
  };
};

export const getConsultantClientWorkspace = async (
  publicClientId: string,
  account: AuthenticatedAccount
) => {
  await ensureRegisteredClientsForEligibleUsers();
  const context = await getRegisteredConsultantClientProfileContext(publicClientId, account.accountId, professionalTypeForAccount(account));
  if (!context) return null;

  const owner = { accountId: context.accountId, clientId: context.internalClientId };
  const [healthProfile, nutritionProfile, careCase, reports, biomarkers, wearableSummary, timeline, healthScores, medicationMonitoring, foodPreferences] = await Promise.all([
    getHealthProfileByClientId(context.internalClientId),
    getNutritionProfileByClientId(context.internalClientId),
    getCareCaseByClientId(context.internalClientId),
    listConsultantReportSummariesForClient(context.internalClientId, context.accountId),
    listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId),
    getConsultantWearableSummaryForClient(context.internalClientId, context.accountId),
    listConsultantTimelineForClient(context.internalClientId, context.accountId),
    listLatestHealthScores(owner),
    getMedicationMonitoringForOwner(owner),
    getFoodPreferenceProfile(publicClientId)
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
    careCase,
    cap003Assigned: true
  });
  const consentValidation = buildConsentValidation(account);
  const stressAssessment = assignmentValidation.status === 'assigned_to_requestor'
    ? await (async () => {
        const [latest, history] = await Promise.all([
          getLatestAssessmentResult(owner),
          listAssessmentResults(owner, 100)
        ]);
        return {
          assessmentType: 'PSS10',
          latest: latest.result,
          previous: latest.previousResult,
          change: assessmentChange(latest.result, latest.previousResult),
          history
        };
      })()
    : null;
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
    getConsultantNutritionIntelligence(publicClientId, account),
    getConsultantLatestDietPlan(publicClientId, account),
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
    medicationMonitoring,
    stressAssessment,
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
    foodPreferences: foodPreferences
      ? {
          ...foodPreferences,
          status: foodPreferenceStatus(foodPreferences)
        }
      : null,
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
        medicationMonitoring.summary.activeMedicationCount > 0 ? 'medications' : null,
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
