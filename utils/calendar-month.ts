import type { DiaryEntry } from '@/utils/diary-storage';

// 年月を1つの整数(年*12+月)で扱い、範囲比較や前後移動を単純な大小比較にする
export function getMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export function getPickerMaxMonthIndex(today: Date): number {
  return getMonthIndex(today.getFullYear(), today.getMonth() + 1);
}

// 日記が無い月にも過去日の日記を書けるよう、カレンダー・年月ピッカーの下限は最古の日記の月に
// かかわらず、少なくとも今年からこの年数分さかのぼった年の1月まで遡れるようにする
export const CALENDAR_MIN_YEARS_BACK = 10;

export function getPickerMinMonthIndex(entries: DiaryEntry[], pickerMaxMonthIndex: number): number {
  const floorMonthIndex = getMonthIndex(
    getYearFromMonthIndex(pickerMaxMonthIndex) - CALENDAR_MIN_YEARS_BACK,
    1,
  );
  const entryMonthIndexes = entries
    .map((entry) => {
      const createdAt = new Date(entry.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }
      return getMonthIndex(createdAt.getFullYear(), createdAt.getMonth() + 1);
    })
    .filter((monthIndex): monthIndex is number => monthIndex !== null);

  return Math.min(floorMonthIndex, ...entryMonthIndexes);
}

export function getYearFromMonthIndex(monthIndex: number): number {
  return Math.floor((monthIndex - 1) / 12);
}

export function getMonthFromMonthIndex(monthIndex: number): number {
  return ((monthIndex - 1) % 12) + 1;
}

// 指定した年月の1日を表す'YYYY-MM-DD'キーを組み立てる
export function getFirstDayOfMonthKey(year: number, month: number): string {
  return `${year}-${`${month}`.padStart(2, '0')}-01`;
}

// 日本語の月名。react-native-calendarsのロケール設定と年月ピッカーの月ボタン表示で共有する
export const JA_MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];
