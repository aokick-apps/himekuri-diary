// 日記データをJSONファイルからインポート(再取り込み)するための純粋関数群。
// ファイル選択(expo-document-picker)・確認ダイアログのI/Oは`app/(tabs)/settings.tsx`側で行い、
// このファイルは外部I/Oを持たないパース・検証ロジックのみを扱う(`utils/diary-export.ts`と同方針)。
import { DIARY_BACKUP_FORMAT, DIARY_BACKUP_VERSION } from '@/utils/diary-export';
import { isValidBase64 } from '@/utils/base64';
import { isDiaryEntry, isDiaryImage, type DiaryEntry } from '@/utils/diary-storage';
import { BODY_MAX_LENGTH, splitIntoGraphemes } from '@/utils/diary-text';

/** インポート対象のJSON文字列をパースした結果。 */
export type DiaryImportParseResult = {
  /** `DiaryEntry`として妥当な形をしていた要素のみ。 */
  validEntries: DiaryEntry[];
  /** `DiaryEntry`の形を満たさず読み込みをスキップした要素の数。 */
  invalidCount: number;
  /** 取り込む日記が参照していて、バックアップに本体が含まれる添付画像のファイル名。 */
  imageFileNames: string[];
};

/**
 * 画像入りバックアップの1行目が示す画像のうち、取り込む日記が参照していて、ファイル名が
 * 添付画像ディレクトリの外を指せない(`isDiaryImage`で検証)ものだけを返す。
 */
function extractReferencedImageFileNames(rawNames: unknown, entries: DiaryEntry[]): string[] {
  if (!Array.isArray(rawNames)) {
    return [];
  }
  const listed = new Set(rawNames.filter((name): name is string => typeof name === 'string'));
  const referenced = new Set(
    entries.flatMap((entry) => (entry.images ?? []).map((i) => i.fileName)),
  );
  return [...listed].filter((name) => referenced.has(name) && isDiaryImage({ fileName: name }));
}

/** 画像入りバックアップの2行目以降にある、画像の断片1つ分。 */
export type DiaryBackupImageChunk = {
  fileName: string;
  /** Base64として妥当であることを検証済みの断片。 */
  data: string;
  /** その画像の最後の断片か。 */
  isLast: boolean;
};

/** 1行をパースして画像の断片として検証する。不正な行は`null`を返す。 */
export function parseDiaryBackupImageLine(line: string): DiaryBackupImageChunk | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const { image, data, last } = parsed as Record<string, unknown>;
  if (
    typeof image !== 'string' ||
    !isDiaryImage({ fileName: image }) ||
    typeof data !== 'string' ||
    !isValidBase64(data)
  ) {
    return null;
  }
  return { fileName: image, data, isLast: last === true };
}

/**
 * インポート対象のJSON文字列を`DiaryEntry[]`としてパース・検証する。
 *
 * - JSONとしてパースできない場合は`JSON.parse`の例外をそのまま伝播させる。
 * - トップレベルは日記の配列(旧形式)か、画像入りバックアップの1行目のオブジェクト(`format`・`version`で判別)。
 *   どちらでもない場合や未対応のバージョンの場合は、エクスポート形式と異なるファイルとみなし例外を投げる。
 * - `DiaryEntry`の形を満たさない要素・`text`が`BODY_MAX_LENGTH`を超える要素は、
 *   `getAllDiaryEntries`と同様の方針で不正なデータとみなしその要素だけを除外する
 *   (1件の不整合でファイル全体のインポートが失敗しないようにするため)。
 */
export function parseDiaryEntriesForImport(content: string): DiaryImportParseResult {
  const root: unknown = JSON.parse(content);
  let parsed: unknown;
  let rawImageNames: unknown;
  if (Array.isArray(root)) {
    parsed = root;
  } else if (
    typeof root === 'object' &&
    root !== null &&
    (root as Record<string, unknown>).format === DIARY_BACKUP_FORMAT &&
    (root as Record<string, unknown>).version === DIARY_BACKUP_VERSION
  ) {
    parsed = (root as Record<string, unknown>).entries;
    rawImageNames = (root as Record<string, unknown>).images;
  }
  if (!Array.isArray(parsed)) {
    throw new Error('インポートするデータの形式が正しくありません');
  }

  const validEntries = parsed.filter(
    (entry): entry is DiaryEntry =>
      isDiaryEntry(entry) && splitIntoGraphemes(entry.text).length <= BODY_MAX_LENGTH,
  );
  return {
    validEntries,
    invalidCount: parsed.length - validEntries.length,
    imageFileNames: extractReferencedImageFileNames(rawImageNames, validEntries),
  };
}
