import { act, renderHook } from '@testing-library/react-native';

import { useMonthNavigation } from '@/hooks/use-month-navigation';
import type { DiaryEntry } from '@/utils/diary-storage';

const NOW = new Date(2026, 5, 25, 12, 0, 0);

function monthChange(year: number, month: number) {
  return {
    year,
    month,
    day: 1,
    timestamp: new Date(year, month - 1, 1).getTime(),
    dateString: `${year}-${`${month}`.padStart(2, '0')}-01`,
  };
}

describe('useMonthNavigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts on the current month with the arrows limited only by the upper bound (正常系: 初期状態)', () => {
    const { result } = renderHook(() => useMonthNavigation([]));

    expect(result.current.displayedYear).toBe(2026);
    expect(result.current.displayedMonth).toBe(6);
    expect(result.current.calendarInitialDate).toBe('2026-06-25');
    expect(result.current.canMoveToPreviousMonth).toBe(true);
    expect(result.current.canMoveToNextMonth).toBe(false);
  });

  it('follows swipe/arrow month changes and syncs calendarInitialDate to the first day (正常系)', () => {
    const { result } = renderHook(() => useMonthNavigation([]));

    act(() => {
      result.current.handleMonthChange(monthChange(2025, 12));
    });

    expect(result.current.displayedYear).toBe(2025);
    expect(result.current.displayedMonth).toBe(12);
    expect(result.current.calendarInitialDate).toBe('2025-12-01');
    expect(result.current.canMoveToNextMonth).toBe(true);
  });

  it('stops the previous-month arrow at January ten years ago (境界値: 下限)', () => {
    const { result } = renderHook(() => useMonthNavigation([]));

    act(() => {
      result.current.handleMonthChange(monthChange(2016, 1));
    });

    expect(result.current.canMoveToPreviousMonth).toBe(false);
  });

  it('opens the picker on the displayed year and clamps year steps to the range (正常系/境界値)', () => {
    const { result } = renderHook(() => useMonthNavigation([]));

    act(() => {
      result.current.handleOpenMonthPicker();
    });
    expect(result.current.isMonthPickerVisible).toBe(true);
    expect(result.current.pickerYear).toBe(2026);
    expect(result.current.isNextYearDisabled).toBe(true);

    act(() => {
      result.current.handlePickerYearStep(-100);
    });
    expect(result.current.pickerYear).toBe(2016);
    expect(result.current.isPreviousYearDisabled).toBe(true);

    act(() => {
      result.current.handlePickerYearStep(100);
    });
    expect(result.current.pickerYear).toBe(2026);
  });

  it('jumps to the selected month and closes the picker, but ignores months outside the range (正常系/異常系)', () => {
    const { result } = renderHook(() => useMonthNavigation([]));
    act(() => {
      result.current.handleOpenMonthPicker();
    });

    act(() => {
      result.current.handleSelectMonth(12);
    });
    expect(result.current.isMonthPickerVisible).toBe(true);
    expect(result.current.displayedMonth).toBe(6);

    act(() => {
      result.current.handleSelectMonth(3);
    });
    expect(result.current.isMonthPickerVisible).toBe(false);
    expect(result.current.displayedMonth).toBe(3);
    expect(result.current.calendarInitialDate).toBe('2026-03-01');
  });

  it('extends the lower bound to the oldest entry month when it is older than ten years ago (正常系)', () => {
    const entries: DiaryEntry[] = [
      { id: 'old', text: '古い日記', createdAt: new Date(2012, 3, 15).toISOString() },
    ];
    const { result } = renderHook(() => useMonthNavigation(entries));

    expect(result.current.pickerMinYear).toBe(2012);
    expect(result.current.isPickerMonthInRange(2012, 3)).toBe(false);
    expect(result.current.isPickerMonthInRange(2012, 4)).toBe(true);
  });
});
