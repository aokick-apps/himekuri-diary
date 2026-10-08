import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { AppLockProvider } from '@/contexts/app-lock-context';

// `jest.mock('@/utils/app-lock-authentication', ...)`で差し替え済みのモジュールを参照する。
// 呼び出し側のテストファイルでモック宣言が必要
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const mockedAuthenticationUtil = require('@/utils/app-lock-authentication') as {
  isAppLockSupportedAsync: jest.Mock;
  authenticateForAppLockAsync: jest.Mock;
};

export const wrapper = ({ children }: PropsWithChildren) => (
  <AppLockProvider>{children}</AppLockProvider>
);

// 各テスト前にAsyncStorageとモックを初期状態へ戻す
export async function resetAppLockTestState(): Promise<void> {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  // 明示的にモックを指定しないテストでは「対応端末」を既定の挙動にしておく
  mockedAuthenticationUtil.isAppLockSupportedAsync.mockResolvedValue(true);
  mockedAuthenticationUtil.authenticateForAppLockAsync.mockResolvedValue(true);
}

// `AppState.addEventListener`は`jest.fn()`化されているため、`change`イベント用に登録された
// リスナーを`mock.calls`から取り出し、テスト側から直接呼び出してバックグラウンド遷移をシミュレートする
export function getAppStateChangeListener(): (nextAppState: string) => void {
  const addEventListenerMock = AppState.addEventListener as jest.Mock;
  const call = addEventListenerMock.mock.calls.find(([eventName]) => eventName === 'change');
  if (!call) {
    throw new Error('AppState.addEventListener("change", ...) が呼び出されていません');
  }
  return call[1];
}
