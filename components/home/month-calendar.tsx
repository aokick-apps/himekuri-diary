import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CalendarProps, DateData } from 'react-native-calendars';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemePreference } from '@/contexts/theme-preference-context';
import type { MonthNavigation } from '@/hooks/use-month-navigation';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getFirstDayOfMonthKey,
  getMonthFromMonthIndex,
  JA_MONTH_NAMES,
} from '@/utils/calendar-month';
import { formatDateHeading, toDateKey } from '@/utils/diary-date';
import type { DiaryEntry } from '@/utils/diary-storage';

// 外枠の実測高さがまだ取れていない初回レンダー用のフォールバック値
const DEFAULT_DAY_CELL_HEIGHT = 48;
// 日付セル内テキストの拡大率上限。OS文字サイズ設定で無制限に拡大されるとdayCellHeightを
// 超えてoverflow: 'hidden'で見切れてしまうため、上限を設ける
const DAY_CELL_MAX_FONT_SCALE = 1.5;
// showSixWeeksにより月をまたいでも常に6行になるため、固定値で計算する
const CALENDAR_WEEK_ROWS = 6;
// react-native-calendarsのヘッダー+曜日行のおおよその高さと、週の行マージン(weekVerticalMargin=7の上下2回分)
const CALENDAR_CHROME_HEIGHT = 90;
const CALENDAR_WEEK_ROW_MARGIN = 14;

// react-native-calendarsが使うdayComponentのpropsの型(ライブラリ側から直接exportされていないため、
// CalendarPropsから抽出して利用する)
type DayComponentProps = ComponentProps<NonNullable<CalendarProps['dayComponent']>>;

// アプリ全体が日本語UIのため、カレンダーの月名・曜日名・「今日」ボタンの表記も日本語化する
LocaleConfig.locales.ja = {
  monthNames: JA_MONTH_NAMES,
  monthNamesShort: JA_MONTH_NAMES,
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
  today: '今日',
};
LocaleConfig.defaultLocale = 'ja';

