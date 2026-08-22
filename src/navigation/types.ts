import { TrackerTab } from '../services/trackerAnalysisService';
import { ReportParameter } from '../services/nuetraService';

export type RootStackParamList = {
  Splash: undefined;
  OnboardingBasics: undefined;
  OnboardingCalendar: undefined;
  OnboardingNotifications: undefined;
  OnboardingAssessment: {
    startPhase?: 'lifestyle' | 'recovery';
    lifestyle?: { heightCm: number; weightKg: number; activityLevel: string; sleepHours: number; sleepQuality: string };
  } | undefined;
  OnboardingReady: undefined;
  FoodPreferences: {
    mode?: 'onboarding' | 'profile';
    lifestyle?: { heightCm: number; weightKg: number; activityLevel: string; sleepHours: number; sleepQuality: string };
  } | undefined;
  SignIn: undefined;
  SignUp: undefined;
  ChangePin: { force?: boolean } | undefined;
  SyncWearable: { autoSync?: boolean } | undefined;
  SyncSuccess: { deviceName: string };
  Main: undefined;
  FocusSession: undefined;
  BreathingSession: undefined;
  MovementSession: undefined;
  HydrationSession: undefined;
  Leadership: undefined;
  ConsultantBooking: undefined;
  AssistHub: undefined;
  SubscriptionPlans: {
    source?: 'assist' | 'talk_to_expert' | 'get_assistance' | 'book_consultation' | 'subscription_management';
    requiredEntitlement?: string | null;
    returnDestination?: keyof RootStackParamList;
  } | undefined;
  SubscriptionPlanDetails: { planId: string };
  SubscriptionCompare: undefined;
  MySubscription: undefined;
  SubscriptionCheckout: { planId: string };
  SubscriptionPaymentPlaceholder: {
    status?: 'PENDING' | 'PAYMENT_PENDING' | 'PROCESSING' | 'PAYMENT_FAILED';
    returnDestination?: keyof RootStackParamList;
  } | undefined;
  PaymentSuccess: {
    returnDestination?: keyof RootStackParamList;
    priceBreakup?: import('../services/subscriptionService').PriceBreakup;
  } | undefined;
  Search: undefined;
  Notifications: undefined;
  Profile: undefined;
  Reports: undefined;
  Sessions: undefined;
  Cycle: undefined;
  ConnectedMetrics: undefined;
  HealthSyncDebug: undefined;
  ReportsChat: { reportName: string; reportId: string; reportParameters: ReportParameter[] };
  NutritionPlan: undefined;
  NutritionExperience: undefined;
  MedicationForm: { medicationId?: string } | undefined;
  MedicationCalendar: undefined;
  MedicationNotifications: undefined;
  CycleCalendar: undefined;
  CycleInsights: undefined;
  CycleNotifications: undefined;
  FamilyDashboard: undefined;
  FamilyMemberDetail: { connectionId: string };
  Pss10Assessment: { mode?: 'intro' | 'history' } | undefined;
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
  Journey: undefined;
  Tracker: undefined;
  Nutrition: undefined;
  Care: undefined;
  Profile: undefined;
};
