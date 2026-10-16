import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingIllustration } from '@/components/onboarding-illustrations';
import { OnboardingColors, type OnboardingColorSet } from '@/constants/onboarding-colors';
import { ONBOARDING_SLIDES, type OnboardingSlide } from '@/constants/onboarding-slides';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SHEET_HORIZONTAL_MARGIN = 20;
const SWIPE_THRESHOLD = 50;
const DOT_ANIMATION_MS = 250;
const GRADIENT_BAND_COUNT = 48;

type OnboardingProps = {
  visible: boolean;
  // スキップ、または最後のスライドで「はじめる」を押したときに呼ばれる。完了フラグの保存は呼び出し側が行う
  onFinish: () => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

// 追加依存なしで縦方向のグラデーションを描くため、色を補間した細い帯を積み重ねて近似する
function buildGradientBands(stops: { color: string; offset: number }[]): string[] {
  return Array.from({ length: GRADIENT_BAND_COUNT }, (_, i) => {
    const t = i / (GRADIENT_BAND_COUNT - 1);
    const upper = stops.findIndex((stop) => stop.offset >= t);
    const end = stops[Math.max(upper, 1)];
    const start = stops[Math.max(upper, 1) - 1];
    const ratio = Math.min(Math.max((t - start.offset) / (end.offset - start.offset), 0), 1);
    const from = hexToRgb(start.color);
    const to = hexToRgb(end.color);
    const [r, g, b] = from.map((channel, k) => Math.round(channel + (to[k] - channel) * ratio));
    return `rgb(${r},${g},${b})`;
  });
}

function GradientBackground({ stops }: { stops: { color: string; offset: number }[] }) {
  const bands = useMemo(() => buildGradientBands(stops), [stops]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bands.map((color, index) => (
        <View key={index} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

function PaginationDot({ active, colors }: { active: boolean; colors: OnboardingColorSet }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const progressValue = useRef(active ? 1 : 0);

  useEffect(() => {
    // 既に目標値と同じ場合は不要なアニメーション開始(再描画)を避ける
    if (progressValue.current === (active ? 1 : 0)) return;
    progressValue.current = active ? 1 : 0;
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: DOT_ANIMATION_MS,
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }),
          backgroundColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.dotInactive, colors.dotActive],
          }),
        },
      ]}
    />
  );
}

/**
 * アプリ初回起動時にのみ表示するオンボーディング画面。
 * 完了判定・フラグ保存は呼び出し側(app/_layout.tsx)が行い、本コンポーネントはvisible/onFinishのみを扱う。
 */
