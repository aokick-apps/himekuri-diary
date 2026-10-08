import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import {
  THEME_PREFERENCE_STORAGE_KEY,
  ThemePreferenceProvider,
} from '@/contexts/theme-preference-context';

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

describe('外観セクション(ライト/ダーク/端末に合わせるの切り替え)', () => {
  const APPEARANCE_SECTION_TITLE = '外観';
  const LIGHT_LABEL = 'ライト';
  const DARK_LABEL = 'ダーク';
  const SYSTEM_LABEL = '端末に合わせる';

  // `useThemePreference()`は`Provider`配下でない場合`setPreference`がno-opにフォールバックする
  // 仕様(tests/contexts/theme-preference-context.test.tsx参照)のため、実機と同じ構成を再現するために
  // 明示的に`ThemePreferenceProvider`でラップする。
  function renderSettingsScreen() {
    return render(
      <ThemePreferenceProvider>
        <SettingsScreen />
      </ThemePreferenceProvider>,
    );
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the "外観" section with all 3 choices (ライト/ダーク/端末に合わせる) (操作導線の存在確認)', () => {
    renderSettingsScreen();

    expect(screen.getByText(APPEARANCE_SECTION_TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: LIGHT_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: DARK_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: SYSTEM_LABEL })).toBeTruthy();
  });

  it('selects "端末に合わせる" by default when nothing has been saved yet (正常系: 既定の選択状態)', () => {
    renderSettingsScreen();

    expect(screen.getByRole('button', { name: SYSTEM_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: LIGHT_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByRole('button', { name: DARK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('calls setPreference("light") (persists to AsyncStorage) and marks "ライト" as selected when pressed (正常系)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: LIGHT_LABEL }));
    });

    expect(screen.getByRole('button', { name: LIGHT_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: DARK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByRole('button', { name: SYSTEM_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'light'),
    );
  });

  it('calls setPreference("dark") (persists to AsyncStorage) and marks "ダーク" as selected when pressed (正常系)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: DARK_LABEL }));
    });

    expect(screen.getByRole('button', { name: DARK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: LIGHT_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'dark'),
    );
  });

  it('switches selection back to "端末に合わせる" (system) when pressed after choosing an explicit theme (正常系: 端末に合わせるへの再切り替え)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: LIGHT_LABEL }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: SYSTEM_LABEL }));
    });

    expect(screen.getByRole('button', { name: SYSTEM_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: LIGHT_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'system'),
    );
  });

  it('reflects a preference that was already saved in AsyncStorage as the selected choice on mount (正常系: 起動時の復元)', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');

    renderSettingsScreen();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: DARK_LABEL }).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      ),
    );
    expect(screen.getByRole('button', { name: SYSTEM_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('ignores an invalid value stored in AsyncStorage and keeps the default "端末に合わせる" selected (境界値: 不正な保存値)', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'not-a-valid-preference');

    renderSettingsScreen();

    // 不正値のため読み込みが完了しても既定値のままである(意図的にawaitで少し待ってから確認する)
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: SYSTEM_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('keeps "ライト" selected in the UI (does not crash) even when AsyncStorage.setItem rejects (異常系: 保存失敗)', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage write error'));

    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: LIGHT_LABEL }));
    });

    // 保存(永続化)に失敗しても、目の前の選択状態(見た目)は更新されたまま
    expect(screen.getByRole('button', { name: LIGHT_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
