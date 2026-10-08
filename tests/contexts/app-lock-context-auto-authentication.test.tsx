import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  APP_LOCK_ENABLED_STORAGE_KEY,
  type AppLockAuthenticationResult,
  useAppLock,
} from '@/contexts/app-lock-context';

import {
  getAppStateChangeListener,
  mockedAuthenticationUtil,
  resetAppLockTestState,
  wrapper,
} from '../helpers/app-lock-test-helpers';

// ネイティブの`AsyncStorage`モジュールはJest環境では利用できないため、公式のインメモリモックに差し替える
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// コンテキストの状態管理・永続化ロジックを検証するため、expo-local-authenticationの薄いラッパーごとモック化する
jest.mock('@/utils/app-lock-authentication', () => ({
  isAppLockSupportedAsync: jest.fn(),
  authenticateForAppLockAsync: jest.fn(),
}));

describe('AppLockProvider / useAppLock', () => {
  beforeEach(async () => {
    await resetAppLockTestState();
  });

  describe('自動認証のトリガー', () => {
    it('does not call authenticateForAppLockAsync at the moment the app moves to the background (正常系: background遷移では自動認証を呼ばない)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('background');
      });

      // 画面がOFFになっていく過程でOS標準パスコードへフォールバックしてしまうため、
      // background遷移の瞬間には認証プロンプトを起動してはいけない
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });

    it('automatically calls authenticateForAppLockAsync when the app returns to active while locked (正常系: active復帰で自動認証)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      act(() => {
        handleAppStateChange('background');
      });
      expect(result.current.isUnlocked).toBe(false);

      act(() => {
        handleAppStateChange('active');
      });

      await waitFor(() =>
        expect(mockedAuthenticationUtil.authenticateForAppLockAsync).toHaveBeenCalledTimes(1),
      );
    });

    it('automatically calls authenticateForAppLockAsync once when a previously saved ON setting is restored as already locked on launch (正常系: 起動時ロック済み状態の復元で自動認証)', async () => {
      await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'true');

      const { result } = renderHook(() => useAppLock(), { wrapper });

      await waitFor(() => expect(result.current.isReady).toBe(true));
      await waitFor(() =>
        expect(mockedAuthenticationUtil.authenticateForAppLockAsync).toHaveBeenCalledTimes(1),
      );
    });

    it('does not call authenticateForAppLockAsync on launch when the restored setting is OFF (境界値: 起動時OFF復元では自動認証を呼ばない)', async () => {
      await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'false');

      const { result } = renderHook(() => useAppLock(), { wrapper });

      await waitFor(() => expect(result.current.isReady).toBe(true));
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });

    it('does not call authenticateForAppLockAsync again when returning to active while already unlocked (境界値: 既にunlocked状態でのactive復帰では二重に呼ばない)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();

      // ONにしただけではまだロックされていない(isUnlocked=true)状態でactiveへ戻っても、
      // 認証プロンプトを起動する必要はない
      await act(async () => {
        handleAppStateChange('active');
        // isSupportedの再チェックによる非同期の状態更新を待ってからテストを終える
        await Promise.resolve();
      });

      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });

    it('does not call authenticateForAppLockAsync on launch when the device has no authentication enrolled (異常系: 起動時に認証手段が無い端末では自動認証しない)', async () => {
      await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'true');
      mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(false);

      const { result } = renderHook(() => useAppLock(), { wrapper });

      await waitFor(() => expect(result.current.isReady).toBe(true));
      await waitFor(() =>
        expect(mockedAuthenticationUtil.isAppLockSupportedAsync).toHaveBeenCalled(),
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isSupported).toBe(false);
      expect(result.current.isUnlocked).toBe(false);
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });

    it('still calls authenticateForAppLockAsync once on launch when the support check resolves after the stored setting (境界値: isSupportedの判定がisReadyより遅れて確定する場合)', async () => {
      await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'true');
      let resolveSupported: (value: boolean) => void = () => {};
      mockedAuthenticationUtil.isAppLockSupportedAsync.mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveSupported = resolve;
        }),
      );

      const { result } = renderHook(() => useAppLock(), { wrapper });
      await waitFor(() => expect(result.current.isReady).toBe(true));
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();

      await act(async () => {
        resolveSupported(true);
      });

      await waitFor(() =>
        expect(mockedAuthenticationUtil.authenticateForAppLockAsync).toHaveBeenCalledTimes(1),
      );
    });

    it('does not call authenticateForAppLockAsync when returning to active after device authentication was removed in the background (異常系: バックグラウンド中に認証手段が失われた場合は脱出導線を優先)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      act(() => {
        handleAppStateChange('background');
      });
      mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(false);

      await act(async () => {
        handleAppStateChange('active');
      });

      await waitFor(() => expect(result.current.isSupported).toBe(false));
      expect(result.current.isUnlocked).toBe(false);
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    async function lockScreen(result: { current: ReturnType<typeof useAppLock> }) {
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      act(() => {
        handleAppStateChange('background');
      });
    }

    it('unlocks the screen and returns true when authentication succeeds (正常系: 認証成功)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await lockScreen(result);
      mockedAuthenticationUtil.authenticateForAppLockAsync.mockResolvedValue(true);

      let authResult: AppLockAuthenticationResult | undefined;
      await act(async () => {
        authResult = await result.current.authenticate();
      });

      expect(authResult).toBe('success');
      expect(result.current.isUnlocked).toBe(true);
    });

    it('keeps the screen locked and returns "failure" when authentication fails (異常系: 認証失敗)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await lockScreen(result);
      mockedAuthenticationUtil.authenticateForAppLockAsync.mockResolvedValue(false);

      let authResult: AppLockAuthenticationResult | undefined;
      await act(async () => {
        authResult = await result.current.authenticate();
      });

      expect(authResult).toBe('failure');
      expect(result.current.isUnlocked).toBe(false);
    });

    it('keeps the screen locked and returns "failure" without throwing when the underlying call rejects (異常系: 認証呼び出し自体の失敗)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await lockScreen(result);
      mockedAuthenticationUtil.authenticateForAppLockAsync.mockRejectedValue(
        new Error('native error'),
      );

      let authResult: AppLockAuthenticationResult | undefined;
      await act(async () => {
        authResult = await result.current.authenticate();
      });

      expect(authResult).toBe('failure');
      expect(result.current.isUnlocked).toBe(false);
    });

    it('returns "skipped" (not "failure") for a duplicate call while a previous authenticate() is still in flight (境界値: 多重呼び出しの抑止)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await lockScreen(result);
      let resolveAuthentication: (success: boolean) => void = () => {};
      mockedAuthenticationUtil.authenticateForAppLockAsync.mockReturnValue(
        new Promise((resolve) => {
          resolveAuthentication = resolve;
        }),
      );

      let firstCallResult: Promise<AppLockAuthenticationResult>;
      let secondCallResult: AppLockAuthenticationResult | undefined;
      act(() => {
        firstCallResult = result.current.authenticate();
      });
      await act(async () => {
        secondCallResult = await result.current.authenticate();
      });

      expect(secondCallResult).toBe('skipped');
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveAuthentication(true);
        await firstCallResult;
      });
      expect(result.current.isUnlocked).toBe(true);
    });
  });
});
