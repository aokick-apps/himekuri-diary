import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { DIARY_REMINDER_STORAGE_KEY, useDiaryReminder } from '@/contexts/diary-reminder-context';

import {
  createDeferred,
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

  it('defaults to disabled, 21:00, and "undetermined" permission before AsyncStorage/OS state has resolved (初期値)', async () => {
    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(result.current.hour).toBe(21);
    expect(result.current.minute).toBe(0);
    expect(result.current.permissionStatus).toBe('undetermined');

    // 初期化の非同期更新をテスト終了前に流し切る
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
  });

  it('loads the current permission status from the OS on mount (正常系: 許可状態の初期取得)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.permissionStatus).toBe('granted');
  });

  it('loads a previously saved enabled/time setting from AsyncStorage on mount (正常系: 起動時の復元)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.hour).toBe(8);
    expect(result.current.minute).toBe(30);
  });

  it('ignores a stored value that is not a valid settings object and stays on the default (境界値: 不正な保存値)', async () => {
    await AsyncStorage.setItem(DIARY_REMINDER_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.hour).toBe(21);
    expect(result.current.minute).toBe(0);
  });

  it('ignores a stored hour/minute that is out of range (境界値: 範囲外の時刻)', async () => {
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 24, minute: 0 }),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // 不正値のため既定値のまま(hour=24は無効)
    expect(result.current.hour).toBe(21);
  });

  it('corrects a stored enabled=true back to false and cancels the schedule when the permission is already denied on mount (異常系: 完全終了中に許可が取り消された状態での起動)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await waitFor(() => expect(result.current.hour).toBe(8));

    expect(result.current.enabled).toBe(false);
    expect(result.current.minute).toBe(30);
    expect(result.current.permissionStatus).toBe('denied');
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: false, hour: 8, minute: 30 }),
    );
  });

  it('corrects a stored enabled=true back to false and cancels the schedule when the permission is undetermined on mount (異常系: Androidで取り消し後に再度尋ねられる状態での起動)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('undetermined');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await waitFor(() => expect(result.current.hour).toBe(8));

    expect(result.current.enabled).toBe(false);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: false, hour: 8, minute: 30 }),
    );
  });

  it('keeps a stored enabled=true unchanged when the permission is granted on mount (正常系: 起動時に許可済みの場合はenabledを維持)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(true);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();
  });

  it('leaves a stored enabled=false untouched when the permission is denied on mount (境界値: 元々OFFの場合はdeniedでも何も変更しない)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: false, hour: 8, minute: 30 }),
    );
    jest.clearAllMocks();
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await waitFor(() => expect(result.current.hour).toBe(8));

    expect(result.current.enabled).toBe(false);
    expect(result.current.minute).toBe(30);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();
    // 変更が無い場合はAsyncStorageへの書き戻し(persist)自体を行わないことも確認する
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('corrects enabled back to false when the settings restore resolves before the permission lookup (異常系: 設定復元が先に解決する順序でも補正される)', async () => {
    const settingsDeferred = createDeferred<string | null>();
    const permissionDeferred = createDeferred<'denied'>();
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(settingsDeferred.promise);
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockReturnValueOnce(
      permissionDeferred.promise,
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    // 先に設定復元だけを解決させる。この時点では許可状態が未取得のため補正されず、
    // 保存されていたenabled=trueがそのまま反映される
    await act(async () => {
      settingsDeferred.resolve(JSON.stringify({ enabled: true, hour: 8, minute: 30 }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.enabled).toBe(true);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();

    // 後から許可状態(denied)が解決すると、矛盾を検知してenabledをfalseへ補正する
    await act(async () => {
      permissionDeferred.resolve('denied');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.hour).toBe(8);
    expect(result.current.minute).toBe(30);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: false, hour: 8, minute: 30 }),
    );
  });

  it('corrects enabled back to false when the permission lookup resolves before the settings restore (異常系: 許可状態取得が先に解決する順序でも補正される)', async () => {
    const settingsDeferred = createDeferred<string | null>();
    const permissionDeferred = createDeferred<'denied'>();
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(settingsDeferred.promise);
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockReturnValueOnce(
      permissionDeferred.promise,
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    // 先に許可状態(denied)だけを解決させる。この時点では設定が未復元のため補正の
    // しようがなく、permissionStatusの表示のみが更新される
    await act(async () => {
      permissionDeferred.resolve('denied');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.permissionStatus).toBe('denied');
    expect(result.current.enabled).toBe(false);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).not.toHaveBeenCalled();

    // 後から設定復元(enabled=true)が解決すると、既にdeniedと分かっているため
    // 復元と同時に補正され、enabled=trueが画面へ反映されることはない
    await act(async () => {
      settingsDeferred.resolve(JSON.stringify({ enabled: true, hour: 8, minute: 30 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.hour).toBe(8);
    expect(result.current.minute).toBe(30);
    expect(mockedNotificationsUtil.cancelDailyReminderAsync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: false, hour: 8, minute: 30 }),
    );
  });

  it('falls back to the default without crashing when AsyncStorage.getItem rejects (異常系: 読み込み失敗)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage read error'));

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
  });

  it('keeps "undetermined" without crashing when getReminderPermissionStatusAsync rejects (異常系: 許可状態取得失敗)', async () => {
    mockedNotificationsUtil.getReminderPermissionStatusAsync.mockRejectedValue(
      new Error('permission query error'),
    );

    const { result } = renderHook(() => useDiaryReminder(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.permissionStatus).toBe('undetermined');
  });

  describe('isLoaded(設定の復元と許可状態の取得の完了)', () => {
    it('is false initially and becomes true once both the saved settings and permission status have been loaded (正常系: 両方の完了後にtrue)', async () => {
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      expect(result.current.isLoaded).toBe(false);

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
    });

    it('stays false until the permission status resolves even when the saved settings have already been restored (境界値: 許可状態の取得が後から完了する場合)', async () => {
      const deferredPermission = createDeferred<'granted' | 'denied' | 'undetermined'>();
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockReturnValue(
        deferredPermission.promise,
      );
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
      );
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });

      await waitFor(() => expect(result.current.enabled).toBe(true));
      expect(result.current.isLoaded).toBe(false);

      await act(async () => {
        deferredPermission.resolve('granted');
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.enabled).toBe(true);
    });

    it('stays false until the saved settings are restored even when the permission status has already resolved (境界値: 設定の復元が後から完了する場合)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const deferredStorage = createDeferred<string | null>();
      jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(deferredStorage.promise);
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });

      await waitFor(() => expect(result.current.permissionStatus).toBe('granted'));
      expect(result.current.isLoaded).toBe(false);

      await act(async () => {
        deferredStorage.resolve(JSON.stringify({ enabled: true, hour: 8, minute: 30 }));
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.enabled).toBe(true);
    });

    it('never renders isLoaded=true together with a stale enabled=true when a stored ON setting is corrected to OFF by a denied permission (境界値: 許可拒否による補正前の状態でtrueにならない)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 8, minute: 30 }),
      );
      const seen: { enabled: boolean; isLoaded: boolean }[] = [];
      const { result } = renderHook(
        () => {
          const value = useDiaryReminder();
          seen.push({ enabled: value.enabled, isLoaded: value.isLoaded });
          return value;
        },
        { wrapper },
      );

      await waitFor(() => expect(result.current.isLoaded).toBe(true));

      expect(result.current.enabled).toBe(false);
      expect(seen.some((entry) => entry.isLoaded && entry.enabled)).toBe(false);
    });

    it('becomes true even when restoring the saved settings fails (異常系: 復元失敗でも既定値のまま完了扱い)', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage error'));
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.enabled).toBe(false);
    });

    it('becomes true even when fetching the permission status fails (異常系: 許可状態の取得失敗でも未確認のまま完了扱い)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockRejectedValueOnce(
        new Error('permission error'),
      );
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.permissionStatus).toBe('undetermined');
    });
  });

  describe('Provider外での利用(no-opフォールバック)', () => {
    it('returns the default disabled/21:00/undetermined state when used outside of DiaryReminderProvider (異常系/境界値: Provider外での利用)', () => {
      const { result } = renderHook(() => useDiaryReminder());

      expect(result.current.enabled).toBe(false);
      expect(result.current.hour).toBe(21);
      expect(result.current.minute).toBe(0);
      expect(result.current.permissionStatus).toBe('undetermined');
    });

    it('reports isLoaded as true outside of the Provider since nothing is ever loaded (境界値: Provider外は読み込み待ちにならない)', () => {
      const { result } = renderHook(() => useDiaryReminder());

      expect(result.current.isLoaded).toBe(true);
    });

    it('does not throw and does not touch AsyncStorage/notifications when setEnabled is called outside of the Provider (境界値: Provider外でのsetEnabledはno-op)', async () => {
      const { result } = renderHook(() => useDiaryReminder());

      await expect(result.current.setEnabled(true)).resolves.toBeUndefined();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockedNotificationsUtil.requestReminderPermissionAsync).not.toHaveBeenCalled();
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('does not throw and resolves to undefined when setTime is called outside of the Provider (境界値: Provider外でのsetTimeはno-op)', async () => {
      const { result } = renderHook(() => useDiaryReminder());

      await expect(result.current.setTime(8, 0)).resolves.toBeUndefined();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });
  });
});
