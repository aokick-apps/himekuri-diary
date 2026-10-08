import { Platform } from 'react-native';

import { DIARY_BACKUP_IMAGE_CHUNK_BYTES } from '@/utils/diary-export';
import { readDiaryBackupForImport, writeDiaryBackupFile } from '@/utils/diary-backup-io';
import type { DiaryEntry } from '@/utils/diary-storage';

jest.mock('expo-file-system', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../helpers/mock-memory-file-system').createMemoryFileSystemMock(),
);

jest.mock('expo-image-picker', () => ({}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid') }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('expo-file-system') as ReturnType<
  typeof import('../helpers/mock-memory-file-system').createMemoryFileSystemMock
>;

const IMAGES_DIR = 'file:///documents/diary-images';
const EXPORT_URI = 'file:///cache/backup.json';
const PICKED_URI = 'file:///picked/backup.json';
const originalOS = Platform.OS;

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

function makeBytes(length: number, seed = 1): Uint8Array {
  return new Uint8Array(length).map((_, i) => (i * 7 + seed) % 256);
}

function putImage(fileName: string, bytes: Uint8Array) {
  fs.__files.set(`${IMAGES_DIR}/${fileName}`, bytes);
}

function entry(id: string, fileNames: string[], text = `日記${id}`): DiaryEntry {
  return {
    id,
    text,
    createdAt: '2026-04-01T00:00:00.000Z',
    ...(fileNames.length > 0 ? { images: fileNames.map((fileName) => ({ fileName })) } : {}),
  };
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function pickedAsset(extra: Record<string, unknown> = {}) {
  return { uri: PICKED_URI, name: 'backup.json', lastModified: 0, ...extra };
}

async function exportToCache(entries: DiaryEntry[]): Promise<Uint8Array> {
  const { File } = fs;
  await writeDiaryBackupFile(new File(EXPORT_URI) as never, entries);
  return fs.__files.get(EXPORT_URI) as Uint8Array;
}

function linesOf(bytes: Uint8Array): string[] {
  return new TextDecoder().decode(bytes).split('\n');
}

beforeEach(() => {
  fs.__files.clear();
  fs.__directories.clear();
  fs.__failWritesTo.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setPlatform(originalOS);
  // どの経路でも、開いたファイルハンドルは必ず閉じられていること
  expect(fs.__openedHandles.open).toBe(0);
  jest.restoreAllMocks();
});

describe('writeDiaryBackupFile', () => {
  it('writes the legacy array JSON when no attached image exists (正常系: 画像なし)', async () => {
    const entries = [entry('1', [])];

    const written = await exportToCache(entries);

    expect(JSON.parse(new TextDecoder().decode(written))).toEqual(entries);
  });

  it('writes the legacy array JSON when the referenced image files are missing (境界値: 本体が無い)', async () => {
    const entries = [entry('1', ['missing.jpg'])];

    const written = await exportToCache(entries);

    expect(JSON.parse(new TextDecoder().decode(written))).toEqual(entries);
  });

  it('writes the header line followed by one chunk line per slice of each image (正常系: 形式)', async () => {
    const photo = makeBytes(3);
    putImage('a.jpg', photo);
    const entries = [entry('1', ['a.jpg', 'missing.jpg'])];

    const lines = linesOf(await exportToCache(entries));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[0])).toEqual({
      format: 'diary-backup',
      version: 2,
      entries,
      images: ['a.jpg'],
    });
    expect(JSON.parse(lines[1])).toEqual({
      image: 'a.jpg',
      data: Buffer.from(photo).toString('base64'),
      last: true,
    });
  });

  it('splits images at multiples of the chunk size and marks only the final slice (境界値: 断片の境界)', async () => {
    const chunk = DIARY_BACKUP_IMAGE_CHUNK_BYTES;
    const sizes: Record<string, number> = {
      'empty.jpg': 0,
      'one.jpg': 1,
      'exact.jpg': chunk,
      'over.jpg': chunk + 1,
      'triple.jpg': chunk * 2 + 5,
    };
    for (const [name, size] of Object.entries(sizes)) {
      putImage(name, makeBytes(size, size));
    }
    const entries = [entry('1', Object.keys(sizes))];

    const lines = linesOf(await exportToCache(entries)).slice(1, -1);

    const chunksByImage = new Map<string, { data: string; last?: true }[]>();
    for (const line of lines) {
      expect(line.length).toBeLessThan(70 * 1024);
      const parsed = JSON.parse(line) as { image: string; data: string; last?: true };
      chunksByImage.set(parsed.image, [...(chunksByImage.get(parsed.image) ?? []), parsed]);
    }
    expect([...chunksByImage.keys()]).toEqual(Object.keys(sizes));
    for (const [name, size] of Object.entries(sizes)) {
      const chunks = chunksByImage.get(name) ?? [];
      expect(chunks).toHaveLength(Math.max(1, Math.ceil(size / chunk)));
      expect(chunks.map((c) => c.last === true)).toEqual(
        chunks.map((_, i) => i === chunks.length - 1),
      );
      const joined = Buffer.concat(chunks.map((c) => Buffer.from(c.data, 'base64')));
      expect(new Uint8Array(joined)).toEqual(makeBytes(size, size));
    }
  });

  it('keeps multi-byte text and newlines in entries on a single header line (マルチバイト文字)', async () => {
    putImage('a.jpg', makeBytes(10));
    const text = '日本語🎉\n二行目 終わり';

    const lines = linesOf(await exportToCache([entry('1', ['a.jpg'], text)]));

    expect(JSON.parse(lines[0]).entries[0].text).toBe(text);
  });

  it('falls back to the legacy array JSON on web, where images are not supported (Web)', async () => {
    setPlatform('web');
    putImage('a.jpg', makeBytes(10));
    const entries = [entry('1', ['a.jpg'])];

    const written = await exportToCache(entries);

    expect(JSON.parse(new TextDecoder().decode(written))).toEqual(entries);
  });

  it('closes the handles and throws when an image cannot be read to the end (異常系: 読み込み失敗)', async () => {
    putImage('a.jpg', makeBytes(10));
    const { File } = fs;
    const source = new File(`${IMAGES_DIR}/a.jpg`);
    jest
      .spyOn(Object.getPrototypeOf(source.open()), 'readBytes')
      .mockReturnValue(new Uint8Array(1));
    fs.__openedHandles.open = 0;

    await expect(exportToCache([entry('1', ['a.jpg'])])).rejects.toThrow();
  });
});

describe('readDiaryBackupForImport / restoreImages', () => {
  async function exportAndPick(entries: DiaryEntry[]) {
    fs.__files.set(PICKED_URI, await exportToCache(entries));
  }

  it('restores every image byte-for-byte from an exported backup (正常系: ラウンドトリップ)', async () => {
    const chunk = DIARY_BACKUP_IMAGE_CHUNK_BYTES;
    const photos: Record<string, Uint8Array> = {
      'a.jpg': makeBytes(1000, 3),
      'big.png': makeBytes(chunk * 2 + 17, 5),
      'empty.jpg': new Uint8Array(0),
    };
    for (const [name, bytes] of Object.entries(photos)) putImage(name, bytes);
    const entries = [entry('1', Object.keys(photos), '日本語🎉\n本文')];
    await exportToCacheFromScratch(entries, photos);

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(backup.validEntries).toEqual(entries);
    expect(backup.imageFileNames).toEqual(Object.keys(photos));
    expect(await backup.restoreImages()).toBe(0);
    for (const [name, bytes] of Object.entries(photos)) {
      expect(fs.__files.get(`${IMAGES_DIR}/${name}`)).toEqual(bytes);
    }
    expect([...fs.__files.keys()].some((uri) => uri.endsWith('.partial'))).toBe(false);
  });

  // 取り込み先の端末を想定し、画像が無い状態でバックアップを選択した状態を作る
  async function exportToCacheFromScratch(
    entries: DiaryEntry[],
    photos: Record<string, Uint8Array>,
  ) {
    fs.__files.clear();
    for (const [name, bytes] of Object.entries(photos)) putImage(name, bytes);
    const exported = await exportToCache(entries);
    fs.__files.clear();
    fs.__files.set(PICKED_URI, exported);
  }

  it('reads the legacy pretty-printed array as a whole and restores nothing (後方互換: 旧形式)', async () => {
    const entries = [entry('1', [])];
    fs.__files.set(PICKED_URI, utf8(JSON.stringify(entries, null, 2)));

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(backup.validEntries).toEqual(entries);
    expect(backup.imageFileNames).toEqual([]);
    expect(await backup.restoreImages()).toBe(0);
  });

  it('reads a legacy single-line array without a fallback (後方互換: 1行の配列)', async () => {
    const entries = [entry('1', [])];
    fs.__files.set(PICKED_URI, utf8(JSON.stringify(entries)));

    expect((await readDiaryBackupForImport(pickedAsset() as never)).validEntries).toEqual(entries);
  });

  it('rejects a file that is neither format (異常系)', async () => {
    fs.__files.set(PICKED_URI, utf8('not json'));

    await expect(readDiaryBackupForImport(pickedAsset() as never)).rejects.toThrow();
  });

  it('keeps an existing image with the same name and counts it as restored (既存ファイルのスキップ)', async () => {
    const photo = makeBytes(100);
    putImage('a.jpg', photo);
    putImage('b.jpg', makeBytes(50));
    const entries = [entry('1', ['a.jpg', 'b.jpg'])];
    await exportAndPick(entries);
    putImage('a.jpg', utf8('existing'));
    fs.__files.delete(`${IMAGES_DIR}/b.jpg`);

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(await backup.restoreImages()).toBe(0);
    expect(fs.__files.get(`${IMAGES_DIR}/a.jpg`)).toEqual(utf8('existing'));
    expect(fs.__files.get(`${IMAGES_DIR}/b.jpg`)).toEqual(makeBytes(50));
  });

  function buildBackup(entries: DiaryEntry[], names: string[], lines: unknown[]): Uint8Array {
    const header = JSON.stringify({ format: 'diary-backup', version: 2, entries, images: names });
    return utf8(
      [header, ...lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))), ''].join('\n'),
    );
  }

  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

  it('ignores image lines that no imported entry references (異常系: 未参照の画像)', async () => {
    const entries = [entry('1', ['a.jpg'])];
    fs.__files.set(
      PICKED_URI,
      buildBackup(
        entries,
        ['a.jpg', 'unused.jpg'],
        [
          { image: 'unused.jpg', data: b64(makeBytes(3)), last: true },
          { image: 'a.jpg', data: b64(makeBytes(3)), last: true },
        ],
      ),
    );

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(backup.imageFileNames).toEqual(['a.jpg']);
    expect(await backup.restoreImages()).toBe(0);
    expect(fs.__files.has(`${IMAGES_DIR}/unused.jpg`)).toBe(false);
    expect(fs.__files.has(`${IMAGES_DIR}/a.jpg`)).toBe(true);
  });

  it('never writes outside the image directory for path-like names (異常系: パストラバーサル)', async () => {
    const entries = [entry('1', ['a.jpg'])];
    fs.__files.set(
      PICKED_URI,
      buildBackup(
        entries,
        ['a.jpg', '../evil.jpg'],
        [
          { image: '../evil.jpg', data: b64(makeBytes(3)), last: true },
          { image: 'sub/evil.jpg', data: b64(makeBytes(3)), last: true },
        ],
      ),
    );

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(await backup.restoreImages()).toBe(1);
    expect([...fs.__files.keys()].filter((uri) => uri.includes('evil'))).toEqual([]);
  });

  it('counts an image with an invalid line as failed, removes its temp file and still restores the others (異常系: 不正行・不正Base64)', async () => {
    const entries = [entry('1', ['bad.jpg', 'good.jpg', 'junk.jpg'])];
    fs.__files.set(
      PICKED_URI,
      buildBackup(
        entries,
        ['bad.jpg', 'good.jpg', 'junk.jpg'],
        [
          { image: 'bad.jpg', data: b64(makeBytes(3)) },
          { image: 'bad.jpg', data: 'not base64!', last: true },
          '',
          { image: 'good.jpg', data: b64(makeBytes(4)), last: true },
          { image: 'junk.jpg', data: b64(makeBytes(3)) },
          'this line is not json',
          { image: 'junk.jpg', data: b64(makeBytes(3)), last: true },
        ],
      ),
    );

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(await backup.restoreImages()).toBe(2);
    expect(fs.__files.has(`${IMAGES_DIR}/bad.jpg`)).toBe(false);
    expect(fs.__files.has(`${IMAGES_DIR}/junk.jpg`)).toBe(false);
    expect(fs.__files.get(`${IMAGES_DIR}/good.jpg`)).toEqual(makeBytes(4));
    expect([...fs.__files.keys()].some((uri) => uri.endsWith('.partial'))).toBe(false);
  });

  it('treats an image whose final chunk is missing as failed (異常系: 途中で切れたファイル)', async () => {
    const entries = [entry('1', ['a.jpg', 'b.jpg'])];
    fs.__files.set(
      PICKED_URI,
      buildBackup(
        entries,
        ['a.jpg', 'b.jpg'],
        [
          { image: 'a.jpg', data: b64(makeBytes(3)) },
          { image: 'b.jpg', data: b64(makeBytes(3)) },
        ],
      ),
    );

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(await backup.restoreImages()).toBe(2);
    expect([...fs.__files.keys()].filter((uri) => uri.startsWith(IMAGES_DIR))).toEqual([]);
  });

  it('removes the temp file when writing fails midway and counts the image as failed (異常系: 書き込み失敗)', async () => {
    const entries = [entry('1', ['a.jpg'])];
    fs.__files.set(
      PICKED_URI,
      buildBackup(
        entries,
        ['a.jpg'],
        [
          { image: 'a.jpg', data: b64(makeBytes(3)) },
          { image: 'a.jpg', data: b64(makeBytes(3)), last: true },
        ],
      ),
    );
    const backup = await readDiaryBackupForImport(pickedAsset() as never);
    fs.__failWritesTo.add('a.jpg.partial');

    expect(await backup.restoreImages()).toBe(1);
    expect([...fs.__files.keys()].filter((uri) => uri.startsWith(IMAGES_DIR))).toEqual([]);
  });

  it('copes with lines and multi-byte characters that straddle read blocks (境界値: ブロックをまたぐ行)', async () => {
    const text = '日本語🎉'.repeat(10);
    const entries = Array.from({ length: 3000 }, (_, i) =>
      entry(String(i), i === 0 ? ['a.jpg'] : [], text),
    );
    putImage('a.jpg', makeBytes(150000));
    await exportAndPick(entries);
    fs.__files.delete(`${IMAGES_DIR}/a.jpg`);

    const backup = await readDiaryBackupForImport(pickedAsset() as never);

    expect(backup.validEntries).toEqual(entries);
    expect(await backup.restoreImages()).toBe(0);
    expect(fs.__files.get(`${IMAGES_DIR}/a.jpg`)).toEqual(makeBytes(150000));
  });

  describe('Web', () => {
    beforeEach(() => setPlatform('web'));

    it('reads only the first line of a v2 backup and restores nothing (Web: 画像なし)', async () => {
      const entries = [entry('1', ['a.jpg'])];
      const content = buildBackup(
        entries,
        ['a.jpg'],
        [{ image: 'a.jpg', data: b64(makeBytes(3)), last: true }],
      );
      const file = new Blob([content as unknown as BlobPart]);

      const backup = await readDiaryBackupForImport(pickedAsset({ file }) as never);

      expect(backup.validEntries).toEqual(entries);
      expect(await backup.restoreImages()).toBe(0);
      expect(fs.__files.size).toBe(0);
    });

    it('widens the read window until the first line is complete (Web: 先頭行が大きい場合)', async () => {
      const many = Array.from({ length: 4000 }, (_, i) => entry(String(i), [], 'あ'.repeat(40)));
      const content = buildBackup(many, [], []);
      expect(content.length).toBeGreaterThan(256 * 1024);

      const backup = await readDiaryBackupForImport(
        pickedAsset({ file: new Blob([content as unknown as BlobPart]) }) as never,
      );

      expect(backup.validEntries).toHaveLength(4000);
    });

    it('reads a legacy pretty-printed array through the whole-file fallback (Web: 旧形式)', async () => {
      const entries = [entry('1', [])];
      const file = new Blob([JSON.stringify(entries, null, 2)]);

      const backup = await readDiaryBackupForImport(pickedAsset({ file }) as never);

      expect(backup.validEntries).toEqual(entries);
    });
  });
});
