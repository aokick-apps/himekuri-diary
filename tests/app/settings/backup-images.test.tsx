import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
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

jest.mock('@/utils/app-lock-authentication', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createAppLockAuthenticationMock(),
);

jest.mock('expo-file-system', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/mock-memory-file-system').createMemoryFileSystemMock(),
);

jest.mock('expo-image-picker', () => ({}));

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
const fs = require('expo-file-system') as ReturnType<
  typeof import('../../helpers/mock-memory-file-system').createMemoryFileSystemMock
>;

const IMAGES_DIR = 'file:///documents/diary-images';
const PICKED_URI = 'file:///picked/backup.json';
const photo = new Uint8Array([1, 2, 3, 4, 5, 250, 251]);
const originalOS = Platform.OS;

const entryWithImage = {
  id: '1',
  text: '写真つきの日記',
  createdAt: '2026-01-01T00:00:00.000Z',
  images: [{ fileName: 'a.jpg' }],
};

const utf8 = (text: string) => new TextEncoder().encode(text);

function backupBytes(
  images: object[] = [
    { image: 'a.jpg', index: 0, data: Buffer.from(photo).toString('base64'), last: true },
  ],
) {
  const header = JSON.stringify({
    format: 'diary-backup',
    version: 2,
    entries: [entryWithImage],
    images: ['a.jpg'],
  });
  return utf8([header, ...images.map((line) => JSON.stringify(line)), ''].join('\n'));
}

describe('添付写真を含む日記データのエクスポート/インポート', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStoreMock.__reset();
    jest.clearAllMocks();
    fs.__files.clear();
    fs.__directories.clear();
    fs.__failWritesTo.clear();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: PICKED_URI, name: 'backup.json', mimeType: 'application/json' }],
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  async function pressAlertButton(label: string) {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === label)?.onPress?.();
    });
  }

  async function startImport(bytes: Uint8Array) {
    fs.__files.set(PICKED_URI, bytes);
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('日記データをインポート'));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  }

  it('exports entries and their photos as a header line plus image chunk lines (エクスポート: 画像本体を含める)', async () => {
    await saveDiaryEntry(entryWithImage);
    fs.__files.set(`${IMAGES_DIR}/a.jpg`, photo);
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('日記データをエクスポート'));
    });

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    const sharedUri = (Sharing.shareAsync as jest.Mock).mock.calls[0][0] as string;
    const lines = new TextDecoder().decode(fs.__files.get(sharedUri)).split('\n');
    expect(JSON.parse(lines[0])).toMatchObject({
      format: 'diary-backup',
      version: 2,
      entries: [entryWithImage],
      images: ['a.jpg'],
    });
    expect(JSON.parse(lines[1])).toEqual({
      image: 'a.jpg',
      index: 0,
      data: Buffer.from(photo).toString('base64'),
      last: true,
    });
  });

  it('keeps writing the legacy array format when no photo exists (エクスポート: 画像なしは従来形式)', async () => {
    await saveDiaryEntry({ id: '2', text: '写真なし', createdAt: '2026-01-02T00:00:00.000Z' });
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('日記データをエクスポート'));
    });

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    const sharedUri = (Sharing.shareAsync as jest.Mock).mock.calls[0][0] as string;
    expect(Array.isArray(JSON.parse(new TextDecoder().decode(fs.__files.get(sharedUri))))).toBe(
      true,
    );
  });

  it('mentions the number of photos in the confirmation dialog and restores them on confirm (インポート: 画像の復元)', async () => {
    await startImport(backupBytes());

    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toContain('添付写真1枚もあわせて取り込みます');
    expect(fs.__files.has(`${IMAGES_DIR}/a.jpg`)).toBe(false);

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。',
      ),
    );
    expect(fs.__files.get(`${IMAGES_DIR}/a.jpg`)).toEqual(photo);
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('reports photos that could not be restored while still importing the entries (インポート: 画像の一部が復元できない場合)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await startImport(backupBytes([{ image: 'a.jpg', index: 0, data: 'not base64!', last: true }]));

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。\n1枚の添付写真は復元できませんでした。',
      ),
    );
    expect(fs.__files.has(`${IMAGES_DIR}/a.jpg`)).toBe(false);
    expect(await getAllDiaryEntries()).toEqual([entryWithImage]);
  });

  it('does not overwrite a photo that already exists with the same name (インポート: 既存ファイルのスキップ)', async () => {
    fs.__files.set(`${IMAGES_DIR}/a.jpg`, utf8('existing'));
    await startImport(backupBytes());

    await pressAlertButton('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。',
      ),
    );
    expect(fs.__files.get(`${IMAGES_DIR}/a.jpg`)).toEqual(utf8('existing'));
  });

  it('says photos are not imported instead of promising a count where attachments are unsupported (インポート: 画像添付非対応の環境)', async () => {
    Platform.OS = 'web';
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'blob:backup',
          name: 'backup.json',
          file: new Blob([backupBytes() as unknown as BlobPart]),
        },
      ],
    });
    await startImport(backupBytes());

    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).not.toContain('添付写真1枚');
    expect(message).toContain('この環境では添付写真は取り込まれません');
  });

  it('does not mention photos when importing a legacy backup without image data (インポート: 旧形式との後方互換)', async () => {
    await startImport(utf8(JSON.stringify([entryWithImage], null, 2)));

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
    const header = JSON.stringify({
      format: 'diary-backup',
      version: 2,
      entries: [evil],
      images: ['../../evil.jpg'],
    });
    const line = JSON.stringify({ image: '../../evil.jpg', index: 0, data: 'AQID', last: true });
    await startImport(utf8(`${header}\n${line}\n`));

    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe(
      'インポートできる日記データがありません',
    );
    expect([...fs.__files.keys()].some((uri) => uri.includes('evil'))).toBe(false);
  });
});
