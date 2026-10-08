import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { DiaryImageAttachmentField } from '@/components/diary-image-attachment-field';
import type { DiaryImageDraft } from '@/utils/diary-images';

jest.mock('@/utils/diary-images', () => ({
  isDiaryImageAttachmentSupported: jest.fn(() => true),
  pickDiaryImageAsync: jest.fn(),
  getDiaryImageDraftUri: (draft: { kind: string; uri?: string; image?: { fileName: string } }) =>
    draft.kind === 'stored' ? `file:///documents/diary-images/${draft.image?.fileName}` : draft.uri,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedDiaryImages = require('@/utils/diary-images') as {
  isDiaryImageAttachmentSupported: jest.Mock;
  pickDiaryImageAsync: jest.Mock;
};

const STORED: DiaryImageDraft = { kind: 'stored', image: { fileName: 'a.jpg' } };

describe('DiaryImageAttachmentField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDiaryImages.isDiaryImageAttachmentSupported.mockReturnValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('shows only the "写真を添付" button while nothing is attached (正常系: 未添付)', () => {
    render(<DiaryImageAttachmentField drafts={[]} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: '写真を添付' })).toBeTruthy();
    expect(screen.queryByLabelText('添付した写真')).toBeNull();
  });

  it('adds the picked photo as a new draft (正常系: 添付)', async () => {
    mockedDiaryImages.pickDiaryImageAsync.mockResolvedValue({
      status: 'picked',
      uri: 'file:///tmp/new.jpg',
    });
    const onChange = jest.fn();
    render(<DiaryImageAttachmentField drafts={[]} onChange={onChange} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '写真を添付' }));
    });

    expect(onChange).toHaveBeenCalledWith([{ kind: 'picked', uri: 'file:///tmp/new.jpg' }]);
  });

  it('hides the add button once the upper limit is reached, showing the thumbnail with replace/remove actions (境界値: 上限枚数)', () => {
    render(<DiaryImageAttachmentField drafts={[STORED]} onChange={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '写真を添付' })).toBeNull();
    expect(screen.getByLabelText('添付した写真').props.source).toEqual({
      uri: 'file:///documents/diary-images/a.jpg',
    });
    expect(screen.getByRole('button', { name: '添付した写真を差し替える' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '添付した写真を削除する' })).toBeTruthy();
  });

  it('replaces the attached photo in place (正常系: 差し替え)', async () => {
    mockedDiaryImages.pickDiaryImageAsync.mockResolvedValue({
      status: 'picked',
      uri: 'file:///tmp/replaced.jpg',
    });
    const onChange = jest.fn();
    render(<DiaryImageAttachmentField drafts={[STORED]} onChange={onChange} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '添付した写真を差し替える' }));
    });

    expect(onChange).toHaveBeenCalledWith([{ kind: 'picked', uri: 'file:///tmp/replaced.jpg' }]);
  });

  it('removes the attached photo (正常系: 削除)', () => {
    const onChange = jest.fn();
    render(<DiaryImageAttachmentField drafts={[STORED]} onChange={onChange} />);

    fireEvent.press(screen.getByRole('button', { name: '添付した写真を削除する' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does nothing when picking is canceled (境界値: キャンセル)', async () => {
    mockedDiaryImages.pickDiaryImageAsync.mockResolvedValue({ status: 'canceled' });
    const onChange = jest.fn();
    render(<DiaryImageAttachmentField drafts={[]} onChange={onChange} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '写真を添付' }));
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows an error message when the picker itself fails (異常系: 選択処理の失敗)', async () => {
    mockedDiaryImages.pickDiaryImageAsync.mockRejectedValue(new Error('native error'));
    render(<DiaryImageAttachmentField drafts={[]} onChange={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '写真を添付' }));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      '写真を選択できませんでした',
      'もう一度お試しください。',
    );
  });

  it('marks every action as disabled while saving (境界値: 保存中)', () => {
    render(<DiaryImageAttachmentField drafts={[STORED]} onChange={jest.fn()} disabled />);

    expect(
      screen.getByRole('button', { name: '添付した写真を削除する' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('renders nothing on platforms without file system support such as web (境界値: 非対応環境)', () => {
    mockedDiaryImages.isDiaryImageAttachmentSupported.mockReturnValue(false);
    render(<DiaryImageAttachmentField drafts={[]} onChange={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '写真を添付' })).toBeNull();
  });
});
