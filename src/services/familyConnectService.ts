import {
  FamilyConnection,
  FamilyPermissions,
  FamilyRelationshipType,
  FamilyShareType,
  FamilyWellnessSummary,
  Medication,
  MedicationLog,
  WellnessSnapshot,
  DailyCheckIn
} from '../types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const defaultFamilyPermissions = (): FamilyPermissions => ({
  medication_adherence: true,
  wellness_checkins: true,
  activity_consistency: true,
  sleep_summary: true,
  emergency_alerts: true,
  appointment_reminders: false,
  uploaded_reports: false,
  wellness_trends: true
});

export const generateInviteCode = (prefix: 'FIT' | 'CARE' | 'FTSY' = 'FIT') => {
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
};

export const validateInviteCode = (code: string) => /^(FIT|CARE|FTSY)-[A-Z2-9]{4,6}$/.test(code.trim().toUpperCase());

export const normalizeInviteCode = (code: string) => code.trim().toUpperCase();

export const relationshipLabel = (value: FamilyRelationshipType) => {
  if (value === 'family_member') return 'Family Member';
  return value[0].toUpperCase() + value.slice(1);
};

export const buildSupportiveMedicationLabel = (medications: Medication[], logs: MedicationLog[]) => {
  if (medications.length === 0) return 'No medication plan shared';
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((item) => item.scheduledForISO.slice(0, 10) === todayKey);
  if (todayLogs.some((l) => l.status === 'taken')) return 'Medication reminders completed today';
  if (todayLogs.some((l) => l.status === 'snoozed')) return 'Medication reminder snoozed';
  if (todayLogs.some((l) => l.status === 'missed')) return 'Medication support may be helpful';
  return 'Medication routine in progress';
};

export const buildWellnessActivityLabel = (wellness: WellnessSnapshot, checkIns: DailyCheckIn[]) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCheckIn = checkIns.find((item) => item.dateISO.slice(0, 10) === todayKey);
  if (todayCheckIn) return 'Wellness check-in shared recently';
  if (wellness.movementMinutes >= 20) return 'Wellness activity detected';
  if (wellness.movementMinutes >= 8) return 'Steady wellness activity';
  return 'Gentle day, check-in may help';
};

export const buildFamilySummary = (params: {
  connection: FamilyConnection;
  medications: Medication[];
  medicationLogs: MedicationLog[];
  wellness: WellnessSnapshot;
  checkIns: DailyCheckIn[];
}): FamilyWellnessSummary => {
  const { connection, medications, medicationLogs, wellness, checkIns } = params;
  const todayISO = new Date().toISOString();

  const medLabel = buildSupportiveMedicationLabel(medications, medicationLogs);
  const wellnessLabel = buildWellnessActivityLabel(wellness, checkIns);

  return {
    connectionId: connection.id,
    summaryDateISO: todayISO,
    medicationAdherence: medLabel.includes('completed') ? 'completed_today' : medLabel.includes('helpful') ? 'needs_attention' : 'partially_completed',
    wellnessActivity: wellnessLabel.includes('detected') ? 'active' : wellnessLabel.includes('Steady') ? 'steady' : 'quiet',
    sleepSummary: wellness.sleepHours >= 6.5 ? 'normal' : 'needs_rest',
    checkInStatus: connection.lastCheckInISO ? 'recent' : 'pending',
    trendLabel: `${medLabel}. ${wellnessLabel}.`
  };
};

export const shareTypeLabel = (type: FamilyShareType) => {
  const map: Record<FamilyShareType, string> = {
    medication_adherence: 'Medication adherence',
    wellness_checkins: 'Wellness check-ins',
    activity_consistency: 'Activity consistency',
    sleep_summary: 'Sleep summary',
    emergency_alerts: 'Emergency alerts',
    appointment_reminders: 'Appointment reminders',
    uploaded_reports: 'Uploaded reports/documents',
    wellness_trends: 'Basic wellness trends'
  };
  return map[type];
};
