// 設定画面のテスト(tests/app/settings/)で共通利用するモックの実体。
// 各テストファイルから jest.mock('<モジュール>', () => require('<このファイル>').<ファクトリ>()) の形で使う
// (jest.mockのファクトリ内では外側のimportを参照できないため、require経由で実体を取り込む)。

/* eslint-disable @typescript-eslint/no-require-imports */

// 「リマインダー」セクションが使うexpo-notificationsラッパーを、ネイティブ通知APIを呼ばずに検証できるようにする
export function createReminderNotificationsMock() {
  return {
    getReminderPermissionStatusAsync: jest.fn(() => Promise.resolve('undetermined')),
    requestReminderPermissionAsync: jest.fn(() => Promise.resolve('undetermined')),
    scheduleDailyReminderAsync: jest.fn(() => Promise.resolve()),
    cancelDailyReminderAsync: jest.fn(() => Promise.resolve()),
  };
}

// 添付画像の削除・バックアップへの出し入れはネイティブのファイルシステムに依存するため、呼び出しを無効化する
export function createDiaryImagesMock() {
  return {
    deleteAllDiaryImages: jest.fn(),
    readDiaryImagesAsBase64: jest.fn(() => Promise.resolve(new Map<string, string>())),
    restoreDiaryImagesFromBase64: jest.fn(() => 0),
  };
}

// 「アプリロック」セクションが使う生体認証ラッパーを、ネイティブAPIを呼ばずに検証できるようにする
export function createAppLockAuthenticationMock() {
  return {
    isAppLockSupportedAsync: jest.fn(() => Promise.resolve(true)),
    authenticateForAppLockAsync: jest.fn(() => Promise.resolve(true)),
  };
}

// `expo-file-system`(新API)はJest環境で`Paths.cache`の参照時点で例外になるため、固定のURIを返す
// `Paths.cache`と書き込み内容を記録できる`File`のモックに差し替える。
// `Paths.cache`を「取得できない」状態に上書きできるよう`state`に持たせ、テストと実装のどちらの
// import経由でも同じ実体を読み書きできるようにする。
export function createFileSystemMock() {
  const state: { cacheDirectoryUri: string | null } = { cacheDirectoryUri: 'file:///mock-cache/' };
  const write = jest.fn();
  // インポート機能が`new File(asset.uri).text()`で読み込む内容を差し替えるためのモック
  const text = jest.fn((_uri: string) => Promise.reject(new Error('text() is not mocked')));

  class MockFile {
    uri: string;

    // エクスポートは`new File(Paths.cache, fileName)`(2引数)、インポートは`new File(asset.uri)`
    // (URI文字列1つ)で呼び出すため、両方の呼び出し方に対応する
    constructor(directoryOrUri: { uri: string } | string, fileName?: string) {
      this.uri =
        typeof directoryOrUri === 'string'
          ? directoryOrUri
          : `${directoryOrUri.uri}${fileName ?? ''}`;
    }

    write(content: string) {
      return write(this.uri, content);
    }

    text() {
      return text(this.uri);
    }
  }

  return {
    Paths: {
      get cache() {
        if (state.cacheDirectoryUri === null) {
          throw new Error('キャッシュディレクトリを取得できませんでした');
        }
        return { uri: state.cacheDirectoryUri };
      },
    },
    File: MockFile,
    __mockState: state,
    __mockWrite: write,
    __mockText: text,
  };
}

// ネイティブのファイル選択UIを表示できないため、選択結果をテストごとに差し替えられるようにする
export function createDocumentPickerMock() {
  return {
    getDocumentAsync: jest.fn(),
  };
}

// Jest環境では`isAvailableAsync`が常に`false`になってしまうため、共有可能なケースを明示的にモックする
export function createSharingMock() {
  return {
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    shareAsync: jest.fn(() => Promise.resolve()),
  };
}

// 暗号鍵の生成(getOrCreateEncryptionKey)をNode標準のcryptoで代替する
export function createCryptoMock() {
  const nodeCrypto = require('crypto');
  return {
    getRandomBytes: jest.fn((length: number) => new Uint8Array(nodeCrypto.randomBytes(length))),
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
  };
}

// jest-expoのオートモックは状態を永続化しないため、インメモリでキーと値を保持するモックに差し替える
export function createSecureStoreMock() {
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

// `Link`をパススルーしつつ、各リンクの`href`を`testID`として検証できる薄いモックにする
export function createRouterMock() {
  const ReactForMock = require('react');
  const { Text: TextForMock } = require('react-native');

  function MockLink({
    href,
    children,
    ...rest
  }: { href: unknown; children?: unknown } & Record<string, unknown>) {
    return ReactForMock.createElement(
      TextForMock,
      { ...rest, testID: `link-${String(href)}` },
      children,
    );
  }

  return { Link: MockLink };
}
