import React, { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold
} from '@expo-google-fonts/poppins';
import { AppNavigation } from './src/navigation/AppNavigation';
import { AppProvider, useAppContext } from './src/state/AppContext';
import { getThemeColors } from './src/design/tokens';

let hasConfiguredGlobalFont = false;

const Root = () => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);

  useEffect(() => {
    const GlobalText = Text as typeof Text & { defaultProps?: { style?: unknown } };
    GlobalText.defaultProps = GlobalText.defaultProps ?? {};
    GlobalText.defaultProps.style = [{ fontFamily: 'Poppins_400Regular', color: palette.textPrimary }, GlobalText.defaultProps.style];
  }, [palette.textPrimary]);

  return (
    <>
      <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
      <AppNavigation />
    </>
  );
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font
  });

  if (!fontsLoaded) {
    return null;
  }

  if (!hasConfiguredGlobalFont) {
    const GlobalText = Text as typeof Text & { defaultProps?: { style?: unknown } };
    GlobalText.defaultProps = GlobalText.defaultProps ?? {};
    GlobalText.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, GlobalText.defaultProps.style];

    const GlobalTextInput = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };
    GlobalTextInput.defaultProps = GlobalTextInput.defaultProps ?? {};
    GlobalTextInput.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, GlobalTextInput.defaultProps.style];
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
