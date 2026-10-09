import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  dateKeyToDate,
  formatDateHeading,
  getSwipeDayDelta,
  getWeekDays,
  toDateKey,
} from '@/utils/diary-date';
import type { DiaryEntry } from '@/utils/diary-storage';
import { truncateForAccessibilityLabel } from '@/utils/diary-text';

// 週表示レイアウトの「今日」判定を再評価する間隔(ミリ秒)。タブ画面が保持され続けても
// 日付をまたいだタイミングから1分以内には追従できるようにする
const TODAY_DATE_KEY_REFRESH_INTERVAL_MS = 60 * 1000;

// 週表示カレンダーのヘッダーで使う曜日の短縮名(getWeekDaysのdayOfWeek(0:日〜6:土)に対応する並び)
const JA_WEEKDAY_SHORT_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 週表示レイアウトのカレンダー部分。フォーカス中の日を含む週(日曜始まり)の7日分を1行の
// ヘッダーとして表示し、各日付の下にその日の日記を作成日時の昇順で並べる(初期フォーカスは今日)。
// ヘッダーの日付タップ・専用の前後日ボタンのタップ・左右スワイプでフォーカスを前後の日へ移動でき、
// フォーカスが週の外に出た場合は表示する週ごと自動的に切り替わる。
// 日記の無い今日以前の日には、月表示の空日タップと同じく新規作成モーダルを開く「+」ボタンを出す
export function WeekCalendarView({
  entriesByDate,
  onEntryPress,
  onCreateEntry,
  isLoading,
  showEmptyWeekHint,
}: {
  entriesByDate: Record<string, DiaryEntry[]>;
  onEntryPress: (dateKey: string) => void;
  onCreateEntry: (dateKey: string) => void;
  // 日記の有無が未確定の間は新規作成ボタンを出さない
  isLoading: boolean;
  // 日記が1件も無い場合は画面上部の案内と重複するため、週内のヒントは出さない
  showEmptyWeekHint: boolean;
}) {
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const linkColor = useThemeColor({}, 'link');
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');

  // 「今日」の日付キー。expo-routerのTabsはタブ画面をアンマウントしないため、マウント時一度きりの
  // 評価だと週表示を開いたまま日付をまたいでも古い日付を指し続ける。フォーカス復帰時に加え、
  // 開いたままでも追従できるようタイマーでも定期的に再評価する
  const [todayDateKey, setTodayDateKey] = useState(() => toDateKey(new Date()));
  useFocusEffect(
    useCallback(() => {
      setTodayDateKey(toDateKey(new Date()));
    }, []),
  );
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTodayDateKey(toDateKey(new Date()));
    }, TODAY_DATE_KEY_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);
  // フォーカス中の日。初期値は今日で、タップ/スワイプ操作で前後に移動する
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const focusedDateKey = useMemo(() => toDateKey(focusedDate), [focusedDate]);
  // 表示する週はフォーカス中の日を基準に毎回計算し直すため、週の外へフォーカスが
  // 移動した場合も自動的に隣の週へ表示が切り替わる
  const weekDays = useMemo(() => getWeekDays(focusedDate), [focusedDate]);

  // フォーカスをdelta日分(前日: -1 / 翌日: +1)移動する。前後日ボタンのタップ・スワイプ操作の共通処理
  const moveFocusByDays = useCallback((delta: number) => {
    setFocusedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }, []);

  // 週ヘッダーの日付タップで、その日へフォーカスを移す
  const handleFocusDate = useCallback((dateKey: string) => {
    setFocusedDate(dateKeyToDate(dateKey));
  }, []);

  // 左右スワイプでフォーカスを前後の日へ移動するジェスチャー(追加ライブラリ不要なPanResponderを使用)。
  // 移動量の判定自体はgetSwipeDayDeltaに切り出しており、ここでは結果に応じてフォーカスを動かすだけ
  const panResponderRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        getSwipeDayDelta(gestureState.dx, gestureState.dy) !== 0,
      onPanResponderRelease: (_event, gestureState) => {
        const delta = getSwipeDayDelta(gestureState.dx, gestureState.dy);
        if (delta !== 0) {
          moveFocusByDays(delta);
        }
      },
    }),
  );

  const isWeekEmpty =
    !isLoading && weekDays.every((weekDay) => (entriesByDate[weekDay.dateKey] ?? []).length === 0);

  return (
    <View
      style={[styles.weekWrapper, { borderColor: iconColor, backgroundColor }]}
      {...panResponderRef.current.panHandlers}
    >
      <View style={styles.weekFocusNav}>
        <Pressable
          onPress={() => moveFocusByDays(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="前の日へ移動"
        >
          <IconSymbol name="chevron.left" size={20} color={tintColor} />
        </Pressable>
        <ThemedText type="subtitle" style={{ color: textColor }}>
          {formatDateHeading(focusedDateKey)}
        </ThemedText>
        <Pressable
          onPress={() => moveFocusByDays(1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="次の日へ移動"
        >
          <IconSymbol name="chevron.right" size={20} color={tintColor} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.weekScrollContent}>
        {isWeekEmpty && showEmptyWeekHint ? (
          <ThemedText style={styles.weekEmptyHint}>
            「+」をタップすると、その日の日記を新規作成できます
          </ThemedText>
        ) : null}
        <View style={styles.weekRow}>
          {weekDays.map((weekDay) => {
            const isToday = weekDay.dateKey === todayDateKey;
            const isFocused = weekDay.dateKey === focusedDateKey;
            const dayEntries = entriesByDate[weekDay.dateKey] ?? [];
            return (
              <View key={weekDay.dateKey} style={styles.weekColumn}>
                <Pressable
                  onPress={() => handleFocusDate(weekDay.dateKey)}
                  style={[styles.weekColumnHeader, isFocused && { borderColor: tintColor }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDateHeading(weekDay.dateKey)}にフォーカスを移動`}
                  accessibilityState={{ selected: isFocused }}
                >
                  <ThemedText style={[styles.weekDayName, { color: textColor }]}>
                    {JA_WEEKDAY_SHORT_NAMES[weekDay.dayOfWeek]}
                  </ThemedText>
                  {isToday ? (
                    <View style={[styles.todayBadge, { backgroundColor: tintColor }]}>
                      <ThemedText
                        style={[styles.dayNumber, { color: backgroundColor, fontWeight: '700' }]}
                      >
                        {weekDay.day}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={styles.dayNumber}>{weekDay.day}</ThemedText>
                  )}
                </Pressable>
                <View style={styles.weekColumnEntries}>
                  {dayEntries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => onEntryPress(weekDay.dateKey)}
                      style={[styles.weekEntryItem, { backgroundColor: tintColor }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDateHeading(weekDay.dateKey)}の日記: ${truncateForAccessibilityLabel(entry.text)}`}
                    >
                      <ThemedText
                        numberOfLines={2}
                        style={[styles.weekEntryText, { color: backgroundColor }]}
                      >
                        {entry.text || '(内容なし)'}
                      </ThemedText>
                    </Pressable>
                  ))}
                  {!isLoading && dayEntries.length === 0 && weekDay.dateKey <= todayDateKey ? (
                    <Pressable
                      onPress={() => onCreateEntry(weekDay.dateKey)}
                      hitSlop={8}
                      style={[
                        styles.weekCreateButton,
                        { borderColor: tintColor },
                        // 全日が空の週では今日の列だけ強調して、最初に押す場所が分かるようにする
                        isWeekEmpty && isToday && styles.weekCreateButtonEmphasized,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDateHeading(weekDay.dateKey)}の日記を新規作成`}
                    >
                      <ThemedText style={[styles.weekCreateButtonText, { color: linkColor }]}>
                        +
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 週表示のカレンダー部分。calendarWrapperと同様に残りスペースを使い切る
  weekWrapper: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  weekScrollContent: {
    padding: 8,
  },
  // フォーカス中の日の見出しと、タップで前後日へ移動するボタンを並べるナビゲーションバー
  weekFocusNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  // フォーカス中の日を枠線で強調するため、常に(透明の)枠線を確保しておきレイアウトのガタつきを防ぐ
  weekColumnHeader: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  weekDayName: {
    fontSize: 12,
  },
  weekColumnEntries: {
    width: '100%',
    gap: 4,
  },
  // タップ領域の目安(44pt)を確保した、日記の無い日の新規作成ボタン
  weekCreateButton: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  weekCreateButtonEmphasized: {
    borderWidth: 2,
    borderStyle: 'solid',
  },
  weekEmptyHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
    paddingBottom: 8,
  },
  weekCreateButtonText: {
    fontSize: 20,
    lineHeight: 24,
  },
  weekEntryItem: {
    width: '100%',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  weekEntryText: {
    fontSize: 10,
  },
  todayBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 14,
  },
});
