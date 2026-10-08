import type { DiaryEntry } from '@/utils/diary-storage';
import { BODY_MAX_LENGTH } from '@/utils/diary-text';
import { DIARY_BACKUP_FORMAT, DIARY_BACKUP_VERSION } from '@/utils/diary-export';
import { parseDiaryBackupImageLine, parseDiaryEntriesForImport } from '@/utils/diary-import';

describe('parseDiaryEntriesForImport', () => {
  it('parses a JSON array of valid diary entries (正常系)', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: '今日はいい天気でした。', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', text: '公園を散歩しました。', createdAt: '2026-01-02T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, imageFileNames: [] });
  });

  it('parses an empty array without error (境界値: 0件)', () => {
    expect(parseDiaryEntriesForImport('[]')).toEqual({
      validEntries: [],
      invalidCount: 0,
      imageFileNames: [],
    });
  });

  it('skips elements that do not match the DiaryEntry shape while keeping the valid ones (異常系: 一部エントリのスキーマ不整合)', () => {
    const valid: DiaryEntry = {
      id: '1',
      text: '今日はいい天気でした。',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const mixed = [
      valid,
      { id: '2', text: '欠損データ' }, // createdAtが欠けている
      { id: 3, text: '型違い', createdAt: '2026-01-03T00:00:00.000Z' }, // idが数値
      null,
      'not-an-object',
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(mixed));

    expect(result).toEqual({ validEntries: [valid], invalidCount: 4, imageFileNames: [] });
  });

  it('throws when the JSON content itself is invalid (異常系: パース失敗)', () => {
    expect(() => parseDiaryEntriesForImport('not-valid-json{{{')).toThrow();
  });

  it('throws when the top-level value is not an array (異常系: 配列でない)', () => {
    expect(() => parseDiaryEntriesForImport(JSON.stringify({ id: '1' }))).toThrow(
      '形式が正しくありません',
    );
  });

  it('throws for primitive top-level JSON values such as numbers or strings (境界値)', () => {
    expect(() => parseDiaryEntriesForImport('123')).toThrow();
    expect(() => parseDiaryEntriesForImport('"just a string"')).toThrow();
  });

  it('round-trips entries containing emoji/multi-byte text without data loss', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: '🎉絵文字も含むテキスト🍣', createdAt: '2026-04-01T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result.validEntries).toEqual(entries);
  });

  it('accepts an entry whose text length is within BODY_MAX_LENGTH (正常系)', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: '本文'.repeat(10), createdAt: '2026-05-01T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, imageFileNames: [] });
  });

  it('accepts an entry whose text length is exactly BODY_MAX_LENGTH (境界値: ちょうど上限)', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: 'あ'.repeat(BODY_MAX_LENGTH), createdAt: '2026-05-01T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, imageFileNames: [] });
  });

  it('rejects an entry whose text length exceeds BODY_MAX_LENGTH by one grapheme (境界値: 上限+1)', () => {
    const overLimitEntry: DiaryEntry = {
      id: '1',
      text: 'あ'.repeat(BODY_MAX_LENGTH + 1),
      createdAt: '2026-05-01T00:00:00.000Z',
    };

    const result = parseDiaryEntriesForImport(JSON.stringify([overLimitEntry]));

    expect(result).toEqual({ validEntries: [], invalidCount: 1, imageFileNames: [] });
  });

  it('counts both text-length violations and schema violations together in invalidCount, keeping only the truly valid entries (異常系: 文字数超過と型不正の混在)', () => {
    const valid: DiaryEntry = {
      id: '1',
      text: '有効なエントリ',
      createdAt: '2026-05-01T00:00:00.000Z',
    };
    const overLimit: DiaryEntry = {
      id: '2',
      text: 'あ'.repeat(BODY_MAX_LENGTH + 1),
      createdAt: '2026-05-02T00:00:00.000Z',
    };
    const schemaInvalid = { id: '3', text: '欠損データ' }; // createdAtが欠けている
    const mixed = [valid, overLimit, schemaInvalid];

    const result = parseDiaryEntriesForImport(JSON.stringify(mixed));

    expect(result).toEqual({ validEntries: [valid], invalidCount: 2, imageFileNames: [] });
  });

  it('counts BODY_MAX_LENGTH based on grapheme units, accepting a ZWJ-joined family emoji as a single character (境界値: grapheme単位の判定)', () => {
    const familyEmoji = '👨‍👩‍👧‍👦';
    // UTF-16コードユニット単位では11文字分だが、grapheme単位ではBODY_MAX_LENGTHちょうどになるよう構成する
    const entries: DiaryEntry[] = [
      {
        id: '1',
        text: `${'あ'.repeat(BODY_MAX_LENGTH - 1)}${familyEmoji}`,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, imageFileNames: [] });
  });
});

