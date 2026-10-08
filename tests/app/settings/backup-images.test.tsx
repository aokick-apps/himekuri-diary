import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import { getAllDiaryEntries, saveDiaryEntry } from '@/utils/diary-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/utils/diary-reminder-notifications', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createReminderNotificationsMock(),
);

jest.mock('@/utils/diary-images', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createDiaryImagesMock(),
);

jest.mock('@/utils/app-lock-authentication', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createAppLockAuthenticationMock(),
);

jest.mock('expo-file-system', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createFileSystemMock(),
);

jest.mock('expo-document-picker', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createDocumentPickerMock(),
);

jest.mock('expo-sharing', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createSharingMock(),
);

jest.mock('expo-crypto', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createCryptoMock(),
);

jest.mock('expo-secure-store', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createSecureStoreMock(),
);

jest.mock('expo-router', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createRouterMock(),
);

const secureStoreMock = SecureStore as unknown as { __reset: () => void };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedFileSystem = require('expo-file-system') as {
  __mockWrite: jest.Mock;
  __mockText: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedDiaryImages = require('@/utils/diary-images') as {
  isDiaryImageAttachmentSupported: jest.Mock;
  readDiaryImagesAsBase64: jest.Mock;
  restoreDiaryImagesFromBase64: jest.Mock;
};

const entryWithImage = {
  id: '1',
  text: '写真つきの日記',
  createdAt: '2026-01-01T00:00:00.000Z',
  images: [{ fileName: 'a.jpg' }],
};

describe('添付写真を含む日記データのエクスポート/インポート', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStoreMock.__reset();
    jest.clearAllMocks();
    mockedFileSystem.__mockWrite.mockReturnValue(undefined);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    mockedDiaryImages.readDiaryImagesAsBase64.mockResolvedValue(new Map());
    mockedDiaryImages.restoreDiaryImagesFromBase64.mockReturnValue(0);
    mockedDiaryImages.isDiaryImageAttachmentSupported.mockReturnValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  async function pressAlertButton(label: string) {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === label)?.onPress?.();
    });
  }

  async function startImport(content: string) {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///picked/backup.json', name: 'backup.json', mimeType: 'application/json' },
      ],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(content);
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('日記データをインポート'));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  }

  const backupJson = JSON.stringify({
    format: 'diary-backup',
    version: 2,
    entries: [entryWithImage],
    images: { 'a.jpg': 'QUJD' },
  });

  it('embeds the image data in the exported file when entries have attached photos (エクスポート: 画像本体を含める)', async () => {
    await saveDiaryEntry(entryWithImage);
    mockedDiaryImages.readDiaryImagesAsBase64.mockResolvedValue(new Map([['a.jpg', 'QUJD']]));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('日記データをエクスポート'));
    });

    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    const written = JSON.parse(mockedFileSystem.__mockWrite.mock.calls[0][1]);
    expect(written).toMatchObject({
      format: 'diary-backup',
      version: 2,
      entries: [entryWithImage],
      images: { 'a.jpg': 'QUJD' },
    });
    expect(mockedDiaryImages.readDiaryImagesAsBase64).toHaveBeenCalledWith([entryWithImage]);
  });

  it('keeps writing the legacy array format when there is no image data (エクスポート: 画像なしは従来形式)', async () => {
    await saveDiaryEntry({ id: '2', text: '写真なし', createdAt: '2026-01-02T00:00:00.000Z' });
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('日記データをエクスポート'));
    });

    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    expect(Array.isArray(JSON.parse(mockedFileSystem.__mockWrite.mock.calls[0][1]))).toBe(true);
  });

  it('mentions the number of photos in the confirmation dialog and restores them before saving entries (インポート: 画像の復元)', async () => {
    await startImport(backupJson);

    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toContain('添付写真1枚もあわせて取り込みます');
    expect(mockedDiaryImages.restoreDiaryImagesFromBase64).not.toHaveBeenCalled();

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。',
      ),
    );
    expect(mockedDiaryImages.restoreDiaryImagesFromBase64).toHaveBeenCalledWith(
      new Map([['a.jpg', 'QUJD']]),
    );
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('reports photos that could not be restored while still importing the entries (インポート: 画像の一部が復元できない場合)', async () => {
    mockedDiaryImages.restoreDiaryImagesFromBase64.mockReturnValue(1);
    await startImport(backupJson);

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。\n1枚の添付写真は復元できませんでした。',
      ),
    );
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('treats a thrown restore error as all photos failing but still imports the entries (インポート: 画像ディレクトリを作れない場合)', async () => {
    mockedDiaryImages.restoreDiaryImagesFromBase64.mockImplementation(() => {
      throw new Error('no space');
    });
    await startImport(backupJson);

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。\n1枚の添付写真は復元できませんでした。',
      ),
    );
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('says photos are not imported instead of promising a count where attachments are unsupported (インポート: 画像添付非対応の環境)', async () => {
    mockedDiaryImages.isDiaryImageAttachmentSupported.mockReturnValue(false);
    await startImport(backupJson);

    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).not.toContain('添付写真1枚');
    expect(message).toContain('この環境では添付写真は取り込まれません');
  });

  it('does not mention photos when importing a legacy backup without image data (インポート: 旧形式との後方互換)', async () => {
    await startImport(JSON.stringify([entryWithImage]));

    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).not.toContain('添付写真');

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。',
      ),
    );
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('skips entries with path-like image names and never restores their data (インポート: パストラバーサル)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const evil = { ...entryWithImage, images: [{ fileName: '../../evil.jpg' }] };
    await startImport(
      JSON.stringify({
        format: 'diary-backup',
        version: 2,
        entries: [evil],
        images: { '../../evil.jpg': 'QUJD' },
      }),
    );

    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe(
      'インポートできる日記データがありません',
    );
    expect(mockedDiaryImages.restoreDiaryImagesFromBase64).not.toHaveBeenCalled();
  });
});
