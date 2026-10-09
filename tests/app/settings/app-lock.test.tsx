import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import { AppLockProvider } from '@/contexts/app-lock-context';

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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedAppLockAuthentication = require('@/utils/app-lock-authentication') as {
  isAppLockSupportedAsync: jest.Mock;
  authenticateForAppLockAsync: jest.Mock;
};

describe('アプリロックセクション(生体認証によるアプリロック)', () => {
  const APP_LOCK_SECTION_TITLE = 'アプリロック';
  const APP_LOCK_TOGGLE_LABEL = 'アプリロック';
  const UNSUPPORTED_TEXT =
    'この端末では生体認証・パスコードが設定されていないため、アプリロックを利用できません。';

  // `useAppLock()`は`Provider`配下でない場合`setEnabled`がno-opにフォールバックする仕様
  // (tests/contexts/app-lock-context.test.tsx参照)のため、実機と同じ構成を再現するために
  // 明示的に`AppLockProvider`でラップする。
  function renderSettingsScreen() {
    return render(
      <AppLockProvider>
        <SettingsScreen />
      </AppLockProvider>,
    );
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockedAppLockAuthentication.isAppLockSupportedAsync.mockResolvedValue(true);
    mockedAppLockAuthentication.authenticateForAppLockAsync.mockResolvedValue(true);
  });

  it('renders the "アプリロック" section with the toggle, defaulting to OFF (操作導線の存在確認・初期値)', async () => {
    renderSettingsScreen();

    expect(screen.getByText(APP_LOCK_SECTION_TITLE)).toBeTruthy();
    const toggle = screen.getByLabelText(APP_LOCK_TOGGLE_LABEL);
    expect(toggle.props.value).toBe(false);
    // 対応端末かどうかの判定が完了するまでは無効化されているため、明示的に待つ
    await waitFor(() => expect(toggle.props.disabled).toBe(false));
  });

  it('persists ON via AsyncStorage when the toggle is pressed on a supported device (正常系: ON)', async () => {
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(false),
    );

    await act(async () => {
      fireEvent(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL), 'valueChange', true);
    });

    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.value).toBe(true);
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('app-lock-enabled', 'true'),
    );
  });

  it('persists OFF via AsyncStorage when the toggle is pressed while ON (正常系: ON→OFF)', async () => {
    await AsyncStorage.setItem('app-lock-enabled', 'true');
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.value).toBe(true),
    );

    await act(async () => {
      fireEvent(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL), 'valueChange', false);
    });

    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.value).toBe(false);
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('app-lock-enabled', 'false'),
    );
  });

  it('disables the toggle and shows the unsupported message when the device has no biometrics/passcode enrolled (異常系: 非対応端末)', async () => {
    mockedAppLockAuthentication.isAppLockSupportedAsync.mockResolvedValue(false);
    renderSettingsScreen();

    await waitFor(() => expect(screen.getByText(UNSUPPORTED_TEXT)).toBeTruthy());
    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(true);
  });

  it('does not show the unsupported message on a supported device (境界値: 対応端末では非表示)', async () => {
    renderSettingsScreen();

    await waitFor(() =>
      expect(mockedAppLockAuthentication.isAppLockSupportedAsync).toHaveBeenCalled(),
    );
    expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
  });

  it('disables the toggle while the ON/OFF switch is being persisted, to prevent duplicate taps (境界値: 連続タップ防止)', async () => {
    let resolveSetItem: () => void = () => {};
    // `mockReturnValue`(永続的な上書き)ではなく`mockReturnValueOnce`を使う。前者だと
    // `jest.clearAllMocks()`(呼び出し履歴のクリアのみで実装はクリアされない)では戻らず、
    // 後続テストにまで「setItemが永遠に解決しないPromise」が漏れてしまう
    // (tests/contexts/diary-reminder-context.test.tsxの同種の注意書きを参照)。
    jest.spyOn(AsyncStorage, 'setItem').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSetItem = () => resolve(undefined);
      }),
    );
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(false),
    );

    act(() => {
      fireEvent(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL), 'valueChange', true);
    });

    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(true);

    await act(async () => {
      resolveSetItem();
      await Promise.resolve();
    });

    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(false);
  });

  it('restores a previously saved ON setting from AsyncStorage on mount (正常系: 起動時の復元)', async () => {
    await AsyncStorage.setItem('app-lock-enabled', 'true');

    renderSettingsScreen();

    await waitFor(() =>
      expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.value).toBe(true),
    );
  });

  // 永続化失敗時にスイッチの表示がONのまま(実際には保存されていない)にならず、
  // かつ未処理のPromise rejectionが発生しないことを確認する。
  // リマインダーセクションの同種テスト(異常系: 通知登録失敗時のフィードバック)と
  // 同じパターン・粒度で検証する。
  it('shows a failure alert and reverts the toggle to OFF when AsyncStorage.setItem fails (異常系: 永続化失敗時のロールバック・フィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage write error'));
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(false),
    );

    await act(async () => {
      fireEvent(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL), 'valueChange', true);
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'アプリロックの設定に失敗しました',
        '設定を保存できませんでした。もう一度お試しください。',
      ),
    );
    // 永続化に失敗しているため、見た目上もONに確定させず呼び出し前のOFFへ戻す
    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.value).toBe(false);
    // 連続タップ防止用の無効化状態も、失敗を経て正しく解除されている
    expect(screen.getByLabelText(APP_LOCK_TOGGLE_LABEL).props.disabled).toBe(false);
  });
});
