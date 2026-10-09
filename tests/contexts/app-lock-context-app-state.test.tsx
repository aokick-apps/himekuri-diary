import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useAppLock } from '@/contexts/app-lock-context';

import {
  getAppStateChangeListener,
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

  describe('AppStateによるバックグラウンド遷移時の再ロック', () => {
    it('locks the screen when the app moves to the background while enabled (正常系: background遷移でロック)', async () => {
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
    });

    it('does not lock the screen when moving to the background while disabled (境界値: OFF時はbackground遷移してもロックしない)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('background');
      });

      expect(result.current.isUnlocked).toBe(true);
    });

    it('does not lock the screen on an "inactive" transition (境界値: inactiveでは再ロックしない)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('inactive');
      });

      // 'inactive'は生体認証プロンプト表示中にも一時的に発生しうるため、ロックしない
      expect(result.current.isUnlocked).toBe(true);
    });

    it('removes the AppState subscription on unmount (境界値: アンマウント時のクリーンアップ)', async () => {
      const addEventListenerMock = AppState.addEventListener as jest.Mock;
      const { unmount } = renderHook(() => useAppLock(), { wrapper });
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

  describe('inactive遷移時のプライバシーオーバーレイ', () => {
    it('sets isInactiveOverlayVisible=true on an "inactive" transition while enabled (正常系: ONかつinactive遷移でオーバーレイ表示)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('inactive');
      });

      expect(result.current.isInactiveOverlayVisible).toBe(true);
    });

    it('resets isInactiveOverlayVisible to false once the app becomes "active" again (正常系: active復帰でオーバーレイ非表示)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      const handleAppStateChange = getAppStateChangeListener();
      act(() => {
        handleAppStateChange('inactive');
      });
      expect(result.current.isInactiveOverlayVisible).toBe(true);

      await act(async () => {
        handleAppStateChange('active');
        // isSupportedの再チェックによる非同期の状態更新を待ってからテストを終える
        await Promise.resolve();
      });

      expect(result.current.isInactiveOverlayVisible).toBe(false);
    });

    it('does not show the overlay on an "inactive" transition while disabled (境界値: OFF時はinactive遷移してもオーバーレイを表示しない)', async () => {
      const { result } = renderHook(() => useAppLock(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      const handleAppStateChange = getAppStateChangeListener();

      act(() => {
        handleAppStateChange('inactive');
      });

      expect(result.current.isInactiveOverlayVisible).toBe(false);
    });
  });
});
