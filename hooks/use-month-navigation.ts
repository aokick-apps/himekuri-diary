import { useCallback, useMemo, useState } from 'react';
import type { DateData } from 'react-native-calendars';

import {
  getFirstDayOfMonthKey,
  getMonthIndex,
  getPickerMaxMonthIndex,
  getPickerMinMonthIndex,
  getYearFromMonthIndex,
} from '@/utils/calendar-month';
import { toDateKey } from '@/utils/diary-date';
import type { DiaryEntry } from '@/utils/diary-storage';

export type MonthNavigation = ReturnType<typeof useMonthNavigation>;

// 月表示カレンダーの表示中の年月と、年月ジャンプ用ピッカーの状態・移動可能範囲をまとめて管理する。
// カレンダー本体とピッカーが同じ下限・上限を参照するよう、範囲の計算はここに一本化している
export function useMonthNavigation(entries: DiaryEntry[]) {
  // カレンダーに現在表示中の年・月。react-native-calendarsの`current`propは初回マウント時にしか
  // 参照されない(ジャンプにはinitialDateを使う)ため、ヘッダー表示・ピッカーはこのstateを正とし、
  // onMonthChangeでスワイプ/矢印操作にも追従させる
  const [displayedYear, setDisplayedYear] = useState(() => new Date().getFullYear());
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date().getMonth() + 1);
  // Calendarへ渡す'YYYY-MM-DD'。`current`propは初回マウント時のみ参照され追従しないが、
  // `initialDate`は値が変わるたびその月へジャンプするため、年月ピッカーからのジャンプに使う。
  // テーマ切替時の強制再マウント後も移動先の月を復元できるよう、handleMonthChangeでも同期させる
  const [calendarInitialDate, setCalendarInitialDate] = useState(() => toDateKey(new Date()));
  // 年月ジャンプ用ピッカーの表示状態と、ピッカー内で選択中の年(月はdisplayedMonthを参照)
  const [isMonthPickerVisible, setIsMonthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(displayedYear);

  const [pickerToday, setPickerToday] = useState(() => new Date());
  const pickerMaxYear = pickerToday.getFullYear();
  const pickerMaxMonthIndex = getPickerMaxMonthIndex(pickerToday);

  const pickerMinMonthIndex = useMemo(() => {
    return getPickerMinMonthIndex(entries, pickerMaxMonthIndex);
  }, [entries, pickerMaxMonthIndex]);

  const pickerMinYear = getYearFromMonthIndex(pickerMinMonthIndex);

  const isPickerMonthInRange = useCallback(
    (year: number, month: number) => {
      const monthIndex = getMonthIndex(year, month);
      return monthIndex >= pickerMinMonthIndex && monthIndex <= pickerMaxMonthIndex;
    },
    [pickerMinMonthIndex, pickerMaxMonthIndex],
  );

  const isPreviousYearDisabled = pickerYear <= pickerMinYear;
  const isNextYearDisabled = pickerYear >= pickerMaxYear;

  // スワイプ・矢印操作で表示月が変わった際、ヘッダー表示・年月ピッカーのハイライト・
  // calendarInitialDateをその月に追従させる。テーマ切替時の`key={colorScheme}`強制再マウント後、
  // 新しいCalendarインスタンスはinitialDateから表示月を再構築するため、ここで同期させておかないと
  // スワイプ・矢印だけで移動した状態でテーマを切り替えた際に日付グリッドが今日の月へ巻き戻ってしまう
  const handleMonthChange = useCallback((date: DateData) => {
    setDisplayedYear(date.year);
    setDisplayedMonth(date.month);
    setCalendarInitialDate(getFirstDayOfMonthKey(date.year, date.month));
  }, []);

  // ヘッダーの年月表示をタップすると、現在表示中の年を初期選択状態にしてピッカーを開く
  const handleOpenMonthPicker = useCallback(() => {
    const currentToday = new Date();
    const currentPickerMaxMonthIndex = getPickerMaxMonthIndex(currentToday);
    const currentPickerMinYear = getYearFromMonthIndex(
      getPickerMinMonthIndex(entries, currentPickerMaxMonthIndex),
    );
    setPickerToday(currentToday);
    setPickerYear(
      Math.min(Math.max(displayedYear, currentPickerMinYear), currentToday.getFullYear()),
    );
    setIsMonthPickerVisible(true);
  }, [displayedYear, entries]);

  const handleCloseMonthPicker = useCallback(() => {
    setIsMonthPickerVisible(false);
  }, []);

  const handlePickerYearStep = useCallback(
    (delta: number) => {
      setPickerYear((year) => Math.min(Math.max(year + delta, pickerMinYear), pickerMaxYear));
    },
    [pickerMinYear, pickerMaxYear],
  );

  // 月ボタンが選択されたら、その年月の1日をcalendarInitialDateへセットしてカレンダーをジャンプさせる
  const handleSelectMonth = useCallback(
    (month: number) => {
      if (!isPickerMonthInRange(pickerYear, month)) {
        return;
      }
      setDisplayedYear(pickerYear);
      setDisplayedMonth(month);
      setCalendarInitialDate(getFirstDayOfMonthKey(pickerYear, month));
      setIsMonthPickerVisible(false);
    },
    [isPickerMonthInRange, pickerYear],
  );

  const displayedMonthIndex = getMonthIndex(displayedYear, displayedMonth);

  return {
    displayedYear,
    displayedMonth,
    calendarInitialDate,
    isMonthPickerVisible,
    pickerYear,
    pickerMinYear,
    pickerMinMonthIndex,
    pickerMaxMonthIndex,
    isPickerMonthInRange,
    isPreviousYearDisabled,
    isNextYearDisabled,
    canMoveToPreviousMonth: displayedMonthIndex > pickerMinMonthIndex,
    canMoveToNextMonth: displayedMonthIndex < pickerMaxMonthIndex,
    handleMonthChange,
    handleOpenMonthPicker,
    handleCloseMonthPicker,
    handlePickerYearStep,
    handleSelectMonth,
  };
}
