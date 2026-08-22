import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { initialWellness } from '../data/mock';
import {
  AssessmentProfile,
  DailyCheckIn,
  DecisionLog,
  CycleLog,
  CycleNotificationSettings,
  CyclePrediction,
  CyclePhase,
  CycleSymptom,
  FamilyConnection,
  FamilyEmergencyEvent,
  FamilyInvite,
  FamilyPermissions,
  FamilyRelationshipType,
  FamilyShareType,
  FamilyWellnessSummary,
  PublishedNutritionPlan,
  MoodSelection,
  Medication,
  MedicationLog,
  MedicationLogStatus,
  Nudge,
  NudgeAction,
  OnboardingProfile,
  PriorityPlan,
  ThemeMode,
  WearableDevice,
  WearableSyncPayload,
  WellnessSnapshot,
  HealthProfileSyncDiagnostics
} from '../types';
import { applyMoodImpact } from '../utils/wellness';
import { generatePriorityPlan, buildDecisionLog } from '../services/intelligenceEngine';
import { todayKey, toDayKey } from '../utils/date';
import {
  cancelAllMedicationScheduledNotifications,
  clearScheduledMedicationNotifications,
  initMedicationNotifications,
  requestMedicationNotificationPermissions,
  scheduleMedicationNotifications,
  scheduleSnoozeNotification
} from '../services/medicationNotificationService';
import {
  buildLogId,
  getMedicationOccurrencesForDate,
  getMedicationStatusForOccurrence,
  resolveMedicationSlotForOccurrence
} from '../services/medicationUtils';
import {
  buildCyclePrediction,
  getMostCommonSymptoms,
  getPhaseForDate
} from '../services/cyclePredictionService';
import { clearCycleNotifications, scheduleCycleNotifications } from '../services/cycleNotificationService';
import {
  buildFamilySummary,
  defaultFamilyPermissions,
  generateInviteCode,
  normalizeInviteCode,
  validateInviteCode
} from '../services/familyConnectService';
import {
  AuthServiceError,
  buildSessionFromAuthResponse,
  getCurrentAuthSession,
  logoutAuthSession,
  type AuthSessionResponse,
  type CurrentAuthSession
} from '../services/authService';
import { registerAccessTokenProvider } from '../services/apiClient';
import { queueHealthEvent } from '../services/platformEventService';
import {
  getPlatformHealthProfile,
  getPlatformHealthProfileSyncDiagnostics,
  mergePlatformProfileIntoOnboarding,
  processPendingHealthProfileSync,
  syncPlatformHealthProfile
} from '../services/platformHealthProfileService';
import { getPublishedNutritionPlan } from '../services/nutritionPlanService';
import { getHealthScoreSummary, submitPssAssessment } from '../services/healthIntelligenceService';
import { syncMedicationSnapshot } from '../services/medicationSyncService';
import { normalizeOnboardingProfile } from '../utils/healthProfile';
import { wellnessFromHealthScores } from '../services/healthSyncManager';
import { getIdentityScopedStorageKey, type StorageIdentity } from '../utils/identityScopedStorage';
import { deriveOnboardingGate, type OnboardingResumeStep, type OnboardingStatus } from '../utils/onboardingGate';

type StoredAuthSession = CurrentAuthSession & {
  sessionToken: string;
};

