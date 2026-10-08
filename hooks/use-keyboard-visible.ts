import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// キーボードが表示中かどうか。iOSは表示アニメーションと同時にレイアウトを切り替えられるよう、
// 表示前(will)のイベントで判定する(Androidはwill系のイベントが発火しないためdid系を使う)
export function useKeyboardVisible(): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setIsVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return isVisible;
}
