import Constants from 'expo-constants';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

const buildSha =
  process.env.EXPO_PUBLIC_BUILD_SHA
  ?? (Constants.expoConfig?.extra as { buildSha?: string } | undefined)?.buildSha
  ?? 'unavailable';

export class ProductionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[RuntimeBoundary]', {
      buildSha,
      appVersion: Constants.expoConfig?.version ?? 'unavailable',
      platform: Platform.OS,
      phase: 'REACT_ROOT',
      errorClass: error.name || 'Error'
    });
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen} accessibilityRole="alert">
        <Text style={styles.title}>Fiteatsy needs to recover</Text>
        <Text style={styles.body}>Your session and saved data remain on this device. Try reopening this screen.</Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: '#000000' },
  title: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 24, textAlign: 'center' },
  body: { color: '#C7CBD1', fontFamily: 'Exo_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#5BE000', paddingHorizontal: 24 },
  buttonText: { color: '#071000', fontFamily: 'Exo_700Bold', fontSize: 16 }
});
