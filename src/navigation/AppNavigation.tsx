import React, { useCallback } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getThemeColors } from '../design/tokens';
import { RootStackParamList, MainTabParamList } from './types';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { OnboardingBasicsScreen } from '../screens/onboarding/OnboardingBasicsScreen';
import { OnboardingAnthropometricsScreen } from '../screens/onboarding/OnboardingAnthropometricsScreen';
import { OnboardingAssessmentScreen } from '../screens/onboarding/OnboardingAssessmentScreen';
import { OnboardingReadyScreen } from '../screens/onboarding/OnboardingReadyScreen';
import { FoodPreferencesScreen } from '../screens/onboarding/FoodPreferencesScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ChangePinScreen } from '../screens/auth/ChangePinScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TrackerScreen } from '../screens/home/TrackerScreen';
import { TrackerDetailScreen } from '../screens/home/TrackerDetailScreen';
import { ReportsScreen } from '../screens/home/ReportsScreen';
import { ReportComparisonScreen } from '../screens/home/ReportComparisonScreen';
import { SessionsScreen } from '../screens/home/SessionsScreen';
import { FocusScreen } from '../screens/wellness/FocusScreen';
import { BreathingScreen } from '../screens/wellness/BreathingScreen';
import { MovementScreen } from '../screens/wellness/MovementScreen';
import { HydrationScreen } from '../screens/wellness/HydrationScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { LeadershipScreen } from '../screens/home/LeadershipScreen';
import { ConsultantBookingScreen } from '../screens/home/ConsultantBookingScreen';
import { AssistHubScreen } from '../screens/home/AssistHubScreen';
import { PaymentSuccessScreen } from '../screens/home/PaymentSuccessScreen';
import { SubscriptionPlansScreen } from '../screens/home/SubscriptionPlansScreen';
import { SubscriptionPlanDetailsScreen } from '../screens/home/SubscriptionPlanDetailsScreen';
import { SubscriptionCompareScreen } from '../screens/home/SubscriptionCompareScreen';
import { MySubscriptionScreen } from '../screens/home/MySubscriptionScreen';
import { SubscriptionCheckoutScreen } from '../screens/home/SubscriptionCheckoutScreen';
import { SubscriptionPaymentPlaceholderScreen } from '../screens/home/SubscriptionPaymentPlaceholderScreen';
import { SearchScreen } from '../screens/home/SearchScreen';
import { NotificationsScreen } from '../screens/home/NotificationsScreen';
import { ProfileScreen } from '../screens/home/ProfileScreen';
import { MyProfileScreen } from '../screens/profile/MyProfileScreen';
import { ConnectedHealthScreen } from '../screens/profile/ConnectedHealthScreen';
import { PrivacyConsentScreen } from '../screens/profile/PrivacyConsentScreen';
import { SecurityScreen } from '../screens/profile/SecurityScreen';
import { NotificationPreferencesScreen } from '../screens/profile/NotificationPreferencesScreen';
import { AppPreferencesScreen } from '../screens/profile/AppPreferencesScreen';
import { HelpSupportScreen } from '../screens/profile/HelpSupportScreen';
import { GrievanceFormScreen } from '../screens/profile/GrievanceFormScreen';
import { MyIssuesScreen } from '../screens/profile/MyIssuesScreen';
import { MyIssueDetailScreen } from '../screens/profile/MyIssueDetailScreen';
import { CanonicalConnectedMetricsScreen } from '../screens/sync/CanonicalConnectedMetricsScreen';
import { CanonicalHealthSyncDebugScreen } from '../screens/sync/CanonicalHealthSyncDebugScreen';
import { HealthDataSyncScreen } from '../screens/sync/CanonicalHealthDataSyncScreen';
import { ReportsChatScreen } from '../screens/home/ReportsChatScreen';
import { NutritionPlanScreen } from '../screens/home/NutritionPlanScreen';
import { NutritionHubScreen } from '../screens/home/NutritionHubScreen';
import { MedicationFormScreen } from '../screens/medication/MedicationFormScreen';
import { MedicationCalendarScreen } from '../screens/medication/MedicationCalendarScreen';
import { MedicationNotificationsScreen } from '../screens/medication/MedicationNotificationsScreen';
import { CycleScreen } from '../screens/cycle/CycleScreen';
import { CycleCalendarScreen } from '../screens/cycle/CycleCalendarScreen';
import { CycleInsightsScreen } from '../screens/cycle/CycleInsightsScreen';
import { CycleNotificationsScreen } from '../screens/cycle/CycleNotificationsScreen';
import { Pss10AssessmentScreen } from '../screens/assessments/Pss10AssessmentScreen';
import { useAppContext } from '../state/AppContext';
import { traceRuntimePerformance } from '../services/runtimePerformanceTrace';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const CareTabScreen = ConsultantBookingScreen as React.ComponentType<any>;

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0
        }
      }}
    >
      <Tab.Screen name="Journey" component={HomeScreen} />
      <Tab.Screen name="Tracker" component={TrackerScreen} />
      <Tab.Screen name="Nutrition" component={NutritionHubScreen} />
      <Tab.Screen name="Care" component={CareTabScreen} />
    </Tab.Navigator>
  );
};