// 月表示レイアウトのカレンダー部分。日付セルに日記の有無・件数を表示し、見出しのタップで年月ピッカーを開く
export function MonthCalendar({
  entriesByDate,
  isLoading,
  navigation,
  onDayPress,
}: {
  entriesByDate: Record<string, DiaryEntry[]>;
  isLoading: boolean;
  navigation: MonthNavigation;
  onDayPress: (date: DateData) => void;
}) {
  const { colorScheme } = useThemePreference();
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');
  // カレンダー外枠(flex: 1で残りスペースを使い切るView)の実測高さ(onLayoutで取得)。
  // 日付グリッドの高さもこの値を基準に算出し、外枠との基準を一致させる
  const [wrapperHeight, setWrapperHeight] = useState(0);

  // 外枠の実測高さ(wrapperHeight)からヘッダー+曜日行の高さと6週分の行マージンを差し引き、
  // 残りを6週で均等に割って日付セルの高さを算出する。カレンダー本体側の実測値を使う反復補正も
  // 試したが、react-native-calendarsのレイアウト確定タイミングとズレて不安定だったため、
  // 外枠の実測値のみを使うシンプルな一度切りの計算にしている
  const dayCellHeight = useMemo(() => {
    if (wrapperHeight <= 0) {
      return DEFAULT_DAY_CELL_HEIGHT;
    }
    const gridHeight = wrapperHeight - CALENDAR_CHROME_HEIGHT;
    const perRowHeight = gridHeight / CALENDAR_WEEK_ROWS - CALENDAR_WEEK_ROW_MARGIN;
    return Math.max(DEFAULT_DAY_CELL_HEIGHT, perRowHeight);
  }, [wrapperHeight]);

  // react-native-calendarsのrenderHeaderは矢印・曜日行を維持したまま中央の見出しのみ差し替えられるため、
  // 既存の月送り・レイアウトに影響せず見出しをタップ可能なボタンに置き換えられる
  const renderCalendarHeader = useCallback(() => {
    return (
      <Pressable
        onPress={navigation.handleOpenMonthPicker}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${navigation.displayedYear}年${navigation.displayedMonth}月、年月を選択して移動`}
        style={styles.calendarHeaderButton}
      >
        <ThemedText
          allowFontScaling={false}
          style={[styles.calendarHeaderText, { color: textColor }]}
        >
          {navigation.displayedYear}年{navigation.displayedMonth}月
        </ThemedText>
        <IconSymbol name="chevron.down" size={18} color={textColor} />
      </Pressable>
    );
  }, [
    navigation.displayedYear,
    navigation.displayedMonth,
    navigation.handleOpenMonthPicker,
    textColor,
  ]);

  const renderDay = useCallback(
    ({ date, state }: DayComponentProps) => {
      if (!date) {
        return null;
      }

      const dayEntries = entriesByDate[date.dateString];
      // その日にエントリが実在するか(タイトル文字列の有無ではなくonDayPressと同じ基準で判定。
      // 本文が空白のみのレガシーデータではタイトルが空文字列になり得るため区別が必要)
      const hasEntries = Boolean(dayEntries?.length);
      const entryCount = dayEntries?.length ?? 0;
      const isDisabled = state === 'disabled' || state === 'inactive';
      const isToday = state === 'today';
      // 未来日はmaxDateによりstateが'disabled'になるため、それ以外は押せる扱いにする。
      // 読み込み中はonDayPressが何もしないため、見た目・アクセシビリティ上も押せない扱いにする
      const isPressable = !isLoading && (hasEntries || state !== 'disabled');
      // スクリーンリーダー向けに「何年何月何日か」「日記の有無・新規作成可否」が伝わるラベルを組み立てる
      const statusLabel = hasEntries
        ? `日記あり(${entryCount}件)`
        : isPressable
          ? '日記なし、タップして新規作成'
          : '日記なし';
      const accessibilityLabel = `${formatDateHeading(date.dateString)}、${statusLabel}`;

      return (
        <Pressable
          style={[styles.dayCell, { height: dayCellHeight }]}
          // react-native-calendars内部のonPressはmaxDateを超える日付で発火しないため、
          // isPressableの判定と遷移処理を一致させるためonDayPressを直接呼び出す
          onPress={() => onDayPress(date)}
          disabled={!isPressable}
          accessibilityRole={isPressable ? 'button' : undefined}
          accessibilityLabel={accessibilityLabel}
          // タップしても反応しない日はスクリーンリーダーにも操作不可であることを明示的に伝える
          accessibilityState={{ disabled: !isPressable }}
        >
          {isToday ? (
            // 今日のセルは数字を丸背景で囲んで強調する
            <View style={[styles.todayBadge, { backgroundColor: tintColor }]}>
              <ThemedText
                style={[styles.dayNumber, { color: backgroundColor, fontWeight: '700' as const }]}
                maxFontSizeMultiplier={DAY_CELL_MAX_FONT_SCALE}
              >
                {date.day}
              </ThemedText>
            </View>
          ) : (
            <ThemedText
              style={[styles.dayNumber, isDisabled ? styles.dayNumberDisabled : undefined]}
              maxFontSizeMultiplier={DAY_CELL_MAX_FONT_SCALE}
            >
              {date.day}
            </ThemedText>
          )}
          {entryCount === 1 ? (
            // タイトル文字は小さすぎて読めないため、日記が1件あることが伝わるドットで代替する
            <View style={[styles.entryDot, { backgroundColor: tintColor }]} />
          ) : entryCount > 1 ? (
            // 2件以上ある場合は合計件数を丸バッジで表示する
            <View style={[styles.entryCountBadge, { backgroundColor: tintColor }]}>
              <ThemedText
                style={[styles.entryCountText, { color: backgroundColor }]}
                maxFontSizeMultiplier={DAY_CELL_MAX_FONT_SCALE}
              >
                {entryCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [entriesByDate, isLoading, tintColor, backgroundColor, dayCellHeight, onDayPress],
  );

  return (
    <View
      style={[styles.calendarWrapper, { borderColor: iconColor, backgroundColor }]}
      onLayout={(event) => setWrapperHeight(event.nativeEvent.layout.height)}
    >
      <Calendar
        // react-native-calendarsはtheme propのスタイルをuseRefで初回計算しキャッシュするため、
        // マウント後のテーマ変更に追従しない。colorSchemeをkeyにして変化のたびに強制再マウントさせる
        key={colorScheme}
        theme={{
          backgroundColor,
          calendarBackground: backgroundColor,
          // 曜日行はtextColorを使い、アイコン色より高いコントラストで視認性を確保する
          textSectionTitleColor: textColor,
          textDayHeaderFontWeight: '600',
          dayTextColor: textColor,
          arrowColor: tintColor,
          todayTextColor: tintColor,
        }}
        dayComponent={renderDay}
        onDayPress={onDayPress}
        // 見出しを日本語語順で表示しつつ、タップで年月ピッカーを開くボタンに差し替える
        renderHeader={renderCalendarHeader}
        enableSwipeMonths
        // ピッカーから任意の年月へジャンプするための制御用prop(詳細はcalendarInitialDateを参照)
        initialDate={navigation.calendarInitialDate}
        onMonthChange={navigation.handleMonthChange}
        // 未来日を新規作成の対象外にするため、今日より後の日付をタップ不可(state: 'disabled')にする
        maxDate={toDateKey(new Date())}
        // 年月ピッカーで選択可能な最古月より過去へスワイプできてしまうと、
        // ピッカーのクランプ処理と表示中の月が食い違うため下限を揃える
        minDate={getFirstDayOfMonthKey(
          navigation.pickerMinYear,
          getMonthFromMonthIndex(navigation.pickerMinMonthIndex),
        )}
        // minDate/maxDateは日付セルの見た目にのみ影響し、矢印タップ・スワイプによる
        // 月送り自体はブロックしないため、範囲外への移動はここで直接止める
        onPressArrowLeft={(subtractMonth) => {
          if (navigation.canMoveToPreviousMonth) {
            subtractMonth();
          }
        }}
        onPressArrowRight={(addMonth) => {
          if (navigation.canMoveToNextMonth) {
            addMonth();
          }
        }}
        disableArrowLeft={!navigation.canMoveToPreviousMonth}
        disableArrowRight={!navigation.canMoveToNextMonth}
        // 月によって行数(4〜6週)が変わって高さがガタつかないよう、常に6週分の高さで揃える
        showSixWeeks
      />
    </View>
  );
}

const styles = StyleSheet.create({
  calendarWrapper: {
    // 残りスペースをすべて使い切る外枠。日付グリッドの高さ計算もこの実測高さを基準にし、
    // 外枠と内部の基準がズレて中身がはみ出さないようにする
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    // 実測に多少の誤差があっても、日付グリッドが外枠からはみ出して見えないようにする保険
    overflow: 'hidden',
  },
  calendarHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  calendarHeaderText: {
    // react-native-calendarsのデフォルト見出し(textMonthFontSize/textMonthFontWeight)と揃えた見た目にしている
    fontSize: 18,
    fontWeight: '700',
  },
  dayCell: {
    alignItems: 'center',
    paddingTop: 4,
    gap: 2,
  },
  dayNumber: {
    fontSize: 14,
  },
  dayNumberDisabled: {
    opacity: 0.3,
  },
  todayBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  entryCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  entryCountText: {
    fontSize: 9,
    fontWeight: '700',
    // ThemedTextのデフォルトlineHeight(24)だと丸の中で数字が下寄りになるため、fontSizeに近い値を明示する
    lineHeight: 11,
  },
});
