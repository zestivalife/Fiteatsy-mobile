const mockStorage = new Map<string, string>();
const mockApiFetch = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  })
}));

jest.mock('../src/services/apiClient', () => {
  class ApiClientError extends Error {
    code: string;
    status?: number;

    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    ApiClientError,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args)
  };
});

import {
  getPlatformHealthProfileSyncDiagnostics,
  processPendingHealthProfileSync,
  syncPlatformHealthProfile
} from '../src/services/platformHealthProfileService';
import { getSyncQueue } from '../src/services/platformSyncService';
import { AssessmentProfile, OnboardingProfile } from '../src/types';

const identity = { userId: 'acct_sync', clientId: 'fc_sync' };

const onboarding: OnboardingProfile = {
  name: 'Lalit',
  dateOfBirthISO: '1994-04-20',
  calculatedAge: 32,
  gender: 'Male',
  ageBracket: '25-34',
  primaryConditions: ['Diabetes'],
  symptomTags: ['Fatigue'],
  healthGoals: ['Sugar Control'],
  secondaryGoals: ['Better Energy'],
  wearablePreference: 'manual',
  careTrack: 'Blood Sugar Recovery Care',
  assignedConsultantId: null,
  assignedConsultant: null,
  calendarProvider: 'None',
  calendarPermissionGranted: false,
  notificationPermissionGranted: true,
  createdAtISO: '2026-08-12T00:00:00.000Z',
  currentWeightKg: 84,
  goalWeightKg: 76,
  heightCm: 174,
  activityLevel: 'Moderate',
  primaryGoal: 'Sugar Control'
};

const assessment: AssessmentProfile = {
  completedAtISO: '2026-08-12T00:00:00.000Z',
  goal: 'Become Better',
  heightCm: 174,
  weightKg: 84,
  mood: 'Neutral',
  soughtHelpBefore: 'No',
  physicalDistress: 'No',
  sleepQuality: 'Fair',
  stressLevel: 3,
  voiceReflection: 'Need more consistency.'
};

describe('health profile sync reliability', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockApiFetch.mockReset();
    jest.clearAllMocks();
  });

  it('queues the full health profile payload when direct sync fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));

    await expect(syncPlatformHealthProfile(onboarding, assessment, identity)).rejects.toThrow('offline');

    const queue = await getSyncQueue(identity);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      entityType: 'health_profile',
      operation: 'patch',
      status: 'pending'
    });
    expect(queue[0].payload).toMatchObject({
      patch: expect.objectContaining({
        dateOfBirthISO: '1994-04-20',
        gender: 'Male',
        currentWeightKg: 84,
        goalWeightKg: 76,
        wellnessGoals: ['Sugar Control', 'Better Energy']
      })
    });

    const diagnostics = await getPlatformHealthProfileSyncDiagnostics(identity);
    expect(diagnostics).toMatchObject({
      status: 'pending',
      retryCount: 1
    });
    expect(diagnostics.lastAttemptAt).toEqual(expect.any(String));
    expect(diagnostics.lastSuccessAt).toBeNull();
  });

  it('retries queued health profile items and clears diagnostics after a later success', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(syncPlatformHealthProfile(onboarding, assessment, identity)).rejects.toThrow('offline');

    mockApiFetch.mockResolvedValueOnce({ ok: true });

    await expect(processPendingHealthProfileSync(identity)).resolves.toBe(1);
    await expect(getSyncQueue(identity)).resolves.toEqual([]);

    const diagnostics = await getPlatformHealthProfileSyncDiagnostics(identity);
    expect(diagnostics).toMatchObject({
      status: 'synced',
      retryCount: 0
    });
    expect(diagnostics.lastAttemptAt).toEqual(expect.any(String));
    expect(diagnostics.lastSuccessAt).toEqual(expect.any(String));
  });
});
