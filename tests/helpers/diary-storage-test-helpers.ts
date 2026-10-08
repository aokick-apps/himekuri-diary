import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { decryptText, encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import { buildDiaryEntryKey, type DiaryEntry } from '@/utils/diary-storage';

export const secureStoreMock = SecureStore as unknown as { __reset: () => void };

// 各テスト前にAsyncStorage・暗号鍵・モックの呼び出し履歴を初期状態へ戻す
export async function resetDiaryStorageState(): Promise<void> {
  await AsyncStorage.clear();
  secureStoreMock.__reset();
  jest.clearAllMocks();
}

// createdAt降順(新しい順)で返される仕様に合わせ、新しい順に並べて定義しておく
export const sampleDiaryEntries: DiaryEntry[] = [
  { id: '2', text: '公園を散歩しました。', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: '1', text: '今日はいい天気でした。', createdAt: '2026-01-01T00:00:00.000Z' },
];

// 個別キー方式で保存されているエントリを、AsyncStorageから直接読み取って復号するヘルパー
export async function readPersistedEntry(id: string): Promise<DiaryEntry | null> {
  const stored = await AsyncStorage.getItem(buildDiaryEntryKey(id));
  if (!stored) {
    return null;
  }
  const key = await getOrCreateEncryptionKey();
  return JSON.parse(decryptText(stored, key));
}

// テストの事前状態として、指定したエントリを個別キーへ暗号化して直接書き込むヘルパー
export async function seedDiaryEntry(entry: DiaryEntry): Promise<void> {
  const key = await getOrCreateEncryptionKey();
  await AsyncStorage.setItem(buildDiaryEntryKey(entry.id), encryptText(JSON.stringify(entry), key));
}