type AppContextValue = {
  bootstrapped: boolean;
  onboardingStatus: OnboardingStatus;
  onboardingResumeStep: OnboardingResumeStep;
  devices: WearableDevice[];
  setDevices: React.Dispatch<React.SetStateAction<WearableDevice[]>>;
  wellness: WellnessSnapshot;
  setWellness: React.Dispatch<React.SetStateAction<WellnessSnapshot>>;
  mood: MoodSelection | null;
  setMood: React.Dispatch<React.SetStateAction<MoodSelection | null>>;
  onboarding: OnboardingProfile | null;
  setOnboarding: React.Dispatch<React.SetStateAction<OnboardingProfile | null>>;
  assessment: AssessmentProfile | null;
  setAssessment: React.Dispatch<React.SetStateAction<AssessmentProfile | null>>;
  authSession: StoredAuthSession | null;
  isAuthenticated: boolean;
  completeAuthentication: (session: AuthSessionResponse) => Promise<void>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  checkIns: DailyCheckIn[];
  submitCheckIn: (checkIn: Omit<DailyCheckIn, 'dateISO'> & { stressLevel?: 1 | 2 | 3 | 4 | 5 }) => Promise<void>;
  hasCheckedInToday: boolean;
  priorityPlan: PriorityPlan | null;
  decisionLogs: DecisionLog[];
  nudges: Nudge[];
  logNudgeAction: (nudgeId: string, action: NudgeAction) => void;
  wearableSyncData: WearableSyncPayload[];
  addWearableSyncData: (payload: WearableSyncPayload) => void;
  themeMode: ThemeMode;
  setThemeMode: React.Dispatch<React.SetStateAction<ThemeMode>>;
  logout: () => void;
  selectedDeviceId: string | null;
  setSelectedDeviceId: React.Dispatch<React.SetStateAction<string | null>>;
  wearableSetupCompleted: boolean;
  setWearableSetupCompleted: React.Dispatch<React.SetStateAction<boolean>>;
  medicationPermissionGranted: boolean;
  medications: Medication[];
  medicationLogs: MedicationLog[];
  requestMedicationPermission: () => Promise<boolean>;
  addMedication: (input: Omit<Medication, 'id' | 'createdAtISO' | 'updatedAtISO' | 'notificationIds'>) => Promise<void>;
  updateMedication: (medicationId: string, patch: Partial<Medication>) => Promise<void>;
  pauseMedication: (medicationId: string) => Promise<void>;
  deleteMedication: (medicationId: string) => Promise<void>;
  markMedicationAction: (params: {
    medicationId: string;
    scheduledForISO: string;
    status: Extract<MedicationLogStatus, 'taken' | 'snoozed' | 'skipped'>;
    snoozeMinutes?: 5 | 10 | 15 | 30;
  }) => Promise<void>;
  getMedicationTimelineForDate: (dateISO: string) => Array<{
    medication: Medication;
    scheduledForISO: string;
    status: MedicationLogStatus;
  }>;
  cycleLogs: CycleLog[];
  cycleNotificationSettings: CycleNotificationSettings;
  cyclePrediction: CyclePrediction;
  requestCyclePermission: () => Promise<boolean>;
  updateCycleNotificationSettings: (patch: Partial<CycleNotificationSettings>) => Promise<void>;
  logCycleForDate: (input: Omit<CycleLog, 'id' | 'createdAtISO' | 'updatedAtISO'>) => Promise<void>;
  getCycleDaySnapshot: (dateISO: string) => {
    phase: CyclePhase;
    isPeriodDay: boolean;
    isPredictedFertile: boolean;
    isPredictedOvulation: boolean;
    log: CycleLog | null;
  };
  getCycleInsights: () => {
    averageCycleLengthDays: number;
    averagePeriodDurationDays: number;
    confidence: CyclePrediction['confidence'];
    consistencyScore: number;
    commonSymptoms: Array<{ symptom: CycleSymptom; count: number }>;
  };
  familyInvites: FamilyInvite[];
  familyConnections: FamilyConnection[];
  familyEmergencyEvents: FamilyEmergencyEvent[];
  generateFamilyInvite: (prefix?: 'FIT' | 'CARE' | 'FTSY') => FamilyInvite;
  requestFamilyConnection: (params: {
    code: string;
    memberName: string;
    relationship: FamilyRelationshipType;
    visibilityLevel?: 'basic_support' | 'wellness_support';
    contactMethod?: 'phone' | 'whatsapp';
    contactValue?: string;
  }) => { ok: boolean; reason?: string; connectionId?: string };
  approveFamilyConnection: (connectionId: string, permissions: FamilyPermissions) => void;
  rejectFamilyConnection: (connectionId: string) => void;
  updateFamilyPermissions: (connectionId: string, permissions: Partial<FamilyPermissions>) => void;
  setFamilySharingPaused: (connectionId: string, paused: boolean) => void;
  disconnectFamilyMember: (connectionId: string) => void;
  sendFamilyPing: (connectionId: string, message: string) => Promise<void>;
  triggerFamilySOS: (connectionId: string, message?: string) => Promise<void>;
  getFamilySummary: (connectionId: string) => FamilyWellnessSummary | null;
  healthProfileSyncDiagnostics: HealthProfileSyncDiagnostics;
  retryPendingHealthProfileSync: () => Promise<void>;
  publishedNutritionPlan: PublishedNutritionPlan | null;
  refreshPublishedNutritionPlan: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const STORAGE_KEYS = {
  onboarding: 'nuetra.onboarding',
  assessment: 'nuetra.assessment',
  auth: 'nuetra.auth',
  theme: 'nuetra.theme',
  selectedDeviceId: 'nuetra.selectedDeviceId',
  wearableSetupCompleted: 'nuetra.wearableSetupCompleted',
  devices: 'nuetra.devices',
  medications: 'nuetra.medications',
  medicationLogs: 'nuetra.medicationLogs',
  medicationPermission: 'nuetra.medicationPermission',
  cycleLogs: 'nuetra.cycleLogs',
  cycleNotificationSettings: 'nuetra.cycleNotificationSettings',
  cyclePermission: 'nuetra.cyclePermission',
  familyInvites: 'nuetra.familyInvites',
  familyConnections: 'nuetra.familyConnections',
  familyEmergencyEvents: 'nuetra.familyEmergencyEvents',
  reportHistory: 'fiteatsy.reportHistory',
  sessionSignals: 'fiteatsy.sessionSignals.v1',
  platformActiveCareCase: 'fiteatsy.platform.activeCareCase.v1',
  platformSyncQueue: 'fiteatsy.platform.syncQueue.v1'
} as const;

const USER_SCOPED_STORAGE_KEYS = [
  STORAGE_KEYS.onboarding,
  STORAGE_KEYS.assessment,
  STORAGE_KEYS.selectedDeviceId,
  STORAGE_KEYS.wearableSetupCompleted,
  STORAGE_KEYS.devices,
  STORAGE_KEYS.medications,
  STORAGE_KEYS.medicationLogs,
  STORAGE_KEYS.medicationPermission,
  STORAGE_KEYS.cycleLogs,
  STORAGE_KEYS.cycleNotificationSettings,
  STORAGE_KEYS.cyclePermission,
  STORAGE_KEYS.familyInvites,
  STORAGE_KEYS.familyConnections,
  STORAGE_KEYS.familyEmergencyEvents,
  STORAGE_KEYS.reportHistory,
  STORAGE_KEYS.sessionSignals,
  STORAGE_KEYS.platformActiveCareCase,
  STORAGE_KEYS.platformSyncQueue
] as const;

const toSessionStorageIdentity = (session: StoredAuthSession | null): StorageIdentity | null =>
  session
    ? {
        userId: session.accountId,
        clientId: session.client.fiteatsyClientId
      }
    : null;

const getSessionScopedKey = (baseKey: string, session: StoredAuthSession | null) =>
  getIdentityScopedStorageKey(baseKey, toSessionStorageIdentity(session));

const removeUserStorage = (session: StoredAuthSession | null) => {
  const legacyKeys = USER_SCOPED_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key));
  const scopedKeys = USER_SCOPED_STORAGE_KEYS.map((key) => {
    const scopedKey = getSessionScopedKey(key, session);
    return scopedKey ? AsyncStorage.removeItem(scopedKey) : Promise.resolve();
  });
  return Promise.all([...legacyKeys, ...scopedKeys]);
};

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>('NOT_STARTED');
  const [onboardingResumeStep, setOnboardingResumeStep] = useState<OnboardingResumeStep>('basics');
  const [devices, setDevicesState] = useState<WearableDevice[]>([]);
  const [wellness, setWellnessState] = useState<WellnessSnapshot>(initialWellness);
  const [mood, setMood] = useState<MoodSelection | null>(null);
  const [onboarding, setOnboardingState] = useState<OnboardingProfile | null>(null);
  const [assessment, setAssessmentState] = useState<AssessmentProfile | null>(null);
  const [authSession, setAuthSessionState] = useState<StoredAuthSession | null>(null);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [wearableSyncData, setWearableSyncData] = useState<WearableSyncPayload[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [wearableSetupCompleted, setWearableSetupCompletedState] = useState(false);
  const [medicationPermissionGranted, setMedicationPermissionGranted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [cycleLogs, setCycleLogs] = useState<CycleLog[]>([]);
  const [cyclePermissionGranted, setCyclePermissionGranted] = useState(false);
  const [cycleNotificationSettings, setCycleNotificationSettings] = useState<CycleNotificationSettings>({
    enabled: false,
    reminderTime24h: '20:00',
    notificationIds: []
  });
  const [familyInvites, setFamilyInvites] = useState<FamilyInvite[]>([]);
  const [familyConnections, setFamilyConnections] = useState<FamilyConnection[]>([]);
  const [familyEmergencyEvents, setFamilyEmergencyEvents] = useState<FamilyEmergencyEvent[]>([]);
  const [healthProfileSyncDiagnostics, setHealthProfileSyncDiagnosticsState] = useState<HealthProfileSyncDiagnostics>({
    status: 'synced',
    lastAttemptAt: null,
    lastSuccessAt: null,
    retryCount: 0
  });
  const [publishedNutritionPlan, setPublishedNutritionPlan] = useState<PublishedNutritionPlan | null>(null);
  const userId = authSession?.accountId ?? '';
  const clientId = authSession?.client.fiteatsyClientId ?? '';
  const isAuthenticated = authSession !== null;

  const getUserStorageKey = useCallback(
    (baseKey: string) => getSessionScopedKey(baseKey, authSession),
    [authSession]
  );

  const currentStorageIdentity = useMemo(
    () => (authSession ? { userId: authSession.accountId, clientId: authSession.client.fiteatsyClientId } : null),
    [authSession]
  );

  const refreshHealthProfileSyncDiagnostics = useCallback(async (identity = currentStorageIdentity) => {
    const diagnostics = await getPlatformHealthProfileSyncDiagnostics(identity);
    setHealthProfileSyncDiagnosticsState(diagnostics);
    return diagnostics;
  }, [currentStorageIdentity]);

  const retryPendingHealthProfileSync = useCallback(async () => {
    if (!currentStorageIdentity) return;
    await processPendingHealthProfileSync(currentStorageIdentity);
    await refreshHealthProfileSyncDiagnostics(currentStorageIdentity);
  }, [currentStorageIdentity, refreshHealthProfileSyncDiagnostics]);

  const refreshPublishedNutritionPlan = useCallback(async () => {
    if (!authSession) {
      setPublishedNutritionPlan(null);
      return;
    }
    try {
      const plan = await getPublishedNutritionPlan();
      setPublishedNutritionPlan(plan);
    } catch (error) {
      if (error instanceof Error && /still being prepared|not found/i.test(error.message)) {
        setPublishedNutritionPlan(null);
        return;
      }
      console.warn('[AppContext] published nutrition plan refresh skipped', {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      setPublishedNutritionPlan(null);
    }
  }, [authSession]);

  const setUserStorageItem = useCallback(
    (baseKey: string, value: string) => {
      const scopedKey = getUserStorageKey(baseKey);
      if (scopedKey) {
        AsyncStorage.setItem(scopedKey, value);
      }
    },
    [getUserStorageKey]
  );

  const removeUserStorageItem = useCallback(
    (baseKey: string) => {
      const scopedKey = getUserStorageKey(baseKey);
      if (scopedKey) {
        AsyncStorage.removeItem(scopedKey);
      }
    },
    [getUserStorageKey]
  );

  const clearPersistedAuth = useCallback((sessionToClear: StoredAuthSession | null = null) => {
    setAuthSessionState(null);
    setOnboardingStatus('NOT_STARTED');
    setOnboardingResumeStep('basics');
    AsyncStorage.removeItem(STORAGE_KEYS.auth);
    void removeUserStorage(sessionToClear);
  }, []);

  const persistAuthSession = useCallback((session: StoredAuthSession | null) => {
    setAuthSessionState(session);
    if (session) {
      AsyncStorage.setItem(STORAGE_KEYS.auth, JSON.stringify(session));
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.auth);
    }
  }, []);

  const completeAuthentication = useCallback(async (session: AuthSessionResponse) => {
    const fallback = buildSessionFromAuthResponse(session);
    if (fallback) {
      persistAuthSession({
        ...fallback,
        sessionToken: session.sessionToken
      });
    }

    try {
      const current = await getCurrentAuthSession(session.sessionToken);
      persistAuthSession({
        ...current,
        sessionToken: session.sessionToken
      });
      const remoteBundle = await getPlatformHealthProfile(session.sessionToken);
      const gate = deriveOnboardingGate(remoteBundle.profile);
      setOnboardingStatus(gate.status);
      setOnboardingResumeStep(gate.resumeStep);
    } catch (error) {
      if (!fallback) throw error;
      setOnboardingStatus('NOT_STARTED');
      setOnboardingResumeStep('basics');
      console.warn('[AppContext] auth/me refresh deferred after fresh login', {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }, [persistAuthSession]);

  useEffect(() => {
    registerAccessTokenProvider(() => authSession?.sessionToken ?? null);
  }, [authSession]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await initMedicationNotifications();

        const [storedAuth, storedTheme] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.auth),
          AsyncStorage.getItem(STORAGE_KEYS.theme)
        ]);

        if (storedTheme === 'light' || storedTheme === 'dark') {
          setThemeModeState(storedTheme);
        }

        let sessionForStorage: StoredAuthSession | null = null;
        if (storedAuth) {
          const parsed = safeParse<StoredAuthSession | null>(storedAuth, null);
          if (parsed?.sessionToken) {
            setAuthSessionState(parsed);
            sessionForStorage = parsed;
            try {
              const refreshed = await getCurrentAuthSession(parsed.sessionToken);
              sessionForStorage = {
                ...refreshed,
                sessionToken: parsed.sessionToken
              };
              persistAuthSession(sessionForStorage);
            } catch (error) {
              if (
                error instanceof AuthServiceError &&
                (error.code === 'NETWORK_OFFLINE' || error.code === 'SERVER_ERROR')
              ) {
                setAuthSessionState(parsed);
              } else {
                clearPersistedAuth(parsed);
                sessionForStorage = null;
              }
            }
          }
        }

        if (!sessionForStorage) {
          setOnboardingStatus('NOT_STARTED');
          setOnboardingResumeStep('basics');
          return;
        }

        const readScoped = (key: string) => {
          const scopedKey = getSessionScopedKey(key, sessionForStorage);
          return scopedKey ? AsyncStorage.getItem(scopedKey) : Promise.resolve(null);
        };

        const [
          storedOnboarding,
          storedAssessment,
          storedSelectedDeviceId,
          storedWearableSetupCompleted,
          storedDevices,
          storedMedications,
          storedMedicationLogs,
          storedMedicationPermission,
          storedCycleLogs,
          storedCycleSettings,
          storedCyclePermission,
          storedFamilyInvites,
          storedFamilyConnections,
          storedFamilyEmergencyEvents
        ] = await Promise.all([
          readScoped(STORAGE_KEYS.onboarding),
          readScoped(STORAGE_KEYS.assessment),
          readScoped(STORAGE_KEYS.selectedDeviceId),
          readScoped(STORAGE_KEYS.wearableSetupCompleted),
          readScoped(STORAGE_KEYS.devices),
          readScoped(STORAGE_KEYS.medications),
          readScoped(STORAGE_KEYS.medicationLogs),
          readScoped(STORAGE_KEYS.medicationPermission),
          readScoped(STORAGE_KEYS.cycleLogs),
          readScoped(STORAGE_KEYS.cycleNotificationSettings),
          readScoped(STORAGE_KEYS.cyclePermission),
          readScoped(STORAGE_KEYS.familyInvites),
          readScoped(STORAGE_KEYS.familyConnections),
          readScoped(STORAGE_KEYS.familyEmergencyEvents)
        ]);

        if (storedOnboarding) {
          const parsed = safeParse<OnboardingProfile | null>(storedOnboarding, null);
          if (parsed && typeof parsed === 'object') {
            const normalized = normalizeOnboardingProfile(parsed);
            setOnboardingState(normalized);
            const scopedKey = getSessionScopedKey(STORAGE_KEYS.onboarding, sessionForStorage);
            if (scopedKey) {
              AsyncStorage.setItem(scopedKey, JSON.stringify(normalized));
            }
          }
        }
        if (storedAssessment) {
          const parsed = safeParse<AssessmentProfile | null>(storedAssessment, null);
          if (parsed && typeof parsed === 'object') setAssessmentState(parsed);
        }
        try {
          await processPendingHealthProfileSync(toSessionStorageIdentity(sessionForStorage));
          const remoteBundle = await getPlatformHealthProfile();
          const gate = deriveOnboardingGate(remoteBundle.profile);
          setOnboardingStatus(gate.status);
          setOnboardingResumeStep(gate.resumeStep);
          setOnboardingState((previous) => {
            const baseProfile = previous ?? normalizeOnboardingProfile({
              name: sessionForStorage?.user.name ?? 'Fiteatsy Client',
              createdAtISO: new Date().toISOString()
            });
            const normalized = normalizeOnboardingProfile(mergePlatformProfileIntoOnboarding(baseProfile, remoteBundle.profile));
            const scopedKey = getSessionScopedKey(STORAGE_KEYS.onboarding, sessionForStorage);
            if (scopedKey) {
              AsyncStorage.setItem(scopedKey, JSON.stringify(normalized));
            }
            return normalized;
          });
          setAssessmentState((previous) => {
            const next = {
              ...(previous ?? {
                completedAtISO: new Date().toISOString(),
                goal: 'Become Better' as const,
                mood: 'Neutral' as const,
                soughtHelpBefore: 'No' as const,
                physicalDistress: 'No' as const,
                sleepQuality: 'Fair' as const,
                stressLevel: 3 as const,
                voiceReflection: ''
              }),
              heightCm: remoteBundle.profile.heightCm ?? previous?.heightCm ?? 0,
              weightKg: remoteBundle.profile.currentWeightKg ?? previous?.weightKg ?? 0
            };
            const scopedKey = getSessionScopedKey(STORAGE_KEYS.assessment, sessionForStorage);
            if (scopedKey) {
              AsyncStorage.setItem(scopedKey, JSON.stringify(next));
            }
            return next;
          });
          const diagnostics = await getPlatformHealthProfileSyncDiagnostics(toSessionStorageIdentity(sessionForStorage));
          setHealthProfileSyncDiagnosticsState(diagnostics);
          try {
            const plan = await getPublishedNutritionPlan();
            setPublishedNutritionPlan(plan);
          } catch (error) {
            if (!(error instanceof Error) || !/still being prepared|not found/i.test(error.message)) {
              console.warn('[AppContext] published nutrition plan bootstrap skipped', {
                errorMessage: error instanceof Error ? error.message : String(error)
              });
            }
            setPublishedNutritionPlan(null);
          }
        } catch (error) {
          console.warn('[AppContext] platform health profile hydration skipped', {
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          const diagnostics = await getPlatformHealthProfileSyncDiagnostics(toSessionStorageIdentity(sessionForStorage));
          setHealthProfileSyncDiagnosticsState(diagnostics);
          setPublishedNutritionPlan(null);
          setOnboardingStatus('IN_PROGRESS');
          setOnboardingResumeStep('basics');
        }
        if (storedSelectedDeviceId) {
          setSelectedDeviceIdState(storedSelectedDeviceId);
        }
        if (storedWearableSetupCompleted) {
          setWearableSetupCompletedState(storedWearableSetupCompleted === '1');
        }
        if (storedDevices) {
          const parsed = safeParse<WearableDevice[]>(storedDevices, []);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDevicesState(parsed);
          }
        }
        if (storedMedications) {
          const parsed = safeParse<Medication[]>(storedMedications, []);
          if (Array.isArray(parsed)) setMedications(parsed);
        }
        if (storedMedicationLogs) {
          const parsed = safeParse<MedicationLog[]>(storedMedicationLogs, []);
          if (Array.isArray(parsed)) setMedicationLogs(parsed);
        }
        if (storedMedicationPermission === '1') {
          setMedicationPermissionGranted(true);
        }
        if (storedCycleLogs) {
          const parsed = safeParse<CycleLog[]>(storedCycleLogs, []);
          if (Array.isArray(parsed)) setCycleLogs(parsed);
        }
        if (storedCycleSettings) {
          const parsed = safeParse<Partial<CycleNotificationSettings>>(storedCycleSettings, {});
          if (parsed && typeof parsed === 'object') {
            setCycleNotificationSettings({
              enabled: Boolean(parsed.enabled),
              reminderTime24h: typeof parsed.reminderTime24h === 'string' ? parsed.reminderTime24h : '20:00',
              notificationIds: Array.isArray(parsed.notificationIds) ? parsed.notificationIds : []
            });
          }
        }
        if (storedCyclePermission === '1') {
          setCyclePermissionGranted(true);
        }
        if (storedFamilyInvites) {
          const parsed = safeParse<FamilyInvite[]>(storedFamilyInvites, []);
          if (Array.isArray(parsed)) setFamilyInvites(parsed);
        }
        if (storedFamilyConnections) {
          const parsed = safeParse<FamilyConnection[]>(storedFamilyConnections, []);
          if (Array.isArray(parsed)) setFamilyConnections(parsed);
        }
        if (storedFamilyEmergencyEvents) {
          const parsed = safeParse<FamilyEmergencyEvent[]>(storedFamilyEmergencyEvents, []);
          if (Array.isArray(parsed)) setFamilyEmergencyEvents(parsed);
        }
      } finally {
        setBootstrapped(true);
      }
    };

    bootstrap();
  }, [clearPersistedAuth, persistAuthSession]);

  const setOnboarding = useCallback<React.Dispatch<React.SetStateAction<OnboardingProfile | null>>>(
    (updater) => {
      setOnboardingState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        if (next) {
          const normalized = normalizeOnboardingProfile(next);
          setUserStorageItem(STORAGE_KEYS.onboarding, JSON.stringify(normalized));
          if (userId) {
            void queueHealthEvent({
              userId,
              clientId,
              onboarding: normalized,
              eventType: previous ? 'profile_updated' : 'profile_created',
              eventSource: 'mobile.onboarding',
              eventPayload: {
                careTrack: normalized.careTrack,
                gender: normalized.gender,
                wearablePreference: normalized.wearablePreference,
                primaryGoal: normalized.primaryGoal ?? null,
                secondaryGoals: normalized.secondaryGoals
              }
            });
            void syncPlatformHealthProfile(normalized, assessment, currentStorageIdentity).finally(() => {
              void refreshHealthProfileSyncDiagnostics(currentStorageIdentity);
            }).catch(() => undefined);
          }
          return normalized;
        } else {
          removeUserStorageItem(STORAGE_KEYS.onboarding);
        }
        return next;
      });
    },
    [assessment, clientId, currentStorageIdentity, refreshHealthProfileSyncDiagnostics, removeUserStorageItem, setUserStorageItem, userId]
  );

  const setAssessment = useCallback<React.Dispatch<React.SetStateAction<AssessmentProfile | null>>>(
    (updater) => {
      setAssessmentState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        if (next) {
          setUserStorageItem(STORAGE_KEYS.assessment, JSON.stringify(next));
          if (userId) {
            void queueHealthEvent({
              userId,
              clientId,
              onboarding,
              eventType: 'assessment_completed',
              eventSource: 'mobile.assessment',
              eventPayload: {
                goal: next.goal,
                stressLevel: next.stressLevel,
                sleepQuality: next.sleepQuality,
                physicalDistress: next.physicalDistress
              }
            });
            void syncPlatformHealthProfile(onboarding, next, currentStorageIdentity).finally(() => {
              void refreshHealthProfileSyncDiagnostics(currentStorageIdentity);
            }).catch(() => undefined);
          }
        } else {
          removeUserStorageItem(STORAGE_KEYS.assessment);
        }
        return next;
      });
    },
    [clientId, currentStorageIdentity, onboarding, refreshHealthProfileSyncDiagnostics, removeUserStorageItem, setUserStorageItem, userId]
  );

  const setIsAuthenticated = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(authSession !== null) : updater;
      if (!next) {
        clearPersistedAuth(authSession);
      }
    },
    [authSession, clearPersistedAuth]
  );

  const setThemeMode = useCallback<React.Dispatch<React.SetStateAction<ThemeMode>>>(
    (updater) => {
      setThemeModeState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        AsyncStorage.setItem(STORAGE_KEYS.theme, next);
        return next;
      });
    },
    []
  );

  const setSelectedDeviceId = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (updater) => {
      setSelectedDeviceIdState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        if (next) {
          setUserStorageItem(STORAGE_KEYS.selectedDeviceId, next);
        } else {
          removeUserStorageItem(STORAGE_KEYS.selectedDeviceId);
        }
        return next;
      });
    },
    [removeUserStorageItem, setUserStorageItem]
  );

  const setWearableSetupCompleted = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (updater) => {
      setWearableSetupCompletedState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        setUserStorageItem(STORAGE_KEYS.wearableSetupCompleted, next ? '1' : '0');
        return next;
      });
    },
    [setUserStorageItem]
  );

  const setDevices = useCallback<React.Dispatch<React.SetStateAction<WearableDevice[]>>>(
    (updater) => {
      setDevicesState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        setUserStorageItem(STORAGE_KEYS.devices, JSON.stringify(next));
        return next;
      });
    },
    [setUserStorageItem]
  );

  const persistMedications = useCallback((next: Medication[]) => {
    setUserStorageItem(STORAGE_KEYS.medications, JSON.stringify(next));
  }, [setUserStorageItem]);

  const persistMedicationLogs = useCallback((next: MedicationLog[]) => {
    setUserStorageItem(STORAGE_KEYS.medicationLogs, JSON.stringify(next));
  }, [setUserStorageItem]);

  const syncMedicationStateToBackend = useCallback((nextMedications: Medication[], nextLogs: MedicationLog[]) => {
    if (!userId || !authSession?.sessionToken) return;
    void syncMedicationSnapshot(nextMedications, nextLogs).catch((error) => {
      console.warn('[MedicationSync] Snapshot sync failed', {
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }, [authSession?.sessionToken, userId]);

  const persistCycleLogs = useCallback((next: CycleLog[]) => {
    setUserStorageItem(STORAGE_KEYS.cycleLogs, JSON.stringify(next));
  }, [setUserStorageItem]);

  const persistCycleNotificationSettings = useCallback((next: CycleNotificationSettings) => {
    setUserStorageItem(STORAGE_KEYS.cycleNotificationSettings, JSON.stringify(next));
  }, [setUserStorageItem]);
  const persistFamilyInvites = useCallback((next: FamilyInvite[]) => {
    setUserStorageItem(STORAGE_KEYS.familyInvites, JSON.stringify(next));
  }, [setUserStorageItem]);
  const persistFamilyConnections = useCallback((next: FamilyConnection[]) => {
    setUserStorageItem(STORAGE_KEYS.familyConnections, JSON.stringify(next));
  }, [setUserStorageItem]);
  const persistFamilyEmergencyEvents = useCallback((next: FamilyEmergencyEvent[]) => {
    setUserStorageItem(STORAGE_KEYS.familyEmergencyEvents, JSON.stringify(next));
  }, [setUserStorageItem]);

  const requestMedicationPermission = useCallback(async () => {
    const granted = await requestMedicationNotificationPermissions();
    setMedicationPermissionGranted(granted);
    setUserStorageItem(STORAGE_KEYS.medicationPermission, granted ? '1' : '0');
    return granted;
  }, [setUserStorageItem]);

  const cyclePrediction = useMemo(() => buildCyclePrediction(cycleLogs), [cycleLogs]);

  const requestCyclePermission = useCallback(async () => {
    const granted = await requestMedicationNotificationPermissions();
    setCyclePermissionGranted(granted);
    setUserStorageItem(STORAGE_KEYS.cyclePermission, granted ? '1' : '0');
    return granted;
  }, [setUserStorageItem]);

  const updateCycleNotificationSettings = useCallback<AppContextValue['updateCycleNotificationSettings']>(
    async (patch) => {
      const next = { ...cycleNotificationSettings, ...patch };
      if (next.notificationIds.length > 0) {
        await clearCycleNotifications(next.notificationIds);
      }
      let notificationIds: string[] = [];
      if (next.enabled && cyclePermissionGranted) {
        notificationIds = await scheduleCycleNotifications({
          reminderTime24h: next.reminderTime24h,
          prediction: cyclePrediction
        });
      }
      const hydrated = { ...next, notificationIds };
      setCycleNotificationSettings(hydrated);
      persistCycleNotificationSettings(hydrated);
    },
    [cycleNotificationSettings, cyclePermissionGranted, cyclePrediction, persistCycleNotificationSettings]
  );

  const logCycleForDate = useCallback<AppContextValue['logCycleForDate']>(
    async (input) => {
      const day = new Date(input.dateISO);
      const normalizedISO = new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString();
      const now = new Date().toISOString();
      setCycleLogs((previous) => {
        const existing = previous.find((log) => toDayKey(log.dateISO) === toDayKey(normalizedISO));
        const nextLog: CycleLog = existing
          ? { ...existing, ...input, dateISO: normalizedISO, updatedAtISO: now }
          : { ...input, id: `cycle-${Date.now()}`, dateISO: normalizedISO, createdAtISO: now, updatedAtISO: now };
        const next = [nextLog, ...previous.filter((log) => toDayKey(log.dateISO) !== toDayKey(normalizedISO))].slice(0, 800);
        persistCycleLogs(next);
        return next;
      });
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: 'cycle_logged',
          eventSource: 'mobile.cycle',
          eventPayload: {
            dateISO: normalizedISO,
            flow: input.flow ?? null,
            symptoms: input.symptoms,
            notes: input.notes ?? ''
          },
          priority: 'medium'
        });
      }
    },
    [clientId, onboarding, persistCycleLogs, userId]
  );

  const getCycleDaySnapshot = useCallback<AppContextValue['getCycleDaySnapshot']>(
    (dateISO) => {
      const dayKey = toDayKey(dateISO);
      const log = cycleLogs.find((item) => toDayKey(item.dateISO) === dayKey) ?? null;
      const phase = getPhaseForDate(cycleLogs, dateISO, cyclePrediction);
      const isPeriodDay = Boolean(log?.flow || log?.periodStarted);
      const isPredictedFertile =
        Boolean(cyclePrediction.predictedFertileStartISO) &&
        Boolean(cyclePrediction.predictedFertileEndISO) &&
        toDayKey(dateISO) >= toDayKey(cyclePrediction.predictedFertileStartISO ?? dateISO) &&
        toDayKey(dateISO) <= toDayKey(cyclePrediction.predictedFertileEndISO ?? dateISO);
      const isPredictedOvulation =
        Boolean(cyclePrediction.predictedOvulationISO) &&
        toDayKey(dateISO) === toDayKey(cyclePrediction.predictedOvulationISO ?? dateISO);

      return { phase, isPeriodDay, isPredictedFertile, isPredictedOvulation, log };
    },
    [cycleLogs, cyclePrediction]
  );

  const getCycleInsights = useCallback<AppContextValue['getCycleInsights']>(
    () => ({
      averageCycleLengthDays: cyclePrediction.averageCycleLengthDays,
      averagePeriodDurationDays: cyclePrediction.averagePeriodDurationDays,
      confidence: cyclePrediction.confidence,
      consistencyScore: cyclePrediction.consistencyScore,
      commonSymptoms: getMostCommonSymptoms(cycleLogs)
    }),
    [cycleLogs, cyclePrediction]
  );

  useEffect(() => {
    const syncCycleNotifications = async () => {
      if (!cycleNotificationSettings.enabled || !cyclePermissionGranted) return;
      const ids = await scheduleCycleNotifications({
        reminderTime24h: cycleNotificationSettings.reminderTime24h,
        prediction: cyclePrediction
      });
      if (cycleNotificationSettings.notificationIds.length > 0) {
        await clearCycleNotifications(cycleNotificationSettings.notificationIds);
      }
      const next = { ...cycleNotificationSettings, notificationIds: ids };
      setCycleNotificationSettings(next);
      persistCycleNotificationSettings(next);
    };
    syncCycleNotifications();
    // intentionally track cycle prediction and reminder time changes
  }, [cyclePrediction, cyclePermissionGranted, cycleNotificationSettings.enabled, cycleNotificationSettings.reminderTime24h]);

  const generateFamilyInvite = useCallback<AppContextValue['generateFamilyInvite']>(
    (prefix = 'FIT') => {
      const now = new Date();
      const invite: FamilyInvite = {
        code: generateInviteCode(prefix),
        createdAtISO: now.toISOString(),
        expiresAtISO: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        createdByUserId: userId,
        usedByUserId: null,
        revoked: false
      };
      setFamilyInvites((previous) => {
        const next = [invite, ...previous].slice(0, 40);
        persistFamilyInvites(next);
        return next;
      });
      return invite;
    },
    [persistFamilyInvites]
  );

  const requestFamilyConnection = useCallback<AppContextValue['requestFamilyConnection']>(
    ({ code, memberName, relationship, visibilityLevel = 'basic_support', contactMethod, contactValue }) => {
      const normalized = normalizeInviteCode(code);
      if (!validateInviteCode(normalized)) return { ok: false, reason: 'Invalid invite code format.' };
      const invite = familyInvites.find((item) => item.code === normalized && !item.revoked);
      if (!invite) return { ok: false, reason: 'Invite code not found or expired.' };
      if (new Date(invite.expiresAtISO).getTime() < Date.now()) return { ok: false, reason: 'Invite code expired.' };
      if (familyConnections.some((item) => item.inviteCode === normalized && item.status !== 'disconnected')) {
        return { ok: false, reason: 'Connection request already exists.' };
      }

      const now = new Date().toISOString();
      const connection: FamilyConnection = {
        id: `fam-${Date.now()}`,
        memberName: memberName.trim() || 'Family Member',
        relationship,
        role: 'connected_member',
        status: 'pending_outgoing',
        inviteCode: normalized,
        permissions: defaultFamilyPermissions(),
        visibilityLevel,
        contactMethod,
        contactValue,
        sharingPaused: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        lastCheckInISO: null,
        createdAtISO: now,
        updatedAtISO: now
      };
      setFamilyConnections((previous) => {
        const next = [connection, ...previous];
        persistFamilyConnections(next);
        return next;
      });
      return { ok: true, connectionId: connection.id };
    },
    [familyConnections, familyInvites, persistFamilyConnections]
  );

  const approveFamilyConnection = useCallback<AppContextValue['approveFamilyConnection']>(
    (connectionId, permissions) => {
      setFamilyConnections((previous) => {
        const next = previous.map((item) =>
          item.id === connectionId ? { ...item, status: 'connected' as const, permissions, updatedAtISO: new Date().toISOString() } : item
        );
        persistFamilyConnections(next);
        return next;
      });
    },
    [persistFamilyConnections]
  );

  const rejectFamilyConnection = useCallback<AppContextValue['rejectFamilyConnection']>(
    (connectionId) => {
      setFamilyConnections((previous) => {
        const next = previous.map((item) =>
          item.id === connectionId ? { ...item, status: 'rejected' as const, updatedAtISO: new Date().toISOString() } : item
        );
        persistFamilyConnections(next);
        return next;
      });
    },
    [persistFamilyConnections]
  );

  const updateFamilyPermissions = useCallback<AppContextValue['updateFamilyPermissions']>(
    (connectionId, permissions) => {
      setFamilyConnections((previous) => {
        const next = previous.map((item) =>
          item.id === connectionId
            ? { ...item, permissions: { ...item.permissions, ...permissions }, updatedAtISO: new Date().toISOString() }
            : item
        );
        persistFamilyConnections(next);
        return next;
      });
    },
    [persistFamilyConnections]
  );

  const setFamilySharingPaused = useCallback<AppContextValue['setFamilySharingPaused']>(
    (connectionId, paused) => {
      setFamilyConnections((previous) => {
        const next = previous.map((item) =>
          item.id === connectionId ? { ...item, sharingPaused: paused, updatedAtISO: new Date().toISOString() } : item
        );
        persistFamilyConnections(next);
        return next;
      });
    },
    [persistFamilyConnections]
  );

  const disconnectFamilyMember = useCallback<AppContextValue['disconnectFamilyMember']>(
    (connectionId) => {
      setFamilyConnections((previous) => {
        const next = previous.map((item) =>
          item.id === connectionId ? { ...item, status: 'disconnected' as const, sharingPaused: true, updatedAtISO: new Date().toISOString() } : item
        );
        persistFamilyConnections(next);
        return next;
      });
    },
    [persistFamilyConnections]
  );

  const sendFamilyPing = useCallback<AppContextValue['sendFamilyPing']>(
    async (connectionId, message) => {
      const createdAtISO = new Date().toISOString();
      const event: FamilyEmergencyEvent = {
        id: `fam-evt-${Date.now()}`,
        connectionId,
        type: 'check_in_ping',
        message,
        createdAtISO,
        delivery: 'sent'
      };
      setFamilyEmergencyEvents((previous) => {
        const next = [event, ...previous].slice(0, 200);
        persistFamilyEmergencyEvents(next);
        return next;
      });
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Family check-in sent', body: message, sound: 'default', data: { type: 'family_ping', connectionId } },
        trigger: null
      });
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: 'family_ping_sent',
          eventSource: 'mobile.family',
          eventPayload: {
            connectionId,
            message
          }
        });
      }
    },
    [clientId, onboarding, persistFamilyEmergencyEvents, userId]
  );

  const triggerFamilySOS = useCallback<AppContextValue['triggerFamilySOS']>(
    async (connectionId, message = 'SOS: Please check in immediately.') => {
      const createdAtISO = new Date().toISOString();
      const event: FamilyEmergencyEvent = {
        id: `fam-evt-${Date.now()}`,
        connectionId,
        type: 'sos',
        message,
        createdAtISO,
        delivery: 'sent'
      };
      setFamilyEmergencyEvents((previous) => {
        const next = [event, ...previous].slice(0, 200);
        persistFamilyEmergencyEvents(next);
        return next;
      });
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Emergency alert sent', body: message, sound: 'default', data: { type: 'family_sos', connectionId } },
        trigger: null
      });
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: 'family_sos_triggered',
          eventSource: 'mobile.family',
          eventPayload: {
            connectionId,
            message
          },
          priority: 'high',
          shouldEvaluateTicket: true
        });
      }
    },
    [clientId, onboarding, persistFamilyEmergencyEvents, userId]
  );

  const getFamilySummary = useCallback<AppContextValue['getFamilySummary']>(
    (connectionId) => {
      const connection = familyConnections.find((item) => item.id === connectionId && item.status === 'connected');
      if (!connection || connection.sharingPaused) return null;
      return buildFamilySummary({
        connection,
        medications,
        medicationLogs,
        wellness,
        checkIns
      });
    },
    [checkIns, familyConnections, medicationLogs, medications, wellness]
  );

  const addMedication = useCallback<AppContextValue['addMedication']>(
    async (input) => {
      const nowISO = new Date().toISOString();
      const medication: Medication = {
        ...input,
        id: `med-${Date.now()}`,
        createdAtISO: nowISO,
        updatedAtISO: nowISO,
        notificationIds: []
      };

      let notificationIds: string[] = [];
      if (medicationPermissionGranted) {
        notificationIds = await scheduleMedicationNotifications(medication);
      }

      const withNotifications = { ...medication, notificationIds };
      setMedications((previous) => {
        const next = [withNotifications, ...previous];
        persistMedications(next);
        syncMedicationStateToBackend(next, medicationLogs);
        return next;
      });
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: 'medication_added',
          eventSource: 'mobile.medication',
          eventPayload: {
            medicationId: medication.id,
            name: medication.name,
            schedule: medication.schedule,
            status: medication.status
          },
          priority: 'medium'
        });
      }
    },
    [clientId, medicationLogs, medicationPermissionGranted, onboarding, persistMedications, syncMedicationStateToBackend, userId]
  );

  const updateMedication = useCallback<AppContextValue['updateMedication']>(
    async (medicationId, patch) => {
      const existing = medications.find((m) => m.id === medicationId);
      if (!existing) return;

      await clearScheduledMedicationNotifications(existing.notificationIds);
      const candidate: Medication = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAtISO: new Date().toISOString(),
        notificationIds: []
      };

      const nextNotificationIds =
        medicationPermissionGranted && candidate.status === 'active' ? await scheduleMedicationNotifications(candidate) : [];
      const hydrated = { ...candidate, notificationIds: nextNotificationIds };

      setMedications((previous) => {
        const next = previous.map((item) => (item.id === medicationId ? hydrated : item));
        persistMedications(next);
        syncMedicationStateToBackend(next, medicationLogs);
        return next;
      });
    },
    [medicationLogs, medicationPermissionGranted, medications, persistMedications, syncMedicationStateToBackend]
  );

  const pauseMedication = useCallback<AppContextValue['pauseMedication']>(
    async (medicationId) => {
      const existing = medications.find((m) => m.id === medicationId);
      if (!existing) return;
      await clearScheduledMedicationNotifications(existing.notificationIds);
      await updateMedication(medicationId, { status: 'paused', notificationIds: [] });
    },
    [medications, updateMedication]
  );

  const deleteMedication = useCallback<AppContextValue['deleteMedication']>(
    async (medicationId) => {
      const existing = medications.find((m) => m.id === medicationId);
      if (!existing) return;
      await clearScheduledMedicationNotifications(existing.notificationIds);

      setMedications((previous) => {
        const next = previous.filter((item) => item.id !== medicationId);
        persistMedications(next);
        syncMedicationStateToBackend(next, medicationLogs.filter((item) => item.medicationId !== medicationId));
        return next;
      });
      setMedicationLogs((previous) => {
        const next = previous.filter((item) => item.medicationId !== medicationId);
        persistMedicationLogs(next);
        return next;
      });
    },
    [medicationLogs, medications, persistMedicationLogs, persistMedications, syncMedicationStateToBackend]
  );

  const markMedicationAction = useCallback<AppContextValue['markMedicationAction']>(
    async ({ medicationId, scheduledForISO, status, snoozeMinutes }) => {
      const medication = medications.find((item) => item.id === medicationId);
      if (!medication) return;

      const slot = resolveMedicationSlotForOccurrence(medication, scheduledForISO);
      const log: MedicationLog = {
        id: buildLogId(medicationId, slot, scheduledForISO),
        medicationId,
        scheduledForISO,
        status,
        actionedAtISO: new Date().toISOString(),
        snoozedUntilISO: null
      };

      if (status === 'snoozed' && snoozeMinutes) {
        const snoozedUntilISO = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
        log.snoozedUntilISO = snoozedUntilISO;
        await scheduleSnoozeNotification(medication.name, medication.id, snoozeMinutes);
      }

      setMedicationLogs((previous) => {
        const withoutSame = previous.filter((item) => !(item.medicationId === medicationId && item.scheduledForISO === scheduledForISO));
        const next = [log, ...withoutSame].slice(0, 2000);
        persistMedicationLogs(next);
        syncMedicationStateToBackend(medications, next);
        return next;
      });
      const eventTypeByStatus: Record<Extract<MedicationLogStatus, 'taken' | 'snoozed' | 'skipped'>, 'medication_taken' | 'medication_snoozed' | 'medication_skipped'> = {
        taken: 'medication_taken',
        snoozed: 'medication_snoozed',
        skipped: 'medication_skipped'
      };
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: eventTypeByStatus[status],
          eventSource: 'mobile.medication',
          eventPayload: {
            medicationId,
            medicationName: medication.name,
            scheduledForISO,
            snoozeMinutes: snoozeMinutes ?? null,
            status
          }
        });
      }
    },
    [clientId, medications, onboarding, persistMedicationLogs, syncMedicationStateToBackend, userId]
  );

  useEffect(() => {
    if (!bootstrapped || !medicationPermissionGranted) return;

    let cancelled = false;
    const reconcile = async () => {
      await cancelAllMedicationScheduledNotifications();
      const refreshed = await Promise.all(
        medications.map(async (medication) => {
          if (medication.status !== 'active') {
            return { ...medication, notificationIds: [] };
          }
          const notificationIds = await scheduleMedicationNotifications(medication);
          return { ...medication, notificationIds };
        })
      );
      if (cancelled) return;
      setMedications(refreshed);
      persistMedications(refreshed);
    };

    reconcile();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, medicationPermissionGranted, medications.length, persistMedications]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const action = response.actionIdentifier;
      const data = response.notification.request.content.data as { medicationId?: string; scheduledForISO?: string } | undefined;
      if (!data?.medicationId || !data?.scheduledForISO) return;

      if (action === 'TAKEN') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'taken' });
      } else if (action === 'SKIP') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'skipped' });
      } else if (action === 'SNOOZE_5') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'snoozed', snoozeMinutes: 5 });
      } else if (action === 'SNOOZE_10') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'snoozed', snoozeMinutes: 10 });
      } else if (action === 'SNOOZE_15') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'snoozed', snoozeMinutes: 15 });
      } else if (action === 'SNOOZE_30') {
        markMedicationAction({ medicationId: data.medicationId, scheduledForISO: data.scheduledForISO, status: 'snoozed', snoozeMinutes: 30 });
      }
    });
    return () => sub.remove();
  }, [markMedicationAction]);

  const getMedicationTimelineForDate = useCallback<AppContextValue['getMedicationTimelineForDate']>(
    (dateISO) => {
      const day = new Date(dateISO);
      return medications.flatMap((medication) => {
        const occurrences = getMedicationOccurrencesForDate(medication, day);
        return occurrences.map((occurrence) => {
          const scheduledForISO = occurrence.scheduledFor.toISOString();
          return {
            medication,
            scheduledForISO,
            status: getMedicationStatusForOccurrence(medication.id, scheduledForISO, medicationLogs)
          };
        });
      });
    },
    [medicationLogs, medications]
  );

  const setWellness = useCallback<React.Dispatch<React.SetStateAction<WellnessSnapshot>>>(
    (updater) => {
      setWellnessState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        return applyMoodImpact(next, mood);
      });
    },
    [mood]
  );

  const setMoodWithImpact = useCallback<React.Dispatch<React.SetStateAction<MoodSelection | null>>>((updater) => {
    setMood((previousMood) => {
      const nextMood = typeof updater === 'function' ? updater(previousMood) : updater;
      setWellnessState((previousWellness) => applyMoodImpact(previousWellness, nextMood));
      return nextMood;
    });
  }, []);

  const submitCheckIn = useCallback<AppContextValue['submitCheckIn']>(
    async (checkIn) => {
      const nowISO = new Date().toISOString();
      const { stressLevel, ...dailyCheckInPayload } = checkIn;
      const nextCheckIn: DailyCheckIn = {
        ...dailyCheckInPayload,
        dateISO: nowISO
      };

      setCheckIns((previous) => {
        const key = toDayKey(nowISO);
        const withoutToday = previous.filter((item) => toDayKey(item.dateISO) !== key);
        const next = [...withoutToday, nextCheckIn].slice(-30);

        const sentToday = nudges.filter((nudge) => toDayKey(nudge.scheduledAtISO) === key).length;
        const todayMeetings = 4;
        const plan = generatePriorityPlan({
          userId,
          profile: onboarding,
          checkins: next,
          todayMeetings,
          nudgesSentToday: sentToday
        });

        setPriorityPlan(plan);
        setDecisionLogs((logs) => [...logs.slice(-99), buildDecisionLog(plan, next)]);
        if (plan.suggestedNudge) {
          setNudges((previousNudges) => [...previousNudges, plan.suggestedNudge as Nudge]);
        }

        const moodMap: Record<number, MoodSelection> = {
          1: '😔',
          2: '☹️',
          3: '😐',
          4: '🙂',
          5: '😀'
        };
        const moodFromCheckIn = moodMap[dailyCheckInPayload.mood];
        setMood((_) => moodFromCheckIn);

        const normalizedEnergy = dailyCheckInPayload.energy / 5;
        setWellnessState((current) =>
          applyMoodImpact(
            {
              ...current,
              sleepHours: Number((6 + dailyCheckInPayload.sleepQuality * 0.5).toFixed(1)),
              focusMinutes: Math.max(0, current.focusMinutes + Math.round((normalizedEnergy - 0.5) * 6)),
              breathingMinutes: Math.max(0, current.breathingMinutes + (dailyCheckInPayload.mood <= 2 ? 3 : 1)),
              movementMinutes: Math.max(0, current.movementMinutes + (dailyCheckInPayload.energy >= 4 ? 2 : 1)),
              heartRateAvg: Math.max(52, Math.min(120, current.heartRateAvg + (dailyCheckInPayload.mood <= 2 ? 2 : -1)))
            },
            moodFromCheckIn
          )
        );

        return next;
      });
      if (userId) {
        void queueHealthEvent({
          userId,
          clientId,
          onboarding,
          eventType: 'daily_check_in_submitted',
          eventSource: 'mobile.tracker',
          eventPayload: nextCheckIn,
          priority: dailyCheckInPayload.mood <= 2 ? 'medium' : 'low',
          shouldEvaluateTicket: dailyCheckInPayload.mood <= 2
        });
      }

      if (stressLevel != null) {
        try {
          const answers = [
            { questionId: 'pss_01', score: Math.max(0, Math.min(4, stressLevel - 1)) },
            { questionId: 'pss_03', score: Math.max(0, Math.min(4, stressLevel)) },
            { questionId: 'pss_06', score: Math.max(0, Math.min(4, stressLevel - 1)) },
            { questionId: 'pss_10', score: Math.max(0, Math.min(4, stressLevel)) },
          ];
          await submitPssAssessment(answers);
          const scores = await getHealthScoreSummary();
          setWellnessState((current) => wellnessFromHealthScores(current, null, scores));
        } catch (error) {
          console.warn('[AppContext] stress assessment sync skipped', {
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
      }
    },
    [clientId, nudges, onboarding, userId]
  );

  const addWearableSyncData = useCallback((payload: WearableSyncPayload) => {
    setWearableSyncData((previous) => [payload, ...previous].slice(0, 60));
    if (userId) {
      void queueHealthEvent({
        userId,
        clientId,
        onboarding,
        eventType: 'wearable_synced',
        eventSource: 'mobile.wearable',
        eventPayload: payload
      });
    }
  }, [clientId, onboarding, userId]);

  const logNudgeAction = useCallback((nudgeId: string, action: NudgeAction) => {
    setDecisionLogs((previous) => [
      ...previous.slice(-99),
      {
        id: `dec-${Date.now()}`,
        createdAtISO: new Date().toISOString(),
        inputSummary: `Nudge feedback received for ${nudgeId}`,
        reasoning: `User selected ${action}.`,
        outputSummary: action === 'snoozed' ? 'Future nudge timing should be delayed.' : 'Nudge preference updated.'
      }
    ]);
  }, []);

  const hasCheckedInToday = useMemo(() => checkIns.some((item) => toDayKey(item.dateISO) === todayKey()), [checkIns]);

  const logout = useCallback(() => {
    if (authSession?.sessionToken) {
      void logoutAuthSession(authSession.sessionToken).catch(() => undefined);
    }
    clearPersistedAuth(authSession);
    setMood(null);
    setOnboardingState(null);
    setOnboardingStatus('NOT_STARTED');
    setOnboardingResumeStep('basics');
    setAssessmentState(null);
    setDevicesState([]);
    setSelectedDeviceId(null);
    setWearableSetupCompleted(false);
    setMedicationPermissionGranted(false);
    setCheckIns([]);
    setPriorityPlan(null);
    setDecisionLogs([]);
    setNudges([]);
    setWearableSyncData([]);
    setMedications([]);
    setMedicationLogs([]);
    setCycleLogs([]);
    setCyclePermissionGranted(false);
    setCycleNotificationSettings({ enabled: false, reminderTime24h: '20:00', notificationIds: [] });
    setFamilyInvites([]);
    setFamilyConnections([]);
    setFamilyEmergencyEvents([]);
    setPublishedNutritionPlan(null);
    setWellnessState(initialWellness);
  }, [authSession, clearPersistedAuth, setSelectedDeviceId, setWearableSetupCompleted]);


  useEffect(() => {
    if (!currentStorageIdentity) {
      setHealthProfileSyncDiagnosticsState({
        status: 'synced',
        lastAttemptAt: null,
        lastSuccessAt: null,
        retryCount: 0
      });
      return;
    }
    void refreshHealthProfileSyncDiagnostics(currentStorageIdentity);
  }, [currentStorageIdentity, refreshHealthProfileSyncDiagnostics]);

  useEffect(() => {
    if (!authSession) return undefined;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void retryPendingHealthProfileSync();
      }
    });
    return () => unsubscribe();
  }, [authSession, retryPendingHealthProfileSync]);

  const value = useMemo(
    () => ({
      bootstrapped,
      onboardingStatus,
      onboardingResumeStep,
      devices,
      setDevices,
      wellness,
      setWellness,
      mood,
      setMood: setMoodWithImpact,
      onboarding,
      setOnboarding,
      assessment,
      setAssessment,
      authSession,
      isAuthenticated,
      completeAuthentication,
      setIsAuthenticated,
      checkIns,
      submitCheckIn,
      hasCheckedInToday,
      priorityPlan,
      decisionLogs,
      nudges,
      logNudgeAction,
      wearableSyncData,
      addWearableSyncData,
      themeMode,
      setThemeMode,
      logout,
      selectedDeviceId,
      setSelectedDeviceId,
      wearableSetupCompleted,
      setWearableSetupCompleted,
      medicationPermissionGranted,
      medications,
      medicationLogs,
      requestMedicationPermission,
      addMedication,
      updateMedication,
      pauseMedication,
      deleteMedication,
      markMedicationAction,
      getMedicationTimelineForDate,
      cycleLogs,
      cycleNotificationSettings,
      cyclePrediction,
      requestCyclePermission,
      updateCycleNotificationSettings,
      logCycleForDate,
      getCycleDaySnapshot,
      getCycleInsights,
      familyInvites,
      familyConnections,
      familyEmergencyEvents,
      generateFamilyInvite,
      requestFamilyConnection,
      approveFamilyConnection,
      rejectFamilyConnection,
      updateFamilyPermissions,
      setFamilySharingPaused,
      disconnectFamilyMember,
      sendFamilyPing,
      triggerFamilySOS,
      getFamilySummary,
      healthProfileSyncDiagnostics,
      retryPendingHealthProfileSync,
      publishedNutritionPlan,
      refreshPublishedNutritionPlan
    }),
    [
      addWearableSyncData,
      assessment,
      authSession,
      bootstrapped,
      onboardingResumeStep,
      onboardingStatus,
      checkIns,
      decisionLogs,
      devices,
      hasCheckedInToday,
      isAuthenticated,
      completeAuthentication,
      logNudgeAction,
      logout,
      markMedicationAction,
      medicationLogs,
      medicationPermissionGranted,
      medications,
      cycleLogs,
      cycleNotificationSettings,
      cyclePrediction,
      familyConnections,
      familyEmergencyEvents,
      familyInvites,
      healthProfileSyncDiagnostics,
      publishedNutritionPlan,
      mood,
      nudges,
      onboarding,
      priorityPlan,
      selectedDeviceId,
      wearableSetupCompleted,
      setAssessment,
      setDevices,
      setIsAuthenticated,
      setMoodWithImpact,
      setOnboarding,
      setSelectedDeviceId,
      setWearableSetupCompleted,
      setThemeMode,
      setWellness,
      requestMedicationPermission,
      requestCyclePermission,
      addMedication,
      updateMedication,
      pauseMedication,
      deleteMedication,
      getMedicationTimelineForDate,
      updateCycleNotificationSettings,
      logCycleForDate,
      getCycleDaySnapshot,
      getCycleInsights,
      generateFamilyInvite,
      requestFamilyConnection,
      approveFamilyConnection,
      rejectFamilyConnection,
      updateFamilyPermissions,
      setFamilySharingPaused,
      disconnectFamilyMember,
      sendFamilyPing,
      triggerFamilySOS,
      getFamilySummary,
      retryPendingHealthProfileSync,
      refreshPublishedNutritionPlan,
      submitCheckIn,
      themeMode,
      wearableSyncData,
      wellness
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return context;
};
