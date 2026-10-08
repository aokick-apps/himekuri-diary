import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { DIARY_REMINDER_STORAGE_KEY, useDiaryReminder } from '@/contexts/diary-reminder-context';

import {
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

  describe('setEnabled', () => {
    it('requests permission, persists enabled=true, and schedules the reminder when turned ON while undetermined and the user grants it (正常系: ON・未確認から許可)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('undetermined');
      mockedNotificationsUtil.requestReminderPermissionAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(mockedNotificationsUtil.requestReminderPermissionAsync).toHaveBeenCalledTimes(1);
      expect(result.current.enabled).toBe(true);
      expect(result.current.permissionStatus).toBe('granted');
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledWith(21, 0);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
    });

    it('does not schedule anything and keeps enabled=false when the permission is denied by the user (異常系: ON・未確認から拒否)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('undetermined');
      mockedNotificationsUtil.requestReminderPermissionAsync.mockResolvedValue('denied');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(result.current.enabled).toBe(false);
      expect(result.current.permissionStatus).toBe('denied');
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('schedules directly without re-requesting permission when the permission is already granted (正常系: 既に許可済み)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(mockedNotificationsUtil.requestReminderPermissionAsync).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(true);
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledWith(21, 0);
    });

    it('does not schedule and keeps enabled=false when the permission is already denied (異常系: 既に拒否済み)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(mockedNotificationsUtil.requestReminderPermissionAsync).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(false);
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('schedules with the time chosen via setTime while OFF when turned ON afterwards, without scheduling before that (正常系: OFF中に決めた時刻でONにする)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setTime(6, 45);
      });
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledTimes(1);
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledWith(6, 45);
      expect(result.current.enabled).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 6, minute: 45 }),
      );
    });

    it('keeps the time chosen via setTime while OFF even when turning ON is denied, so a later grant uses that time (境界値: OFF中に決めた時刻は拒否されても保持される)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('undetermined');
      mockedNotificationsUtil.requestReminderPermissionAsync.mockResolvedValue('denied');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setTime(23, 55);
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(result.current.enabled).toBe(false);
      expect(result.current.hour).toBe(23);
      expect(result.current.minute).toBe(55);
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('persists enabled=false and cancels the schedule when turned OFF, regardless of permission status (正常系: OFF)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      jest.clearAllMocks();

      await act(async () => {
        await result.current.setEnabled(false);
      });

      expect(result.current.enabled).toBe(false);
      expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: false, hour: 21, minute: 0 }),
      );
    });

    it('reverts enabled back to false and propagates the error from scheduleDailyReminderAsync when turning ON (異常系: ON時のスケジュール登録失敗)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      // `mockRejectedValueOnce`を使い、この呼び出しのみを失敗させる。`mockRejectedValue`
      // (永続的な上書き)を使うと`jest.clearAllMocks()`(mock.callsのクリアのみで実装は
      // クリアされない)では戻らず、以降の(このファイル内で後に実行される)テストにまで
      // 失敗が漏れてしまうため注意する
      mockedNotificationsUtil.scheduleDailyReminderAsync.mockRejectedValueOnce(
        new Error('schedule error'),
      );
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      // 状態更新(persist)はact()配下で反映させつつ、rejectする例外自体も捕捉して検証する
      let caughtError: unknown;
      await act(async () => {
        try {
          await result.current.setEnabled(true);
        } catch (error) {
          caughtError = error;
        }
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe('schedule error');
      // スケジュール登録に失敗した場合、「ONに見えるが実際には通知が届かない」状態を避けるため
      // enabledはfalseへ戻される(呼び出し元は例外を捕捉してユーザーへ案内する想定)
      expect(result.current.enabled).toBe(false);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: false, hour: 21, minute: 0 }),
      );
    });
  });
});
