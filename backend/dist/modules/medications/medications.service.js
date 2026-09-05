import { listMedicationLogsForOwner, listMedicationsForOwner, upsertMedicationSnapshot } from './medications.repository.js';
import { acknowledgeMedicationException, getMedicationExceptionById, listActiveMedicationExceptionsForOwner, listMedicationExceptionsForOwner, resolveInactiveMedicationExceptions, upsertActiveMedicationException } from './medication-exceptions.repository.js';
export const MEDICATION_EXCEPTION_RULE_VERSION = 'medication-exceptions-v1';
export const MEDICATION_EXCEPTION_RULES = {
    repeatedMissedDoses: {
        count: 2,
        windowDays: 3
    },
    lowSevenDayAdherence: {
        threshold: 80
    },
    adherenceDrop: {
        percentagePointDrop: 15
    },
    consecutiveUnresolvedDoses: {
        count: 3
    }
};
export const MEDICATION_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;
const businessDateKey = (date) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const startOfMedicationDay = (date) => new Date(`${businessDateKey(date)}T00:00:00.000+05:30`);
const addDays = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};
const toDayKey = (date) => businessDateKey(date);
const parseTimeSlot = (day, time24h) => {
    const [hourRaw, minuteRaw] = time24h.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute))
        return null;
    return new Date(`${toDayKey(day)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+05:30`);
};
const daysBetween = (start, day) => Math.floor((new Date(`${toDayKey(day)}T00:00:00.000Z`).getTime() - new Date(`${toDayKey(start)}T00:00:00.000Z`).getTime()) / 86_400_000);
const matchesFrequency = (medication, day) => {
    const start = new Date(medication.schedule.duration.startDateISO);
    const difference = daysBetween(start, day);
    if (difference < 0)
        return false;
    const rule = medication.schedule.frequency;
    if (rule.preset === 'every_day')
        return true;
    if (rule.preset === 'alternate_days')
        return difference % 2 === 0;
    if (rule.preset === 'every_x_days')
        return difference % Math.max(1, rule.intervalDays ?? 1) === 0;
    if (rule.preset === 'weekly' || rule.preset === 'specific_weekdays') {
        return (rule.weekdays ?? []).includes(new Date(`${toDayKey(day)}T00:00:00.000Z`).getUTCDay());
    }
    if (rule.preset === 'monthly') {
        return (rule.monthlyDays ?? []).includes(Number(toDayKey(day).slice(8, 10)));
    }
    return true;
};
const getMedicationOccurrencesForDate = (medication, day) => {
    if (medication.status !== 'active')
        return [];
    const dayStart = startOfMedicationDay(day);
    const dayKey = toDayKey(dayStart);
    const startKey = toDayKey(new Date(medication.schedule.duration.startDateISO));
    const endKey = medication.schedule.duration.endDateISO ? toDayKey(new Date(medication.schedule.duration.endDateISO)) : null;
    if (dayKey < startKey)
        return [];
    if (endKey && dayKey > endKey)
        return [];
    if (!matchesFrequency(medication, dayStart))
        return [];
    return medication.schedule.timeSlots.flatMap((slot) => {
        const scheduledFor = parseTimeSlot(dayStart, slot.time24h);
        if (!scheduledFor)
            return [];
        return [{ medication, slot, scheduledForISO: scheduledFor.toISOString() }];
    });
};
const formatTime = (iso) => new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MEDICATION_TIME_ZONE
}).format(new Date(iso));
const mealRelationLabels = {
    before_meal: 'Before food',
    after_meal: 'After food',
    with_meal: 'With food',
    empty_stomach: 'Empty stomach'
};
const logByOccurrence = (logs) => {
    const map = new Map();
    for (const log of logs) {
        map.set(`${log.medicationId}:${log.scheduledForISO}`, log);
    }
    return map;
};
const resolveOccurrenceStatus = (scheduledForISO, log, now = new Date()) => {
    if (log)
        return log.status;
    const scheduledAt = new Date(scheduledForISO).getTime();
    const deltaMinutes = (now.getTime() - scheduledAt) / 60_000;
    if (deltaMinutes > 120)
        return 'missed';
    if (deltaMinutes >= -30)
        return 'upcoming';
    return 'upcoming';
};
const summarizeAdherence = (occurrences, logs, now = new Date()) => {
    const logMap = logByOccurrence(logs);
    const statusCounts = {
        scheduled: occurrences.length,
        taken: 0,
        snoozed: 0,
        skipped: 0,
        missed: 0,
        upcoming: 0
    };
    for (const occurrence of occurrences) {
        const log = logMap.get(`${occurrence.medication.id}:${occurrence.scheduledForISO}`);
        const status = resolveOccurrenceStatus(occurrence.scheduledForISO, log, now);
        statusCounts[status] += 1;
    }
    return {
        ...statusCounts,
        adherencePercent: statusCounts.scheduled === 0 ? null : Math.round((statusCounts.taken / statusCounts.scheduled) * 100)
    };
};
const buildOccurrencesForRange = (medications, daysBack, now = new Date()) => {
    const today = startOfMedicationDay(now);
    const days = Array.from({ length: daysBack }, (_item, index) => addDays(today, -index));
    return days.flatMap((day) => medications.flatMap((medication) => getMedicationOccurrencesForDate(medication, day)));
};
const buildOccurrencesForWindow = (medications, startDayOffset, lengthDays, now = new Date()) => {
    const today = startOfMedicationDay(now);
    const days = Array.from({ length: lengthDays }, (_item, index) => addDays(today, startDayOffset + index));
    return days.flatMap((day) => medications.flatMap((medication) => getMedicationOccurrencesForDate(medication, day)));
};
const getStatusForOccurrence = (occurrence, logMap, now) => resolveOccurrenceStatus(occurrence.scheduledForISO, logMap.get(`${occurrence.medication.id}:${occurrence.scheduledForISO}`), now);
const stableEvidenceFingerprint = (type, evidence) => `${type}:${JSON.stringify(evidence, Object.keys(evidence).sort())}`;
const buildExceptionInput = (owner, type, title, summary, evidence, now) => ({
    clientId: owner.clientId,
    userId: owner.accountId,
    type,
    severity: 'ATTENTION',
    ruleVersion: MEDICATION_EXCEPTION_RULE_VERSION,
    title,
    summary,
    evidence,
    evidenceFingerprint: stableEvidenceFingerprint(type, evidence),
    detectedAt: now.toISOString()
});
export const detectMedicationExceptionInputs = async (owner, now = new Date()) => {
    const from = addDays(startOfMedicationDay(now), -30).toISOString();
    const to = addDays(startOfMedicationDay(now), 2).toISOString();
    const [medications, logs] = await Promise.all([
        listMedicationsForOwner(owner),
        listMedicationLogsForOwner(owner, from, to)
    ]);
    const activeMedications = medications.filter((item) => item.status === 'active');
    if (activeMedications.length === 0)
        return [];
    const logMap = logByOccurrence(logs);
    const inputs = [];
    const currentSevenDayOccurrences = buildOccurrencesForRange(activeMedications, 7, now);
    const currentSevenDay = summarizeAdherence(currentSevenDayOccurrences, logs, now);
    const previousSevenDayOccurrences = buildOccurrencesForWindow(activeMedications, -13, 7, now);
    const previousSevenDay = summarizeAdherence(previousSevenDayOccurrences, logs, now);
    if (currentSevenDay.scheduled > 0 &&
        currentSevenDay.adherencePercent != null &&
        currentSevenDay.adherencePercent < MEDICATION_EXCEPTION_RULES.lowSevenDayAdherence.threshold) {
        inputs.push(buildExceptionInput(owner, 'LOW_7_DAY_ADHERENCE', 'Medication adherence needs attention', `7-day medication adherence is ${currentSevenDay.adherencePercent}%.`, {
            scheduledDoses: currentSevenDay.scheduled,
            takenDoses: currentSevenDay.taken,
            missedDoses: currentSevenDay.missed,
            skippedDoses: currentSevenDay.skipped,
            snoozedDoses: currentSevenDay.snoozed,
            current7DayAdherence: currentSevenDay.adherencePercent,
            threshold: MEDICATION_EXCEPTION_RULES.lowSevenDayAdherence.threshold
        }, now));
    }
    if (currentSevenDay.scheduled > 0 &&
        previousSevenDay.scheduled > 0 &&
        currentSevenDay.adherencePercent != null &&
        previousSevenDay.adherencePercent != null) {
        const percentagePointDrop = previousSevenDay.adherencePercent - currentSevenDay.adherencePercent;
        if (percentagePointDrop >= MEDICATION_EXCEPTION_RULES.adherenceDrop.percentagePointDrop) {
            inputs.push(buildExceptionInput(owner, 'ADHERENCE_DROP', 'Medication adherence decreased', `Adherence decreased by ${percentagePointDrop} percentage points compared with the previous 7-day period.`, {
                scheduledDoses: currentSevenDay.scheduled,
                takenDoses: currentSevenDay.taken,
                current7DayAdherence: currentSevenDay.adherencePercent,
                previous7DayAdherence: previousSevenDay.adherencePercent,
                percentagePointDrop,
                thresholdPercentagePointDrop: MEDICATION_EXCEPTION_RULES.adherenceDrop.percentagePointDrop
            }, now));
        }
    }
    const missedWindowOccurrences = buildOccurrencesForRange(activeMedications, MEDICATION_EXCEPTION_RULES.repeatedMissedDoses.windowDays, now);
    const missedOccurrences = missedWindowOccurrences.filter((occurrence) => getStatusForOccurrence(occurrence, logMap, now) === 'missed');
    if (missedOccurrences.length >= MEDICATION_EXCEPTION_RULES.repeatedMissedDoses.count) {
        inputs.push(buildExceptionInput(owner, 'REPEATED_MISSED_DOSES', 'Repeated missed scheduled doses', `${missedOccurrences.length} scheduled doses were missed in the last ${MEDICATION_EXCEPTION_RULES.repeatedMissedDoses.windowDays} days.`, {
            missedDoses: missedOccurrences.length,
            windowDays: MEDICATION_EXCEPTION_RULES.repeatedMissedDoses.windowDays,
            thresholdMissedDoses: MEDICATION_EXCEPTION_RULES.repeatedMissedDoses.count,
            medications: [...new Set(missedOccurrences.map((occurrence) => occurrence.medication.name))].slice(0, 5)
        }, now));
    }
    const historicalOccurrences = buildOccurrencesForRange(activeMedications, 30, now)
        .filter((occurrence) => new Date(occurrence.scheduledForISO).getTime() <= now.getTime())
        .sort((left, right) => new Date(left.scheduledForISO).getTime() - new Date(right.scheduledForISO).getTime());
    let currentRun = 0;
    let longestRun = 0;
    for (const occurrence of historicalOccurrences) {
        const status = getStatusForOccurrence(occurrence, logMap, now);
        if (status === 'missed' || status === 'skipped') {
            currentRun += 1;
            longestRun = Math.max(longestRun, currentRun);
        }
        else if (status === 'taken' || status === 'snoozed') {
            currentRun = 0;
        }
    }
    if (longestRun >= MEDICATION_EXCEPTION_RULES.consecutiveUnresolvedDoses.count) {
        inputs.push(buildExceptionInput(owner, 'CONSECUTIVE_UNRESOLVED_DOSES', 'Consecutive unresolved medication doses', `${longestRun} consecutive scheduled doses were missed or skipped.`, {
            consecutiveUnresolvedDoses: longestRun,
            thresholdConsecutiveUnresolvedDoses: MEDICATION_EXCEPTION_RULES.consecutiveUnresolvedDoses.count
        }, now));
    }
    return inputs;
};
export const refreshMedicationExceptionsForOwner = async (owner, now = new Date()) => {
    const detectedInputs = await detectMedicationExceptionInputs(owner, now);
    const activeTypes = detectedInputs.map((item) => item.type);
    const [activeExceptions] = await Promise.all([
        Promise.all(detectedInputs.map((input) => upsertActiveMedicationException(input))),
        resolveInactiveMedicationExceptions(owner, activeTypes, MEDICATION_EXCEPTION_RULE_VERSION)
    ]);
    return activeExceptions;
};
export const getMedicationExceptionsForOwner = async (owner, now = new Date()) => {
    await refreshMedicationExceptionsForOwner(owner, now);
    return listMedicationExceptionsForOwner(owner);
};
export const getActiveMedicationExceptionsForOwner = async (owner, now = new Date()) => {
    await refreshMedicationExceptionsForOwner(owner, now);
    return listActiveMedicationExceptionsForOwner(owner);
};
export const getMedicationException = getMedicationExceptionById;
export const acknowledgeMedicationExceptionForConsultant = async (exceptionId, consultantAccountId) => acknowledgeMedicationException(exceptionId, consultantAccountId);
export const syncClientMedicationSnapshot = async (owner, medications, logs) => {
    await upsertMedicationSnapshot(owner, medications, logs);
    return { synced: true, medicationCount: medications.length, logCount: logs.length };
};
export const getMedicationMonitoringForOwner = async (owner, now = new Date()) => {
    const from = addDays(startOfMedicationDay(now), -30).toISOString();
    const to = addDays(startOfMedicationDay(now), 2).toISOString();
    const [medications, logs] = await Promise.all([
        listMedicationsForOwner(owner),
        listMedicationLogsForOwner(owner, from, to)
    ]);
    const activeMedications = medications.filter((item) => item.status === 'active');
    const todayOccurrences = activeMedications.flatMap((medication) => getMedicationOccurrencesForDate(medication, now))
        .sort((left, right) => new Date(left.scheduledForISO).getTime() - new Date(right.scheduledForISO).getTime());
    const sevenDayOccurrences = buildOccurrencesForRange(activeMedications, 7, now);
    const thirtyDayOccurrences = buildOccurrencesForRange(activeMedications, 30, now);
    const logMap = logByOccurrence(logs);
    const todaySummary = summarizeAdherence(todayOccurrences, logs, now);
    const sevenDay = summarizeAdherence(sevenDayOccurrences, logs, now);
    const thirtyDay = summarizeAdherence(thirtyDayOccurrences, logs, now);
    const nextDose = todayOccurrences.find((occurrence) => {
        const status = resolveOccurrenceStatus(occurrence.scheduledForISO, logMap.get(`${occurrence.medication.id}:${occurrence.scheduledForISO}`), now);
        return status === 'upcoming';
    }) ?? null;
    const todaysDoses = todayOccurrences.map((occurrence) => {
        const log = logMap.get(`${occurrence.medication.id}:${occurrence.scheduledForISO}`);
        const status = resolveOccurrenceStatus(occurrence.scheduledForISO, log, now);
        return {
            medicationId: occurrence.medication.id,
            medicationName: occurrence.medication.name,
            dosage: occurrence.medication.dosage,
            type: occurrence.medication.type,
            scheduledFor: occurrence.scheduledForISO,
            scheduledTime: formatTime(occurrence.scheduledForISO),
            foodRelation: occurrence.slot.mealRelation,
            foodRelationLabel: mealRelationLabels[occurrence.slot.mealRelation] ?? null,
            status: status.toUpperCase(),
            actionedAt: log?.actionedAtISO ?? null,
            snoozedUntil: log?.snoozedUntilISO ?? null,
            skipReason: log?.status === 'skipped' ? log.note : null
        };
    });
    const history = logs
        .slice()
        .sort((left, right) => new Date(right.scheduledForISO).getTime() - new Date(left.scheduledForISO).getTime())
        .slice(0, 80)
        .map((log) => {
        const medication = medications.find((item) => item.id === log.medicationId);
        return {
            id: log.id,
            medicationId: log.medicationId,
            medicationName: medication?.name ?? 'Medication',
            dosage: medication?.dosage ?? null,
            scheduledFor: log.scheduledForISO,
            scheduledTime: formatTime(log.scheduledForISO),
            status: log.status.toUpperCase(),
            actionedAt: log.actionedAtISO,
            snoozedUntil: log.snoozedUntilISO,
            skipReason: log.status === 'skipped' ? log.note : null
        };
    });
    return {
        summary: {
            activeMedicationCount: activeMedications.length,
            today: todaySummary,
            sevenDay,
            thirtyDay,
            nextDose: nextDose
                ? {
                    medicationId: nextDose.medication.id,
                    medicationName: nextDose.medication.name,
                    dosage: nextDose.medication.dosage,
                    scheduledFor: nextDose.scheduledForISO,
                    scheduledTime: formatTime(nextDose.scheduledForISO),
                    foodRelation: nextDose.slot.mealRelation,
                    foodRelationLabel: mealRelationLabels[nextDose.slot.mealRelation] ?? null
                }
                : null,
            supplyTrackingAvailable: false
        },
        todaysDoses,
        activeMedications: activeMedications.map((medication) => ({
            id: medication.id,
            name: medication.name,
            type: medication.type,
            dosage: medication.dosage,
            frequency: medication.schedule.frequency,
            scheduledTimes: medication.schedule.timeSlots.map((slot) => ({
                id: slot.id,
                time24h: slot.time24h,
                displayTime: formatTime(parseTimeSlot(now, slot.time24h)?.toISOString() ?? now.toISOString()),
                mealRelation: slot.mealRelation,
                mealRelationLabel: mealRelationLabels[slot.mealRelation] ?? null
            })),
            duration: medication.schedule.duration,
            reminderEnabled: medication.notificationEnabled,
            reminderSound: medication.reminderSound,
            recentAdherence: summarizeAdherence(buildOccurrencesForRange([medication], 7, now), logs.filter((log) => log.medicationId === medication.id), now),
            supply: null
        })),
        history,
        generatedAt: now.toISOString(),
        dataSource: 'client_medication_tracker'
    };
};
