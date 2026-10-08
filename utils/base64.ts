// バイト列とBase64文字列の相互変換。大きなファイルを小さな断片に分けて扱うため、
// 文字列を介さずUint8Arrayを直接読み書きできる実装を外部依存なしで持つ。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_TABLE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i += 1) {
  DECODE_TABLE[ALPHABET.charCodeAt(i)] = i;
}

/** 3バイトごとに4文字へ変換する。端数がある場合のみ`=`で埋める */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const chunk = (b0 << 16) | (b1 << 8) | b2;
    parts.push(
      ALPHABET[(chunk >> 18) & 63] +
        ALPHABET[(chunk >> 12) & 63] +
        (i + 1 < bytes.length ? ALPHABET[(chunk >> 6) & 63] : '=') +
        (i + 2 < bytes.length ? ALPHABET[chunk & 63] : '='),
    );
  }
  return parts.join('');
}

/** 長さ・文字種・パディングがBase64として正しいか。空文字は0バイトとして妥当 */
export function isValidBase64(value: string): boolean {
  if (value.length % 4 !== 0) {
    return false;
  }
  // 巨大な文字列に正規表現を使うと再帰でスタックを使い切りうるため、1文字ずつ検証する
  const padStart = value.endsWith('==')
    ? value.length - 2
    : value.endsWith('=')
      ? value.length - 1
      : value.length;
  for (let i = 0; i < padStart; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 128 || DECODE_TABLE[code] < 0) {
      return false;
    }
  }
  return true;
}

/** 不正なBase64は例外にする(壊れたデータを黙って書き込まないため) */
export function decodeBase64(value: string): Uint8Array {
  if (!isValidBase64(value)) {
    throw new Error('Base64として正しくありません');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let out = 0;
  for (let i = 0; i < value.length; i += 4) {
    const c0 = DECODE_TABLE[value.charCodeAt(i)];
    const c1 = DECODE_TABLE[value.charCodeAt(i + 1)];
    const c2 = value[i + 2] === '=' ? 0 : DECODE_TABLE[value.charCodeAt(i + 2)];
    const c3 = value[i + 3] === '=' ? 0 : DECODE_TABLE[value.charCodeAt(i + 3)];
    const chunk = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (out < bytes.length) bytes[out++] = (chunk >> 16) & 255;
    if (out < bytes.length) bytes[out++] = (chunk >> 8) & 255;
    if (out < bytes.length) bytes[out++] = chunk & 255;
  }
  return bytes;
}
