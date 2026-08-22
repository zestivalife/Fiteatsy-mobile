import React, { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityActionEvent,
  FlatList,
  StyleProp,
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ViewStyle,
  StyleSheet,
  Text,
  Vibration,
  View
} from 'react-native';
import { radius, typography } from '../design/tokens';

type NumericWheelPickerProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  itemHeight?: number;
  visibleRows?: 5 | 7;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  backgroundColor: string;
  highlightColor: string;
  style?: StyleProp<ViewStyle>;
  onChange: (value: number) => void;
};

export const NumericWheelPicker = ({
  label,
  value,
  min,
  max,
  unit,
  itemHeight = 56,
  visibleRows = 5,
  textColor,
  mutedTextColor,
  borderColor,
  backgroundColor,
  highlightColor,
  style,
  onChange
}: NumericWheelPickerProps) => {
  const listRef = useRef<FlatList<number>>(null);
  const currentValueRef = useRef(value);
  const values = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => min + index), [max, min]);
  const centerPadding = ((visibleRows - 1) / 2) * itemHeight;
  const selectedIndex = Math.max(0, values.indexOf(value));

  useEffect(() => {
    currentValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: selectedIndex * itemHeight, animated: false });
    }, 10);
    return () => clearTimeout(id);
  }, [itemHeight, selectedIndex]);

  const commitSelection = (nextValue: number) => {
    if (nextValue === currentValueRef.current) return;
    currentValueRef.current = nextValue;
    if (Platform.OS !== 'web') {
      Vibration.vibrate(8);
    }
    onChange(nextValue);
  };

  const snapToNearest = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / itemHeight);
    const nextIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
    const nextValue = values[nextIndex];
    listRef.current?.scrollToOffset({ offset: nextIndex * itemHeight, animated: true });
    commitSelection(nextValue);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const nextValue = Math.max(min, Math.min(max, currentValueRef.current + delta));
    const nextIndex = values.indexOf(nextValue);
    listRef.current?.scrollToOffset({ offset: nextIndex * itemHeight, animated: true });
    commitSelection(nextValue);
  };

  const renderItem = ({ item }: ListRenderItemInfo<number>) => {
    const selected = item === value;
    return (
      <View style={[styles.item, { height: itemHeight }]}>
        <Text style={[styles.itemText, { color: selected ? textColor : mutedTextColor }, selected && styles.itemTextActive]}>
          {item}
          {selected && unit ? <Text style={[styles.unitText, { color: textColor }]}>{` ${unit}`}</Text> : null}
        </Text>
      </View>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={`Swipe up or down to change ${label.toLowerCase()}.`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityValue={{ min, max, now: value, text: unit ? `${value} ${unit}` : `${value}` }}
      onAccessibilityAction={handleAccessibilityAction}
      style={[styles.wrapper, { height: itemHeight * visibleRows, borderColor, backgroundColor }, style]}
    >
      <FlatList
        ref={listRef}
        data={values}
        keyExtractor={(item) => `${label}-${item}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={{ paddingVertical: centerPadding }}
        getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
        onMomentumScrollEnd={snapToNearest}
        onScrollEndDrag={snapToNearest}
      />
      <View pointerEvents="none" style={[styles.selectionBand, { top: centerPadding, height: itemHeight, borderColor: highlightColor }]} />
      <View pointerEvents="none" style={[styles.fadeTop, { height: centerPadding, backgroundColor }]} />
      <View pointerEvents="none" style={[styles.fadeBottom, { height: centerPadding, backgroundColor }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemText: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 34
  },
  itemTextActive: {
    fontSize: 40,
    lineHeight: 46,
    fontFamily: 'Exo_700Bold'
  },
  unitText: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  selectionBand: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(96,175,0,0.12)'
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  }
});
