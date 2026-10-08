import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';

import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

// Keyboard.addListenerに登録されたリスナーをイベント名ごとに取り出して直接呼ぶ
function mockKeyboardListeners() {
  const listeners = new Map<string, () => void>();
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
    listeners.set(eventName, listener as () => void);
    return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  return { listeners, remove };
}

describe('useKeyboardVisible', () => {
  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  it('follows the keyboardWillShow/WillHide events on iOS (正常系)', () => {
    setPlatform('ios');
    const { listeners } = mockKeyboardListeners();
    const { result } = renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);

    act(() => listeners.get('keyboardWillShow')?.());
    expect(result.current).toBe(true);

    act(() => listeners.get('keyboardWillHide')?.());
    expect(result.current).toBe(false);
  });

  it('uses the keyboardDidShow/DidHide events on Android, where will-events are not fired (境界値: Android)', () => {
    setPlatform('android');
    const { listeners } = mockKeyboardListeners();
    const { result } = renderHook(() => useKeyboardVisible());

    act(() => listeners.get('keyboardDidShow')?.());
    expect(result.current).toBe(true);
    expect(listeners.has('keyboardWillShow')).toBe(false);
  });

  it('removes both listeners on unmount (境界値: アンマウント時の後始末)', () => {
    setPlatform('ios');
    const { remove } = mockKeyboardListeners();
    const { unmount } = renderHook(() => useKeyboardVisible());

    unmount();

    expect(remove).toHaveBeenCalledTimes(2);
  });
});
