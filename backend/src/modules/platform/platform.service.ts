import { countReports } from '../reports/reports.store.js';
import {
  createCareCaseIfMissing,
  createNotificationRecord,
  createOrUpdateHealthProfile,
  getCareCaseById,
  getCareCaseByClientId,
  getHealthProfileByClientId,
  listHealthEvents,
  listHealthTickets,
  listNotificationsForClient,
  listTimelineEvents,
  saveNutritionProfile,
  addTimelineEvent,
  addHealthEvent,
  updateCareCase,
} from './platform.store.js';
import { calculateAgeFromDob, calculateNutritionProfileCompletion } from './platform.calculations.js';
import { createOperationalTicket, transitionCareCaseStage, validateStageTransition } from './platform.lifecycle.js';
import { CareCaseStage, ClientOwnershipContext, HealthProfileRecord } from './platform.types.js';

const nowIso = () => new Date().toISOString();

const inferStage = (profile: HealthProfileRecord, reportCount: number, readinessScore: number): CareCaseStage => {
  if (!profile.dateOfBirthISO || !profile.gender || !profile.heightCm || !profile.currentWeightKg) return 'health_profile_pending';
  if (reportCount === 0) return 'blood_report_pending';
  if (readinessScore < 75) return 'ready_for_consultant';
  return 'consultant_review';
};

export const upsertHealthProfile = async (owner: ClientOwnershipContext, patch: Partial<HealthProfileRecord>) => {
  const calculatedAge = patch.dateOfBirthISO ? calculateAgeFromDob(patch.dateOfBirthISO) : undefined;
  const profile = await createOrUpdateHealthProfile(owner, {
    ...patch,
    ...(calculatedAge !== undefined ? { calculatedAge } : {}),
  });
  const reportCount = await countReports({ userId: owner.accountId, clientId: owner.clientId });
  const nutrition = await saveNutritionProfile(
    owner,
    profile.id,
    calculateNutritionProfileCompletion(profile, reportCount)
  );
  const careCase = await createCareCaseIfMissing(owner, profile.id);
  const nextStage = inferStage(profile, reportCount, nutrition.readinessScore);
  if (
    careCase.currentStage !== nextStage &&
    validateStageTransition(careCase.currentStage, nextStage)
  ) {
    await transitionCareCaseStage(careCase, nextStage, 'Profile completion and report availability recalculated.');
  }

  await addTimelineEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    kind: 'health_profile_updated',
    title: 'Health profile updated',
    detail: 'Shared health profile values were refreshed.',
    eventTimeISO: nowIso(),
    metadata: {
      completionPercent: nutrition.completionPercent,
      readinessScore: nutrition.readinessScore,
    },
  });
  await addHealthEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    type: 'health_profile_updated',
    summary: 'Health profile updated',
    payload: {
      completionPercent: nutrition.completionPercent,
      readinessScore: nutrition.readinessScore,
      missingFields: nutrition.missingFields,
    },
    replayKey: `${careCase.id}:health_profile_updated:${profile.version}`,
    eventTimeISO: nowIso(),
  });

  if (nutrition.missingFields.length > 0) {
    await createOperationalTicket(
      careCase.id,
      owner.accountId,
      'missing_health_profile',
      nutrition.readinessScore < 60 ? 'high' : 'medium',
      profile.assignedConsultantId,
      null,
      `Missing profile fields: ${nutrition.missingFields.join(', ')}`
    );
  }

  return { profile, nutrition, careCase: await getCareCaseByClientId(owner.clientId) };
};

export const getHealthProfileBundle = async (owner: ClientOwnershipContext) => {
  const profile = await getHealthProfileByClientId(owner.clientId);
  if (!profile) return null;
  const reportCount = await countReports({ userId: owner.accountId, clientId: owner.clientId });
  const nutrition = await saveNutritionProfile(
    owner,
    profile.id,
    calculateNutritionProfileCompletion(profile, reportCount)
  );
  const careCase = await createCareCaseIfMissing(owner, profile.id);
  return { profile, nutrition, careCase, reportCount };
};

export const requestMissingInformation = async (owner: ClientOwnershipContext, fields: string[], requestedBy: string) => {
  const bundle = await getHealthProfileBundle(owner);
  if (!bundle) {
    throw new Error('Health profile not found');
  }

  const ticket = await createOperationalTicket(
    bundle.careCase.id,
    owner.accountId,
    'missing_health_profile',
    'medium',
    requestedBy,
    null,
    `Consultant requested: ${fields.join(', ')}`
  );

  await createNotificationRecord({
    userId: owner.accountId,
    clientId: owner.clientId,
    careCaseId: bundle.careCase.id,
    channel: 'in_app',
    title: 'Consultant requested more information',
    body: `Please complete: ${fields.join(', ')}`,
    sentAtISO: nowIso(),
  });

  await addTimelineEvent({
    careCaseId: bundle.careCase.id,
    userId: owner.accountId,
    kind: 'notification_sent',
    title: 'Missing information requested',
    detail: `Requested by ${requestedBy}: ${fields.join(', ')}`,
    eventTimeISO: nowIso(),
    metadata: { fields, requestedBy, ticketId: ticket.id },
  });

  return { ticket, requestedFields: fields };
};

