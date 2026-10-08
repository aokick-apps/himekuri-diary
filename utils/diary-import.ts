// 日記データをJSONファイルからインポート(再取り込み)するための純粋関数群。
// ファイル選択(expo-document-picker)・確認ダイアログのI/Oは`app/(tabs)/settings.tsx`側で行い、
// このファイルは外部I/Oを持たないパース・検証ロジックのみを扱う(`utils/diary-export.ts`と同方針)。
import { DIARY_BACKUP_FORMAT, DIARY_BACKUP_VERSION } from '@/utils/diary-export';
import { isDiaryEntry, isDiaryImage, type DiaryEntry } from '@/utils/diary-storage';
import { BODY_MAX_LENGTH, splitIntoGraphemes } from '@/utils/diary-text';

/** インポート対象のJSON文字列をパースした結果。 */
export type DiaryImportParseResult = {
  /** `DiaryEntry`として妥当な形をしていた要素のみ。 */
  validEntries: DiaryEntry[];
  /** `DiaryEntry`の形を満たさず読み込みをスキップした要素の数。 */
  invalidCount: number;
  /** 取り込み対象の日記が参照する添付画像のうち、バックアップに本体が含まれていたもの(ファイル名 -> Base64)。 */
  images: Map<string, string>;
};

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function isBase64(value: unknown): value is string {
  return typeof value === 'string' && value.length % 4 === 0 && BASE64_PATTERN.test(value);
}

/**
 * バックアップ内の画像のうち、取り込む日記が参照していて、ファイル名とBase64が妥当なものだけを返す。
 * ファイル名は添付画像ディレクトリの外を指せないよう`isDiaryImage`で検証する。
 */
function extractReferencedImages(rawImages: unknown, entries: DiaryEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  if (typeof rawImages !== 'object' || rawImages === null || Array.isArray(rawImages)) {
    return result;
  }
  for (const entry of entries) {
    for (const image of entry.images ?? []) {
      // `__proto__`等の継承プロパティを拾わないよう、自身のプロパティだけを見る
      if (!Object.prototype.hasOwnProperty.call(rawImages, image.fileName)) {
        continue;
      }
      const data = (rawImages as Record<string, unknown>)[image.fileName];
      if (isDiaryImage(image) && isBase64(data)) {
        result.set(image.fileName, data);
      }
    }
  }
  return result;
}

/**
 * インポート対象のJSON文字列を`DiaryEntry[]`としてパース・検証する。
 *
 * - JSONとしてパースできない場合は`JSON.parse`の例外をそのまま伝播させる。
 * - トップレベルは日記の配列(旧形式)か、画像本体を含むオブジェクト形式(`format`・`version`で判別)。
 *   どちらでもない場合や未対応のバージョンの場合は、エクスポート形式と異なるファイルとみなし例外を投げる。
 * - `DiaryEntry`の形を満たさない要素・`text`が`BODY_MAX_LENGTH`を超える要素は、
 *   `getAllDiaryEntries`と同様の方針で不正なデータとみなしその要素だけを除外する
 *   (1件の不整合でファイル全体のインポートが失敗しないようにするため)。
 */
export function parseDiaryEntriesForImport(content: string): DiaryImportParseResult {
  const root: unknown = JSON.parse(content);
  let parsed: unknown;
  let rawImages: unknown;
  if (Array.isArray(root)) {
    parsed = root;
  } else if (
    typeof root === 'object' &&
    root !== null &&
    (root as Record<string, unknown>).format === DIARY_BACKUP_FORMAT &&
    (root as Record<string, unknown>).version === DIARY_BACKUP_VERSION
  ) {
    parsed = (root as Record<string, unknown>).entries;
    rawImages = (root as Record<string, unknown>).images;
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
    images: extractReferencedImages(rawImages, validEntries),
  };
}
