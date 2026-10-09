import { decodeBase64, encodeBase64, isValidBase64 } from '@/utils/base64';

describe('base64', () => {
  const samples = [[], [0], [0, 255], [1, 2, 3], [255, 254, 253, 252], [0, 0, 0, 0, 0]];

  it('matches Node Buffer for every padding length (正常系: 0〜2バイトの端数)', () => {
    for (const sample of samples) {
      const bytes = Uint8Array.from(sample);
      const expected = Buffer.from(bytes).toString('base64');

      expect(encodeBase64(bytes)).toBe(expected);
      expect(Array.from(decodeBase64(expected))).toEqual(sample);
    }
  });

  it('round-trips a large binary buffer (境界値: 大きなデータ)', () => {
    const bytes = new Uint8Array(48 * 1024 + 1).map((_, i) => (i * 31) % 256);

    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it('rejects malformed Base64 (異常系)', () => {
    for (const value of ['QUJ', 'QU!D', 'QUJD=', '=QUJ', 'QU=D', 'あいうえ']) {
      expect(isValidBase64(value)).toBe(false);
      expect(() => decodeBase64(value)).toThrow();
    }
    expect(isValidBase64('')).toBe(true);
  });
});
