import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getThemeColors } from '../design/tokens';
import { RootStackParamList, MainTabParamList } from './types';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { OnboardingBasicsScreen } from '../screens/onboarding/OnboardingBasicsScreen';
import { OnboardingCalendarScreen } from '../screens/onboarding/OnboardingCalendarScreen';
import { OnboardingNotificationsScreen } from '../screens/onboarding/OnboardingNotificationsScreen';
import { OnboardingAssessmentScreen } from '../screens/onboarding/OnboardingAssessmentScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { SyncWearableScreen } from '../screens/sync/SyncWearableScreen';
import { SyncSuccessScreen } from '../screens/sync/SyncSuccessScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TrackerScreen } from '../screens/home/TrackerScreen';
import { TrackerDetailScreen } from '../screens/home/TrackerDetailScreen';
import { ReportsScreen } from '../screens/home/ReportsScreen';
import { SessionsScreen } from '../screens/home/SessionsScreen';
import { FocusScreen } from '../screens/wellness/FocusScreen';
import { BreathingScreen } from '../screens/wellness/BreathingScreen';
import { MovementScreen } from '../screens/wellness/MovementScreen';
import { HydrationScreen } from '../screens/wellness/HydrationScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { LeadershipScreen } from '../screens/home/LeadershipScreen';
import { SearchScreen } from '../screens/home/SearchScreen';
import { NotificationsScreen } from '../screens/home/NotificationsScreen';
import { ProfileScreen } from '../screens/home/ProfileScreen';
import { ConnectedMetricsScreen } from '../screens/sync/ConnectedMetricsScreen';
import { ReportsChatScreen } from '../screens/home/ReportsChatScreen';
import { MedicationFormScreen } from '../screens/medication/MedicationFormScreen';
import { MedicationCalendarScreen } from '../screens/medication/MedicationCalendarScreen';
import { MedicationNotificationsScreen } from '../screens/medication/MedicationNotificationsScreen';
import { CycleScreen } from '../screens/cycle/CycleScreen';
import { CycleCalendarScreen } from '../screens/cycle/CycleCalendarScreen';
import { CycleInsightsScreen } from '../screens/cycle/CycleInsightsScreen';
import { CycleNotificationsScreen } from '../screens/cycle/CycleNotificationsScreen';
import { FamilyDashboardScreen } from '../screens/family/FamilyDashboardScreen';
import { FamilyMemberDetailScreen } from '../screens/family/FamilyMemberDetailScreen';
import { useAppContext } from '../state/AppContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tracker" component={TrackerScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Sessions" component={SessionsScreen} />
      <Tab.Screen name="Cycle" component={CycleScreen} />
    </Tab.Navigator>
  );
};

export const AppNavigation = () => {
  const { themeMode } = useAppContext();
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

  return (
    <NavigationContainer theme={navTheme}>
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
        <Stack.Screen name="OnboardingCalendar" component={OnboardingCalendarScreen} />
        <Stack.Screen name="OnboardingNotifications" component={OnboardingNotificationsScreen} />
        <Stack.Screen name="OnboardingAssessment" component={OnboardingAssessmentScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SyncWearable" component={SyncWearableScreen} />
        <Stack.Screen name="SyncSuccess" component={SyncSuccessScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="TrackerDetail" component={TrackerDetailScreen} />
        <Stack.Screen name="FocusSession" component={FocusScreen} />
        <Stack.Screen name="BreathingSession" component={BreathingScreen} />
        <Stack.Screen name="MovementSession" component={MovementScreen} />
        <Stack.Screen name="HydrationSession" component={HydrationScreen} />
        <Stack.Screen name="Leadership" component={LeadershipScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ConnectedMetrics" component={ConnectedMetricsScreen} />
        <Stack.Screen name="ReportsChat" component={ReportsChatScreen} />
        <Stack.Screen name="MedicationForm" component={MedicationFormScreen} />
        <Stack.Screen name="MedicationCalendar" component={MedicationCalendarScreen} />
        <Stack.Screen name="MedicationNotifications" component={MedicationNotificationsScreen} />
        <Stack.Screen name="CycleCalendar" component={CycleCalendarScreen} />
        <Stack.Screen name="CycleInsights" component={CycleInsightsScreen} />
        <Stack.Screen name="CycleNotifications" component={CycleNotificationsScreen} />
        <Stack.Screen name="FamilyDashboard" component={FamilyDashboardScreen} />
        <Stack.Screen name="FamilyMemberDetail" component={FamilyMemberDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