export const listCareCaseTimeline = async (careCaseId: string) => listTimelineEvents(careCaseId);
export const listCareCaseEvents = async (careCaseId: string) => listHealthEvents(careCaseId);
export const listCareCaseTickets = async (careCaseId: string) => listHealthTickets(careCaseId);
export const listClientNotifications = async (owner: ClientOwnershipContext) => listNotificationsForClient(owner.clientId);

export const assignConsultant = async (owner: ClientOwnershipContext, careCaseId: string, consultantId: string, mentorId?: string | null) => {
  const careCase = await getCareCaseById(careCaseId);
  if (!careCase) throw new Error('Care case not found');
  if (careCase.clientId !== owner.clientId) {
    const error = new Error('Care case does not belong to current client.');
    error.name = 'CARE_CASE_FORBIDDEN';
    throw error;
  }
  const updated = await updateCareCase(careCaseId, owner.clientId, {
    assignedConsultantId: consultantId,
    assignedMentorId: mentorId ?? careCase.assignedMentorId,
  });
  await addTimelineEvent({
    careCaseId,
    userId: careCase.userId,
    kind: 'consultant_assigned',
    title: 'Consultant assigned',
    detail: `Consultant ${consultantId} assigned to the care case.`,
    eventTimeISO: nowIso(),
    metadata: { consultantId, mentorId: mentorId ?? null },
  });
  await createNotificationRecord({
    userId: careCase.userId,
    clientId: owner.clientId,
    careCaseId,
    channel: 'in_app',
    title: 'Consultant assigned',
    body: `Your consultant assignment is now active.`,
    sentAtISO: nowIso(),
  });
  return updated;
};

export const syncReportPipelineToPlatform = async (
  owner: ClientOwnershipContext,
  reportId: string,
  stage: 'uploaded' | 'ocr_completed' | 'biomarkers_updated' | 'analysis_completed',
  detail: string
) => {
  const bundle = await getHealthProfileBundle(owner);
  if (!bundle) {
    const profile = await createOrUpdateHealthProfile(owner, {});
    await createCareCaseIfMissing(owner, profile.id, 'new_client');
  }
  const nextBundle = await getHealthProfileBundle(owner);
  if (!nextBundle) return null;

  const kind =
    stage === 'uploaded'
      ? 'blood_report_uploaded'
      : stage === 'ocr_completed'
        ? 'ocr_completed'
        : 'biomarkers_updated';

  const timeline = await addTimelineEvent({
    careCaseId: nextBundle.careCase.id,
    userId: owner.accountId,
    kind,
    title: detail,
    detail,
    eventTimeISO: nowIso(),
    metadata: { reportId, stage },
  });

  await addHealthEvent({
    careCaseId: nextBundle.careCase.id,
    userId: owner.accountId,
    type: kind,
    summary: detail,
    payload: { reportId, stage },
    replayKey: `${nextBundle.careCase.id}:${reportId}:${stage}:${timeline.id}`,
    eventTimeISO: nowIso(),
  });

  const reportCount = await countReports({ userId: owner.accountId, clientId: owner.clientId });
  const recomputedNutrition = await saveNutritionProfile(
    owner,
    nextBundle.profile.id,
    calculateNutritionProfileCompletion(nextBundle.profile, reportCount)
  );

  const nextStage = inferStage(nextBundle.profile, reportCount, recomputedNutrition.readinessScore);
  if (
    nextBundle.careCase.currentStage !== nextStage &&
    validateStageTransition(nextBundle.careCase.currentStage, nextStage)
  ) {
    await transitionCareCaseStage(nextBundle.careCase, nextStage, `Report pipeline advanced to ${stage}.`);
  }

  if (stage === 'analysis_completed') {
    await createNotificationRecord({
      userId: owner.accountId,
      clientId: owner.clientId,
      careCaseId: nextBundle.careCase.id,
      channel: 'in_app',
      title: 'Blood report processed',
      body: 'OCR, biomarker extraction, and AI validation are complete.',
      sentAtISO: nowIso(),
    });
  }

  return { timeline, careCaseId: nextBundle.careCase.id };
};
