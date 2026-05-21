import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../design/tokens';
import { hydrationProgress, remainingHydration } from '../../utils/hydration';
import { useAppContext } from '../../state/AppContext';

const presetIntakes = [0.5, 1, 1.5] as const;
const vesselSize = 136;

export const HydrationScreen = () => {
  const navigation = useNavigation();
  const { wellness, setWellness } = useAppContext();
  const progress = hydrationProgress(wellness.hydrationLiters, wellness.hydrationGoalLiters);

  const fillProgress = useRef(new Animated.Value(progress)).current;
  const waveShiftOne = useRef(new Animated.Value(0)).current;
  const waveShiftTwo = useRef(new Animated.Value(0)).current;
  const bobShift = useRef(new Animated.Value(0)).current;
  const bubbleOne = useRef(new Animated.Value(0)).current;
  const bubbleTwo = useRef(new Animated.Value(0)).current;
  const bubbleThree = useRef(new Animated.Value(0)).current;
  const splashBurst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillProgress, {
      toValue: progress,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [progress, fillProgress]);

  useEffect(() => {
    const waveLoopOne = Animated.loop(
      Animated.timing(waveShiftOne, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    const waveLoopTwo = Animated.loop(
      Animated.timing(waveShiftTwo, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    waveLoopOne.start();
    waveLoopTwo.start();

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobShift, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(bobShift, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const bubbleLoopOne = Animated.loop(
      Animated.timing(bubbleOne, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    const bubbleLoopTwo = Animated.loop(
      Animated.timing(bubbleTwo, {
        toValue: 1,
        duration: 3800,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    const bubbleLoopThree = Animated.loop(
      Animated.timing(bubbleThree, {
        toValue: 1,
        duration: 4600,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    bobLoop.start();
    bubbleLoopOne.start();
    bubbleLoopTwo.start();
    bubbleLoopThree.start();

    return () => {
      waveLoopOne.stop();
      waveLoopTwo.stop();
      bobLoop.stop();
      bubbleLoopOne.stop();
      bubbleLoopTwo.stop();
      bubbleLoopThree.stop();
    };
  }, [waveShiftOne, waveShiftTwo, bobShift, bubbleOne, bubbleTwo, bubbleThree]);

  const addIntake = (liters: number) => {
    splashBurst.setValue(0);
    Animated.timing(splashBurst, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start();

    setWellness((prev) => ({
      ...prev,
      hydrationLiters: Number((prev.hydrationLiters + liters).toFixed(1))
    }));
  };

  const submitCurrent = () => {
    addIntake(0.2);
  };

  const resetHydration = () => {
    setWellness((prev) => ({
      ...prev,
      hydrationLiters: 0
    }));
  };

  const fillTranslateY = fillProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [vesselSize, 0]
  });

  const waveOneX = waveShiftOne.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -54]
  });

  const waveTwoX = waveShiftTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 54]
  });

  const bobY = bobShift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4]
  });
  const splashUp = splashBurst.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -24]
  });
  const splashFade = splashBurst.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.9, 0]
  });

  const bubbleOneY = bubbleOne.interpolate({
    inputRange: [0, 1],
    outputRange: [62, -14]
  });
  const bubbleTwoY = bubbleTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [70, -10]
  });
  const bubbleThreeY = bubbleThree.interpolate({
    inputRange: [0, 1],
    outputRange: [64, -12]
  });

  const bubbleOneX = bubbleOne.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8]
  });
  const bubbleTwoX = bubbleTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10]
  });
  const bubbleThreeX = bubbleThree.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6]
  });

  const bubbleOneOpacity = bubbleOne.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 0.5, 0.5, 0]
  });
  const bubbleTwoOpacity = bubbleTwo.interpolate({
    inputRange: [0, 0.2, 0.9, 1],
    outputRange: [0, 0.42, 0.42, 0]
  });
  const bubbleThreeOpacity = bubbleThree.interpolate({
    inputRange: [0, 0.25, 0.92, 1],
    outputRange: [0, 0.36, 0.36, 0]
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Hydration</Text>
        <View style={styles.headerGhost} />
      </View>

      <Text style={styles.subTitle}>
        You Drank <Text style={styles.highlight}>{wellness.hydrationLiters.toFixed(1)}L</Text> Today
      </Text>
      <Text style={styles.targetText}>Dietitian Target: {wellness.hydrationGoalLiters.toFixed(1)}L</Text>

      <Card style={styles.circleCard}>
        <View style={styles.vessel}>
          <Animated.View style={[styles.waterLayer, { transform: [{ translateY: bobY }] }]}>
            <Animated.View style={[styles.waterFill, { transform: [{ translateY: fillTranslateY }] }]}>
              <Animated.View style={[styles.wave, styles.waveOne, { transform: [{ translateX: waveOneX }] }]} />
              <Animated.View style={[styles.wave, styles.waveTwo, { transform: [{ translateX: waveTwoX }] }]} />
              <Animated.View
                style={[
                  styles.bubble,
                  styles.bubbleOne,
                  { opacity: bubbleOneOpacity, transform: [{ translateY: bubbleOneY }, { translateX: bubbleOneX }] }
                ]}
              />
              <Animated.View
                style={[
                  styles.bubble,
                  styles.bubbleTwo,
                  { opacity: bubbleTwoOpacity, transform: [{ translateY: bubbleTwoY }, { translateX: bubbleTwoX }] }
                ]}
              />
              <Animated.View
                style={[
                  styles.bubble,
                  styles.bubbleThree,
                  { opacity: bubbleThreeOpacity, transform: [{ translateY: bubbleThreeY }, { translateX: bubbleThreeX }] }
                ]}
              />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.splashDrop, styles.splashOne, { opacity: splashFade, transform: [{ translateY: splashUp }] }]} />
          <Animated.View
            style={[
              styles.splashDrop,
              styles.splashTwo,
              { opacity: splashFade, transform: [{ translateY: splashUp }, { translateX: -10 }] }
            ]}
          />
          <Animated.View
            style={[
              styles.splashDrop,
              styles.splashThree,
              { opacity: splashFade, transform: [{ translateY: splashUp }, { translateX: 10 }] }
            ]}
          />

          <View style={styles.gloss} />
          <Text style={styles.centerValue}>{Math.round(progress * 100)}%</Text>
        </View>
      </Card>

      <Text style={styles.prompt}>Add Current Intake</Text>
      <View style={styles.chips}>
        {presetIntakes.map((value) => (
          <Pressable key={value} style={styles.chip} onPress={() => addIntake(value)}>
            <Text style={styles.chipText}>{value} L</Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton title="Submit" onPress={submitCurrent} />
      <Pressable style={styles.resetButton} onPress={resetHydration}>
        <Ionicons name="refresh" size={18} color={colors.textPrimary} />
        <Text style={styles.resetText}>Reset Intake</Text>
      </Pressable>

      <Text style={styles.footer}>
        You still need {remainingHydration(wellness.hydrationLiters, wellness.hydrationGoalLiters).toFixed(1)}L to hit goal
      </Text>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6
  },
  title: {
    ...typography.title,
    textAlign: 'left'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  headerGhost: {
    width: 36,
    height: 36
  },
  subTitle: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textPrimary,
    marginTop: 6,
    marginBottom: 4
  },
  highlight: {
    color: '#60AF00',
    fontWeight: '700'
  },
  targetText: {
    ...typography.caption,
    textAlign: 'center',
    color: '#F5E1E1',
    marginBottom: 16
  },
  circleCard: {
    alignSelf: 'center',
    width: 178,
    height: 178,
    borderRadius: 89,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18
  },
  vessel: {
    width: vesselSize,
    height: vesselSize,
    borderRadius: vesselSize / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#C9CFD4',
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center'
  },
  waterFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: vesselSize + 28,
    bottom: -28,
    backgroundColor: 'rgba(53, 181, 255, 0.68)'
  },
  waterLayer: {
    ...StyleSheet.absoluteFillObject
  },
  wave: {
    position: 'absolute',
    top: -14,
    width: vesselSize + 64,
    height: 30,
    borderRadius: 18
  },
  waveOne: {
    backgroundColor: 'rgba(140, 226, 255, 0.82)'
  },
  waveTwo: {
    top: -10,
    backgroundColor: 'rgba(36, 157, 255, 0.58)'
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(234, 249, 255, 0.60)'
  },
  bubbleOne: {
    width: 8,
    height: 8,
    left: 32,
    bottom: 8
  },
  bubbleTwo: {
    width: 6,
    height: 6,
    right: 34,
    bottom: 10
  },
  bubbleThree: {
    width: 5,
    height: 5,
    left: 66,
    bottom: 9
  },
  splashDrop: {
    position: 'absolute',
    top: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(201, 241, 255, 0.95)'
  },
  splashOne: {
    width: 12,
    height: 12,
    left: 61
  },
  splashTwo: {
    width: 8,
    height: 8,
    left: 46
  },
  splashThree: {
    width: 8,
    height: 8,
    left: 82
  },
  gloss: {
    position: 'absolute',
    top: 14,
    left: 24,
    width: 44,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.29)',
    transform: [{ rotate: '-18deg' }]
  },
  centerValue: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 30,
    color: colors.white
  },
  prompt: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 12
  },
  chips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1E1E1E'
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  footer: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: 10
  },
  resetButton: {
    marginTop: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#1E1E1E'
  },
  resetText: {
    ...typography.caption,
    color: colors.textPrimary
  }
});
