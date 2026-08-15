import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { getThemeColors, typography } from '../design/tokens';
import { MainTabParamList } from '../navigation/types';
import { useAppContext } from '../state/AppContext';

const iconMap: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Tracker: 'pulse-outline',
  Reports: 'document-text-outline',
  Sessions: 'sparkles-outline',
  Cycle: 'person-circle-outline'
};

const labelMap: Record<keyof MainTabParamList, string> = {
  Home: 'Home',
  Tracker: 'Tracker',
  Reports: 'Reports',
  Sessions: 'Sessions',
  Cycle: 'Cycle'
};

export const FloatingTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <BlurView intensity={42} tint={isLight ? 'light' : 'dark'} style={[styles.blurShell, { borderColor: palette.strokeStrong }]}>
        <LinearGradient
          colors={isLight ? ['rgba(255,255,255,0.96)', 'rgba(247,250,244,0.96)'] : ['rgba(18,19,18,0.92)', 'rgba(6,8,7,0.94)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const routeName = route.name as keyof MainTabParamList;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={labelMap[routeName]}
                onPress={onPress}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              >
                <View
                  style={[
                    styles.itemInner,
                    isFocused
                      ? {
                          backgroundColor: '#5FC100',
                          borderColor: '#5FC100'
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: 'transparent'
                        }
                  ]}
                >
                  <Ionicons
                    name={iconMap[routeName]}
                    size={20}
                    color={isFocused ? '#FFFFFF' : palette.textMuted}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      {
                        color: isFocused ? '#FFFFFF' : palette.textMuted,
                        fontFamily: isFocused ? 'Exo_700Bold' : 'Exo_500Medium'
                      }
                    ]}
                  >
                    {labelMap[routeName]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </LinearGradient>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14
  },
  blurShell: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 7,
    minHeight: 68
  },
  item: {
    flex: 1,
    alignItems: 'center'
  },
  itemInner: {
    width: '100%',
    minHeight: 55,
    borderRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  itemPressed: {
    transform: [{ scale: 0.97 }]
  },
  label: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center'
  }
});
