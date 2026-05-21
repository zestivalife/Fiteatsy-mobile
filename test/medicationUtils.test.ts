import { Medication, MedicationLog } from '../src/types';
import {
  getMedicationOccurrencesForDate,
  getMedicationStatusForOccurrence,
  resolveMedicationSlotForOccurrence
} from '../src/services/medicationUtils';

const baseMedication = (overrides?: Partial<Medication>): Medication => ({
  id: 'med-1',
  name: 'Metformin',
  type: 'tablet',
  dosage: '1 tablet',
  reminderSound: 'default',
  status: 'active',
  createdAtISO: '2026-05-19T00:00:00.000Z',
  updatedAtISO: '2026-05-19T00:00:00.000Z',
  notificationIds: [],
  schedule: {
    frequency: { preset: 'every_day' },
    timeSlots: [
      { id: 'slot-1', time24h: '08:00', mealRelation: 'after_meal' },
      { id: 'slot-2', time24h: '20:00', mealRelation: 'after_meal' }
    ],
    duration: { startDateISO: '2026-05-01T00:00:00.000Z', endDateISO: null, ongoing: true }
  },
  ...overrides
});

describe('medicationUtils', () => {
  it('supports alternate day schedule correctly', () => {
    const med = baseMedication({
      schedule: {
        ...baseMedication().schedule,
        frequency: { preset: 'alternate_days' }
      }
    });
    const day1 = getMedicationOccurrencesForDate(med, new Date('2026-05-01T10:00:00.000Z'));
    const day2 = getMedicationOccurrencesForDate(med, new Date('2026-05-02T10:00:00.000Z'));
    const day3 = getMedicationOccurrencesForDate(med, new Date('2026-05-03T10:00:00.000Z'));
    expect(day1.length).toBeGreaterThan(0);
    expect(day2.length).toBe(0);
    expect(day3.length).toBeGreaterThan(0);
  });

  it('supports weekly and monthly schedules', () => {
    const weekly = baseMedication({
      schedule: {
        ...baseMedication().schedule,
        frequency: { preset: 'weekly', weekdays: [1] } // Monday
      }
    });
    const monthly = baseMedication({
      schedule: {
        ...baseMedication().schedule,
        frequency: { preset: 'monthly', monthlyDays: [15] }
      }
    });
    expect(getMedicationOccurrencesForDate(weekly, new Date('2026-05-18T10:00:00.000Z')).length).toBeGreaterThan(0); // Monday
    expect(getMedicationOccurrencesForDate(weekly, new Date('2026-05-19T10:00:00.000Z')).length).toBe(0); // Tuesday
    expect(getMedicationOccurrencesForDate(monthly, new Date('2026-05-15T10:00:00.000Z')).length).toBeGreaterThan(0);
    expect(getMedicationOccurrencesForDate(monthly, new Date('2026-05-16T10:00:00.000Z')).length).toBe(0);
  });

  it('keeps status upcoming when snoozed-until is in the future', () => {
    const medicationId = 'med-1';
    const scheduledForISO = new Date(Date.now() - 60_000).toISOString();
    const logs: MedicationLog[] = [
      {
        id: 'l1',
        medicationId,
        scheduledForISO,
        status: 'snoozed',
        actionedAtISO: new Date().toISOString(),
        snoozedUntilISO: new Date(Date.now() + 5 * 60_000).toISOString()
      }
    ];
    expect(getMedicationStatusForOccurrence(medicationId, scheduledForISO, logs)).toBe('upcoming');
  });

  it('resolves correct slot for multi-time medications', () => {
    const med = baseMedication();
    const slot = resolveMedicationSlotForOccurrence(med, new Date(2026, 4, 20, 20, 0, 0, 0).toISOString());
    expect(slot.id).toBe('slot-2');
  });
});
