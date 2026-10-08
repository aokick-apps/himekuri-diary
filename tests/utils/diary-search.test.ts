import {
  getSearchExcerpt,
  hiraganaToKatakana,
  matchesSearchQuery,
  normalizeForSearch,
} from '@/utils/diary-search';

describe('hiraganaToKatakana', () => {
  it('converts every hiragana character to the corresponding katakana (正常系)', () => {
    expect(hiraganaToKatakana('にっき')).toBe('ニッキ');
  });

  it('leaves katakana, kanji, ASCII and emoji untouched (正常系: ひらがな以外)', () => {
    expect(hiraganaToKatakana('カタカナ漢字abc😀')).toBe('カタカナ漢字abc😀');
  });

  it('converts both ends of the hiragana range (U+3041 / U+3096) (境界値)', () => {
    expect(hiraganaToKatakana('ぁゖ')).toBe('ァヶ');
  });

  it('does not convert characters just outside the hiragana range (U+3040 / U+3097) (境界値)', () => {
    expect(hiraganaToKatakana('぀゗')).toBe('぀゗');
  });

  it('returns an empty string as-is (境界値: 空文字列)', () => {
    expect(hiraganaToKatakana('')).toBe('');
  });
});

describe('normalizeForSearch', () => {
  it('unifies full-width/half-width forms and hiragana/katakana into the same normalized text (正常系)', () => {
    expect(normalizeForSearch('ＡＢＣ').normalized).toBe('ABC');
    expect(normalizeForSearch('ｶﾀｶﾅ').normalized).toBe('カタカナ');
    expect(normalizeForSearch('かたかな').normalized).toBe('カタカナ');
  });

  it('maps each normalized position back to its range in the original text (正常系: 位置マップ)', () => {
    const { normalized, startMap, endMap } = normalizeForSearch('aｱb');

    expect(normalized).toBe('aアb');
    expect(startMap).toEqual([0, 1, 2]);
    expect(endMap).toEqual([1, 2, 3]);
  });

  it('keeps the position maps aligned with UTF-16 code units for surrogate pair characters (境界値: サロゲートペア)', () => {
    const { normalized, startMap, endMap } = normalizeForSearch('a😀b');

    expect(normalized).toBe('a😀b');
    expect(startMap).toHaveLength(normalized.length);
    expect(endMap).toHaveLength(normalized.length);
    expect(startMap).toEqual([0, 1, 1, 3]);
    expect(endMap).toEqual([1, 3, 3, 4]);
  });

  it('maps every expanded character back to the single original character when NFKC expands it (境界値: 1文字→複数文字)', () => {
    // 「㍿」はNFKCで「株式会社」の4文字に展開される
    const { normalized, startMap, endMap } = normalizeForSearch('㍿');

    expect(normalized).toBe('株式会社');
    expect(startMap).toEqual([0, 0, 0, 0]);
    expect(endMap).toEqual([1, 1, 1, 1]);
  });

  it('returns empty results for an empty string (境界値: 空文字列)', () => {
    expect(normalizeForSearch('')).toEqual({ normalized: '', startMap: [], endMap: [] });
  });
});

describe('matchesSearchQuery', () => {
  it('matches a partial substring regardless of case (正常系)', () => {
    expect(matchesSearchQuery('Today I went to the Park', 'park')).toBe(true);
  });

  it('matches regardless of full-width/half-width and hiragana/katakana differences (正常系: 表記ゆれ)', () => {
    expect(matchesSearchQuery('カフェでコーヒーを飲んだ', 'かふぇ')).toBe(true);
    expect(matchesSearchQuery('ｺｰﾋｰ', 'コーヒー')).toBe(true);
    expect(matchesSearchQuery('ＡＰＰＬＥ', 'apple')).toBe(true);
  });

  it('returns false when the text does not contain the query (異常系: 不一致)', () => {
    expect(matchesSearchQuery('散歩した', '映画')).toBe(false);
  });

  it('returns false for an empty text with a non-empty query (境界値: 空の本文)', () => {
    expect(matchesSearchQuery('', 'a')).toBe(false);
  });
});

describe('getSearchExcerpt', () => {
  it('splits the text into prefix/match/suffix around the first match (正常系)', () => {
    expect(getSearchExcerpt('朝に散歩した', '散歩')).toEqual({
      prefix: '朝に',
      match: '散歩',
      suffix: 'した',
    });
  });

  it('highlights the original characters even when the query matches via normalization (正常系: 表記ゆれ)', () => {
    expect(getSearchExcerpt('今日はｶﾌｪに行った', 'かふぇ')).toEqual({
      prefix: '今日は',
      match: 'ｶﾌｪ',
      suffix: 'に行った',
    });
  });

  it('collapses line breaks in both text and query into spaces (正常系: 改行)', () => {
    expect(getSearchExcerpt('一行目\n\n二行目', '目\n二')).toEqual({
      prefix: '一行',
      match: '目 二',
      suffix: '行目',
    });
  });

  it('keeps exactly 20 characters of context on both sides without ellipses (境界値: ちょうど20文字)', () => {
    const before = 'あ'.repeat(20);
    const after = 'い'.repeat(20);

    expect(getSearchExcerpt(`${before}X${after}`, 'X')).toEqual({
      prefix: before,
      match: 'X',
      suffix: after,
    });
  });

  it('trims the context to 20 characters and adds ellipses when longer (境界値: 21文字)', () => {
    const before = 'あ'.repeat(21);
    const after = 'い'.repeat(21);

    expect(getSearchExcerpt(`${before}X${after}`, 'X')).toEqual({
      prefix: `…${'あ'.repeat(20)}`,
      match: 'X',
      suffix: `${'い'.repeat(20)}…`,
    });
  });

  it('falls back to the leading text without a highlight when nothing matches (異常系: 不一致)', () => {
    expect(getSearchExcerpt('  短い日記  ', '存在しない')).toEqual({
      prefix: '短い日記',
      match: '',
      suffix: '',
    });
  });

  it('truncates the fallback excerpt by grapheme so emoji are not split (境界値: フォールバックの切り詰め)', () => {
    const text = `${'👍'.repeat(21)}`;

    expect(getSearchExcerpt(text, '存在しない')).toEqual({
      prefix: `${'👍'.repeat(20)}…`,
      match: '',
      suffix: '',
    });
  });
});
