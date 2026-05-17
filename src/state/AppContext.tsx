import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { mockDevices, initialWellness } from '../data/mock';
import {
  AssessmentProfile,
  DailyCheckIn,
  DecisionLog,
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
  WellnessSnapshot
} from '../types';
import { applyMoodImpact } from '../utils/wellness';
import { generatePriorityPlan, buildDecisionLog } from '../services/intelligenceEngine';
import { todayKey, toDayKey } from '../utils/date';
import {
  clearScheduledMedicationNotifications,
  initMedicationNotifications,
  requestMedicationNotificationPermissions,
  scheduleMedicationNotifications,
  scheduleSnoozeNotification
} from '../services/medicationNotificationService';
import { buildLogId, getMedicationOccurrencesForDate, getMedicationStatusForOccurrence } from '../services/medicationUtils';

type AppContextValue = {
  bootstrapped: boolean;
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
  isAuthenticated: boolean;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  checkIns: DailyCheckIn[];
  submitCheckIn: (checkIn: Omit<DailyCheckIn, 'dateISO'>) => void;
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
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const STORAGE_KEYS = {
  onboarding: 'nuetra.onboarding',
  assessment: 'nuetra.assessment',
  auth: 'nuetra.auth',
  theme: 'nuetra.theme',
  selectedDeviceId: 'nuetra.selectedDeviceId',
  devices: 'nuetra.devices',
  medications: 'nuetra.medications',
  medicationLogs: 'nuetra.medicationLogs',
  medicationPermission: 'nuetra.medicationPermission'
} as const;

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const userId = 'emp-demo-1';
  const [bootstrapped, setBootstrapped] = useState(false);
  const [devices, setDevicesState] = useState<WearableDevice[]>(mockDevices);
  const [wellness, setWellnessState] = useState<WellnessSnapshot>(initialWellness);
  const [mood, setMood] = useState<MoodSelection | null>(null);
  const [onboarding, setOnboardingState] = useState<OnboardingProfile | null>(null);
  const [assessment, setAssessmentState] = useState<AssessmentProfile | null>(null);
  const [isAuthenticated, setIsAuthenticatedState] = useState(false);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [wearableSyncData, setWearableSyncData] = useState<WearableSyncPayload[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [medicationPermissionGranted, setMedicationPermissionGranted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await initMedicationNotifications();

        const [storedOnboarding, storedAssessment, storedAuth, storedTheme, storedSelectedDeviceId, storedDevices, storedMedications, storedMedicationLogs, storedMedicationPermission] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.onboarding),
          AsyncStorage.getItem(STORAGE_KEYS.assessment),
          AsyncStorage.getItem(STORAGE_KEYS.auth),
          AsyncStorage.getItem(STORAGE_KEYS.theme),
          AsyncStorage.getItem(STORAGE_KEYS.selectedDeviceId),
          AsyncStorage.getItem(STORAGE_KEYS.devices),
          AsyncStorage.getItem(STORAGE_KEYS.medications),
          AsyncStorage.getItem(STORAGE_KEYS.medicationLogs),
          AsyncStorage.getItem(STORAGE_KEYS.medicationPermission)
        ]);

        if (storedOnboarding) {
          setOnboardingState(JSON.parse(storedOnboarding) as OnboardingProfile);
        }
        if (storedAssessment) {
          setAssessmentState(JSON.parse(storedAssessment) as AssessmentProfile);
        }
        if (storedAuth) {
          setIsAuthenticatedState(storedAuth === '1');
        }
        if (storedTheme === 'light' || storedTheme === 'dark') {
          setThemeModeState(storedTheme);
        }
        if (storedSelectedDeviceId) {
          setSelectedDeviceIdState(storedSelectedDeviceId);
        }
        if (storedDevices) {
          const parsed = JSON.parse(storedDevices) as WearableDevice[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDevicesState(parsed);
          }
        }
        if (storedMedications) {
          const parsed = JSON.parse(storedMedications) as Medication[];
          if (Array.isArray(parsed)) setMedications(parsed);
        }
        if (storedMedicationLogs) {
          const parsed = JSON.parse(storedMedicationLogs) as MedicationLog[];
          if (Array.isArray(parsed)) setMedicationLogs(parsed);
        }
        if (storedMedicationPermission === '1') {
          setMedicationPermissionGranted(true);
        }
      } finally {
        setBootstrapped(true);
      }
    };

    bootstrap();
  }, []);

  const setOnboarding = useCallback<React.Dispatch<React.SetStateAction<OnboardingProfile | null>>>(
    (updater) => {
      setOnboardingState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        if (next) {
          AsyncStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(next));
        } else {
          AsyncStorage.removeItem(STORAGE_KEYS.onboarding);
        }
        return next;
      });
    },
    []
  );

  const setAssessment = useCallback<React.Dispatch<React.SetStateAction<AssessmentProfile | null>>>(
    (updater) => {
      setAssessmentState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        if (next) {
          AsyncStorage.setItem(STORAGE_KEYS.assessment, JSON.stringify(next));
        } else {
          AsyncStorage.removeItem(STORAGE_KEYS.assessment);
        }
        return next;
      });
    },
    []
  );

  const setIsAuthenticated = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (updater) => {
      setIsAuthenticatedState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        AsyncStorage.setItem(STORAGE_KEYS.auth, next ? '1' : '0');
        return next;
      });
    },
    []
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
          AsyncStorage.setItem(STORAGE_KEYS.selectedDeviceId, next);
        } else {
          AsyncStorage.removeItem(STORAGE_KEYS.selectedDeviceId);
        }
        return next;
      });
    },
    []
  );

  const setDevices = useCallback<React.Dispatch<React.SetStateAction<WearableDevice[]>>>(
    (updater) => {
      setDevicesState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        AsyncStorage.setItem(STORAGE_KEYS.devices, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const persistMedications = useCallback((next: Medication[]) => {
    AsyncStorage.setItem(STORAGE_KEYS.medications, JSON.stringify(next));
  }, []);

  const persistMedicationLogs = useCallback((next: MedicationLog[]) => {
    AsyncStorage.setItem(STORAGE_KEYS.medicationLogs, JSON.stringify(next));
  }, []);

  const requestMedicationPermission = useCallback(async () => {
    const granted = await requestMedicationNotificationPermissions();
    setMedicationPermissionGranted(granted);
    AsyncStorage.setItem(STORAGE_KEYS.medicationPermission, granted ? '1' : '0');
    return granted;
  }, []);

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
        return next;
      });
    },
    [medicationPermissionGranted, persistMedications]
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
        return next;
      });
    },
    [medicationPermissionGranted, medications, persistMedications]
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
        return next;
      });
      setMedicationLogs((previous) => {
        const next = previous.filter((item) => item.medicationId !== medicationId);
        persistMedicationLogs(next);
        return next;
      });
    },
    [medications, persistMedicationLogs, persistMedications]
  );

  const markMedicationAction = useCallback<AppContextValue['markMedicationAction']>(
    async ({ medicationId, scheduledForISO, status, snoozeMinutes }) => {
      const medication = medications.find((item) => item.id === medicationId);
      if (!medication) return;

      const slot = medication.schedule.timeSlots[0];
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
        return next;
      });
    },
    [medications, persistMedicationLogs]
  );

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

  const submitCheckIn = useCallback(
    (checkIn: Omit<DailyCheckIn, 'dateISO'>) => {
      const nowISO = new Date().toISOString();
      const nextCheckIn: DailyCheckIn = {
        ...checkIn,
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
        const moodFromCheckIn = moodMap[checkIn.mood];
        setMood((_) => moodFromCheckIn);

        const normalizedEnergy = checkIn.energy / 5;
        setWellnessState((current) =>
          applyMoodImpact(
            {
              ...current,
              sleepHours: Number((6 + checkIn.sleepQuality * 0.5).toFixed(1)),
              focusMinutes: Math.max(0, current.focusMinutes + Math.round((normalizedEnergy - 0.5) * 6)),
              breathingMinutes: Math.max(0, current.breathingMinutes + (checkIn.mood <= 2 ? 3 : 1)),
              movementMinutes: Math.max(0, current.movementMinutes + (checkIn.energy >= 4 ? 2 : 1)),
              heartRateAvg: Math.max(52, Math.min(120, current.heartRateAvg + (checkIn.mood <= 2 ? 2 : -1)))
            },
            moodFromCheckIn
          )
        );

        return next;
      });
    },
    [nudges, onboarding]
  );

  const addWearableSyncData = useCallback((payload: WearableSyncPayload) => {
    setWearableSyncData((previous) => [payload, ...previous].slice(0, 60));
  }, []);

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
    setMood(null);
    setIsAuthenticated(false);
    setSelectedDeviceId(null);
    setCheckIns([]);
    setPriorityPlan(null);
    setDecisionLogs([]);
    setNudges([]);
    setWearableSyncData([]);
    setMedications([]);
    setMedicationLogs([]);
  }, [setIsAuthenticated, setSelectedDeviceId]);

  const value = useMemo(
    () => ({
      bootstrapped,
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
      isAuthenticated,
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
      medicationPermissionGranted,
      medications,
      medicationLogs,
      requestMedicationPermission,
      addMedication,
      updateMedication,
      pauseMedication,
      deleteMedication,
      markMedicationAction,
      getMedicationTimelineForDate
    }),
    [
      addWearableSyncData,
      assessment,
      bootstrapped,
      checkIns,
      decisionLogs,
      devices,
      hasCheckedInToday,
      isAuthenticated,
      logNudgeAction,
      logout,
      markMedicationAction,
      medicationLogs,
      medicationPermissionGranted,
      medications,
      mood,
      nudges,
      onboarding,
      priorityPlan,
      selectedDeviceId,
      setAssessment,
      setDevices,
      setIsAuthenticated,
      setMoodWithImpact,
      setOnboarding,
      setSelectedDeviceId,
      setThemeMode,
      setWellness,
      requestMedicationPermission,
      addMedication,
      updateMedication,
      pauseMedication,
      deleteMedication,
      getMedicationTimelineForDate,
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
