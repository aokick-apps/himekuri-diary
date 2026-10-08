import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import {
  CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY,
  CalendarLayoutPreferenceProvider,
} from '@/contexts/calendar-layout-preference-context';

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

describe('カレンダー表示レイアウトセクション(月表示/週表示の切り替え)', () => {
  const SECTION_TITLE = 'カレンダー表示レイアウト';
  const MONTH_LABEL = '月表示';
  const WEEK_LABEL = '週表示';

  // useCalendarLayoutPreference()はProvider配下でない場合setLayoutがno-opにフォールバックする仕様
  // (tests/contexts/calendar-layout-preference-context.test.tsx参照)のため、実機と同じ構成を
  // 再現するために明示的にCalendarLayoutPreferenceProviderでラップする(外観セクションのテストと同じ方針)。
  function renderSettingsScreen() {
    return render(
      <CalendarLayoutPreferenceProvider>
        <SettingsScreen />
      </CalendarLayoutPreferenceProvider>,
    );
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the "カレンダー表示レイアウト" section with both choices (月表示/週表示) (操作導線の存在確認)', () => {
    renderSettingsScreen();

    expect(screen.getByText(SECTION_TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: MONTH_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: WEEK_LABEL })).toBeTruthy();
  });

  it('selects "月表示" by default when nothing has been saved yet (正常系: 既定の選択状態)', () => {
    renderSettingsScreen();

    expect(screen.getByRole('button', { name: MONTH_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: WEEK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('calls setLayout("week") (persists to AsyncStorage) and marks "週表示" as selected when pressed (正常系)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: WEEK_LABEL }));
    });

    expect(screen.getByRole('button', { name: WEEK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: MONTH_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY,
        'week',
      ),
    );
  });

  it('switches selection back to "月表示" when pressed after choosing "週表示" (正常系: 月表示への再切り替え)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: WEEK_LABEL }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: MONTH_LABEL }));
    });

    expect(screen.getByRole('button', { name: MONTH_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: WEEK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY,
        'month',
      ),
    );
  });

  it('reflects a layout that was already saved in AsyncStorage as the selected choice on mount (正常系: 起動時の復元/設定の永続化)', async () => {
    await AsyncStorage.setItem(CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY, 'week');

    renderSettingsScreen();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: WEEK_LABEL }).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      ),
    );
    expect(screen.getByRole('button', { name: MONTH_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('ignores an invalid value stored in AsyncStorage and keeps the default "月表示" selected (境界値: 不正な保存値)', async () => {
    await AsyncStorage.setItem(CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY, 'not-a-valid-layout');

    renderSettingsScreen();

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: MONTH_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('keeps "週表示" selected in the UI (does not crash) even when AsyncStorage.setItem rejects (異常系: 保存失敗)', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage write error'));

    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: WEEK_LABEL }));
    });

    // 保存(永続化)に失敗しても、目の前の選択状態(見た目)は更新されたまま
    expect(screen.getByRole('button', { name: WEEK_LABEL }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
