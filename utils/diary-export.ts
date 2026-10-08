// 日記データをJSON形式でエクスポートするための純粋関数群。
// ファイルの書き出し・共有シート表示のI/O(expo-file-system/expo-sharing)は
// `app/(tabs)/settings.tsx`側で行い、このファイルは外部I/Oを持たずユニットテストしやすくしている。
import type { DiaryEntry } from '@/utils/diary-storage';

const EXPORT_FILE_NAME_PREFIX = 'diary-export';

/** 画像本体を含むバックアップを、日記の配列だけの旧形式と見分けるための識別子 */
export const DIARY_BACKUP_FORMAT = 'diary-backup';
export const DIARY_BACKUP_VERSION = 2;

/**
 * 日記データのエクスポート先ファイル名を生成する。
 * 同じ端末で複数回エクスポートしても上書きされないよう、日時(秒単位)を含めて一意にする。
 */
export function buildDiaryExportFileName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${EXPORT_FILE_NAME_PREFIX}-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
}

/**
 * 日記データ一覧を、エクスポート用のJSON文字列に変換する。
 * 復号済みの平文をそのまま書き出すため、書き出し先ファイルは暗号化されない
 * (ユーザー自身が内容を確認・バックアップできることを目的とするため)。
 *
 * 添付画像(ファイル名 -> Base64)がある場合のみ、画像本体を埋め込んだオブジェクト形式で書き出す。
 * 画像が無い場合は従来どおり日記の配列だけを書き出し、旧形式のまま扱えるようにする。
 */
export function serializeDiaryEntriesForExport(
  entries: DiaryEntry[],
  images: ReadonlyMap<string, string> = new Map(),
): string {
  if (images.size === 0) {
    return JSON.stringify(entries, null, 2);
  }
  return JSON.stringify(
    {
      format: DIARY_BACKUP_FORMAT,
      version: DIARY_BACKUP_VERSION,
      entries,
      images: Object.fromEntries(images),
    },
    null,
    2,
  );
}
