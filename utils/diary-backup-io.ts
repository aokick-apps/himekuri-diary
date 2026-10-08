// 添付画像を含む日記バックアップ(JSON Lines)の読み書き。
// 写真は合計で数百MBになりうるため、全体を文字列やMapに載せず、断片ごとにファイルとの間を
// 行き来させて、メモリ使用量を日記本文+1断片分に抑える。
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, type FileHandle } from 'expo-file-system';
import { Platform } from 'react-native';

import { decodeBase64, encodeBase64 } from '@/utils/base64';
import {
  buildDiaryBackupHeaderLine,
  buildDiaryBackupImageLine,
  collectReferencedImageFileNames,
  DIARY_BACKUP_IMAGE_CHUNK_BYTES,
  serializeDiaryEntriesForExport,
} from '@/utils/diary-export';
import { readPickedFileContent } from '@/utils/diary-file-transfer';
import {
  parseDiaryBackupImageLine,
  parseDiaryEntriesForImport,
  type DiaryImportParseResult,
} from '@/utils/diary-import';
import {
  getDiaryImageFile,
  getDiaryImagesDirectory,
  isDiaryImageAttachmentSupported,
} from '@/utils/diary-images';
import type { DiaryEntry } from '@/utils/diary-storage';

const READ_BLOCK_BYTES = 64 * 1024;
const WEB_FIRST_LINE_WINDOW_BYTES = 256 * 1024;
const NEWLINE = 0x0a;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 同期的なファイル操作が続くとUIが固まるため、画像1枚ごとに描画へ制御を返す
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) {
    return parts[0];
  }
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * ファイルをブロックごとに読み、改行(0x0A)で区切った1行ずつのバイト列を返す。
 * 0x0AはUTF-8のマルチバイト文字の途中には現れないため、バイト列のまま区切っても文字が壊れない。
 */
function* iterateLines(handle: FileHandle): Generator<Uint8Array> {
  const size = handle.size ?? 0;
  let parts: Uint8Array[] = [];
  while ((handle.offset ?? 0) < size) {
    const block = handle.readBytes(READ_BLOCK_BYTES);
    if (block.length === 0) {
      break;
    }
    let start = 0;
    for (
      let index = block.indexOf(NEWLINE, start);
      index !== -1;
      index = block.indexOf(NEWLINE, start)
    ) {
      parts.push(block.subarray(start, index));
      yield concatBytes(parts);
      parts = [];
      start = index + 1;
    }
    if (start < block.length) {
      parts.push(block.subarray(start));
    }
  }
  if (parts.length > 0) {
    yield concatBytes(parts);
  }
}

function writeImageLines(output: FileHandle, fileName: string): void {
  const source = getDiaryImageFile({ fileName }).open();
  try {
    let remaining = source.size ?? 0;
    // 0バイトの画像も、空の断片1行として必ず書き出す
    do {
      const length = Math.min(DIARY_BACKUP_IMAGE_CHUNK_BYTES, remaining);
      const bytes = length > 0 ? source.readBytes(length) : new Uint8Array(0);
      if (bytes.length !== length) {
        throw new Error('添付画像を最後まで読み込めませんでした');
      }
      remaining -= length;
      const line = buildDiaryBackupImageLine(fileName, encodeBase64(bytes), remaining === 0);
      output.writeBytes(encoder.encode(`${line}\n`));
    } while (remaining > 0);
  } finally {
    source.close();
  }
}

/**
 * 日記をバックアップファイルに書き出す。本体が存在する添付画像がある場合だけ、1行目に日記、
 * 2行目以降に画像の断片を並べたJSON Linesにする。無い場合は従来どおりの配列JSONにする。
 */
export async function writeDiaryBackupFile(file: File, entries: DiaryEntry[]): Promise<void> {
  const imageFileNames = isDiaryImageAttachmentSupported()
    ? collectReferencedImageFileNames(entries).filter(
        (fileName) => getDiaryImageFile({ fileName }).exists,
      )
    : [];
  if (imageFileNames.length === 0) {
    file.write(serializeDiaryEntriesForExport(entries));
    return;
  }

  file.create({ overwrite: true });
  const output = file.open();
  try {
    output.writeBytes(encoder.encode(`${buildDiaryBackupHeaderLine(entries, imageFileNames)}\n`));
    for (const fileName of imageFileNames) {
      writeImageLines(output, fileName);
      await yieldToUi();
    }
  } finally {
    output.close();
  }
}

/** インポート用に読み込んだバックアップ。画像の復元は、ユーザーが取り込みを確定した後に呼び出す */
export type DiaryBackupImport = DiaryImportParseResult & {
  /** 画像を添付画像ディレクトリへ書き戻し、書き戻せなかった枚数を返す */
  restoreImages: () => Promise<number>;
};

