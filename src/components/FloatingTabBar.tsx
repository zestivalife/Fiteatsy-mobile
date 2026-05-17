import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing, typography } from '../design/tokens';
import { MainTabParamList } from '../navigation/types';

const iconMap: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Tracker: 'fitness-outline',
  Reports: 'heart-outline',
  Sessions: 'id-card-outline',
  Cycle: 'flower-outline'
};

export const FloatingTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const bottomOffset = 0;

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: bottomOffset }]}>
      <BlurView intensity={52} tint="dark" style={styles.blurShell}>
        <LinearGradient
          colors={['rgba(0,0,0,0.29)', '#323232', '#151515']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bar, { paddingBottom: Math.max(2, Math.round(insets.bottom * 0.45)) }]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key
              });
            };

            const label = descriptors[route.key].options.tabBarLabel ?? descriptors[route.key].options.title ?? route.name;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                onLongPress={onLongPress}
                style={[styles.item, isFocused && styles.itemActive]}
              >
              <Ionicons
                name={iconMap[route.name as keyof MainTabParamList]}
                size={20}
                color={isFocused ? colors.white : colors.textMuted}
              />
                <Text style={[styles.label, isFocused && styles.labelActive]}>{String(label)}</Text>
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
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'transparent'
  },
  blurShell: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14
  },
  bar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    minHeight: 74
  },
  item: {
    flex: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 8,
    gap: 4
  },
  itemActive: {
    backgroundColor: colors.blue
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12
  },
  labelActive: {
    color: colors.white,
    fontFamily: 'System',
    fontWeight: '700'
  }
});
