import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { DiaryReminderProvider } from '@/contexts/diary-reminder-context';

// `jest.mock('@/utils/diary-reminder-notifications', ...)`で差し替え済みのモジュールを参照する。
// 呼び出し側のテストファイルでモック宣言が必要
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const mockedNotificationsUtil = require('@/utils/diary-reminder-notifications') as {
  getReminderPermissionStatusAsync: jest.Mock;
  requestReminderPermissionAsync: jest.Mock;
  scheduleDailyReminderAsync: jest.Mock;
  cancelDailyReminderAsync: jest.Mock;
};

export const wrapper = ({ children }: PropsWithChildren) => (
  <DiaryReminderProvider>{children}</DiaryReminderProvider>
);

// 各テスト前にAsyncStorageとモックを初期状態へ戻す
export async function resetDiaryReminderTestState(): Promise<void> {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  // 明示的にモックを指定しないテストでは「未確認」を既定の挙動にしておく
  mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('undetermined');
  mockedNotificationsUtil.requestReminderPermissionAsync.mockResolvedValue('undetermined');
  // 一部のテストが`mockRejectedValue`(永続的な上書き)で失敗をシミュレートするため、
  // `jest.clearAllMocks()`(呼び出し履歴のクリアのみで実装はクリアされない)だけでは
  // 後続テストに失敗が漏れてしまう。既定では成功させておく
  mockedNotificationsUtil.scheduleDailyReminderAsync.mockResolvedValue(undefined);
}

// `AppState.addEventListener`は`jest.fn()`化されているため、`change`イベント用に登録された
// リスナーを`mock.calls`から取り出し、テスト側から直接呼び出してフォアグラウンド復帰をシミュレートする
export function getAppStateChangeListener(): (nextAppState: string) => void {
  const addEventListenerMock = AppState.addEventListener as jest.Mock;
  const call = addEventListenerMock.mock.calls.find(([eventName]) => eventName === 'change');
  if (!call) {
    throw new Error('AppState.addEventListener("change", ...) が呼び出されていません');
  }
  return call[1];
}

// AsyncStorageの復元と許可状態取得のどちらが先に解決するかをテストごとに明示的に制御するためのヘルパー
export function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
