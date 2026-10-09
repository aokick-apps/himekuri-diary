import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  DIARY_DAY_ENTRIES_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX,
  DIARY_DRAFT_STORAGE_KEY,
  DIARY_EDIT_DRAFT_STORAGE_KEY_PREFIX,
  DIARY_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX,
} from '@/utils/diary-draft-storage';
import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import {
  DIARY_ENTRIES_STORAGE_KEY,
  DIARY_ENTRY_KEY_PREFIX,
  buildDiaryEntryKey,
  clearAllDiaryEntries,
  deleteDiaryEntry,
  getDiaryEntryById,
  isDiaryEntry,
  saveDiaryEntry,
  type DiaryEntry,
} from '@/utils/diary-storage';

import {
  readPersistedEntry,
  resetDiaryStorageState,
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

// 添付画像のファイル削除はネイティブのファイルシステムに依存するため、呼び出されたかだけを検証する
jest.mock('@/utils/diary-images', () => ({
  deleteAllDiaryImages: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedDiaryImages = require('@/utils/diary-images') as { deleteAllDiaryImages: jest.Mock };

describe('clearAllDiaryEntries', () => {
  beforeEach(async () => {
    await resetDiaryStorageState();
  });

  it('removes all entries stored under the per-entry keys from AsyncStorage (正常系)', async () => {
    await seedDiaryEntry({ id: '1', text: '1件目', createdAt: '2026-01-01T00:00:00.000Z' });
    await seedDiaryEntry({ id: '2', text: '2件目', createdAt: '2026-01-02T00:00:00.000Z' });

    await clearAllDiaryEntries();

    expect(await AsyncStorage.getItem(buildDiaryEntryKey('1'))).toBeNull();
    expect(await AsyncStorage.getItem(buildDiaryEntryKey('2'))).toBeNull();
  });

  it('also deletes every attached image file (正常系: 添付画像も削除)', async () => {
    await seedDiaryEntry({
      id: '1',
      text: '画像付き',
      createdAt: '2026-01-01T00:00:00.000Z',
      images: [{ fileName: 'a.jpg' }],
    });

    await clearAllDiaryEntries();

    expect(mockedDiaryImages.deleteAllDiaryImages).toHaveBeenCalledTimes(1);
  });

  it('also removes the legacy single-key data if it still remains (念のためのレガシーキー削除)', async () => {
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'encrypted:v1:dummy-payload');

    await clearAllDiaryEntries();

    expect(await AsyncStorage.getItem(DIARY_ENTRIES_STORAGE_KEY)).toBeNull();
  });

  it('does not affect unrelated keys (他のキーに影響を与えないことの確認)', async () => {
    await seedDiaryEntry({ id: '1', text: '1件目', createdAt: '2026-01-01T00:00:00.000Z' });
    // 日記データ以外のキー(例: 他の設定値)が誤って削除されないことも確認する
    await AsyncStorage.setItem('other-unrelated-key', 'should survive');

    await clearAllDiaryEntries();

    expect(await AsyncStorage.getItem('other-unrelated-key')).toBe('should survive');
  });

  it('also removes unsaved draft keys for the composer, new-entry modal, and edit screen (下書きキーも削除対象に含まれることの確認)', async () => {
    await seedDiaryEntry({ id: '1', text: '1件目', createdAt: '2026-01-01T00:00:00.000Z' });
    await AsyncStorage.setItem(DIARY_DRAFT_STORAGE_KEY, 'encrypted:v1:dummy-composer-draft');
    await AsyncStorage.setItem(
      `${DIARY_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}2026-01-05`,
      'encrypted:v1:dummy-new-entry-draft',
    );
    await AsyncStorage.setItem(
      `${DIARY_EDIT_DRAFT_STORAGE_KEY_PREFIX}entry-1`,
      'encrypted:v1:dummy-edit-draft',
    );
    await AsyncStorage.setItem(
      `${DIARY_DAY_ENTRIES_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}2026-01-05`,
      'encrypted:v1:dummy-day-entries-draft',
    );

    await clearAllDiaryEntries();

    expect(await AsyncStorage.getItem(DIARY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(
      await AsyncStorage.getItem(`${DIARY_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}2026-01-05`),
    ).toBeNull();
    expect(await AsyncStorage.getItem(`${DIARY_EDIT_DRAFT_STORAGE_KEY_PREFIX}entry-1`)).toBeNull();
    expect(
      await AsyncStorage.getItem(
        `${DIARY_DAY_ENTRIES_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}2026-01-05`,
      ),
    ).toBeNull();
  });

  it('does not throw when there is no diary data to delete yet (境界値: 未保存状態での削除)', async () => {
    // 一度も日記を保存していない(=キーが存在しない)状態で呼び出しても例外にならないこと
    await expect(clearAllDiaryEntries()).resolves.toBeUndefined();
  });

  it('leaves AsyncStorage empty for the diary keys when called twice in a row (冪等性の確認)', async () => {
    await seedDiaryEntry({ id: '1', text: '1件目', createdAt: '2026-01-01T00:00:00.000Z' });

    await clearAllDiaryEntries();
    await clearAllDiaryEntries();

    expect(await AsyncStorage.getItem(buildDiaryEntryKey('1'))).toBeNull();
  });

  it('propagates the error when the underlying AsyncStorage removal call fails (異常系)', async () => {
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('storage error'));

    await expect(clearAllDiaryEntries()).rejects.toThrow('storage error');
  });

  it('exports the expected AsyncStorage key constants used across the app (回帰確認)', () => {
    // app/(tabs)/index.tsx側やこのテストファイルもこれらの定数を参照するため、
    // キーの実際の値そのものが意図せず変わっていないことを確認する
    expect(DIARY_ENTRIES_STORAGE_KEY).toBe('diary-entries');
    expect(DIARY_ENTRY_KEY_PREFIX).toBe('diary-entry:');
    expect(buildDiaryEntryKey('abc')).toBe('diary-entry:abc');
  });
});

describe('saveDiaryEntry', () => {
  beforeEach(async () => {
    await resetDiaryStorageState();
  });

  it('persists a single entry under its own per-entry key, encrypted (正常系)', async () => {
    const entry: DiaryEntry = {
      id: '1',
      text: '今日はいい天気でした。',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    await saveDiaryEntry(entry);

    const stored = await AsyncStorage.getItem(buildDiaryEntryKey('1'));
    expect(stored).toEqual(expect.stringMatching(/^encrypted:v1:/));
    expect(await readPersistedEntry('1')).toEqual(entry);
  });

  it('writes to exactly one AsyncStorage key without touching other entries (1回の書き込みで完結すること)', async () => {
    await seedDiaryEntry({
      id: 'other',
      text: '他のエントリ',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    jest.clearAllMocks();

    const entry: DiaryEntry = {
      id: 'new',
      text: '新規エントリ',
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    await saveDiaryEntry(entry);

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      buildDiaryEntryKey('new'),
      expect.stringMatching(/^encrypted:v1:/),
    );
    // 既存の無関係なエントリは変化しない
    expect(await readPersistedEntry('other')).toEqual({
      id: 'other',
      text: '他のエントリ',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('overwrites the existing value when saving an edit to the same id (編集時の上書き)', async () => {
    const entry: DiaryEntry = {
      id: '1',
      text: '元のテキスト',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await saveDiaryEntry(entry);

    const updated: DiaryEntry = { ...entry, text: '編集後のテキスト' };
    await saveDiaryEntry(updated);

    expect(await readPersistedEntry('1')).toEqual(updated);
  });
});

describe('deleteDiaryEntry', () => {
  beforeEach(async () => {
    await resetDiaryStorageState();
  });

  it('removes only the specified entry key (正常系)', async () => {
    await seedDiaryEntry({ id: '1', text: '残す', createdAt: '2026-01-01T00:00:00.000Z' });
    await seedDiaryEntry({ id: '2', text: '消す', createdAt: '2026-01-02T00:00:00.000Z' });

    await deleteDiaryEntry('2');

    expect(await readPersistedEntry('1')).not.toBeNull();
    expect(await AsyncStorage.getItem(buildDiaryEntryKey('2'))).toBeNull();
  });

  it('does not throw when the entry does not exist (境界値)', async () => {
    await expect(deleteDiaryEntry('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('getDiaryEntryById', () => {
  beforeEach(async () => {
    await resetDiaryStorageState();
  });

  it('returns the decrypted entry matching the given id (正常系)', async () => {
    const entry: DiaryEntry = {
      id: '1',
      text: '編集画面から取得する日記',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await seedDiaryEntry(entry);
    await seedDiaryEntry({ id: '2', text: '別のエントリ', createdAt: '2026-01-02T00:00:00.000Z' });

    await expect(getDiaryEntryById('1')).resolves.toEqual(entry);
  });

  it('reads a plain (unencrypted) entry saved before encryption was introduced, for backward compatibility (正常系: 後方互換)', async () => {
    const entry: DiaryEntry = {
      id: '1',
      text: '暗号化対応前の日記',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await AsyncStorage.setItem(buildDiaryEntryKey('1'), JSON.stringify(entry));

    await expect(getDiaryEntryById('1')).resolves.toEqual(entry);
  });

  it('returns null when no entry exists for the given id (境界値)', async () => {
    await expect(getDiaryEntryById('does-not-exist')).resolves.toBeNull();
  });

  it('throws, rather than returning null, when the stored value fails to decrypt (異常系: 復号失敗はnot-foundと区別)', async () => {
    await AsyncStorage.setItem(buildDiaryEntryKey('1'), 'encrypted:v1:not-a-real-payload');

    await expect(getDiaryEntryById('1')).rejects.toThrow();
  });

  it('throws without generating a new key when an encrypted entry exists but no key is stored (異常系: 鍵なし+暗号化データ)', async () => {
    await seedDiaryEntry({ id: '1', text: '暗号化済み', createdAt: '2026-01-01T00:00:00.000Z' });
    secureStoreMock.__reset();
    jest.clearAllMocks();

    await expect(getDiaryEntryById('1')).rejects.toThrow();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('throws, rather than returning null, when the decrypted payload does not match the DiaryEntry shape (異常系: スキーマ不整合)', async () => {
    const key = await getOrCreateEncryptionKey();
    await AsyncStorage.setItem(
      buildDiaryEntryKey('1'),
      encryptText(JSON.stringify({ foo: 'bar' }), key),
    );

    await expect(getDiaryEntryById('1')).rejects.toThrow();
  });

  it('does not read or write any other AsyncStorage key (他のエントリに影響を与えないこと)', async () => {
    await seedDiaryEntry({ id: '1', text: '対象', createdAt: '2026-01-01T00:00:00.000Z' });
    await seedDiaryEntry({ id: '2', text: '無関係', createdAt: '2026-01-02T00:00:00.000Z' });
    jest.clearAllMocks();

    await getDiaryEntryById('1');

    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(buildDiaryEntryKey('1'));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('isDiaryEntry', () => {
  const base = { id: '1', text: '本文', createdAt: '2026-01-01T00:00:00.000Z' };

  it('accepts entries without images for backward compatibility (正常系: 後方互換)', () => {
    expect(isDiaryEntry(base)).toBe(true);
  });

  it('accepts entries whose images are valid references (正常系)', () => {
    expect(isDiaryEntry({ ...base, images: [] })).toBe(true);
    expect(isDiaryEntry({ ...base, images: [{ fileName: 'a.jpg' }] })).toBe(true);
  });

  it.each([
    ['not an array', { fileName: 'a.jpg' }],
    ['missing fileName', [{}]],
    ['non-string fileName', [{ fileName: 1 }]],
    ['empty fileName', [{ fileName: '' }]],
    ['parent directory reference', [{ fileName: '..' }]],
    ['path with a slash', [{ fileName: '../secret.jpg' }]],
    ['path with a backslash', [{ fileName: 'a\\b.jpg' }]],
  ])('rejects images that are %s (異常系: 不正な参照)', (_label, images) => {
    expect(isDiaryEntry({ ...base, images })).toBe(false);
  });
});