// 1行目だけで完結するJSONとして読めなければ`null`(旧形式の整形済みJSONなど)。
// 形式の誤りなど構文エラー以外はそのまま例外にする
function parseFirstLine(line: string | null): DiaryImportParseResult | null {
  if (line === null) {
    return null;
  }
  try {
    return parseDiaryEntriesForImport(line);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function readFirstLineOfNativeFile(file: File): string | null {
  try {
    const handle = file.open();
    try {
      const first = iterateLines(handle).next();
      return first.done ? null : decoder.decode(first.value);
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

// 全体を読み込まずに済むよう、改行が見つかるまで先頭から窓を広げて読む
async function readFirstLineOfBrowserFile(file: Blob): Promise<string> {
  let windowBytes = WEB_FIRST_LINE_WINDOW_BYTES;
  for (;;) {
    const text = await file.slice(0, windowBytes).text();
    const index = text.indexOf('\n');
    if (index >= 0) {
      return text.slice(0, index);
    }
    if (windowBytes >= file.size) {
      return text;
    }
    windowBytes *= 2;
  }
}

/**
 * 画像入りバックアップの2行目以降から、必要な画像だけを復元する。1枚ずつ一時ファイルに書き、
 * 最後の断片まで成功したものだけを本来の場所へ移す。途中で失敗した画像は一時ファイルを消して失敗に数える。
 */
async function restoreImagesFromBackupFile(
  file: File,
  imageFileNames: readonly string[],
): Promise<number> {
  if (!isDiaryImageAttachmentSupported()) {
    return 0;
  }
  // 同名の画像が既にあれば同じ参照として使えるため、上書きせず復元済みとして扱う
  const targets = new Set(
    imageFileNames.filter((fileName) => !getDiaryImageFile({ fileName }).exists),
  );
  if (targets.size === 0) {
    return 0;
  }

  const directory = getDiaryImagesDirectory();
  let input: FileHandle;
  try {
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }
    input = file.open();
  } catch (error) {
    console.warn('restoreImagesFromBackupFile: 添付画像を復元できませんでした', error);
    return targets.size;
  }

  const completed = new Set<string>();
  const failed = new Set<string>();
  let current: { fileName: string; temp: File; handle: FileHandle } | null = null;

  const discardCurrent = () => {
    if (!current) {
      return;
    }
    failed.add(current.fileName);
    try {
      current.handle.close();
      if (current.temp.exists) {
        current.temp.delete();
      }
    } catch (error) {
      console.warn('restoreImagesFromBackupFile: 一時ファイルを削除できませんでした', error);
    }
    current = null;
  };

  try {
    let isHeaderLine = true;
    for (const bytes of iterateLines(input)) {
      if (isHeaderLine) {
        isHeaderLine = false;
        continue;
      }
      if (bytes.length === 0) {
        continue;
      }
      const chunk = parseDiaryBackupImageLine(decoder.decode(bytes));
      if (chunk === null) {
        // 壊れた行は、どの画像の断片か分からないため進行中の画像を失敗として扱う
        discardCurrent();
        continue;
      }
      const { fileName, data, isLast } = chunk;
      if (!targets.has(fileName) || completed.has(fileName) || failed.has(fileName)) {
        continue;
      }
      if (current && current.fileName !== fileName) {
        // 最後の断片に到達しないまま別の画像に移った
        discardCurrent();
      }
      try {
        if (!current) {
          const temp: File = new File(directory, `${fileName}.partial`);
          temp.create({ overwrite: true });
          current = { fileName, temp, handle: temp.open() };
        }
        current.handle.writeBytes(decodeBase64(data));
        if (isLast) {
          current.handle.close();
          current.temp.move(getDiaryImageFile({ fileName }));
          completed.add(fileName);
          current = null;
          await yieldToUi();
        }
      } catch (error) {
        console.warn('restoreImagesFromBackupFile: 添付画像を書き戻せませんでした', error);
        discardCurrent();
        failed.add(fileName);
      }
    }
    // 最後の断片が無いまま終わった画像(ファイルが途中で切れている)
    discardCurrent();
  } finally {
    input.close();
  }
  return targets.size - completed.size;
}

/**
 * 選択されたバックアップを読み込む。1行目だけを先に読んで日記と画像のファイル名を取り出し、
 * 画像本体はここでは読まない。1行目で判別できない旧形式(配列JSON)は全文を読み込む。
 */
export async function readDiaryBackupForImport(
  asset: DocumentPickerAsset,
): Promise<DiaryBackupImport> {
  if (Platform.OS === 'web') {
    // Webは画像を扱わないため、1行目だけを読めばよい
    const webFile = asset.file;
    const firstLine = webFile ? await readFirstLineOfBrowserFile(webFile) : null;
    const parsed =
      parseFirstLine(firstLine) ?? parseDiaryEntriesForImport(await readPickedFileContent(asset));
    return { ...parsed, restoreImages: async () => 0 };
  }

  const file = new File(asset.uri);
  const parsed =
    parseFirstLine(readFirstLineOfNativeFile(file)) ??
    parseDiaryEntriesForImport(await readPickedFileContent(asset));
  return {
    ...parsed,
    restoreImages: () => restoreImagesFromBackupFile(file, parsed.imageFileNames),
  };
}
