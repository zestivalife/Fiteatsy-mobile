import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, typography } from '../design/tokens';
import { MainTabParamList } from '../navigation/types';

const iconMap: Record<keyof MainTabParamList, { inactive: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  Journey: { inactive: 'sparkles-outline', active: 'sparkles' },
  Tracker: { inactive: 'pulse-outline', active: 'pulse' },
  Nutrition: { inactive: 'nutrition-outline', active: 'nutrition' },
  Care: { inactive: 'heart-outline', active: 'heart' },
  Profile: { inactive: 'person-circle-outline', active: 'person-circle' }
};

const labelMap: Record<keyof MainTabParamList, string> = {
  Journey: 'Journey',
  Tracker: 'Tracker',
  Nutrition: 'Nutrition',
  Care: 'Care',
  Profile: 'Profile'
};

export const FloatingTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const routeName = route.name as keyof MainTabParamList;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
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
                <View style={styles.itemInner}>
                  <Ionicons
                    name={isFocused ? iconMap[routeName].active : iconMap[routeName].inactive}
                    size={22}
                    color={isFocused ? '#FFFFFF' : colors.textMuted}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      {
                        color: isFocused ? '#FFFFFF' : colors.textMuted,
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
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0
  },
  footer: {
    overflow: 'hidden',
    backgroundColor: '#0D1013',
    borderTopWidth: 1,
    borderTopColor: '#272D33',
    paddingTop: 4,
    paddingHorizontal: 8
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52
  },
  item: {
    flex: 1,
    alignItems: 'center'
  },
  itemInner: {
    width: '100%',
    minHeight: 46,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  itemPressed: {
    transform: [{ scale: 0.97 }]
  },
  label: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center'
  }
});