export function Onboarding({ visible, onFinish }: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  // translucentなModalはシステムバーの背後まで描画されるため、Modal外でinsetsを取得して加算する
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const colors = OnboardingColors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  const pageWidth = windowWidth - SHEET_HORIZONTAL_MARGIN * 2;
  const lastIndex = ONBOARDING_SLIDES.length - 1;
  const isLastStep = stepIndex === lastIndex;

  const listRef = useRef<{
    scrollToIndex: (params: { index: number; animated: boolean }) => void;
  } | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const dragStartOffset = useRef(0);

  const goTo = useCallback((index: number, animated = true) => {
    setStepIndex(index);
    listRef.current?.scrollToIndex({ index, animated });
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onFinish();
      return;
    }
    goTo(stepIndex + 1);
  }, [goTo, isLastStep, onFinish, stepIndex]);

  const handleScrollBeginDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragStartOffset.current = event.nativeEvent.contentOffset.x;
  }, []);

  // 50pt以上動かした場合のみ前後のスライドへ移動し、足りなければ元の位置へ戻す
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const startIndex = Math.round(dragStartOffset.current / pageWidth);
      const delta = event.nativeEvent.contentOffset.x - dragStartOffset.current;
      let target = startIndex;
      if (delta >= SWIPE_THRESHOLD) target = Math.min(startIndex + 1, lastIndex);
      else if (delta <= -SWIPE_THRESHOLD) target = Math.max(startIndex - 1, 0);
      goTo(target);
    },
    [goTo, lastIndex, pageWidth],
  );

  // 再表示時に前回の続きのスライドから始まらないようリセットする
  const handleDismiss = useCallback(() => {
    goTo(0, false);
  }, [goTo]);

  const illustrationTranslateX = scrollX.interpolate({
    inputRange: [0, Math.max(lastIndex * pageWidth, 1)],
    outputRange: [0, -lastIndex * windowWidth],
    extrapolate: 'clamp',
  });

  const renderSlide = useCallback(
    ({ item }: { item: OnboardingSlide }) => (
      <View style={[styles.slide, { width: pageWidth }]}>
        <Text style={[styles.slideTitle, { color: colors.slideTitle }]}>{item.title}</Text>
        <Text style={[styles.slideDescription, { color: colors.slideDescription }]}>
          {item.description}
        </Text>
      </View>
    ),
    [colors, pageWidth],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onFinish}
      onDismiss={handleDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
        testID="onboarding-container"
      >
        {colors.backgroundGradient ? (
          <GradientBackground stops={colors.backgroundGradient} />
        ) : null}

        <View style={styles.titleBlock}>
          <Text style={[styles.appTitle, { color: colors.title }]}>ひめくり日記</Text>
          <Text style={[styles.appSubtitle, { color: colors.subtitle }]}>毎日をひとことで残す</Text>
        </View>

        <View
          style={styles.illustrationArea}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[
              styles.illustrationRow,
              { width: windowWidth * ONBOARDING_SLIDES.length },
              { transform: [{ translateX: illustrationTranslateX }] },
            ]}
          >
            {ONBOARDING_SLIDES.map((slide) => (
              <View key={slide.key} style={[styles.illustrationPage, { width: windowWidth }]}>
                <OnboardingIllustration slideKey={slide.key} colors={colors.illustration} />
              </View>
            ))}
          </Animated.View>
        </View>

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.sheet,
              paddingBottom: insets.bottom,
              boxShadow: [{ offsetX: 0, offsetY: -12, blurRadius: 32, color: colors.sheetShadow }],
            },
          ]}
          testID="onboarding-sheet"
        >
          <Animated.FlatList
            ref={listRef as never}
            testID="onboarding-slides"
            data={ONBOARDING_SLIDES}
            keyExtractor={(slide) => slide.key}
            renderItem={renderSlide}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: pageWidth,
              offset: pageWidth * index,
              index,
            })}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: true,
            })}
            scrollEventThrottle={16}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            style={styles.slideList}
          />

          <View style={styles.pagination}>
            {ONBOARDING_SLIDES.map((slide, index) => (
              <Pressable
                key={slide.key}
                style={styles.dotButton}
                onPress={() => goTo(index)}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}枚目のスライドへ移動`}
                accessibilityState={{ selected: index === stepIndex }}
              >
                <PaginationDot active={index === stepIndex} colors={colors} />
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: pressed ? colors.primaryButtonPressed : colors.primaryButton },
            ]}
            onPress={handleNext}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryButtonText }]}>
              {isLastStep ? 'はじめる' : '次へ'}
            </Text>
          </Pressable>

          {/* 最後のスライドでも位置がずれないよう、非表示にしても領域は残す */}
          <Pressable
            style={({ pressed }) => [
              styles.skipButton,
              { opacity: isLastStep ? 0 : 1 },
              pressed ? { backgroundColor: colors.pressedSurface } : null,
            ]}
            onPress={onFinish}
            disabled={isLastStep}
            accessibilityRole="button"
            accessibilityLabel="オンボーディングをスキップ"
            accessibilityElementsHidden={isLastStep}
            importantForAccessibility={isLastStep ? 'no-hide-descendants' : 'auto'}
            testID="onboarding-skip"
          >
            <Text style={[styles.skipText, { color: colors.skip }]}>スキップ</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 15,
  },
  appTitle: {
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 1.8,
    lineHeight: 36,
  },
  appSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2.4,
    marginTop: 4,
  },
  illustrationArea: {
    flex: 1,
    marginTop: 20,
    // イラストの下端をシートの裏へ潜り込ませるため、はみ出し分を切り取らない
    overflow: 'visible',
  },
  illustrationRow: {
    flex: 1,
    flexDirection: 'row',
  },
  illustrationPage: {
    alignItems: 'center',
  },
  sheet: {
    marginHorizontal: SHEET_HORIZONTAL_MARGIN,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    alignItems: 'center',
  },
  slideList: {
    flexGrow: 0,
    alignSelf: 'stretch',
  },
  slide: {
    minHeight: 164,
    paddingTop: 30,
    paddingHorizontal: 40,
    paddingBottom: 5,
  },
  slideTitle: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 10,
  },
  slideDescription: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dotButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  primaryButton: {
    alignSelf: 'stretch',
    marginHorizontal: 20,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.28,
  },
  skipButton: {
    marginTop: 5,
    minWidth: 96,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
});
