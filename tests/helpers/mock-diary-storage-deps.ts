// diary-storageのテストが依存するネイティブモジュールのモック実装。
// `jest.mock`のファクトリ内から`require()`で読み込む想定のため、このファイルは他モジュールをimportしない
export function createExpoCryptoMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return {
    getRandomBytes: jest.fn((length: number) => new Uint8Array(nodeCrypto.randomBytes(length))),
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
  };
}

// expo-secure-storeのオートモックは状態を永続化しないため、インメモリでキーと値を保持する
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
