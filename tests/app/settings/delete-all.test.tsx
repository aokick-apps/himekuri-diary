import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import { Colors } from '@/constants/theme';
import {
  THEME_PREFERENCE_STORAGE_KEY,
  ThemePreferenceProvider,
} from '@/contexts/theme-preference-context';
import { DIARY_ENTRIES_STORAGE_KEY } from '@/utils/diary-storage';

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

describe('日記データを全件削除ボタン(データ管理セクション)', () => {
  const DELETE_BUTTON_LABEL = '日記データを全件削除';
  const CONFIRM_DIALOG_TITLE = '日記データを削除しますか?';
  const CONFIRM_DIALOG_MESSAGE =
    'この端末に保存されているすべての日記データが削除されます。この操作は取り消せません。';

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  // Alert.alertをモック化した上で、直近の呼び出しに渡されたボタン定義から指定ラベルのonPressを
  // 直接呼び出すことで「ユーザーがそのボタンをタップした」ことを模倣する。onPress自体が状態更新を
  // 伴う非同期処理(handleDelete)を呼び出すため、actで包んで反映を待つ。
  async function pressAlertButton(label: string) {
    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
    const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
    const button = buttons.find((b) => b.text === label);
    expect(button).toBeDefined();
    await act(async () => {
      button?.onPress?.();
    });
  }

  it('renders a "データ管理" section containing the delete-all button (操作導線の存在確認)', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('データ管理')).toBeTruthy();
    expect(screen.getByText(DELETE_BUTTON_LABEL)).toBeTruthy();
  });

  it('shows a confirmation dialog with cancel/delete options when pressed, and does not delete anything yet (確認ダイアログの表示)', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(DELETE_BUTTON_LABEL));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe(CONFIRM_DIALOG_TITLE);
    expect(message).toBe(CONFIRM_DIALOG_MESSAGE);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ text: 'キャンセル', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: '削除する', style: 'destructive' });

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('deletes nothing when the cancel button is pressed (キャンセル時は削除されない)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'encrypted:v1:dummy-payload');
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(DELETE_BUTTON_LABEL));
    await pressAlertButton('キャンセル');

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(DIARY_ENTRIES_STORAGE_KEY)).toBe(
      'encrypted:v1:dummy-payload',
    );
  });

  it('deletes all diary data from AsyncStorage and shows a completion alert once confirmed (正常系: 削除の実行と完了通知)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(DIARY_ENTRIES_STORAGE_KEY, 'encrypted:v1:dummy-payload');
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(DELETE_BUTTON_LABEL));
    await pressAlertButton('削除する');

    await waitFor(() =>
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DIARY_ENTRIES_STORAGE_KEY),
    );
    expect(await AsyncStorage.getItem(DIARY_ENTRIES_STORAGE_KEY)).toBeNull();

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        '削除が完了しました',
        '保存されていた日記データをすべて削除しました。',
      ),
    );
  });

  it('shows a failure alert (and does not crash) when AsyncStorage.removeItem rejects (異常系: 削除失敗時のフィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('delete failed'));
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(DELETE_BUTTON_LABEL));
    await pressAlertButton('削除する');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        '削除に失敗しました',
        'もう一度お試しください。',
      ),
    );
  });

  // 削除処理中(isDeleting === true)は誤って連続タップされないよう、ボタンを
  // 半透明化(opacity: 0.5)しaccessibilityState.disabledをtrueにする。完了後は元に戻る。
  it('dims the button (opacity 0.5) and sets accessibilityState.disabled to true while deleting, then restores both once finished (処理中の視覚的フィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // AsyncStorage.removeItemが完了するまで解決しないPromiseにして、処理中の一瞬の状態を検証する
    let resolveRemoveItem: () => void = () => {};
    jest.spyOn(AsyncStorage, 'removeItem').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRemoveItem = resolve;
      }),
    );
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText(DELETE_BUTTON_LABEL));
    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
    const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
    const confirmDeleteButton = buttons.find((b) => b.text === '削除する');

    act(() => {
      confirmDeleteButton?.onPress?.();
    });

    const buttonWhileDeleting = screen.getByRole('button', { name: DELETE_BUTTON_LABEL });
    expect(StyleSheet.flatten(buttonWhileDeleting.props.style).opacity).toBe(0.5);
    expect(buttonWhileDeleting.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    resolveRemoveItem();

    await waitFor(() => {
      const buttonAfterDeleting = screen.getByRole('button', { name: DELETE_BUTTON_LABEL });
      expect(StyleSheet.flatten(buttonAfterDeleting.props.style).opacity).toBe(1);
    });
    expect(
      screen.getByRole('button', { name: DELETE_BUTTON_LABEL }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));
  });

  // 削除ボタンの文字色が、固定のライトモード用エラー色ではなくテーマに応じた色になることを確認する。
  describe('ダークモード対応(削除ボタンの文字色)', () => {
    // 単体レンダリングでは実機の`RootLayout`によるラップが無いため、配色切り替えを検証するには
    // 外観セクションのテストと同様に明示的に`ThemePreferenceProvider`でラップする必要がある。
    function renderSettingsScreen() {
      return render(
        <ThemePreferenceProvider>
          <SettingsScreen />
        </ThemePreferenceProvider>,
      );
    }

    it('uses the light theme error color (not a hardcoded value) when the theme preference is light (正常系: ライトモード)', async () => {
      await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'light');
      renderSettingsScreen();

      await waitFor(() => {
        const flattenedStyle = StyleSheet.flatten(
          screen.getByText(DELETE_BUTTON_LABEL).props.style,
        );
        expect(flattenedStyle.color).toBe(Colors.light.error);
      });
    });

    it('uses the dark theme error color (not the light-mode hardcoded value) when the theme preference is dark (正常系: ダークモード)', async () => {
      await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
      renderSettingsScreen();

      await waitFor(() => {
        const flattenedStyle = StyleSheet.flatten(
          screen.getByText(DELETE_BUTTON_LABEL).props.style,
        );
        expect(flattenedStyle.color).toBe(Colors.dark.error);
      });
      // ライトモード用の固定色が使われていないことも明示的に確認する
      const flattenedStyle = StyleSheet.flatten(screen.getByText(DELETE_BUTTON_LABEL).props.style);
      expect(flattenedStyle.color).not.toBe(Colors.light.error);
    });
  });
});
