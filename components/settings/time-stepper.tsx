import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useStepperAutoRepeat } from '@/hooks/use-stepper-auto-repeat';
import { useThemeColor } from '@/hooks/use-theme-color';

// 時刻の「時」「分」を1つずつ調整するためのステッパー(−/+ボタン)。
// 外部ライブラリを追加せずに実装するため、ネイティブのタイムピッカーではなく増減ボタン方式にしている
export function TimeStepper({
  label,
  value,
  onDecrease,
  onIncrease,
  disabled,
}: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled: boolean;
}) {
  const tintColor = useThemeColor({}, 'tint');
  const linkColor = useThemeColor({}, 'link');
  const formattedValue = String(value).padStart(2, '0');
  // 見た目の「21時」と読み上げを揃える
  const valueLabel = `${formattedValue}${label}`;
  const previousValueRef = useRef(value);
  const shouldAnnounceValueChangeRef = useRef(false);
  const handleDecrease = useCallback(() => {
    shouldAnnounceValueChangeRef.current = true;
    onDecrease();
  }, [onDecrease]);
  const handleIncrease = useCallback(() => {
    shouldAnnounceValueChangeRef.current = true;
    onIncrease();
  }, [onIncrease]);
  const decreaseAutoRepeat = useStepperAutoRepeat(handleDecrease, disabled);
  const increaseAutoRepeat = useStepperAutoRepeat(handleIncrease, disabled);

  useEffect(() => {
    if (
      previousValueRef.current !== value &&
      shouldAnnounceValueChangeRef.current &&
      Platform.OS === 'ios'
    ) {
      AccessibilityInfo.announceForAccessibility(valueLabel);
    }
    shouldAnnounceValueChangeRef.current = false;
    previousValueRef.current = value;
  }, [valueLabel, value]);

  return (
    <ThemedView style={styles.group}>
      <Pressable
        onPress={decreaseAutoRepeat.onPress}
        onPressIn={decreaseAutoRepeat.onPressIn}
        onPressOut={decreaseAutoRepeat.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}を減らす`}
        accessibilityState={{ disabled }}
        style={[styles.button, { borderColor: tintColor, opacity: disabled ? 0.4 : 1 }]}
      >
        <ThemedText style={[styles.buttonText, { color: linkColor }]}>−</ThemedText>
      </Pressable>
      <ThemedView
        accessible
        accessibilityLabel={valueLabel}
        accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
        style={[styles.valueGroup, { opacity: disabled ? 0.4 : 1 }]}
      >
        <ThemedText
          // 値が変わっても桁の幅が揺れないよう等幅フォントで表示する
          font="mono"
          style={styles.value}
        >
          {formattedValue}
        </ThemedText>
        <ThemedText style={styles.label}>{label}</ThemedText>
      </ThemedView>
      <Pressable
        onPress={increaseAutoRepeat.onPress}
        onPressIn={increaseAutoRepeat.onPressIn}
        onPressOut={increaseAutoRepeat.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}を増やす`}
        accessibilityState={{ disabled }}
        style={[styles.button, { borderColor: tintColor, opacity: disabled ? 0.4 : 1 }]}
      >
        <ThemedText style={[styles.buttonText, { color: linkColor }]}>+</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
  },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '600',
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
});
