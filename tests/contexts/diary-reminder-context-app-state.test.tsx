import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { DIARY_REMINDER_STORAGE_KEY, useDiaryReminder } from '@/contexts/diary-reminder-context';

import {
  getAppStateChangeListener,
  mockedNotificationsUtil,
  resetDiaryReminderTestState,
  wrapper,
} from '../helpers/diary-reminder-test-helpers';

// ネイティブの`AsyncStorage`モジュールはJest環境では利用できないため、公式のインメモリモックに差し替える
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// コンテキストの状態管理・永続化ロジックを検証するため、expo-notificationsの薄いラッパーごとモック化する
jest.mock('@/utils/diary-reminder-notifications', () => ({
  getReminderPermissionStatusAsync: jest.fn(),
  requestReminderPermissionAsync: jest.fn(),
  scheduleDailyReminderAsync: jest.fn(() => Promise.resolve()),
  cancelDailyReminderAsync: jest.fn(() => Promise.resolve()),
}));

describe('DiaryReminderProvider / useDiaryReminder', () => {
  beforeEach(async () => {
    await resetDiaryReminderTestState();
  });

  describe('AppStateによるフォアグラウンド復帰時の再取得', () => {
    it('refetches the permission status when the app returns to the foreground (正常系: active復帰時の再取得)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedNotificationsUtil.getReminderPermissionStatusAsync).toHaveBeenCalledTimes(1);

      const handleAppStateChange = getAppStateChangeListener();
      await act(async () => {
        handleAppStateChange('active');
        await Promise.resolve();
      });

      expect(mockedNotificationsUtil.getReminderPermissionStatusAsync).toHaveBeenCalledTimes(2);
    });

    it('does not refetch when the app moves to the background (境界値: background遷移時は再取得しない)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      const handleAppStateChange = getAppStateChangeListener();
      await act(async () => {
        handleAppStateChange('background');
        await Promise.resolve();
      });

      expect(mockedNotificationsUtil.getReminderPermissionStatusAsync).toHaveBeenCalledTimes(1);
    });

    it('turns enabled off and cancels the schedule when the permission changes from granted to denied while resuming (異常系: granted→deniedでenabledをOFFに戻す)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      expect(result.current.enabled).toBe(true);
      // `jest.clearAllMocks()`は`AppState.addEventListener`の呼び出し履歴も消してしまう
      // (リスナー登録はマウント時の一度きりのため)ので、クリア前に取り出しておく
      const handleAppStateChange = getAppStateChangeListener();
      jest.clearAllMocks();
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');

      await act(async () => {
        handleAppStateChange('active');
        await Promise.resolve();
      });

      expect(result.current.permissionStatus).toBe('denied');
      expect(result.current.enabled).toBe(false);
      expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: false, hour: 21, minute: 0 }),
      );
    });

    it('keeps enabled unchanged when the permission stays granted while resuming (正常系: granted→grantedはenabled不変)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      jest.clearAllMocks();
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');

      await act(async () => {
        handleAppStateChange('active');
        await Promise.resolve();
      });

      expect(result.current.permissionStatus).toBe('granted');
      expect(result.current.enabled).toBe(true);
      expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('does not turn enabled on automatically when the permission changes from denied to granted while resuming (境界値: denied→grantedでもenabledは自動でONにしない)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.enabled).toBe(false);
      const handleAppStateChange = getAppStateChangeListener();
      jest.clearAllMocks();
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');

      await act(async () => {
        handleAppStateChange('active');
        await Promise.resolve();
      });

      expect(result.current.permissionStatus).toBe('granted');
      expect(result.current.enabled).toBe(false);
    });

    it('keeps the previous permission status and enabled state without crashing when getReminderPermissionStatusAsync rejects while resuming (異常系: active復帰時の許可状態再取得に失敗)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      expect(result.current.enabled).toBe(true);
      const handleAppStateChange = getAppStateChangeListener();
      jest.clearAllMocks();
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockRejectedValueOnce(
        new Error('permission query error'),
      );

      await act(async () => {
        handleAppStateChange('active');
        await Promise.resolve();
      });

      // 再取得に失敗した場合は既存の状態(許可状態・enabled)をそのまま維持し、クラッシュもしない
      expect(result.current.permissionStatus).toBe('granted');
      expect(result.current.enabled).toBe(true);
      expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('removes the AppState subscription on unmount (境界値: アンマウント時のクリーンアップ)', async () => {
      const addEventListenerMock = AppState.addEventListener as jest.Mock;
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { unmount } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      const call = addEventListenerMock.mock.calls.find(
        ([eventName]) => eventName === 'change',
      ) as [string, (...args: unknown[]) => void];
      const resultIndex = addEventListenerMock.mock.calls.indexOf(call);
      const removeMock = addEventListenerMock.mock.results[resultIndex].value.remove as jest.Mock;

      unmount();

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
