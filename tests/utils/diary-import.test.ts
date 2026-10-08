import type { DiaryEntry } from '@/utils/diary-storage';
import { BODY_MAX_LENGTH } from '@/utils/diary-text';
import { DIARY_BACKUP_FORMAT, DIARY_BACKUP_VERSION } from '@/utils/diary-export';
import { parseDiaryEntriesForImport } from '@/utils/diary-import';

describe('parseDiaryEntriesForImport', () => {
  it('parses a JSON array of valid diary entries (正常系)', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: '今日はいい天気でした。', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', text: '公園を散歩しました。', createdAt: '2026-01-02T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, images: new Map() });
  });

  it('parses an empty array without error (境界値: 0件)', () => {
    expect(parseDiaryEntriesForImport('[]')).toEqual({
      validEntries: [],
      invalidCount: 0,
      images: new Map(),
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

    expect(result).toEqual({ validEntries: [valid], invalidCount: 4, images: new Map() });
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

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, images: new Map() });
  });

  it('accepts an entry whose text length is exactly BODY_MAX_LENGTH (境界値: ちょうど上限)', () => {
    const entries: DiaryEntry[] = [
      { id: '1', text: 'あ'.repeat(BODY_MAX_LENGTH), createdAt: '2026-05-01T00:00:00.000Z' },
    ];

    const result = parseDiaryEntriesForImport(JSON.stringify(entries));

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, images: new Map() });
  });

  it('rejects an entry whose text length exceeds BODY_MAX_LENGTH by one grapheme (境界値: 上限+1)', () => {
    const overLimitEntry: DiaryEntry = {
      id: '1',
      text: 'あ'.repeat(BODY_MAX_LENGTH + 1),
      createdAt: '2026-05-01T00:00:00.000Z',
    };

    const result = parseDiaryEntriesForImport(JSON.stringify([overLimitEntry]));

    expect(result).toEqual({ validEntries: [], invalidCount: 1, images: new Map() });
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

    expect(result).toEqual({ validEntries: [valid], invalidCount: 2, images: new Map() });
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

    expect(result).toEqual({ validEntries: entries, invalidCount: 0, images: new Map() });
  });
});

describe('parseDiaryEntriesForImport (添付画像を含むバックアップ)', () => {
  const entry: DiaryEntry = {
    id: '1',
    text: '写真つき',
    createdAt: '2026-04-01T00:00:00.000Z',
    images: [{ fileName: 'a.jpg' }],
  };
  const backup = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: DIARY_BACKUP_FORMAT,
      version: DIARY_BACKUP_VERSION,
      entries: [entry],
      images: { 'a.jpg': 'QUJD' },
      ...overrides,
    });

  it('reads entries and image data from the object format (正常系)', () => {
    expect(parseDiaryEntriesForImport(backup())).toEqual({
      validEntries: [entry],
      invalidCount: 0,
      images: new Map([['a.jpg', 'QUJD']]),
    });
  });

  it('still reads the legacy array format, which has no image data (後方互換)', () => {
    const result = parseDiaryEntriesForImport(JSON.stringify([entry]));

    expect(result.validEntries).toEqual([entry]);
    expect(result.images.size).toBe(0);
  });

  it('ignores image data that no imported entry references (境界値: 参照されない画像)', () => {
    const result = parseDiaryEntriesForImport(
      backup({ images: { 'a.jpg': 'QUJD', 'b.jpg': 'QUJD' } }),
    );

    expect([...result.images.keys()]).toEqual(['a.jpg']);
  });

  it('keeps the entry but drops image data that is not valid Base64 (異常系: 不正なBase64)', () => {
    for (const data of ['not base64!', 'QUJ', 123, null]) {
      const result = parseDiaryEntriesForImport(backup({ images: { 'a.jpg': data } }));

      expect(result.validEntries).toEqual([entry]);
      expect(result.images.size).toBe(0);
    }
  });

  it('rejects entries whose image file name could escape the image directory (異常系: パストラバーサル)', () => {
    const names = ['../evil.jpg', 'dir/evil.jpg', 'dir\\evil.jpg', '..', '.', ''];
    for (const fileName of names) {
      const evil = { ...entry, images: [{ fileName }] };
      const result = parseDiaryEntriesForImport(
        backup({ entries: [evil], images: { [fileName]: 'QUJD' } }),
      );

      expect(result.validEntries).toEqual([]);
      expect(result.invalidCount).toBe(1);
      expect(result.images.size).toBe(0);
    }
  });

  it('does not pick up inherited properties such as __proto__ as image data (異常系: プロトタイプ汚染)', () => {
    const protoEntry = { ...entry, images: [{ fileName: '__proto__' }] };
    const result = parseDiaryEntriesForImport(
      backup({ entries: [protoEntry], images: JSON.parse('{}') }),
    );

    expect(result.images.size).toBe(0);
  });

  it('treats a missing or malformed images field as having no image data (境界値)', () => {
    for (const images of [undefined, null, [], 'x']) {
      expect(parseDiaryEntriesForImport(backup({ images })).images.size).toBe(0);
    }
  });

  it('throws for an unknown version or an object that is not a backup (異常系: 未対応の形式)', () => {
    expect(() => parseDiaryEntriesForImport(backup({ version: 99 }))).toThrow();
    expect(() => parseDiaryEntriesForImport(JSON.stringify({ entries: [entry] }))).toThrow();
    expect(() => parseDiaryEntriesForImport(backup({ entries: 'x' }))).toThrow();
  });
});
