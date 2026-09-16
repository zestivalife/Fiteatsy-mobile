import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgProps } from 'react-native-svg';
import JourneyIcon from '../assets/fiteatsy-footer/Journey.svg';
import JourneyActiveIcon from '../assets/fiteatsy-footer/Journey-fill.svg';
import TrackerIcon from '../assets/fiteatsy-footer/Tracker.svg';
import TrackerActiveIcon from '../assets/fiteatsy-footer/Tracker-fill.svg';
import NutritionIcon from '../assets/fiteatsy-footer/Nutrition.svg';
import NutritionActiveIcon from '../assets/fiteatsy-footer/Nutrition-fill.svg';
import CareIcon from '../assets/fiteatsy-footer/Care.svg';
import CareActiveIcon from '../assets/fiteatsy-footer/Care-fill.svg';
import ProfileIcon from '../assets/fiteatsy-footer/Profile.svg';
import ProfileActiveIcon from '../assets/fiteatsy-footer/Profile-fill.svg';
import { colors, typography } from '../design/tokens';
import { MainTabParamList } from '../navigation/types';

type FooterIcon = React.FC<SvgProps>;

const iconMap: Record<keyof MainTabParamList, { inactive: FooterIcon; active: FooterIcon }> = {
  Journey: { inactive: JourneyIcon, active: JourneyActiveIcon },
  Tracker: { inactive: TrackerIcon, active: TrackerActiveIcon },
  Nutrition: { inactive: NutritionIcon, active: NutritionActiveIcon },
  Care: { inactive: CareIcon, active: CareActiveIcon },
  Profile: { inactive: ProfileIcon, active: ProfileActiveIcon }
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
                  {React.createElement(isFocused ? iconMap[routeName].active : iconMap[routeName].inactive, { width: 24, height: 24 })}
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
    paddingTop: 6,
    paddingHorizontal: 8
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58
  },
  item: {
    flex: 1,
    alignItems: 'center'
  },
  itemInner: {
    width: '100%',
    minHeight: 52,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  itemPressed: {
    transform: [{ scale: 0.97 }]
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center'
  }
});
