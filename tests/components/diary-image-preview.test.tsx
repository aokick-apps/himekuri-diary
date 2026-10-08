import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Image } from 'react-native';

import { DiaryImagePreview } from '@/components/diary-image-preview';

jest.mock('@/utils/diary-images', () => ({
  getDiaryImageFile: (image: { fileName: string }) => ({
    uri: `file:///documents/diary-images/${image.fileName}`,
  }),
}));

describe('DiaryImagePreview', () => {
  const IMAGE = { fileName: 'a.jpg' };

  it('shows the attached photo as a tappable preview (正常系)', () => {
    render(<DiaryImagePreview image={IMAGE} />);

    const button = screen.getByLabelText('添付した写真');
    expect(button.props.accessibilityRole).toBe('imagebutton');
    expect(screen.UNSAFE_getAllByType(Image)[0].props.source).toEqual({
      uri: 'file:///documents/diary-images/a.jpg',
    });
    expect(screen.queryByTestId('diary-image-full-screen')).toBeNull();
  });

  it('opens the photo full screen on tap and closes it with the close button (正常系: 全画面表示)', () => {
    render(<DiaryImagePreview image={IMAGE} />);

    fireEvent.press(screen.getByLabelText('添付した写真'));
    expect(screen.getByTestId('diary-image-full-screen')).toBeTruthy();
    expect(screen.getByLabelText('添付した写真(全画面)')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByTestId('diary-image-full-screen')).toBeNull();
  });

  it('replaces the preview with a message when the file cannot be loaded (異常系: 画像ファイルが無い)', () => {
    render(<DiaryImagePreview image={IMAGE} />);

    fireEvent(screen.UNSAFE_getAllByType(Image)[0], 'error');

    expect(screen.getByText('添付した写真を表示できません')).toBeTruthy();
    expect(screen.queryByLabelText('添付した写真')).toBeNull();
  });
});
