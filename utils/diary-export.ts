// 日記データをJSON形式でエクスポートするための純粋関数群。
// ファイルの書き出し・共有シート表示のI/O(expo-file-system/expo-sharing)は
// `app/(tabs)/settings.tsx`側で行い、このファイルは外部I/Oを持たずユニットテストしやすくしている。
import type { DiaryEntry } from '@/utils/diary-storage';

const EXPORT_FILE_NAME_PREFIX = 'diary-export';

/** 画像本体を含むバックアップ(JSON Lines)を、日記の配列だけの旧形式と見分けるための識別子 */
export const DIARY_BACKUP_FORMAT = 'diary-backup';
export const DIARY_BACKUP_VERSION = 2;

/**
 * 画像を1行に収める元データの大きさ。3の倍数にしておくと、断片ごとにBase64化しても
 * パディングが入らず、どの断片も単独でデコードできる。
 */
export const DIARY_BACKUP_IMAGE_CHUNK_BYTES = 48 * 1024;

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
 * 日記データ一覧を、エクスポート用のJSON文字列(配列)に変換する。
 * 復号済みの平文をそのまま書き出すため、書き出し先ファイルは暗号化されない
 * (ユーザー自身が内容を確認・バックアップできることを目的とするため)。
 */
export function serializeDiaryEntriesForExport(entries: DiaryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/** 日記が参照している添付画像のファイル名(重複なし) */
export function collectReferencedImageFileNames(entries: readonly DiaryEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => (entry.images ?? []).map((i) => i.fileName)))];
}

/**
 * 画像入りバックアップ(JSON Lines)の1行目。日記本体と、後続の行に本体が含まれる画像のファイル名一覧を
 * 改行を含まない1行で表す。画像の枚数を本文の読み込みだけで分かるようにするため一覧を持たせる。
 */
export function buildDiaryBackupHeaderLine(
  entries: DiaryEntry[],
  imageFileNames: readonly string[],
): string {
  return JSON.stringify({
    format: DIARY_BACKUP_FORMAT,
    version: DIARY_BACKUP_VERSION,
    entries,
    images: imageFileNames,
  });
}

/**
 * 画像の断片1つ分の行。`index`は画像内での0始まりの連番で、欠けた断片を検出するために使う。
 * その画像の最後の断片には`last`を付け、途中で切れたファイルも検出できるようにする。
 */
export function buildDiaryBackupImageLine(
  fileName: string,
  data: string,
  index: number,
  isLastChunk: boolean,
): string {
  return JSON.stringify(
    isLastChunk ? { image: fileName, index, data, last: true } : { image: fileName, index, data },
  );
}
