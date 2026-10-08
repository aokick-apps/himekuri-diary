import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import {
  DIARY_ENTRIES_STORAGE_KEY,
  buildDiaryEntryKey,
  getAllDiaryEntries,
} from '@/utils/diary-storage';

import {
  readPersistedEntry,
  resetDiaryStorageState,
  sampleDiaryEntries,
  seedDiaryEntry,
} from '../helpers/diary-storage-test-helpers';

// ネイティブの`AsyncStorage`モジュールはJest環境では利用できないため、公式のインメモリモックに差し替える
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `jest-expo`が自動生成するexpo-cryptoのモックは`getRandomBytes`を持たないため、Node標準の`crypto`で代替する
jest.mock('expo-crypto', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../helpers/mock-diary-storage-deps').createExpoCryptoMock(),
);

jest.mock('expo-secure-store', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../helpers/mock-diary-storage-deps').createSecureStoreMock(),
);

describe('getAllDiaryEntries', () => {
  const sampleEntries = sampleDiaryEntries;

  beforeEach(async () => {
    await resetDiaryStorageState();
  });

  describe('暗号鍵の取得失敗', () => {
    const getItemAsyncMock = SecureStore.getItemAsync as jest.Mock;
    let originalGetItemAsync: ReturnType<typeof getItemAsyncMock.getMockImplementation>;

    beforeEach(() => {
      originalGetItemAsync = getItemAsyncMock.getMockImplementation();
    });

    afterEach(() => {
      getItemAsyncMock.mockImplementation(originalGetItemAsync);
    });

    it('notifies onError and returns an empty array when the encryption key cannot be retrieved, instead of silently skipping every entry (異常系: 鍵取得失敗は全件の読み込み失敗)', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      for (const entry of sampleEntries) {
        await seedDiaryEntry(entry);
      }
      const thrown = new Error('secure store unavailable');
      getItemAsyncMock.mockRejectedValue(thrown);
      const onError = jest.fn();

      const result = await getAllDiaryEntries({ onError });

      expect(result).toEqual([]);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(thrown);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      // 個別エントリの破損として扱わない(要素単位のスキップ警告を出さない)
      expect(warnSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('still reads plain (unencrypted) entries without touching the encryption key (境界値: 平文のみの場合は鍵を必要としない)', async () => {
      await AsyncStorage.setItem(buildDiaryEntryKey('1'), JSON.stringify(sampleEntries[1]));
      getItemAsyncMock.mockRejectedValue(new Error('secure store unavailable'));
      const onError = jest.fn();

      const result = await getAllDiaryEntries({ onError });

      expect(result).toEqual([sampleEntries[1]]);
      expect(onError).not.toHaveBeenCalled();
      expect(getItemAsyncMock).not.toHaveBeenCalled();
    });

    it('treats a key retrieval failure as a whole-load failure even when plain and encrypted entries are mixed, rather than returning a partial list (境界値: 暗号化と平文の混在)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await AsyncStorage.setItem(buildDiaryEntryKey('1'), JSON.stringify(sampleEntries[1]));
      await seedDiaryEntry(sampleEntries[0]);
      getItemAsyncMock.mockRejectedValue(new Error('secure store unavailable'));
      const onError = jest.fn();

      const result = await getAllDiaryEntries({ onError });

      expect(result).toEqual([]);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('recovers on the next call when the key retrieval failure was only transient (境界値: 鍵取得失敗が1回だけ)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      for (const entry of sampleEntries) {
        await seedDiaryEntry(entry);
      }
      getItemAsyncMock.mockRejectedValueOnce(new Error('secure store unavailable'));
      const onError = jest.fn();

      const first = await getAllDiaryEntries({ onError });
      const second = await getAllDiaryEntries({ onError });

      expect(first).toEqual([]);
      expect(second).toEqual(sampleEntries);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array without throwing when the key cannot be retrieved and onError is omitted (異常系: onError省略)', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await seedDiaryEntry(sampleEntries[0]);
      getItemAsyncMock.mockRejectedValue(new Error('secure store unavailable'));

      await expect(getAllDiaryEntries()).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('does not access or generate the encryption key when nothing has been saved yet (境界値: 新規端末の初回読み込み)', async () => {
      const onError = jest.fn();

      const result = await getAllDiaryEntries({ onError });

      expect(result).toEqual([]);
      expect(onError).not.toHaveBeenCalled();
      expect(getItemAsyncMock).not.toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('レガシーキーからの移行(マイグレーション)', () => {
    it('migrates entries from the legacy single-key (encrypted) storage into per-entry keys (正常系)', async () => {
      const key = await getOrCreateEncryptionKey();
      // レガシー形式は「新しい順」を前提としていないため、あえて登録順(古い順)で保存する
      const legacyOrder = [sampleEntries[1], sampleEntries[0]];
      await AsyncStorage.setItem(
        DIARY_ENTRIES_STORAGE_KEY,
        encryptText(JSON.stringify(legacyOrder), key),
      );

      const result = await getAllDiaryEntries();

      // 移行後は個別キー方式のcreatedAt降順ルールに従って返る
      expect(result).toEqual(sampleEntries);
      expect(await readPersistedEntry('1')).toEqual(sampleEntries[1]);
      expect(await readPersistedEntry('2')).toEqual(sampleEntries[0]);
    });

    it('migrates entries from the legacy plain-JSON storage (pre-encryption) into per-entry keys (正常系: 後方互換)', async () => {
      const legacyOrder = [sampleEntries[1], sampleEntries[0]];
      await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, JSON.stringify(legacyOrder));

      expect(await getAllDiaryEntries()).toEqual(sampleEntries);
    });

    it('removes the legacy key once migration has completed (移行後にレガシーキーが削除されること)', async () => {
      const key = await getOrCreateEncryptionKey();
      await AsyncStorage.setItem(
        DIARY_ENTRIES_STORAGE_KEY,
        encryptText(JSON.stringify(sampleEntries), key),
      );

      await getAllDiaryEntries();

      expect(await AsyncStorage.getItem(DIARY_ENTRIES_STORAGE_KEY)).toBeNull();
    });

    it('is idempotent when triggered twice in a row (2回連続で呼び出されても壊れないこと)', async () => {
      const key = await getOrCreateEncryptionKey();
      await AsyncStorage.setItem(
        DIARY_ENTRIES_STORAGE_KEY,
        encryptText(JSON.stringify(sampleEntries), key),
      );

      const first = await getAllDiaryEntries();
      const second = await getAllDiaryEntries();

      expect(first).toEqual(sampleEntries);
      expect(second).toEqual(sampleEntries);
    });

    it('skips invalid elements found in the legacy array while migrating the valid ones, and logs a warning (異常系: 一部エントリのスキーマ不整合)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const key = await getOrCreateEncryptionKey();
      const mixed = [
        sampleEntries[0],
        { id: '2', text: '欠損データ' }, // createdAtが欠けている
        { id: 3, text: '型違い', createdAt: '2026-01-03T00:00:00.000Z' }, // idが数値
        null,
        sampleEntries[1],
      ];
      await AsyncStorage.setItem(
        DIARY_ENTRIES_STORAGE_KEY,
        encryptText(JSON.stringify(mixed), key),
      );

      const result = await getAllDiaryEntries();

      expect(result).toEqual(sampleEntries);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('2件');
      warnSpy.mockRestore();
    });

    it('does not migrate (and returns an empty array) when the legacy payload is corrupted/invalid JSON (異常系)', async () => {
      await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'not-valid-json{{{');

      await expect(getAllDiaryEntries()).resolves.toEqual([]);
    });

    it('does not run migration when there is no legacy data (レガシーキーが無い場合は何もしないこと)', async () => {
      await seedDiaryEntry(sampleEntries[0]);
      // seedDiaryEntry自体もAsyncStorage.setItem経由でmultiSetを呼ぶため、ここで一旦呼び出し履歴を
      // クリアしてから、getAllDiaryEntries内での呼び出しの有無だけを検証する
      jest.clearAllMocks();

      await getAllDiaryEntries();

      expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
      // レガシーキーが元々存在しない以上、削除(removeItem)という不要な書き込みも
      // 発生しないはず(migrateLegacyEntriesIfNeededの早期returnを直接検証する)
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    });
  });
});
