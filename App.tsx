import React, { useEffect } from 'react';
import { AppState, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import {
  Exo_400Regular,
  Exo_500Medium,
  Exo_600SemiBold,
  Exo_700Bold
} from '@expo-google-fonts/exo';
import { AppNavigation } from './src/navigation/AppNavigation';
import { AppProvider, useAppContext } from './src/state/AppContext';
import { getThemeColors } from './src/design/tokens';
import './src/services/wearableBackgroundSync';
import { runConfiguredHealthLifecycleSync } from './src/services/healthLifecycleSync';

let hasConfiguredGlobalFont = false;

const Root = () => {
  const { themeMode, authSession, wellness, setWellness, addWearableSyncData } = useAppContext();
  const palette = getThemeColors(themeMode);

  useEffect(() => {
    const GlobalText = Text as typeof Text & { defaultProps?: { style?: unknown } };
    GlobalText.defaultProps = GlobalText.defaultProps ?? {};
    GlobalText.defaultProps.style = [{ fontFamily: 'Exo_400Regular', color: palette.textPrimary }, GlobalText.defaultProps.style];
  }, [palette.textPrimary]);

  useEffect(() => {
    const clientId = authSession?.client.fiteatsyClientId;
    if (!clientId) return;
    const sync = () => {
      void runConfiguredHealthLifecycleSync({
        fiteatsyClientId: clientId,
        wellness,
        trigger: 'FOREGROUND_RESUME'
      }).then((result) => {
        if (!result) return;
        addWearableSyncData(result.payload);
        setWellness(result.wellness);
      }).catch((error) => {
        console.info('[HealthLifecycle] sync deferred', {
          errorCode: error instanceof Error ? error.message.slice(0, 100) : 'unknown_error'
        });
      });
    };
    sync();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      const resumed = previous !== 'active' && next === 'active';
      previous = next;
      if (resumed) sync();
    });
    return () => subscription.remove();
  }, [addWearableSyncData, authSession?.client.fiteatsyClientId, setWellness, wellness]);

  return (
    <>
      <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
      <AppNavigation />
    </>
  );
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Exo_400Regular,
    Exo_500Medium,
    Exo_600SemiBold,
    Exo_700Bold,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font
  });

  // The branded video splash must mount immediately on a cold launch. Font
  // loading is allowed to finish behind it instead of extending the native
  // black bridge with an otherwise blank React tree.
  if (fontsLoaded && !hasConfiguredGlobalFont) {
    const GlobalText = Text as typeof Text & { defaultProps?: { style?: unknown } };
    GlobalText.defaultProps = GlobalText.defaultProps ?? {};
    GlobalText.defaultProps.style = [{ fontFamily: 'Exo_400Regular' }, GlobalText.defaultProps.style];

    const GlobalTextInput = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };
    GlobalTextInput.defaultProps = GlobalTextInput.defaultProps ?? {};
    GlobalTextInput.defaultProps.style = [{ fontFamily: 'Exo_400Regular' }, GlobalTextInput.defaultProps.style];
    hasConfiguredGlobalFont = true;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <Root />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
