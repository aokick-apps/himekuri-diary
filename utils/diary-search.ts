import { splitIntoGraphemes } from '@/utils/diary-text';

// getSearchExcerptで通常マッチしないフォールバック時に使う抜粋の最大文字数(超える場合は省略記号を付ける)
const FALLBACK_EXCERPT_MAX_LENGTH = 20;

// 検索結果の抜粋で、マッチ箇所の前後何文字を表示するか
const SEARCH_EXCERPT_CONTEXT_LENGTH = 20;

// ひらがな(U+3041〜U+3096)とカタカナ(U+30A1〜U+30F6)のコードポイント差。
// 半角カタカナはNFKC正規化で全角カタカナに統一されるため、ひらがなをカタカナ側に寄せて表記ゆれを吸収する
const HIRAGANA_TO_KATAKANA_CODE_POINT_OFFSET = 0x60;

// 文字列中のひらがなをすべてカタカナへ変換する。ひらがな以外の文字はそのまま返す
export function hiraganaToKatakana(text: string): string {
  let result = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0x3041 && codePoint <= 0x3096) {
      result += String.fromCodePoint(codePoint + HIRAGANA_TO_KATAKANA_CODE_POINT_OFFSET);
    } else {
      result += char;
    }
  }
  return result;
}

// 検索比較用に正規化した文字列と、その各文字が元の文字列上のどの範囲([start, end))に対応するかを示すマップ
export type NormalizedForSearch = {
  normalized: string;
  startMap: number[];
  endMap: number[];
};

// 検索クエリ・日記本文の比較前の正規化(NFKCで全角/半角の表記ゆれ、ひらがな→カタカナ変換で
// ひらがな/カタカナの表記ゆれを吸収する。大文字/小文字は呼び出し元でtoLowerCase()済み)。
// 抜粋表示(getSearchExcerpt)で正規化後の位置を元の文字列上の位置に復元できるよう、
// 1文字ずつ正規化しながら元の文字列上の範囲(startMap/endMap)を記録する。
// 「ｶ」+「ﾞ」→「ガ」のように複数文字が正規化で1文字に減るケースは本実装では非対応
// (稀なエッジケースのため許容する)
export function normalizeForSearch(text: string): NormalizedForSearch {
  let normalized = '';
  const startMap: number[] = [];
  const endMap: number[] = [];
  let originalIndex = 0;
  for (const char of text) {
    const normalizedChar = hiraganaToKatakana(char.normalize('NFKC'));
    const charEnd = originalIndex + char.length;
    // サロゲートペア文字(c.length===2)を1文字=1pushで扱うと、normalizedと
    // startMap/endMapの長さがズレるため、UTF-16コード単位数分だけpushする
    for (const c of normalizedChar) {
      normalized += c;
      for (let i = 0; i < c.length; i++) {
        startMap.push(originalIndex);
        endMap.push(charEnd);
      }
    }
    originalIndex = charEnd;
  }
  return { normalized, startMap, endMap };
}

// 検索結果抜粋の構成要素(prefix/match/suffix)。呼び出し側はmatchのみハイライト表示する
export type SearchExcerpt = {
  prefix: string;
  match: string;
  suffix: string;
};

// 検索キーワードにマッチした日記本文から、マッチ箇所を中心とした抜粋を作る
// (改行は見づらいので空白に置換し、前後を切り詰めた場合は省略記号を付ける)。
// マッチ箇所の抜粋はgrapheme単位までは厳密にせず、多少のズレは許容する単純な文字列操作で行う
export function getSearchExcerpt(text: string, query: string): SearchExcerpt {
  const normalizedText = text.replace(/\n+/g, ' ');
  // クエリ側にも本文と同じ改行畳み込みを適用し、entries.filter側の一致判定とズレないようにする
  const normalizedQuery = query.replace(/\n+/g, ' ');
  const {
    normalized: lowerText,
    startMap,
    endMap,
  } = normalizeForSearch(normalizedText.toLowerCase());
  const lowerQuery = normalizeForSearch(normalizedQuery.toLowerCase()).normalized;
  const matchIndex = lowerText.indexOf(lowerQuery);

  // 呼び出し元は常に非空のtrimmedSearchQueryを渡し、NFKC正規化は非空文字列を空文字列に
  // しないため、lowerQueryが空になることは無い。本文・クエリ双方を同じ規則で折り畳んで
  // いるため、matchIndex===-1もentries.filterを通過したエントリでは実質的に到達しない、
  // 念のためのフォールバック(ハイライト対象なしのためmatchは空文字列)。
  // 本文の最初の行を、書記素クラスタ単位で切り詰めて抜粋として使う
  // (絵文字等が途中で分断されないようにする配慮のためsliceではなくsplitIntoGraphemesを使う)
  if (matchIndex === -1) {
    const trimmedText = normalizedText.trim();
    const graphemes = splitIntoGraphemes(trimmedText);
    const fallbackExcerpt =
      graphemes.length <= FALLBACK_EXCERPT_MAX_LENGTH
        ? trimmedText
        : `${graphemes.slice(0, FALLBACK_EXCERPT_MAX_LENGTH).join('')}…`;
    return { prefix: fallbackExcerpt, match: '', suffix: '' };
  }

  // 正規化後の位置(matchIndex)を、startMap/endMap経由で元の文字列上の範囲に変換する
  const matchStart = startMap[matchIndex] ?? 0;
  const matchEnd = endMap[matchIndex + lowerQuery.length - 1] ?? normalizedText.length;

  const start = Math.max(0, matchStart - SEARCH_EXCERPT_CONTEXT_LENGTH);
  const end = Math.min(normalizedText.length, matchEnd + SEARCH_EXCERPT_CONTEXT_LENGTH);
  const prefixEllipsis = start > 0 ? '…' : '';
  const suffixEllipsis = end < normalizedText.length ? '…' : '';
  return {
    prefix: prefixEllipsis + normalizedText.slice(start, matchStart),
    match: normalizedText.slice(matchStart, matchEnd),
    suffix: normalizedText.slice(matchEnd, end) + suffixEllipsis,
  };
}

// 本文が検索キーワードに部分一致するか(大文字小文字・全角半角・ひらがな/カタカナの表記ゆれを区別しない)。
// getSearchExcerptと同じ正規化規則で判定し、一覧に出した結果で抜粋のハイライトがズレないようにする
export function matchesSearchQuery(text: string, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query.toLowerCase()).normalized;
  return normalizeForSearch(text.toLowerCase()).normalized.includes(normalizedQuery);
}
