import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import {
  buildDiaryEntryKey,
  buildDiaryPartialCorruptionMessage,
  DIARY_ENTRIES_STORAGE_KEY,
  DIARY_LOAD_ERROR_MESSAGE,
} from '@/utils/diary-storage';

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

// テストごとに暗号鍵の永続化状態を分離するための参照
const secureStoreMock = SecureStore as unknown as { __reset: () => void };

// jest.mockした'expo-file-system'の内部状態・書き込み呼び出しをテストごとに操作/検証するための参照
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedFileSystem = require('expo-file-system') as {
  __mockState: { cacheDirectoryUri: string | null };
  __mockWrite: jest.Mock;
  __mockText: jest.Mock;
};

describe('日記データをエクスポートボタン(データ管理セクション)', () => {
  const EXPORT_BUTTON_LABEL = '日記データをエクスポート';
  // getAllDiaryEntriesはcreatedAtの降順(新しい順)で返すため、あらかじめその順序で定義しておく
  const sampleEntriesJson = JSON.stringify([
    { id: '2', text: '公園を散歩しました。', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: '1', text: '今日はいい天気でした。', createdAt: '2026-01-01T00:00:00.000Z' },
  ]);

  const originalPlatformOS = Platform.OS;

  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStoreMock.__reset();
    jest.clearAllMocks();
    // 各テストごとにモックの既定挙動をリセットする(個別のテストで上書きするため)
    mockedFileSystem.__mockState.cacheDirectoryUri = 'file:///mock-cache/';
    mockedFileSystem.__mockWrite.mockReturnValue(undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    Platform.OS = originalPlatformOS;
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it('renders the export button inside the "データ管理" section (操作導線の存在確認)', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('データ管理')).toBeTruthy();
    expect(screen.getByText(EXPORT_BUTTON_LABEL)).toBeTruthy();
  });

  it('shows an alert and does not touch the file system/sharing APIs when there are 0 diary entries (境界値: 0件)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'エクスポートできる日記データがありません',
        '日記を書いてからもう一度お試しください。',
      ),
    );
    expect(mockedFileSystem.__mockWrite).not.toHaveBeenCalled();
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('shows a load-error alert distinct from the "no data" alert when all entries fail to load, so it is not mistaken for having nothing to back up (異常系: 全滅時のエクスポート)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // レガシーキーに不正なJSONを保存し、getAllDiaryEntries内部のマイグレーション処理を
    // 失敗させることで、全滅エラー(外側catch)を再現する
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'not valid json');
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '日記データを読み込めませんでした',
        DIARY_LOAD_ERROR_MESSAGE,
        expect.any(Array),
      ),
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'エクスポートできる日記データがありません',
      expect.anything(),
    );
    expect(mockedFileSystem.__mockWrite).not.toHaveBeenCalled();
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('retries the export via the "再試行" button in the load-error alert, and succeeds once the underlying data becomes readable (異常系からの再試行)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'not valid json');
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '日記データを読み込めませんでした',
        DIARY_LOAD_ERROR_MESSAGE,
        expect.any(Array),
      ),
    );

    // 壊れていたレガシーデータを正常な内容に差し替え、再試行時には読み込めるようにする
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    const retryButton = buttons.find((button: { text: string }) => button.text === '再試行');

    await act(async () => {
      await retryButton.onPress();
    });

    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    const [, writtenContent] = mockedFileSystem.__mockWrite.mock.calls[0];
    expect(JSON.parse(writtenContent)).toEqual(JSON.parse(sampleEntriesJson));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  });

  it('continues the export with the successfully loaded entries and reports the corrupted count in the completion alert when some entries are corrupted (境界値: 一部破損)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    await AsyncStorage.setItem(buildDiaryEntryKey('broken'), 'not valid json');
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    const [, writtenContent] = mockedFileSystem.__mockWrite.mock.calls[0];
    expect(JSON.parse(writtenContent)).toEqual(JSON.parse(sampleEntriesJson));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'エクスポートが完了しました',
        `${buildDiaryPartialCorruptionMessage(1)}。それ以外のデータは書き出せました。`,
      ),
    );
  });

  it('writes the JSON file to the cache directory and opens the native share sheet when there is data (正常系)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // 暗号化対応前の平文JSON形式でも読み込めることを兼ねて確認するため、そのまま保存する
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    const [fileUri, writtenContent] = mockedFileSystem.__mockWrite.mock.calls[0];
    expect(fileUri).toMatch(/^file:\/\/\/mock-cache\/diary-export-\d{8}-\d{6}\.json$/);
    expect(JSON.parse(writtenContent)).toEqual(JSON.parse(sampleEntriesJson));

    await waitFor(() => expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(fileUri, {
      mimeType: 'application/json',
      dialogTitle: '日記データをエクスポート',
      UTI: 'public.json',
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows an alert and does not call shareAsync when sharing is unavailable on the device (異常系)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '共有機能を利用できません',
        'この端末では共有機能を利用できないため、エクスポートを完了できませんでした。',
      ),
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('shows a failure alert when writing the export file fails (異常系: ファイル書き込み失敗)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    mockedFileSystem.__mockWrite.mockImplementation(() => {
      throw new Error('disk full');
    });
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'エクスポートに失敗しました',
        'もう一度お試しください。',
      ),
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('shows a failure alert when the share sheet itself fails (異常系: 共有失敗)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('share cancelled'));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'エクスポートに失敗しました',
        'もう一度お試しください。',
      ),
    );
  });

  // エクスポート処理中(isExporting === true)は誤って連続タップされないよう、ボタンを
  // 半透明化(opacity: 0.5)しaccessibilityState.disabledをtrueにする。完了後は元に戻る。
  it('dims the button (opacity 0.5) and sets accessibilityState.disabled to true while exporting, then restores both once finished (処理中の視覚的フィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    // `file.write()`は同期メソッドのため書き込み自体は即座に終わる。代わりに書き込み後に呼ばれる
    // `Sharing.isAvailableAsync`が完了するまで解決しないPromiseにして、処理中の状態を検証する。
    let resolveIsAvailable: (value: boolean) => void = () => {};
    (Sharing.isAvailableAsync as jest.Mock).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveIsAvailable = resolve;
      }),
    );
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));

    const buttonWhileExporting = screen.getByRole('button', { name: EXPORT_BUTTON_LABEL });
    expect(StyleSheet.flatten(buttonWhileExporting.props.style).opacity).toBe(0.5);
    expect(buttonWhileExporting.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    // この時点で書き込み自体はすでに完了していること(同期メソッドのため)も合わせて確認する
    await waitFor(() => expect(mockedFileSystem.__mockWrite).toHaveBeenCalledTimes(1));
    resolveIsAvailable(true);

    await waitFor(() => {
      const buttonAfterExporting = screen.getByRole('button', { name: EXPORT_BUTTON_LABEL });
      expect(StyleSheet.flatten(buttonAfterExporting.props.style).opacity).toBe(1);
    });
    expect(
      screen.getByRole('button', { name: EXPORT_BUTTON_LABEL }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('shows a spinner with "エクスポート中..." while exporting, keeping the button\'s accessible name and marking it busy (処理中の表示)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    let resolveIsAvailable: (value: boolean) => void = () => {};
    (Sharing.isAvailableAsync as jest.Mock).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveIsAvailable = resolve;
      }),
    );
    render(<SettingsScreen />);
    expect(screen.queryByText('エクスポート中...')).toBeNull();

    fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));

    const button = screen.getByRole('button', { name: EXPORT_BUTTON_LABEL });
    expect(within(button).getByText('エクスポート中...')).toBeTruthy();
    expect(within(button).UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));

    await act(async () => {
      resolveIsAvailable(true);
    });

    await waitFor(() => expect(screen.queryByText('エクスポート中...')).toBeNull());
    const buttonAfter = screen.getByRole('button', { name: EXPORT_BUTTON_LABEL });
    expect(within(buttonAfter).getByText(EXPORT_BUTTON_LABEL)).toBeTruthy();
    expect(within(buttonAfter).UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    expect(buttonAfter.props.accessibilityState).toEqual(expect.objectContaining({ busy: false }));
  });

  it('shows a failure alert when the cache directory is unavailable (境界値: Paths.cacheが取得できない場合)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
    mockedFileSystem.__mockState.cacheDirectoryUri = null;
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'エクスポートに失敗しました',
        'もう一度お試しください。',
      ),
    );
    expect(mockedFileSystem.__mockWrite).not.toHaveBeenCalled();
  });

  describe('Web版(Platform.OS === "web")', () => {
    // Webはexpo-file-system/expo-sharingに対応していないため、実装はBlob + <a download>による
    // ブラウザ標準ダウンロードにフォールバックする。Jest環境(Node)には`document`が存在しないため
    // `click`呼び出しを検証できる最小限のモックを用意する。`URL.createObjectURL`/`revokeObjectURL`も
    // expoのポリフィルのままだと実機のネイティブ`BlobModule`前提で例外になるため差し替える。
    let createdAnchor: { href: string; download: string; click: jest.Mock };
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let localStorageStore: Record<string, string>;

    beforeEach(() => {
      Platform.OS = 'web';
      createdAnchor = { href: '', download: '', click: jest.fn() };
      (global as unknown as { document: Document }).document = {
        createElement: jest.fn(() => createdAnchor),
      } as unknown as Document;
      URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = jest.fn();
      // Web版では暗号鍵の保存先がexpo-secure-storeではなくlocalStorageになる
      // (utils/diary-encryption.ts参照)。テスト実行環境(Node)にはlocalStorageが存在しないため、
      // `tests/utils/diary-encryption.test.ts`と同じ最小限のインメモリ実装を用意しておかないと、
      // getAllDiaryEntries内で毎回異なる鍵が生成されてしまい復号に失敗する
      localStorageStore = {};
      (global as unknown as { localStorage: Storage }).localStorage = {
        getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
          localStorageStore[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete localStorageStore[key];
        }),
        clear: jest.fn(() => {
          localStorageStore = {};
        }),
        key: jest.fn(() => null),
        length: 0,
      } as unknown as Storage;
    });

    afterEach(() => {
      delete (global as unknown as { document?: Document }).document;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      delete (global as unknown as { localStorage?: Storage }).localStorage;
    });

    it('triggers a browser download instead of calling expo-file-system/expo-sharing (正常系: Webフォールバック)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, sampleEntriesJson);
      render(<SettingsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
      });

      await waitFor(() => expect(createdAnchor.click).toHaveBeenCalledTimes(1));
      expect(createdAnchor.download).toMatch(/^diary-export-\d{8}-\d{6}\.json$/);
      expect(mockedFileSystem.__mockWrite).not.toHaveBeenCalled();
      expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows the empty-data alert without touching the DOM when there are 0 entries (境界値: Web版0件)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      render(<SettingsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText(EXPORT_BUTTON_LABEL));
      });

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          'エクスポートできる日記データがありません',
          '日記を書いてからもう一度お試しください。',
        ),
      );
      expect(createdAnchor.click).not.toHaveBeenCalled();
    });
  });
});
