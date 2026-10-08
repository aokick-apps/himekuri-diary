import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useModalSlideTransition } from '@/hooks/use-modal-slide-transition';
import type { MonthNavigation } from '@/hooks/use-month-navigation';
import { useThemeColor } from '@/hooks/use-theme-color';
import { JA_MONTH_NAMES } from '@/utils/calendar-month';

// 年月ピッカーモーダルの高さ上限(画面高さに対する割合)
const MONTH_PICKER_MAX_HEIGHT_RATIO = 0.7;

// カレンダー見出しのタップで開く、年と月を選んでその月へジャンプするボトムシート
export function MonthPickerModal({
  navigation,
  contentBottomPadding,
}: {
  navigation: MonthNavigation;
  contentBottomPadding: number;
}) {
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');
  // 年月ピッカーモーダルのアニメーション制御(詳細はuseModalSlideTransitionを参照)
  const monthPickerTransition = useModalSlideTransition(navigation.isMonthPickerVisible);
  // modalContentのmaxHeight(%)は内容量で高さが決まる親ラッパーを基準に解決され上限として機能しないため、
  // 画面高さからpxで算出して上書きする
  const { height: windowHeight } = useWindowDimensions();
  const monthPickerMaxHeight = windowHeight * MONTH_PICKER_MAX_HEIGHT_RATIO;

  return (
    <Modal
      visible={monthPickerTransition.isMounted}
      animationType="none"
      transparent
      onRequestClose={navigation.handleCloseMonthPicker}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* 背景の半透明オーバーレイをタップした場合はモーダルを閉じる(他のモーダルと同じパターン) */}
      <Pressable
        style={styles.modalOverlay}
        onPress={navigation.handleCloseMonthPicker}
        testID="modal-overlay-pressable"
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.modalOverlayBackground,
            { opacity: monthPickerTransition.overlayOpacity },
          ]}
        />
        <Animated.View
          style={{ transform: [{ translateY: monthPickerTransition.contentTranslateY }] }}
        >
          <ThemedView
            style={[
              styles.modalContent,
              {
                borderColor: iconColor,
                paddingBottom: contentBottomPadding,
                maxHeight: monthPickerMaxHeight,
              },
            ]}
            // オーバーレイへのタップ伝播を防ぐため、modalContent内のタッチ開始をこのViewが引き受ける
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">年月を選択</ThemedText>
              <Pressable
                onPress={navigation.handleCloseMonthPicker}
                accessibilityRole="button"
                accessibilityLabel="閉じる"
              >
                <ThemedText style={[styles.modalCloseText, { color: tintColor }]}>
                  閉じる
                </ThemedText>
              </Pressable>
            </View>
            <View style={styles.yearStepperRow}>
              <Pressable
                onPress={() => navigation.handlePickerYearStep(-1)}
                disabled={navigation.isPreviousYearDisabled}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="前の年"
                accessibilityState={{ disabled: navigation.isPreviousYearDisabled }}
                style={[
                  styles.yearStepperButton,
                  navigation.isPreviousYearDisabled ? styles.disabledButton : null,
                ]}
              >
                <IconSymbol
                  name="chevron.left"
                  size={24}
                  color={navigation.isPreviousYearDisabled ? iconColor : tintColor}
                />
              </Pressable>
              <ThemedText type="subtitle">{navigation.pickerYear}年</ThemedText>
              <Pressable
                onPress={() => navigation.handlePickerYearStep(1)}
                disabled={navigation.isNextYearDisabled}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="次の年"
                accessibilityState={{ disabled: navigation.isNextYearDisabled }}
                style={[
                  styles.yearStepperButton,
                  navigation.isNextYearDisabled ? styles.disabledButton : null,
                ]}
              >
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={navigation.isNextYearDisabled ? iconColor : tintColor}
                />
              </Pressable>
            </View>
            <ThemedText style={[styles.monthPickerHint, { color: iconColor }]}>
              薄く表示されている月は選択できません
            </ThemedText>
            {/* maxHeightに収まらない画面でも全ての月に到達できるようスクロール可能にする */}
            <ScrollView
              style={styles.monthGridScrollView}
              contentContainerStyle={[styles.monthGrid, { paddingBottom: contentBottomPadding }]}
              testID="month-picker-scroll"
            >
              {JA_MONTH_NAMES.map((monthName, index) => {
                const month = index + 1;
                const isSelected =
                  navigation.pickerYear === navigation.displayedYear &&
                  month === navigation.displayedMonth;
                const isDisabled = !navigation.isPickerMonthInRange(navigation.pickerYear, month);
                return (
                  <Pressable
                    key={monthName}
                    style={[
                      styles.monthGridButton,
                      { borderColor: iconColor },
                      isSelected ? { backgroundColor: tintColor, borderColor: tintColor } : null,
                      isDisabled ? styles.disabledButton : null,
                    ]}
                    onPress={() => navigation.handleSelectMonth(month)}
                    disabled={isDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isDisabled
                        ? `${navigation.pickerYear}年${monthName}(選択できません)`
                        : `${navigation.pickerYear}年${monthName}へ移動`
                    }
                    accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                  >
                    <ThemedText
                      style={isSelected ? { color: backgroundColor } : { color: textColor }}
                    >
                      {monthName}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </ThemedView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // 背景の暗さを別レイヤーにし、opacityフェードをコンテンツのスライドから独立させる
  modalOverlayBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalCloseText: {
    fontSize: 16,
  },
  yearStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  yearStepperButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  monthGridScrollView: {
    // maxHeightで区切られた領域の中で自身がスクロール可能な範囲として振る舞うために必要
    flex: 1,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthGridButton: {
    // 3列×4行で12ヶ月を並べる(gap込みで4等分すると幅がはみ出すため31%にしている)
    width: '31%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.35,
  },
});
