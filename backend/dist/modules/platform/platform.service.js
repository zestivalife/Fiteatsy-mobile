import { listReports } from '../reports/reports.store.js';
import { createCareCaseIfMissing, createNotificationRecord, createOrUpdateHealthProfile, getCareCaseById, getCareCaseByUserId, getHealthProfileByUserId, listHealthEvents, listHealthTickets, listNotificationsForUser, listTimelineEvents, saveNutritionProfile, addTimelineEvent, addHealthEvent, updateCareCase, } from './platform.store.js';
import { calculateAgeFromDob, calculateNutritionProfileCompletion } from './platform.calculations.js';
import { createOperationalTicket, transitionCareCaseStage } from './platform.lifecycle.js';
const nowIso = () => new Date().toISOString();
const inferStage = (profile, reportCount, readinessScore) => {
    if (!profile.dateOfBirthISO || !profile.gender || !profile.heightCm || !profile.currentWeightKg)
        return 'health_profile_pending';
    if (reportCount === 0)
        return 'blood_report_pending';
    if (readinessScore < 75)
        return 'ready_for_consultant';
    return 'consultant_review';
};
export const upsertHealthProfile = (userId, patch) => {
    const calculatedAge = patch.dateOfBirthISO ? calculateAgeFromDob(patch.dateOfBirthISO) : undefined;
    const profile = createOrUpdateHealthProfile(userId, {
        ...patch,
        ...(calculatedAge !== undefined ? { calculatedAge } : {}),
    });
    const reportCount = listReports(userId).length;
    const nutrition = saveNutritionProfile(userId, profile.id, calculateNutritionProfileCompletion(profile, reportCount));
    const careCase = createCareCaseIfMissing(userId, profile.id);
    const nextStage = inferStage(profile, reportCount, nutrition.readinessScore);
    if (careCase.currentStage !== nextStage) {
        transitionCareCaseStage(careCase, nextStage, 'Profile completion and report availability recalculated.');
    }
    addTimelineEvent({
        careCaseId: careCase.id,
        userId,
        kind: 'health_profile_updated',
        title: 'Health profile updated',
        detail: 'Shared health profile values were refreshed.',
        eventTimeISO: nowIso(),
        metadata: {
            completionPercent: nutrition.completionPercent,
            readinessScore: nutrition.readinessScore,
        },
    });
    addHealthEvent({
        careCaseId: careCase.id,
        userId,
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
        createOperationalTicket(careCase.id, userId, 'missing_health_profile', nutrition.readinessScore < 60 ? 'high' : 'medium', profile.assignedConsultantId, null, `Missing profile fields: ${nutrition.missingFields.join(', ')}`);
    }
    return { profile, nutrition, careCase: getCareCaseByUserId(userId) };
};
export const getHealthProfileBundle = (userId) => {
    const profile = getHealthProfileByUserId(userId);
    if (!profile)
        return null;
    const reportCount = listReports(userId).length;
    const nutrition = saveNutritionProfile(userId, profile.id, calculateNutritionProfileCompletion(profile, reportCount));
    const careCase = createCareCaseIfMissing(userId, profile.id);
    return { profile, nutrition, careCase, reportCount };
};
export const requestMissingInformation = (userId, fields, requestedBy) => {
    const bundle = getHealthProfileBundle(userId);
    if (!bundle) {
        throw new Error('Health profile not found');
    }
    const ticket = createOperationalTicket(bundle.careCase.id, userId, 'missing_health_profile', 'medium', requestedBy, null, `Consultant requested: ${fields.join(', ')}`);
    createNotificationRecord({
        userId,
        careCaseId: bundle.careCase.id,
        channel: 'in_app',
        title: 'Consultant requested more information',
        body: `Please complete: ${fields.join(', ')}`,
        sentAtISO: nowIso(),
    });
    addTimelineEvent({
        careCaseId: bundle.careCase.id,
        userId,
        kind: 'notification_sent',
        title: 'Missing information requested',
        detail: `Requested by ${requestedBy}: ${fields.join(', ')}`,
        eventTimeISO: nowIso(),
        metadata: { fields, requestedBy, ticketId: ticket.id },
    });
    return { ticket, requestedFields: fields };
};
export const listCareCaseTimeline = (careCaseId) => listTimelineEvents(careCaseId);
export const listCareCaseEvents = (careCaseId) => listHealthEvents(careCaseId);
export const listCareCaseTickets = (careCaseId) => listHealthTickets(careCaseId);
export const listUserNotifications = (userId) => listNotificationsForUser(userId);
export const assignConsultant = (careCaseId, consultantId, mentorId) => {
    const careCase = getCareCaseById(careCaseId);
    if (!careCase)
        throw new Error('Care case not found');
    const updated = updateCareCase(careCaseId, {
        assignedConsultantId: consultantId,
        assignedMentorId: mentorId ?? careCase.assignedMentorId,
    });
    addTimelineEvent({
        careCaseId,
        userId: careCase.userId,
        kind: 'consultant_assigned',
        title: 'Consultant assigned',
        detail: `Consultant ${consultantId} assigned to the care case.`,
        eventTimeISO: nowIso(),
        metadata: { consultantId, mentorId: mentorId ?? null },
    });
    createNotificationRecord({
        userId: careCase.userId,
        careCaseId,
        channel: 'in_app',
        title: 'Consultant assigned',
        body: `Your consultant assignment is now active.`,
        sentAtISO: nowIso(),
    });
    return updated;
};
export const syncReportPipelineToPlatform = (userId, reportId, stage, detail) => {
    const bundle = getHealthProfileBundle(userId);
    if (!bundle) {
        const profile = createOrUpdateHealthProfile(userId, {});
        createCareCaseIfMissing(userId, profile.id, 'new_client');
    }
    const nextBundle = getHealthProfileBundle(userId);
    if (!nextBundle)
        return null;
    const kind = stage === 'uploaded'
        ? 'blood_report_uploaded'
        : stage === 'ocr_completed'
            ? 'ocr_completed'
            : 'biomarkers_updated';
    const timeline = addTimelineEvent({
        careCaseId: nextBundle.careCase.id,
        userId,
        kind,
        title: detail,
        detail,
        eventTimeISO: nowIso(),
        metadata: { reportId, stage },
    });
    addHealthEvent({
        careCaseId: nextBundle.careCase.id,
        userId,
        type: kind,
        summary: detail,
        payload: { reportId, stage },
        replayKey: `${nextBundle.careCase.id}:${reportId}:${stage}:${timeline.id}`,
        eventTimeISO: nowIso(),
    });
    const recomputedNutrition = saveNutritionProfile(userId, nextBundle.profile.id, calculateNutritionProfileCompletion(nextBundle.profile, listReports(userId).length));
    const nextStage = inferStage(nextBundle.profile, listReports(userId).length, recomputedNutrition.readinessScore);
    if (nextBundle.careCase.currentStage !== nextStage) {
        transitionCareCaseStage(nextBundle.careCase, nextStage, `Report pipeline advanced to ${stage}.`);
    }
    if (stage === 'analysis_completed') {
        createNotificationRecord({
            userId,
            careCaseId: nextBundle.careCase.id,
            channel: 'in_app',
            title: 'Blood report processed',
            body: 'OCR, biomarker extraction, and AI validation are complete.',
            sentAtISO: nowIso(),
        });
    }
    return { timeline, careCaseId: nextBundle.careCase.id };
};
