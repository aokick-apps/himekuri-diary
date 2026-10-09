import * as Haptics from 'expo-haptics';

import { notifySaveSuccessHaptics } from '@/utils/save-feedback';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

describe('notifySaveSuccessHaptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // `process.env.EXPO_OS`はbabel-preset-expoがビルド時に置換する(jest-expoでは'ios'固定)ため、
  // iOS以外の分岐はテスト内で切り替えられない
  it('fires a success notification on iOS (正常系: iOS)', () => {
    notifySaveSuccessHaptics();

    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});
