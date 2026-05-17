import { TrackerTab } from '../services/trackerAnalysisService';
import { ReportParameter } from '../services/nuetraService';

export type RootStackParamList = {
  Splash: undefined;
  OnboardingBasics: undefined;
  OnboardingCalendar: undefined;
  OnboardingNotifications: undefined;
  OnboardingAssessment: undefined;
  SignIn: undefined;
  SignUp: undefined;
  SyncWearable: undefined;
  SyncSuccess: { deviceName: string };
  Main: undefined;
  FocusSession: undefined;
  BreathingSession: undefined;
  MovementSession: undefined;
  HydrationSession: undefined;
  Leadership: undefined;
  Search: undefined;
  Notifications: undefined;
  Profile: undefined;
  ReportsChat: { reportName: string; reportParameters: ReportParameter[] };
  TrackerDetail: {
    metricKey: string;
    metricTitle: string;
    subtitle: string;
    icon: string;
    tab: TrackerTab;
    unit: string;
    values: number[];
    compareValues: number[];
    color: string;
    context?: {
      dayLabel?: string;
      stressLevel?: number;
      sleepQuality?: number;
      hydration?: number;
      wellnessScore?: number;
    };
  };
};

export type MainTabParamList = {
  Home: undefined;
  Tracker: undefined;
  Reports: undefined;
  Sessions: undefined;
};
