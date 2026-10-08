import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import { buildDiaryEntryKey, getAllDiaryEntries } from '@/utils/diary-storage';

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

describe('日記データをインポートボタン(データ管理セクション)', () => {
  const IMPORT_BUTTON_LABEL = '日記データをインポート';
  const CONFIRM_DIALOG_TITLE = '日記データをインポートしますか?';
  const IMPORT_FAILURE_ALERT = [
    'インポートに失敗しました',
    '選択したファイルを読み込めませんでした。ファイルの形式を確認してもう一度お試しください。',
  ] as const;

  const pickedAsset = {
    uri: 'file:///picked/diary-export.json',
    name: 'diary-export.json',
    mimeType: 'application/json',
    lastModified: 0,
  };

  const originalPlatformOS = Platform.OS;

  // Alert.alertをモック化した上で、直近の呼び出しに渡されたボタン定義から指定ラベルのonPressを
  // 直接呼び出すことで「ユーザーがそのボタンをタップした」ことを模倣する
  // (削除ボタンのテストにある`pressAlertButton`と同じ方式)。
  async function pressAlertButtonByLabel(label: string) {
    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
    const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
    const button = buttons.find((b) => b.text === label);
    expect(button).toBeDefined();
    await act(async () => {
      button?.onPress?.();
    });
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStoreMock.__reset();
    jest.clearAllMocks();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
    Platform.OS = originalPlatformOS;
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it('renders the import button inside the "データ管理" section (操作導線の存在確認)', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('データ管理')).toBeTruthy();
    expect(screen.getByText(IMPORT_BUTTON_LABEL)).toBeTruthy();
  });

  it('does nothing when the user cancels the document picker (キャンセル時は何もしない)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: null,
    });
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows a confirmation dialog with the entry count before saving anything (確認ダイアログの表示)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
    );
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe(CONFIRM_DIALOG_TITLE);
    expect(message).toContain('1件');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ text: 'キャンセル', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: '取り込む' });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('appends a skipped-count notice to the confirmation dialog when some entries were invalid (異常系: 無効エントリの件数をユーザーに通知)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    const validEntry = { id: '1', text: '有効な日記', createdAt: '2026-01-01T00:00:00.000Z' };
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([validEntry, { id: '2', text: '壊れたデータ' }, { id: '3' }]),
    );
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [title, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe(CONFIRM_DIALOG_TITLE);
    expect(message).toContain(
      '2件のデータは形式が正しくないか文字数上限を超えていたためスキップされました。',
    );
  });

  it('does not append a skipped-count notice when every entry is valid (境界値: 無効エントリが0件の場合は既存文言のまま)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
    );
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toBe(
      '1件の日記データを取り込みます。同じ日記が既にある場合は、ファイルの内容で上書きされます。',
    );
    expect(message).not.toContain('スキップされました');
  });

  it('saves nothing when the confirmation dialog is cancelled (キャンセル時は保存しない)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
    );
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('キャンセル');

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('saves the imported entries and shows a completion alert once confirmed, adding to existing data without deleting it (正常系: 追記マージ)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const existingEntry = {
      id: 'existing',
      text: '既存の日記',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await AsyncStorage.setItem(buildDiaryEntryKey('existing'), JSON.stringify(existingEntry));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    const importedEntry = {
      id: 'imported',
      text: '取り込んだ日記',
      createdAt: '2026-02-01T00:00:00.000Z',
    };
    mockedFileSystem.__mockText.mockResolvedValueOnce(JSON.stringify([importedEntry]));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        buildDiaryEntryKey('imported'),
        expect.any(String),
      ),
    );
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        '1件の日記データを取り込みました。',
      ),
    );

    const allEntries = await getAllDiaryEntries();
    expect(allEntries.map((entry) => entry.id).sort()).toEqual(['existing', 'imported']);
  });

  it('overwrites an existing entry with the imported content when ids collide (id重複時はインポート側の内容で上書き)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(
      buildDiaryEntryKey('1'),
      JSON.stringify({ id: '1', text: '元のテキスト', createdAt: '2026-01-01T00:00:00.000Z' }),
    );
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    const updatedEntry = {
      id: '1',
      text: '更新後のテキスト',
      createdAt: '2026-01-05T00:00:00.000Z',
    };
    mockedFileSystem.__mockText.mockResolvedValueOnce(JSON.stringify([updatedEntry]));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    const allEntries = await getAllDiaryEntries();
    expect(allEntries).toEqual([updatedEntry]);
  });

  it('shows an alert and does not open the confirmation dialog when the file has no valid entries (境界値: 有効なエントリが0件)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce('[]');
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'インポートできる日記データがありません',
        '選択したファイルに有効な日記データが含まれていませんでした。',
      ),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('skips invalid elements in the array but still imports the valid ones, logging a warning (異常系: 一部エントリのスキーマ不整合)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    const validEntry = { id: '1', text: '有効な日記', createdAt: '2026-01-01T00:00:00.000Z' };
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([validEntry, { id: '2', text: '壊れたデータ' }]),
    );
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('件の不正なエントリをスキップしました'),
    );
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    const allEntries = await getAllDiaryEntries();
    expect(allEntries).toEqual([validEntry]);
    warnSpy.mockRestore();
  });

  it('shows an error alert when the selected file is not valid JSON (異常系: パース失敗)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce('not-valid-json{{{');
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(...IMPORT_FAILURE_ALERT));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows an error alert when the top-level JSON value is not an array (異常系: 配列でない)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(JSON.stringify({ not: 'an array' }));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(...IMPORT_FAILURE_ALERT));
  });

  it('shows a failure alert when reading the picked file rejects (異常系: ファイル読み込み失敗)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockRejectedValueOnce(new Error('read error'));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(...IMPORT_FAILURE_ALERT));
  });

  it('shows a failure alert including the count saved so far when saving an imported entry fails (異常系: 保存失敗時に成功件数を通知)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    const importedEntries = [
      { id: '1', text: '取り込む日記1', createdAt: '2026-02-01T00:00:00.000Z' },
      { id: '2', text: '取り込む日記2', createdAt: '2026-02-02T00:00:00.000Z' },
      { id: '3', text: '取り込む日記3', createdAt: '2026-02-03T00:00:00.000Z' },
    ];
    mockedFileSystem.__mockText.mockResolvedValueOnce(JSON.stringify(importedEntries));
    // 1・2件目は成功させ、3件目でのみ失敗させることで途中失敗を再現する
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('write error'));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートに失敗しました',
        '3件中2件を取り込んだ時点で失敗しました。もう一度お試しください。',
      ),
    );
  });

  it('shows a failure alert with 0 saved when the very first entry fails to save (境界値: 1件目で失敗)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(
      JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
    );
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write error'));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートに失敗しました',
        '1件中0件を取り込んだ時点で失敗しました。もう一度お試しください。',
      ),
    );
  });

  // 暗号鍵が未生成の状態(=まさにバックアップ復元時に起きる状況)で
  // 複数件を並列(Promise.all)保存すると、各保存処理が同時に鍵の生成・書き込みを行い、
  // 最後に勝った鍵以外で暗号化されたエントリが復号不能になり消失してしまうため、
  // 逐次保存(for...of)により全件が復号可能なまま残ることを確認する。
  it('saves every imported entry so that all of them are decryptable afterwards, even from a fresh (not-yet-generated) encryption key state (暗号鍵レースコンディションによるデータ消失防止)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // secureStoreMock.__reset()により暗号鍵が未生成の状態から始まる(beforeEachで実施済み)
    const importedEntries = Array.from({ length: 10 }, (_, i) => ({
      id: `entry-${i}`,
      text: `取り込む日記 ${i}`,
      createdAt: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [pickedAsset],
    });
    mockedFileSystem.__mockText.mockResolvedValueOnce(JSON.stringify(importedEntries));
    render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButtonByLabel('取り込む');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'インポートが完了しました',
        `${importedEntries.length}件の日記データを取り込みました。`,
      ),
    );

    const allEntries = await getAllDiaryEntries();
    expect(allEntries.map((entry) => entry.id).sort()).toEqual(
      importedEntries.map((entry) => entry.id).sort(),
    );
  });

  // 他の操作導線(削除/エクスポート)に導入された、処理中の連続タップ防止のための
  // 視覚的フィードバックをインポートボタンにも合わせる。
  it('dims the button and disables it while picking a file, then restores both once finished (処理中の視覚的フィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let resolvePick: (value: DocumentPicker.DocumentPickerResult) => void = () => {};
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReturnValue(
      new Promise<DocumentPicker.DocumentPickerResult>((resolve) => {
        resolvePick = resolve;
      }),
    );
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));

    const buttonWhileImporting = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
    expect(StyleSheet.flatten(buttonWhileImporting.props.style).opacity).toBe(0.5);
    expect(buttonWhileImporting.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await act(async () => {
      resolvePick({ canceled: true, assets: null });
    });

    await waitFor(() => {
      const buttonAfterImporting = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(StyleSheet.flatten(buttonAfterImporting.props.style).opacity).toBe(1);
    });
    expect(
      screen.getByRole('button', { name: IMPORT_BUTTON_LABEL }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));
  });

  // Androidの戻る操作・ダイアログ外タップでは、ボタンのonPressではなくonDismissのみが呼ばれる。
  describe('確認ダイアログをボタン以外の操作(戻る操作など)で閉じた場合', () => {
    async function openConfirmDialog() {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [pickedAsset],
      });
      mockedFileSystem.__mockText.mockResolvedValueOnce(
        JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
      );
      render(<SettingsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
      });
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    }

    it('makes the dialog cancelable so it can be closed with the back button or an outside tap (戻る操作・外側タップで閉じられる)', async () => {
      await openConfirmDialog();

      const options = (Alert.alert as jest.Mock).mock.calls[0][3] as { cancelable?: boolean };
      expect(options?.cancelable).toBe(true);
    });

    async function dismissConfirmDialog() {
      const options = (Alert.alert as jest.Mock).mock.calls[0][3] as { onDismiss?: () => void };
      expect(options?.onDismiss).toBeInstanceOf(Function);
      await act(async () => {
        options.onDismiss?.();
      });
    }

    it('restores the button state and saves nothing when the dialog is dismissed without pressing a button (ボタンの固着解除・保存しない)', async () => {
      await openConfirmDialog();
      expect(
        screen.getByRole('button', { name: IMPORT_BUTTON_LABEL }).props.accessibilityState,
      ).toEqual(expect.objectContaining({ disabled: true }));

      await dismissConfirmDialog();

      const button = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
      expect(StyleSheet.flatten(button.props.style).opacity).toBe(1);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('allows starting the import again after the dialog was dismissed (再度インポートを開始できる)', async () => {
      await openConfirmDialog();
      await dismissConfirmDialog();
      mockedFileSystem.__mockText.mockResolvedValueOnce(
        JSON.stringify([{ id: '2', text: '再取り込み', createdAt: '2026-02-02T00:00:00.000Z' }]),
      );

      await act(async () => {
        fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
      });

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
      expect((Alert.alert as jest.Mock).mock.calls[1][0]).toBe(CONFIRM_DIALOG_TITLE);
    });

    it('restores the button state when the cancel button is pressed on the dialog (キャンセルボタンでも固着しない)', async () => {
      await openConfirmDialog();
      expect(
        screen.getByRole('button', { name: IMPORT_BUTTON_LABEL }).props.accessibilityState,
      ).toEqual(expect.objectContaining({ disabled: true }));

      await pressAlertButtonByLabel('キャンセル');

      const button = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
      expect(StyleSheet.flatten(button.props.style).opacity).toBe(1);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('does not show the import progress while only the confirmation dialog is open (境界値: 保存開始前は進捗を出さない)', async () => {
      await openConfirmDialog();

      const button = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(within(button).getByText(IMPORT_BUTTON_LABEL)).toBeTruthy();
      expect(screen.queryByText(/インポート中/)).toBeNull();
      expect(button.props.accessibilityState).toEqual(expect.objectContaining({ busy: false }));
    });

    it('shows a spinner with the saved/total count while the confirmed import is saving, then restores the label (処理中の表示: 進捗件数)', async () => {
      await openConfirmDialog();
      let resolveSave: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );

      await pressAlertButtonByLabel('取り込む');

      const button = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(within(button).getByText('インポート中... (0/1件)')).toBeTruthy();
      expect(within(button).UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
      expect(button.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
      expect(button.props.accessibilityValue?.text).toBe('1件中0件を取り込み済み');

      await act(async () => {
        resolveSave();
      });

      await waitFor(() => expect(screen.queryByText(/インポート中/)).toBeNull());
      const buttonAfter = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(within(buttonAfter).getByText(IMPORT_BUTTON_LABEL)).toBeTruthy();
      expect(buttonAfter.props.accessibilityValue?.text).toBeUndefined();
    });

    it('keeps the button disabled while the confirmed import is still saving, then restores it once finished (境界値: 取り込み中は無効のまま)', async () => {
      await openConfirmDialog();
      let resolveSave: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );

      await pressAlertButtonByLabel('取り込む');

      const buttonWhileSaving = screen.getByRole('button', { name: IMPORT_BUTTON_LABEL });
      expect(buttonWhileSaving.props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true }),
      );
      expect(StyleSheet.flatten(buttonWhileSaving.props.style).opacity).toBe(0.5);

      await act(async () => {
        resolveSave();
      });

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: IMPORT_BUTTON_LABEL }).props.accessibilityState,
        ).toEqual(expect.objectContaining({ disabled: false })),
      );
    });
  });

  describe('Web版(Platform.OS === "web")', () => {
    beforeEach(() => {
      Platform.OS = 'web';
    });

    it('reads the file content from the browser File object instead of expo-file-system (正常系: Web版)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const webFile = new Blob([
        JSON.stringify([{ id: '1', text: '取り込む日記', createdAt: '2026-02-01T00:00:00.000Z' }]),
      ]);
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ ...pickedAsset, file: webFile }],
      });
      render(<SettingsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
      });

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
      expect((Alert.alert as jest.Mock).mock.calls[0][1]).toContain('1件');
      expect(mockedFileSystem.__mockText).not.toHaveBeenCalled();
    });

    it('shows a failure alert when the browser File object is missing from the picked asset (境界値: asset.fileが無い場合)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [pickedAsset],
      });
      render(<SettingsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText(IMPORT_BUTTON_LABEL));
      });

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(...IMPORT_FAILURE_ALERT));
    });
  });
});
