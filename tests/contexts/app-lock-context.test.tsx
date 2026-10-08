import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { APP_LOCK_ENABLED_STORAGE_KEY, useAppLock } from '@/contexts/app-lock-context';

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

  it('defaults to disabled/unsupported/unlocked before AsyncStorage/OS state has resolved (初期値)', async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isSupported).toBe(false);
    // 起動直後のチラつき防止のため、既定値OFFの読み込み完了前もロック画面は表示しない
    expect(result.current.isUnlocked).toBe(true);

    // 次のテストへ`act`警告が漏れないよう、この後起こる非同期の状態更新が
    // 完了するのを待ってからテストを終える(tests/app/_layout.test.tsxと同じ方針)
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  });

  it('starts with isReady=false and flips to true once the AsyncStorage read settles (初期値: 読み込み完了フラグ)', async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper });

    // AsyncStorageの読み込みが完了するまでは、enabled/isUnlockedがまだ暫定値であることを
    // 示すフラグ。falseのままコンテンツ側が読み込み完了を誤って前提にしないことを検証する
    expect(result.current.isReady).toBe(false);

    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('keeps isReady=false immediately after a previously saved ON setting is restored, and enabled/isUnlocked settle correctly once isReady becomes true (正常系: 起動時のisReadyとisUnlockedの整合性・レースコンディション対策)', async () => {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'true');
    // isReadyがtrueになった瞬間に起動時の自動認証が発火し、既定のモックのまま即座に
    // 成功してisUnlockedがtrueへ戻ってしまうと、ここで検証したいisReady/isUnlockedの
    // レースコンディションを確認できなくなるため、このテストの間だけ認証を保留状態にする
    mockedAuthenticationUtil.authenticateForAppLockAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAppLock(), { wrapper });

    // 読み込み未完了の間にisUnlocked(暫定値true)だけを見て「未ロック」と誤判定しないよう、
    // 呼び出し側はisReadyも合わせて確認する必要があることを示す
    expect(result.current.isReady).toBe(false);

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.enabled).toBe(true);
    expect(result.current.isUnlocked).toBe(false);
  });

  it('sets isReady=true even when AsyncStorage.getItem rejects (異常系: 読み込み失敗時もisReadyは完了扱いになる)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage read error'));

    const { result } = renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('loads isSupported=true from the OS on mount when the device has biometrics/passcode enrolled (正常系: 対応端末)', async () => {
    mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(true);

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isSupported).toBe(true);
  });

  it('keeps isSupported=false when the device has nothing enrolled (異常系: 非対応端末)', async () => {
    mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(false);

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isSupported).toBe(false);
  });

  it('keeps isSupported=false without crashing when isAppLockSupportedAsync rejects (異常系: 対応判定の取得失敗)', async () => {
    mockedAuthenticationUtil.isAppLockSupportedAsync.mockRejectedValue(
      new Error('hardware query error'),
    );

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isSupported).toBe(false);
  });

  describe('isSupportedの再チェック', () => {
    // 端末側の生体認証・パスコード設定が削除されても、isSupportedがマウント時の値のまま
    // 残らないよう、バックグラウンド復帰('active'遷移)のたびに再チェックすることを検証する
    it('re-checks isAppLockSupportedAsync every time the app returns to active (正常系: active復帰の度に再チェック)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.isSupported).toBe(true);
      mockedAuthenticationUtil.isAppLockSupportedAsync.mockClear();
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('active');
      });

      await waitFor(() =>
        expect(mockedAuthenticationUtil.isAppLockSupportedAsync).toHaveBeenCalledTimes(1),
      );
    });

    it('flips isSupported to false once device authentication is no longer enrolled after a background/active cycle (正常系: バックグラウンド中に認証手段が失われた場合を検知)', async () => {
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
      // バックグラウンド中に端末側の生体認証・パスコード設定が全て削除された状況を模す
      mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(false);
      mockedAuthenticationUtil.authenticateForAppLockAsync.mockResolvedValue(false);

      act(() => {
        handleAppStateChange('active');
      });

      await waitFor(() => expect(result.current.isSupported).toBe(false));
    });
  });

  it('loads enabled=true and locks the screen when a previously saved setting is restored (正常系: 起動時の復元・ON)', async () => {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'true');
    // 起動時の自動認証が既定のモックのまま即座に成功してしまわないよう保留にし、
    // 復元直後の「ロックされた」状態そのものを検証できるようにする
    mockedAuthenticationUtil.authenticateForAppLockAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.isUnlocked).toBe(false);
  });

  it('loads enabled=false and keeps the screen unlocked when the saved setting is OFF (正常系: 起動時の復元・OFF)', async () => {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'false');

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isUnlocked).toBe(true);
  });

  it('treats a stored value other than the literal "true" as disabled (境界値: 不正な保存値)', async () => {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, 'yes');

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isUnlocked).toBe(true);
  });

  it('falls back to disabled/unlocked without crashing when AsyncStorage.getItem rejects (異常系: 読み込み失敗)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage read error'));

    const { result } = renderHook(() => useAppLock(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isUnlocked).toBe(true);
  });

  describe('setEnabled', () => {
    it('persists enabled=true without immediately locking the screen (正常系: ON)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.setEnabled(true);
      });

      expect(result.current.enabled).toBe(true);
      // ONにした直後はまだバックグラウンドに遷移していないため、ロック画面は表示しない
      expect(result.current.isUnlocked).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(APP_LOCK_ENABLED_STORAGE_KEY, 'true');
    });

    it('persists enabled=false and forces the screen back to unlocked (正常系: OFF)', async () => {
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

      await act(async () => {
        await result.current.setEnabled(false);
      });

      expect(result.current.enabled).toBe(false);
      expect(result.current.isUnlocked).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(APP_LOCK_ENABLED_STORAGE_KEY, 'false');
    });

    // AsyncStorage.setItemが失敗した場合、enabled/isUnlockedの表示状態が呼び出し前の値へ
    // ロールバックされ、かつ例外が呼び出し元へ伝播する(未処理のPromise rejectionにならない)ことを検証する
    it('rolls back enabled/isUnlocked to their previous values and rethrows when AsyncStorage.setItem rejects (異常系: 永続化失敗時のロールバック)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      // background遷移でisUnlocked=falseにしておき、ロールバック対象がisReadyの初期値
      // (true)ではなく「呼び出し直前の値」であることを検証できるようにする
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      act(() => {
        handleAppStateChange('background');
      });
      expect(result.current.enabled).toBe(true);
      expect(result.current.isUnlocked).toBe(false);
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage write error'));

      await act(async () => {
        await expect(result.current.setEnabled(false)).rejects.toThrow('storage write error');
      });

      expect(result.current.enabled).toBe(true);
      expect(result.current.isUnlocked).toBe(false);
    });
  });

  describe('Provider外での利用(no-opフォールバック)', () => {
    it('returns the default disabled/unsupported/unlocked state when used outside of AppLockProvider (異常系/境界値: Provider外での利用)', () => {
      const { result } = renderHook(() => useAppLock());

      expect(result.current.enabled).toBe(false);
      expect(result.current.isSupported).toBe(false);
      expect(result.current.isUnlocked).toBe(true);
      // Provider外では読み込み待ちの概念自体が存在しないため、常に完了扱いとする
      expect(result.current.isReady).toBe(true);
    });

    it('does not throw and does not touch AsyncStorage when setEnabled is called outside of the Provider (境界値: Provider外でのsetEnabledはno-op)', async () => {
      const { result } = renderHook(() => useAppLock());

      await expect(result.current.setEnabled(true)).resolves.toBeUndefined();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('resolves to "success" without calling the native authentication module outside of the Provider (境界値: Provider外でのauthenticateはno-op)', async () => {
      const { result } = renderHook(() => useAppLock());

      await expect(result.current.authenticate()).resolves.toBe('success');
      expect(mockedAuthenticationUtil.authenticateForAppLockAsync).not.toHaveBeenCalled();
    });
  });
});
