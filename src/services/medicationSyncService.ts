import { Medication, MedicationLog } from '../types';
import { apiFetch } from './apiClient';

type MedicationSnapshotPayload = {
  medications: Array<{
    id: string;
    name: string;
    type: Medication['type'];
    dosage: string;
    schedule: Medication['schedule'];
    reminderSound: Medication['reminderSound'];
    status: Medication['status'];
    notificationEnabled: boolean;
    createdAtISO: string;
    updatedAtISO: string;
  }>;
  logs: MedicationLog[];
};

export const syncMedicationSnapshot = async (medications: Medication[], logs: MedicationLog[]) => {
  const payload: MedicationSnapshotPayload = {
    medications: medications.map((medication) => ({
      id: medication.id,
      name: medication.name,
      type: medication.type,
      dosage: medication.dosage,
      schedule: medication.schedule,
      reminderSound: medication.reminderSound,
      status: medication.status,
      notificationEnabled: medication.notificationIds.length > 0,
      createdAtISO: medication.createdAtISO,
      updatedAtISO: medication.updatedAtISO
    })),
    logs
  };

  return apiFetch<{ synced: boolean; medicationCount: number; logCount: number }>('/v1/platform/medications/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};
