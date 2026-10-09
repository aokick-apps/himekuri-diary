import * as Haptics from 'expo-haptics';

// 保存成功を触覚でも伝える。画面ごとに挙動がばらつかないよう、iOSのみ同じ通知を発火する
export function notifySaveSuccessHaptics(): void {
  if (process.env.EXPO_OS === 'ios') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}
