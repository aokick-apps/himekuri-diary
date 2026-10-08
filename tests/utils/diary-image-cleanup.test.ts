import { cleanUpUnreferencedDiaryImagesAsync } from '@/utils/diary-image-cleanup';
import {
  deleteDiaryImages,
  isDiaryImageAttachmentSupported,
  listStoredDiaryImageFileNames,
} from '@/utils/diary-images';
import { getAllDiaryEntries, type GetAllDiaryEntriesOptions } from '@/utils/diary-storage';

jest.mock('@/utils/diary-images', () => ({
  deleteDiaryImages: jest.fn(),
  isDiaryImageAttachmentSupported: jest.fn(() => true),
  listStoredDiaryImageFileNames: jest.fn(),
}));

jest.mock('@/utils/diary-storage', () => ({
  getAllDiaryEntries: jest.fn(),
}));

const mockedList = jest.mocked(listStoredDiaryImageFileNames);
const mockedGetAll = jest.mocked(getAllDiaryEntries);
const mockedDelete = jest.mocked(deleteDiaryImages);
const mockedSupported = jest.mocked(isDiaryImageAttachmentSupported);

const ENTRY_WITH_IMAGE = {
  id: '1',
  text: '本文',
  createdAt: '2026-01-01T00:00:00.000Z',
  images: [{ fileName: 'used.jpg' }],
};

describe('cleanUpUnreferencedDiaryImagesAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSupported.mockReturnValue(true);
  });

  it('deletes only the image files no diary entry refers to (正常系)', async () => {
    mockedList.mockReturnValue(['used.jpg', 'orphan.jpg']);
    mockedGetAll.mockResolvedValue([ENTRY_WITH_IMAGE]);

    await cleanUpUnreferencedDiaryImagesAsync();

    expect(mockedDelete).toHaveBeenCalledWith([{ fileName: 'orphan.jpg' }]);
  });

  it('skips reading entries when no image file is stored (境界値: 画像なし)', async () => {
    mockedList.mockReturnValue([]);

    await cleanUpUnreferencedDiaryImagesAsync();

    expect(mockedGetAll).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it.each([
    ['the whole load fails', 'onError'],
    ['some entries are corrupted', 'onPartialCorruption'],
  ] as const)(
    'does not delete anything when %s, to avoid removing images of unreadable entries (異常系)',
    async (_label, callbackName) => {
      mockedList.mockReturnValue(['orphan.jpg']);
      mockedGetAll.mockImplementation(async (options?: GetAllDiaryEntriesOptions) => {
        if (callbackName === 'onError') {
          options?.onError?.(new Error('read failed'));
        } else {
          options?.onPartialCorruption?.(1, 2);
        }
        return [];
      });

      await cleanUpUnreferencedDiaryImagesAsync();

      expect(mockedDelete).not.toHaveBeenCalled();
    },
  );

  it('does nothing on platforms without image attachments such as web (境界値: 非対応環境)', async () => {
    mockedSupported.mockReturnValue(false);

    await cleanUpUnreferencedDiaryImagesAsync();

    expect(mockedList).not.toHaveBeenCalled();
  });

  it('resolves without throwing when listing the directory fails (異常系: 起動を妨げない)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedList.mockImplementation(() => {
      throw new Error('list failed');
    });

    await expect(cleanUpUnreferencedDiaryImagesAsync()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