describe('parseDiaryEntriesForImport (画像入りバックアップの1行目)', () => {
  const entry: DiaryEntry = {
    id: '1',
    text: '写真つき',
    createdAt: '2026-04-01T00:00:00.000Z',
    images: [{ fileName: 'a.jpg' }],
  };
  const header = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: DIARY_BACKUP_FORMAT,
      version: DIARY_BACKUP_VERSION,
      entries: [entry],
      images: ['a.jpg'],
      ...overrides,
    });

  it('reads entries and the image file names (正常系)', () => {
    expect(parseDiaryEntriesForImport(header())).toEqual({
      validEntries: [entry],
      invalidCount: 0,
      imageFileNames: ['a.jpg'],
    });
  });

  it('reads multi-byte text and line separators inside entries as they are (マルチバイト文字)', () => {
    const text = '日本語🎉\n二行目\u2028終わり';
    const result = parseDiaryEntriesForImport(header({ entries: [{ ...entry, text }] }));

    expect(result.validEntries[0].text).toBe(text);
  });

  it('still reads the legacy array format, which has no image names (後方互換)', () => {
    const result = parseDiaryEntriesForImport(JSON.stringify([entry]));

    expect(result.validEntries).toEqual([entry]);
    expect(result.imageFileNames).toEqual([]);
  });

  it('ignores listed images that no imported entry references (境界値: 参照されない画像)', () => {
    const result = parseDiaryEntriesForImport(header({ images: ['a.jpg', 'b.jpg'] }));

    expect(result.imageFileNames).toEqual(['a.jpg']);
  });

  it('rejects entries whose image file name could escape the image directory (異常系: パストラバーサル)', () => {
    for (const fileName of ['../evil.jpg', 'dir/evil.jpg', 'dir\\evil.jpg', '..', '.', '']) {
      const evil = { ...entry, images: [{ fileName }] };
      const result = parseDiaryEntriesForImport(header({ entries: [evil], images: [fileName] }));

      expect(result.validEntries).toEqual([]);
      expect(result.invalidCount).toBe(1);
      expect(result.imageFileNames).toEqual([]);
    }
  });

  it('treats a missing or malformed images field as having no images (境界値)', () => {
    for (const images of [undefined, null, {}, 'x', [1, null]]) {
      expect(parseDiaryEntriesForImport(header({ images })).imageFileNames).toEqual([]);
    }
  });

  it('throws for an unknown version or an object that is not a backup (異常系: 未対応の形式)', () => {
    expect(() => parseDiaryEntriesForImport(header({ version: 99 }))).toThrow();
    expect(() => parseDiaryEntriesForImport(JSON.stringify({ entries: [entry] }))).toThrow();
    expect(() => parseDiaryEntriesForImport(header({ entries: 'x' }))).toThrow();
  });
});

describe('parseDiaryBackupImageLine', () => {
  it('reads a valid chunk line (正常系)', () => {
    expect(parseDiaryBackupImageLine('{"image":"a.jpg","data":"QUJD"}')).toEqual({
      fileName: 'a.jpg',
      data: 'QUJD',
      isLast: false,
    });
    expect(parseDiaryBackupImageLine('{"image":"a.jpg","data":"","last":true}')).toEqual({
      fileName: 'a.jpg',
      data: '',
      isLast: true,
    });
  });

  it('returns null for broken lines, invalid Base64 and path-like file names (異常系)', () => {
    const lines = [
      'not json',
      'null',
      '[]',
      '{"image":"a.jpg"}',
      '{"image":1,"data":"QUJD"}',
      '{"image":"a.jpg","data":123}',
      '{"image":"a.jpg","data":"QUJ"}',
      '{"image":"a.jpg","data":"QU!D"}',
      '{"image":"a.jpg","data":"QUJD=="}',
      '{"image":"../a.jpg","data":"QUJD"}',
      '{"image":"d/a.jpg","data":"QUJD"}',
      '{"image":"d\\\\a.jpg","data":"QUJD"}',
      '{"image":"..","data":"QUJD"}',
      '{"image":"","data":"QUJD"}',
    ];
    for (const line of lines) {
      expect(parseDiaryBackupImageLine(line)).toBeNull();
    }
  });
});
