import {
  CALENDAR_MIN_YEARS_BACK,
  getFirstDayOfMonthKey,
  getMonthFromMonthIndex,
  getMonthIndex,
  getPickerMaxMonthIndex,
  getPickerMinMonthIndex,
  getYearFromMonthIndex,
  JA_MONTH_NAMES,
} from '@/utils/calendar-month';

describe('getMonthIndex / getYearFromMonthIndex / getMonthFromMonthIndex', () => {
  it.each([
    [2026, 1],
    [2026, 6],
    [2026, 12],
    [1999, 12],
  ])('round-trips %i年%i月 through the month index (正常系/境界値: 1月・12月)', (year, month) => {
    const index = getMonthIndex(year, month);

    expect(getYearFromMonthIndex(index)).toBe(year);
    expect(getMonthFromMonthIndex(index)).toBe(month);
  });

  it('orders consecutive months across a year boundary by plain integer comparison (境界値: 年またぎ)', () => {
    expect(getMonthIndex(2027, 1) - getMonthIndex(2026, 12)).toBe(1);
  });
});

describe('getPickerMaxMonthIndex', () => {
  it('returns the month index of the given day (正常系)', () => {
    expect(getPickerMaxMonthIndex(new Date(2026, 5, 25))).toBe(getMonthIndex(2026, 6));
  });
});

describe('getPickerMinMonthIndex', () => {
  const max = getMonthIndex(2026, 6);
  const floor = getMonthIndex(2026 - CALENDAR_MIN_YEARS_BACK, 1);

  function entryAt(year: number, month: number) {
    return {
      id: `${year}-${month}`,
      text: '本文',
      createdAt: new Date(year, month - 1, 15).toISOString(),
    };
  }

  it('falls back to January ten years ago when there are no entries (境界値: 日記0件)', () => {
    expect(getPickerMinMonthIndex([], max)).toBe(floor);
  });

  it('keeps the ten-year floor when every entry is newer than it (正常系)', () => {
    expect(getPickerMinMonthIndex([entryAt(2024, 4), entryAt(2026, 6)], max)).toBe(floor);
  });

  it('uses the oldest entry month when it is older than the floor (正常系)', () => {
    expect(getPickerMinMonthIndex([entryAt(2026, 6), entryAt(2012, 4)], max)).toBe(
      getMonthIndex(2012, 4),
    );
  });

  it('treats an entry exactly in the floor month as the floor itself (境界値: 下限と同じ月)', () => {
    expect(getPickerMinMonthIndex([entryAt(2016, 1)], max)).toBe(floor);
  });

  it('ignores entries whose createdAt cannot be parsed (異常系: 不正な日時)', () => {
    expect(getPickerMinMonthIndex([{ id: 'x', text: '本文', createdAt: 'not-a-date' }], max)).toBe(
      floor,
    );
  });
});

describe('getFirstDayOfMonthKey', () => {
  it('zero-pads single-digit months (境界値: 1桁の月)', () => {
    expect(getFirstDayOfMonthKey(2026, 3)).toBe('2026-03-01');
    expect(getFirstDayOfMonthKey(2026, 12)).toBe('2026-12-01');
  });
});

describe('JA_MONTH_NAMES', () => {
  it('lists the twelve Japanese month names in order (正常系)', () => {
    expect(JA_MONTH_NAMES).toHaveLength(12);
    expect(JA_MONTH_NAMES[0]).toBe('1月');
    expect(JA_MONTH_NAMES[11]).toBe('12月');
  });
});
