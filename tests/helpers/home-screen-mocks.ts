import type { PropsWithChildren } from 'react';

// 各テストファイルの`jest.mock`ファクトリから呼び出して使う、HomeScreenテスト共通のモック実装。
// `jest.mock`はホイストされるためファイルごとの宣言が必要だが、実装本体はここに集約する。

// `expo-router`の`Link`(Trigger/Preview/Menuを伴う複合API)はナビゲーション/routerコンテキストを
// 要求するため、単体レンダリングでも動くよう単純なパススルーコンポーネントに差し替える。
// `useRouter`も同様にナビゲーションコンテキストを要求するため、`push`呼び出しをテストから
// 検証できるjest.fnに差し替える。
export function createExpoRouterMock() {
  const PassThrough = ({ children }: PropsWithChildren) => children;

  const Link = PassThrough as unknown as typeof PassThrough & {
    Trigger: typeof PassThrough;
    Preview: () => null;
    Menu: typeof PassThrough;
    MenuAction: () => null;
  };
  function LinkPreview() {
    return null;
  }

  function LinkMenuAction() {
    return null;
  }

  Link.Trigger = PassThrough;
  Link.Preview = LinkPreview;
  Link.Menu = PassThrough;
  Link.MenuAction = LinkMenuAction;

  // `jest.mock`の巻き上げの都合によりファクトリ内で`require()`を使う必要がある
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactForMock = require('react');

  // 本物の`useFocusEffect`は単体レンダリング環境では動かないため、マウント時に一度だけ
  // 発火する簡易モックに差し替える。再フォーカスを模す場合はunmount/再mountするテストが
  // 多いが、stateを保ったまま再フォーカスだけ模したいテスト向けに、現在マウント中の
  // 全effectを保持し`__triggerRefocus()`で明示的に再発火できるようにしておく
  // (実際のexpo-routerには存在しないテスト専用のヘルパー)。
  const activeFocusEffects = new Set<() => void>();

  function useFocusEffect(effect: () => void) {
    ReactForMock.useEffect(() => {
      activeFocusEffects.add(effect);
      effect();
      return () => {
        activeFocusEffects.delete(effect);
      };
    }, [effect]);
  }

  function __triggerRefocus() {
    for (const effect of activeFocusEffects) {
      effect();
    }
  }

  const mockPush = jest.fn();
  function useRouter() {
    return { push: mockPush };
  }

  return { Link, useFocusEffect, useRouter, __triggerRefocus, __mockPush: mockPush };
}

// jest-expoのオートモックは`randomUUID()`が常に`undefined`を返すため、ID一意性検証のために
// 呼び出しごとに異なる値を返すモックに差し替える。`getRandomBytes`もオートモックには存在しない
// ため、Node標準の`crypto`モジュールによる実際の乱数生成で代替する。
export function createExpoCryptoMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return {
    randomUUID: jest.fn(),
    getRandomBytes: jest.fn((length: number) => new Uint8Array(nodeCrypto.randomBytes(length))),
  };
}

// 保存成功時のハプティックフィードバックを呼び出し引数まで明示的にアサートできるようにする。
export function createExpoHapticsMock() {
  return {
    notificationAsync: jest.fn(() => Promise.resolve()),
    NotificationFeedbackType: { Success: 'success' },
  };
}

// expo-secure-storeはjest-expoのオートモックだと`getItemAsync`が常に`undefined`を返し状態を
// 永続化しないため、保存→再読み込みの暗号化ラウンドトリップを検証できるようインメモリで
// キーと値を保持する独自モックに差し替える。
export function createExpoSecureStoreMock() {
  let store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    // テスト間で鍵の永続化状態を分離するためのヘルパー(実際のexpo-secure-storeには存在しない)
    __reset: () => {
      store = {};
    },
  };
}

// Jest環境ではネイティブの`AsyncStorage`が使えない(`NativeModule: AsyncStorage is null`)ため、
// パッケージ同梱の公式インメモリモックに差し替える。
export function createAsyncStorageMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage/jest/async-storage-mock');
}

// `KeyboardAvoidingView`は`behavior` propをレンダリング結果のstyleに反映しないため、渡された
// propを検証できるよう`testID`付きのViewでそのまま可視化する薄いモックに差し替える。
export function createKeyboardAvoidingViewMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactForMock = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');

  function MockKeyboardAvoidingView({
    children,
    behavior,
    style,
  }: PropsWithChildren<{ behavior?: string; style?: unknown }>) {
    return ReactForMock.createElement(
      RN.View,
      { testID: 'keyboard-avoiding-view', accessibilityValue: { text: behavior }, style },
      children,
    );
  }

  return { __esModule: true, default: MockKeyboardAvoidingView };
}
