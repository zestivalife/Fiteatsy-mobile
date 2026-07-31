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
export const upsertHealthProfile = async (userId, patch) => {
    const calculatedAge = patch.dateOfBirthISO ? calculateAgeFromDob(patch.dateOfBirthISO) : undefined;
    const profile = await createOrUpdateHealthProfile(userId, {
        ...patch,
        ...(calculatedAge !== undefined ? { calculatedAge } : {}),
    });
    const reportCount = listReports(userId).length;
    const nutrition = await saveNutritionProfile(userId, profile.id, calculateNutritionProfileCompletion(profile, reportCount));
    const careCase = await createCareCaseIfMissing(userId, profile.id);
    const nextStage = inferStage(profile, reportCount, nutrition.readinessScore);
    if (careCase.currentStage !== nextStage) {
        await transitionCareCaseStage(careCase, nextStage, 'Profile completion and report availability recalculated.');
    }
    await addTimelineEvent({
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
    await addHealthEvent({
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
        await createOperationalTicket(careCase.id, userId, 'missing_health_profile', nutrition.readinessScore < 60 ? 'high' : 'medium', profile.assignedConsultantId, null, `Missing profile fields: ${nutrition.missingFields.join(', ')}`);
    }
    return { profile, nutrition, careCase: await getCareCaseByUserId(userId) };
};
export const getHealthProfileBundle = async (userId) => {
    const profile = await getHealthProfileByUserId(userId);
    if (!profile)
        return null;
    const reportCount = listReports(userId).length;
    const nutrition = await saveNutritionProfile(userId, profile.id, calculateNutritionProfileCompletion(profile, reportCount));
    const careCase = await createCareCaseIfMissing(userId, profile.id);
    return { profile, nutrition, careCase, reportCount };
};
export const requestMissingInformation = async (userId, fields, requestedBy) => {
    const bundle = await getHealthProfileBundle(userId);
    if (!bundle) {
        throw new Error('Health profile not found');
    }
    const ticket = await createOperationalTicket(bundle.careCase.id, userId, 'missing_health_profile', 'medium', requestedBy, null, `Consultant requested: ${fields.join(', ')}`);
    await createNotificationRecord({
        userId,
        careCaseId: bundle.careCase.id,
        channel: 'in_app',
        title: 'Consultant requested more information',
        body: `Please complete: ${fields.join(', ')}`,
        sentAtISO: nowIso(),
    });
    await addTimelineEvent({
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
export const listCareCaseTimeline = async (careCaseId) => listTimelineEvents(careCaseId);
export const listCareCaseEvents = async (careCaseId) => listHealthEvents(careCaseId);
export const listCareCaseTickets = async (careCaseId) => listHealthTickets(careCaseId);
export const listUserNotifications = async (userId) => listNotificationsForUser(userId);
export const assignConsultant = async (careCaseId, consultantId, mentorId) => {
    const careCase = await getCareCaseById(careCaseId);
    if (!careCase)
        throw new Error('Care case not found');
    const updated = await updateCareCase(careCaseId, {
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
        careCaseId,
        channel: 'in_app',
        title: 'Consultant assigned',
        body: `Your consultant assignment is now active.`,
        sentAtISO: nowIso(),
    });
    return updated;
};
export const syncReportPipelineToPlatform = async (userId, reportId, stage, detail) => {
    const bundle = await getHealthProfileBundle(userId);
    if (!bundle) {
        const profile = await createOrUpdateHealthProfile(userId, {});
        await createCareCaseIfMissing(userId, profile.id, 'new_client');
    }
    const nextBundle = await getHealthProfileBundle(userId);
    if (!nextBundle)
        return null;
    const kind = stage === 'uploaded'
        ? 'blood_report_uploaded'
        : stage === 'ocr_completed'
            ? 'ocr_completed'
            : 'biomarkers_updated';
    const timeline = await addTimelineEvent({
        careCaseId: nextBundle.careCase.id,
        userId,
        kind,
        title: detail,
        detail,
        eventTimeISO: nowIso(),
        metadata: { reportId, stage },
    });
    await addHealthEvent({
        careCaseId: nextBundle.careCase.id,
        userId,
        type: kind,
        summary: detail,
        payload: { reportId, stage },
        replayKey: `${nextBundle.careCase.id}:${reportId}:${stage}:${timeline.id}`,
        eventTimeISO: nowIso(),
    });
    const recomputedNutrition = await saveNutritionProfile(userId, nextBundle.profile.id, calculateNutritionProfileCompletion(nextBundle.profile, listReports(userId).length));
    const nextStage = inferStage(nextBundle.profile, listReports(userId).length, recomputedNutrition.readinessScore);
    if (nextBundle.careCase.currentStage !== nextStage) {
        await transitionCareCaseStage(nextBundle.careCase, nextStage, `Report pipeline advanced to ${stage}.`);
    }
    if (stage === 'analysis_completed') {
        await createNotificationRecord({
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
