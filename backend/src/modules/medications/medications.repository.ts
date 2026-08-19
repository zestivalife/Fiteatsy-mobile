import { pool } from '../../db/pool.js';

export type MedicationType = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'drops' | 'powder';
export type MealRelation = 'before_meal' | 'after_meal' | 'with_meal' | 'empty_stomach';
export type MedicationStatus = 'active' | 'paused';
export type MedicationLogStatus = 'taken' | 'upcoming' | 'missed' | 'snoozed' | 'skipped';
export type ReminderSound = 'default' | 'soft' | 'bell' | 'medical_alert';
export type FrequencyPreset =
  | 'every_day'
  | 'alternate_days'
  | 'specific_weekdays'
  | 'every_x_days'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type MedicationSchedule = {
  frequency: {
    preset: FrequencyPreset;
    intervalDays?: number;
    weekdays?: number[];
    monthlyDays?: number[];
    customRule?: string;
  };
  timeSlots: Array<{
    id: string;
    time24h: string;
    mealRelation: MealRelation;
  }>;
  duration: {
    startDateISO: string;
    endDateISO: string | null;
    ongoing: boolean;
  };
};

export type ClientMedicationRecord = {
  id: string;
  clientId: string;
  userId: string;
  name: string;
  type: MedicationType;
  dosage: string;
  schedule: MedicationSchedule;
  reminderSound: ReminderSound;
  status: MedicationStatus;
  notificationEnabled: boolean;
  createdAtISO: string;
  updatedAtISO: string;
};

export type ClientMedicationLogRecord = {
  id: string;
  clientId: string;
  userId: string;
  medicationId: string;
  scheduledForISO: string;
  status: MedicationLogStatus;
  actionedAtISO: string | null;
  snoozedUntilISO: string | null;
  note: string | null;
};

export type MedicationOwner = {
  accountId: string;
  clientId: string;
};

const toIso = (value: unknown) => new Date(String(value)).toISOString();

const mapMedication = (row: Record<string, unknown>): ClientMedicationRecord => ({
  id: String(row.id),
  clientId: String(row.client_id),
  userId: String(row.user_id),
  name: String(row.name),
  type: String(row.medication_type) as MedicationType,
  dosage: String(row.dosage),
  schedule: row.schedule as MedicationSchedule,
  reminderSound: String(row.reminder_sound) as ReminderSound,
  status: String(row.medication_status) as MedicationStatus,
  notificationEnabled: Boolean(row.notification_enabled),
  createdAtISO: toIso(row.created_at),
  updatedAtISO: toIso(row.source_updated_at ?? row.updated_at)
});

const mapMedicationLog = (row: Record<string, unknown>): ClientMedicationLogRecord => ({
  id: String(row.id),
  clientId: String(row.client_id),
  userId: String(row.user_id),
  medicationId: String(row.medication_id),
  scheduledForISO: toIso(row.scheduled_for),
  status: String(row.log_status) as MedicationLogStatus,
  actionedAtISO: row.actioned_at == null ? null : toIso(row.actioned_at),
  snoozedUntilISO: row.snoozed_until == null ? null : toIso(row.snoozed_until),
  note: row.note == null ? null : String(row.note)
});

export const upsertMedicationSnapshot = async (
  owner: MedicationOwner,
  medications: Array<Omit<ClientMedicationRecord, 'clientId' | 'userId'>>,
  logs: Array<Omit<ClientMedicationLogRecord, 'clientId' | 'userId'>>
) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const medicationIds = medications.map((item) => item.id);

    for (const medication of medications) {
      await client.query(
        `
          insert into client_medications (
            id, client_id, user_id, name, medication_type, dosage, schedule,
            reminder_sound, medication_status, notification_enabled, source_updated_at,
            status, version, created_at, updated_at, deleted_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7::jsonb,
            $8, $9, $10, $11,
            'active', 1, coalesce($12::timestamptz, now()), now(), null
          )
          on conflict (client_id, id) do update set
            name = excluded.name,
            medication_type = excluded.medication_type,
            dosage = excluded.dosage,
            schedule = excluded.schedule,
            reminder_sound = excluded.reminder_sound,
            medication_status = excluded.medication_status,
            notification_enabled = excluded.notification_enabled,
            source_updated_at = excluded.source_updated_at,
            status = 'active',
            version = client_medications.version + 1,
            updated_at = now(),
            deleted_at = null
          where client_medications.user_id = excluded.user_id
        `,
        [
          medication.id,
          owner.clientId,
          owner.accountId,
          medication.name,
          medication.type,
          medication.dosage,
          JSON.stringify(medication.schedule),
          medication.reminderSound,
          medication.status,
          medication.notificationEnabled,
          medication.updatedAtISO,
          medication.createdAtISO
        ]
      );
    }

    if (medicationIds.length === 0) {
      await client.query(
        `
          update client_medications
          set deleted_at = now(), status = 'deleted', updated_at = now(), version = version + 1
          where client_id = $1 and user_id = $2 and deleted_at is null
        `,
        [owner.clientId, owner.accountId]
      );
    } else {
      await client.query(
        `
          update client_medications
          set deleted_at = now(), status = 'deleted', updated_at = now(), version = version + 1
          where client_id = $1
            and user_id = $2
            and deleted_at is null
            and not (id = any($3::text[]))
        `,
        [owner.clientId, owner.accountId, medicationIds]
      );
    }

    for (const log of logs) {
      if (!medicationIds.includes(log.medicationId)) continue;
      await client.query(
        `
          insert into client_medication_logs (
            id, client_id, user_id, medication_id, scheduled_for, log_status,
            actioned_at, snoozed_until, note, status, version, created_at, updated_at, deleted_at
          ) values (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, 'active', 1, now(), now(), null
          )
          on conflict (client_id, medication_id, scheduled_for) do update set
            log_status = excluded.log_status,
            actioned_at = excluded.actioned_at,
            snoozed_until = excluded.snoozed_until,
            note = excluded.note,
            status = 'active',
            version = client_medication_logs.version + 1,
            updated_at = now(),
            deleted_at = null
        `,
        [
          log.id,
          owner.clientId,
          owner.accountId,
          log.medicationId,
          log.scheduledForISO,
          log.status,
          log.actionedAtISO,
          log.snoozedUntilISO,
          log.note ?? null
        ]
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const listMedicationsForOwner = async (owner: MedicationOwner) => {
  const result = await pool.query(
    `
      select *
      from client_medications
      where client_id = $1
        and user_id = $2
        and deleted_at is null
      order by medication_status asc, name asc, created_at asc
    `,
    [owner.clientId, owner.accountId]
  );
  return result.rows.map((row) => mapMedication(row));
};

export const listMedicationLogsForOwner = async (owner: MedicationOwner, fromISO: string, toISO: string) => {
  const result = await pool.query(
    `
      select *
      from client_medication_logs
      where client_id = $1
        and user_id = $2
        and scheduled_for >= $3
        and scheduled_for <= $4
        and deleted_at is null
      order by scheduled_for desc
    `,
    [owner.clientId, owner.accountId, fromISO, toISO]
  );
  return result.rows.map((row) => mapMedicationLog(row));
};