export const AppNavigation = () => {
  const { isAuthenticated, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: palette.bgPrimary,
      card: palette.card,
      text: palette.textPrimary,
      border: palette.stroke,
      primary: palette.blue,
      notification: palette.pink
    }
  };

  const handleNavigationReady = useCallback(() => {
    traceRuntimePerformance('NAVIGATION_READY');
  }, []);

  return (
    <NavigationContainer theme={navTheme} onReady={handleNavigationReady}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 240,
          gestureEnabled: true
        }}
        initialRouteName="Splash"
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="OnboardingBasics" component={OnboardingBasicsScreen} />
        <Stack.Screen name="OnboardingAnthropometrics" component={OnboardingAnthropometricsScreen} />
        <Stack.Screen name="OnboardingAssessment" component={OnboardingAssessmentScreen} />
        <Stack.Screen name="OnboardingReady" component={OnboardingReadyScreen} />
        <Stack.Screen name="FoodPreferences" component={FoodPreferencesScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ChangePin" component={ChangePinScreen} />
        <Stack.Screen name="HealthDataSync" component={HealthDataSyncScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="TrackerDetail" component={TrackerDetailScreen} />
        <Stack.Screen name="FocusSession" component={FocusScreen} />
        <Stack.Screen name="BreathingSession" component={BreathingScreen} />
        <Stack.Screen name="MovementSession" component={MovementScreen} />
        <Stack.Screen name="HydrationSession" component={HydrationScreen} />
        <Stack.Screen name="Leadership" component={LeadershipScreen} />
        <Stack.Screen name="ConsultantBooking" component={ConsultantBookingScreen} />
        <Stack.Screen name="AssistHub" component={AssistHubScreen} />
        <Stack.Screen name="SubscriptionPlans" component={SubscriptionPlansScreen} />
        <Stack.Screen name="SubscriptionPlanDetails" component={SubscriptionPlanDetailsScreen} />
        <Stack.Screen name="SubscriptionCompare" component={SubscriptionCompareScreen} />
        <Stack.Screen name="MySubscription" component={MySubscriptionScreen} />
        <Stack.Screen name="SubscriptionCheckout" component={SubscriptionCheckoutScreen} />
        <Stack.Screen name="SubscriptionPaymentPlaceholder" component={SubscriptionPaymentPlaceholderScreen} />
        <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="MyProfile" component={MyProfileScreen} />
        <Stack.Screen name="ConnectedHealth" component={ConnectedHealthScreen} />
        <Stack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
        <Stack.Screen name="AppPreferences" component={AppPreferencesScreen} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <Stack.Screen name="GrievanceForm" component={GrievanceFormScreen} />
        <Stack.Screen name="MyIssues" component={MyIssuesScreen} />
        <Stack.Screen name="MyIssueDetail" component={MyIssueDetailScreen} />
        <Stack.Screen name="ConnectedMetrics" component={CanonicalConnectedMetricsScreen} />
        {__DEV__ ? <Stack.Screen name="HealthSyncDebug" component={CanonicalHealthSyncDebugScreen} /> : null}
        <Stack.Screen name="ReportsChat" component={ReportsChatScreen} />
        <Stack.Screen name="Reports" component={ReportsScreen} />
        <Stack.Screen name="ReportComparison" component={ReportComparisonScreen} />
        <Stack.Screen name="Sessions" component={SessionsScreen} />
        <Stack.Screen name="Cycle" component={CycleScreen} />
        <Stack.Screen name="NutritionPlan" component={NutritionPlanScreen} />
        <Stack.Screen name="MedicationForm" component={MedicationFormScreen} />
        <Stack.Screen name="MedicationCalendar" component={MedicationCalendarScreen} />
        <Stack.Screen name="MedicationNotifications" component={MedicationNotificationsScreen} />
        <Stack.Screen name="CycleCalendar" component={CycleCalendarScreen} />
        <Stack.Screen name="CycleInsights" component={CycleInsightsScreen} />
        <Stack.Screen name="CycleNotifications" component={CycleNotificationsScreen} />
        <Stack.Screen name="Pss10Assessment" component={Pss10AssessmentScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
