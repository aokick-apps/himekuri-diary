import { SAVE_SUCCESS_MESSAGE } from '@/constants/diary-messages';

describe('SAVE_SUCCESS_MESSAGE (日記保存成功時の共通トースト文言)', () => {
  it('is a non-empty string (正常系)', () => {
    expect(typeof SAVE_SUCCESS_MESSAGE).toBe('string');
    expect(SAVE_SUCCESS_MESSAGE.length).toBeGreaterThan(0);
  });

  it('has no leading/trailing whitespace that would make the toast look misaligned (境界値)', () => {
    expect(SAVE_SUCCESS_MESSAGE).toBe(SAVE_SUCCESS_MESSAGE.trim());
  });

  it('keeps the exact wording expected across every save flow that shares this constant (正常系: ホーム・日別一覧・編集画面での文言統一)', () => {
    expect(SAVE_SUCCESS_MESSAGE).toBe('保存しました');
  });
});
