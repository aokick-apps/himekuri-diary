import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import {
  DIARY_ENTRIES_STORAGE_KEY,
  buildDiaryEntryKey,
  getAllDiaryEntries,
  type DiaryEntry,
} from '@/utils/diary-storage';

import {
  resetDiaryStorageState,
  sampleDiaryEntries,
  secureStoreMock,
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

  it('returns an empty array when nothing has been saved yet (境界値: 未保存状態)', async () => {
    expect(await getAllDiaryEntries()).toEqual([]);
  });

  it('reads entries stored as individual per-entry keys, newest first (正常系)', async () => {
    for (const entry of sampleEntries) {
      await seedDiaryEntry(entry);
    }

    expect(await getAllDiaryEntries()).toEqual(sampleEntries);
  });

  it('sorts entries by createdAt descending regardless of the AsyncStorage key iteration order (並び順の保証)', async () => {
    // わざと古い順に書き込む
    await seedDiaryEntry(sampleEntries[1]);
    await seedDiaryEntry(sampleEntries[0]);

    expect(await getAllDiaryEntries()).toEqual(sampleEntries);
  });

  it('reads plain (unencrypted) per-entry values saved before encryption was introduced, for backward compatibility (正常系: 後方互換)', async () => {
    await AsyncStorage.setItem(buildDiaryEntryKey('1'), JSON.stringify(sampleEntries[1]));
    await AsyncStorage.setItem(buildDiaryEntryKey('2'), JSON.stringify(sampleEntries[0]));

    expect(await getAllDiaryEntries()).toEqual(sampleEntries);
  });

  it('skips a single corrupted entry without discarding the other valid entries (異常系: 1件だけ壊れている)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seedDiaryEntry(sampleEntries[0]);
    await AsyncStorage.setItem(buildDiaryEntryKey('broken'), 'not-valid-json{{{');

    expect(await getAllDiaryEntries()).toEqual([sampleEntries[0]]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('notifies onError instead of onPartialCorruption when every encrypted entry fails to decrypt due to a mismatched key (異常系: 全件復号失敗)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // 端末側には別の鍵が保存されている状況
    await getOrCreateEncryptionKey();
    const otherKey = new Uint8Array(32).fill(9);
    await AsyncStorage.setItem(
      buildDiaryEntryKey('1'),
      encryptText(JSON.stringify(sampleEntries[0]), otherKey),
    );
    await AsyncStorage.setItem(
      buildDiaryEntryKey('2'),
      encryptText(JSON.stringify(sampleEntries[1]), otherKey),
    );
    const onError = jest.fn();
    const onPartialCorruption = jest.fn();

    await expect(getAllDiaryEntries({ onError, onPartialCorruption })).resolves.toEqual([]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onPartialCorruption).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('skips only the entry that fails decryption and reports partial corruption when other entries are readable (異常系: 一部のみ復号失敗)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seedDiaryEntry(sampleEntries[0]);
    const otherKey = new Uint8Array(32).fill(9);
    await AsyncStorage.setItem(
      buildDiaryEntryKey('other'),
      encryptText(JSON.stringify(sampleEntries[1]), otherKey),
    );
    const onError = jest.fn();
    const onPartialCorruption = jest.fn();

    await expect(getAllDiaryEntries({ onError, onPartialCorruption })).resolves.toEqual([
      sampleEntries[0],
    ]);

    expect(onError).not.toHaveBeenCalled();
    expect(onPartialCorruption).toHaveBeenCalledWith(1, 2);
    warnSpy.mockRestore();
  });

  it('notifies onError without generating a new key when encrypted entries exist but no key is stored (異常系: 鍵なし+暗号化データ)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await seedDiaryEntry(sampleEntries[0]);
    secureStoreMock.__reset();
    jest.clearAllMocks();
    const onError = jest.fn();

    await expect(getAllDiaryEntries({ onError })).resolves.toEqual([]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('notifies onError without generating a new key when the legacy encrypted data exists but no key is stored (異常系: レガシー移行時の鍵なし)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const key = await getOrCreateEncryptionKey();
    await AsyncStorage.setItem(
      DIARY_ENTRIES_STORAGE_KEY,
      encryptText(JSON.stringify(sampleEntries), key),
    );
    secureStoreMock.__reset();
    jest.clearAllMocks();
    const onError = jest.fn();

    await expect(getAllDiaryEntries({ onError })).resolves.toEqual([]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(DIARY_ENTRIES_STORAGE_KEY)).not.toBeNull();
    errorSpy.mockRestore();
  });

  it('skips an entry whose decrypted payload does not match the DiaryEntry shape (異常系: スキーマ不整合)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const key = await getOrCreateEncryptionKey();
    await AsyncStorage.setItem(
      buildDiaryEntryKey('broken'),
      encryptText(JSON.stringify({ unexpected: 'shape' }), key),
    );
    await seedDiaryEntry(sampleEntries[0]);

    expect(await getAllDiaryEntries()).toEqual([sampleEntries[0]]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('1件');
    warnSpy.mockRestore();
  });

  it('does not log a warning when all entries are valid (正常系: ログが出ないこと)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const entry of sampleEntries) {
      await seedDiaryEntry(entry);
    }

    await getAllDiaryEntries();

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns an empty array instead of throwing when AsyncStorage.getAllKeys itself rejects (異常系)', async () => {
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('storage read error'));

    await expect(getAllDiaryEntries()).resolves.toEqual([]);
  });

  it('logs the underlying error when all entries fail to load, so it stays distinguishable from a truly empty state (異常系: 全滅時のログ)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = new Error('storage read error');
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(thrown);

    await getAllDiaryEntries();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('getAllDiaryEntries');
    expect(errorSpy.mock.calls[0][1]).toBe(thrown);
    errorSpy.mockRestore();
  });

  it('notifies the caller-supplied onError callback when all entries fail to load (異常系: onErrorコールバック)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = new Error('storage read error');
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(thrown);
    const onError = jest.fn();

    const result = await getAllDiaryEntries({ onError });

    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalledWith(thrown);
  });

  it('does not call onError when entries load successfully (正常系: onErrorが呼ばれないこと)', async () => {
    for (const entry of sampleEntries) {
      await seedDiaryEntry(entry);
    }
    const onError = jest.fn();

    await getAllDiaryEntries({ onError });

    expect(onError).not.toHaveBeenCalled();
  });

  it('does not call onError when only some entries are corrupted, since the read as a whole still succeeds (境界値: 一部だけ壊れている場合はonErrorを呼ばない)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seedDiaryEntry(sampleEntries[0]);
    await AsyncStorage.setItem(buildDiaryEntryKey('broken'), 'not-valid-json{{{');
    const onError = jest.fn();

    const result = await getAllDiaryEntries({ onError });

    expect(result).toEqual([sampleEntries[0]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('notifies the caller-supplied onPartialCorruption callback with the invalid and total entry counts when some entries are corrupted (正常系: onPartialCorruptionコールバック)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seedDiaryEntry(sampleEntries[0]);
    await AsyncStorage.setItem(buildDiaryEntryKey('broken'), 'not-valid-json{{{');
    const onPartialCorruption = jest.fn();

    const result = await getAllDiaryEntries({ onPartialCorruption });

    expect(result).toEqual([sampleEntries[0]]);
    expect(onPartialCorruption).toHaveBeenCalledTimes(1);
    expect(onPartialCorruption).toHaveBeenCalledWith(1, 2);
  });

  it('does not call onPartialCorruption when all entries are valid (正常系: onPartialCorruptionが呼ばれないこと)', async () => {
    for (const entry of sampleEntries) {
      await seedDiaryEntry(entry);
    }
    const onPartialCorruption = jest.fn();

    await getAllDiaryEntries({ onPartialCorruption });

    expect(onPartialCorruption).not.toHaveBeenCalled();
  });

  it('calls only onError, not onPartialCorruption, when the entire load fails (異常系: 全滅時はonPartialCorruptionを呼ばない)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('storage read error'));
    const onError = jest.fn();
    const onPartialCorruption = jest.fn();

    const result = await getAllDiaryEntries({ onError, onPartialCorruption });

    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onPartialCorruption).not.toHaveBeenCalled();
  });

  describe('createdAtが同一の場合の並び順(tie-break)', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
      secureStoreMock.__reset();
      jest.clearAllMocks();
    });

    // getAllDiaryEntriesの実装(diary-storage.ts)は、createdAtが完全に一致する場合に
    // idの降順で安定した順序を返す仕様になっている。この分岐は他のテストでは一度も
    // 通っていなかったため、明示的に検証する
    it('falls back to sorting by id descending when multiple entries share the exact same createdAt (境界値: 同時刻保存)', async () => {
      const sameCreatedAt = '2026-01-01T00:00:00.000Z';
      const entries: DiaryEntry[] = [
        { id: 'a', text: '1件目', createdAt: sameCreatedAt },
        { id: 'c', text: '3件目', createdAt: sameCreatedAt },
        { id: 'b', text: '2件目', createdAt: sameCreatedAt },
      ];
      // わざとid順ではない順番で書き込み、返り値の並び順が挿入順に依存していないことも確認する
      for (const entry of entries) {
        await seedDiaryEntry(entry);
      }

      const result = await getAllDiaryEntries();

      expect(result.map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
    });
  });
});
