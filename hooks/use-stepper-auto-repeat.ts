import { useCallback, useEffect, useRef } from 'react';

// 長押しでのオートリピート開始までの遅延(ms)。単発タップと区別できる程度の間を持たせる
const STEPPER_REPEAT_START_DELAY_MS = 500;
// オートリピート中に値を増減する間隔(ms)
const STEPPER_REPEAT_INTERVAL_MS = 120;

// TimeStepperの−/+ボタン長押し中に一定間隔で値を増減し続けるオートリピートを実装するフック。
// PressableのonLongPressは単発でしか発火しないためsetIntervalで明示的に反復させる。
// onChange/disabledは再レンダリングで変わりうるため、実行中のタイマーが最新の値を参照できるようrefで保持する
export function useStepperAutoRepeat(onChange: () => void, disabled: boolean) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 長押しによるオートリピートが発火済みかどうか。発火済みの場合、指を離した際に届くonPressで
  // さらに1回増減してしまう(単発タップとの二重発火)のを防ぐために使う
  const didRepeatRef = useRef(false);

  const stopRepeating = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // アンマウント時にタイマーが残らないようにする
  useEffect(() => stopRepeating, [stopRepeating]);

  // 非同期処理(通知の再スケジュール登録)が完了するまでは値を進めない。既存のisTimePending等に
  // よる連打防止と同じ方針を、長押し中の連続発火にも適用する
  const fireIfEnabled = useCallback(() => {
    if (!disabledRef.current) {
      onChangeRef.current();
    }
  }, []);

  const handlePressIn = useCallback(() => {
    didRepeatRef.current = false;
    timeoutRef.current = setTimeout(() => {
      didRepeatRef.current = true;
      fireIfEnabled();
      intervalRef.current = setInterval(fireIfEnabled, STEPPER_REPEAT_INTERVAL_MS);
    }, STEPPER_REPEAT_START_DELAY_MS);
  }, [fireIfEnabled]);

  const handlePress = useCallback(() => {
    if (didRepeatRef.current) {
      didRepeatRef.current = false;
      return;
    }
    onChangeRef.current();
  }, []);

  return { onPressIn: handlePressIn, onPressOut: stopRepeating, onPress: handlePress };
}
