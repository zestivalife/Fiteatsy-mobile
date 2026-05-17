import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppNavigation } from './src/navigation/AppNavigation';
import { AppProvider } from './src/state/AppContext';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <StatusBar style="light" />
        <AppNavigation />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
