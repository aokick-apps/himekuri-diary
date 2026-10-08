import { act, renderHook } from '@testing-library/react-native';

import { useStepperAutoRepeat } from '@/hooks/use-stepper-auto-repeat';

const START_DELAY_MS = 500;
const INTERVAL_MS = 120;

describe('useStepperAutoRepeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onChange once on a single tap without starting the auto-repeat (正常系: 単発タップ)', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useStepperAutoRepeat(onChange, false));

    act(() => {
      result.current.onPressIn();
      result.current.onPressOut();
      result.current.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(START_DELAY_MS * 2);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not start repeating before the start delay elapses (境界値: 開始遅延の直前)', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useStepperAutoRepeat(onChange, false));

    act(() => {
      result.current.onPressIn();
      jest.advanceTimersByTime(START_DELAY_MS - 1);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires once at the start delay and then every interval while held (正常系: 長押し)', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useStepperAutoRepeat(onChange, false));

    act(() => {
      result.current.onPressIn();
      jest.advanceTimersByTime(START_DELAY_MS);
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS * 3);
    });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('stops repeating on press out and ignores the trailing onPress after a long press (正常系: 二重発火の防止)', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useStepperAutoRepeat(onChange, false));

    act(() => {
      result.current.onPressIn();
      jest.advanceTimersByTime(START_DELAY_MS + INTERVAL_MS);
      result.current.onPressOut();
      result.current.onPress();
    });
    expect(onChange).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS * 5);
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('skips repeated calls while disabled, following the latest disabled value (異常系: 処理中は値を進めない)', () => {
    const onChange = jest.fn();
    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) => useStepperAutoRepeat(onChange, disabled),
      { initialProps: { disabled: false } },
    );

    act(() => {
      result.current.onPressIn();
      jest.advanceTimersByTime(START_DELAY_MS);
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender({ disabled: true });
    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS * 3);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timers on unmount (境界値: アンマウント時のクリーンアップ)', () => {
    const onChange = jest.fn();
    const { result, unmount } = renderHook(() => useStepperAutoRepeat(onChange, false));

    act(() => {
      result.current.onPressIn();
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(START_DELAY_MS + INTERVAL_MS * 3);
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
