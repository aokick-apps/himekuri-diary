import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import { Colors, Fonts } from '@/constants/theme';
import {
  DIARY_REMINDER_STORAGE_KEY,
  DiaryReminderProvider,
} from '@/contexts/diary-reminder-context';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedDiaryReminderNotifications = require('@/utils/diary-reminder-notifications') as {
  getReminderPermissionStatusAsync: jest.Mock;
  requestReminderPermissionAsync: jest.Mock;
  scheduleDailyReminderAsync: jest.Mock;
  cancelDailyReminderAsync: jest.Mock;
};

describe('リマインダーセクション(日記を書く習慣化のためのリマインダー通知)', () => {
  const REMINDER_SECTION_TITLE = 'リマインダー';
  const REMINDER_TOGGLE_LABEL = '日記リマインダー通知';
  const HOUR_DECREASE_LABEL = '時を減らす';
  const HOUR_INCREASE_LABEL = '時を増やす';
  const MINUTE_DECREASE_LABEL = '分を減らす';
  const MINUTE_INCREASE_LABEL = '分を増やす';
  const FALLBACK_TEXT =
    '通知が許可されていないため、リマインダーを利用できません。端末の設定からこのアプリの通知を許可してください。';
  const OFF_HINT_TEXT = 'リマインダーをONにすると、この時刻に通知します。';

  // `useDiaryReminder()`は`Provider`配下でない場合`setEnabled`/`setTime`がno-opにフォールバックする
  // 仕様(tests/contexts/diary-reminder-context.test.tsx参照)のため、実機と同じ構成を再現するために
  // 明示的に`DiaryReminderProvider`でラップする。
  function renderSettingsScreen() {
    return render(
      <DiaryReminderProvider>
        <SettingsScreen />
      </DiaryReminderProvider>,
    );
  }

  const originalPlatformOS = Platform.OS;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
      'undetermined',
    );
    mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue(
      'undetermined',
    );
    mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockResolvedValue(undefined);
    mockedDiaryReminderNotifications.cancelDailyReminderAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it('renders the "リマインダー" section with the toggle switch and time stepper, defaulting to OFF/21:00 (操作導線の存在確認・初期値)', async () => {
    renderSettingsScreen();

    expect(screen.getByText(REMINDER_SECTION_TITLE)).toBeTruthy();
    const toggle = screen.getByLabelText(REMINDER_TOGGLE_LABEL);
    expect(toggle.props.value).toBe(false);
    expect(screen.getByText('21')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();

    // 初期化の非同期更新が完了した合図(OFF時の案内文の表示)まで待ってから終える
    await screen.findByText(OFF_HINT_TEXT);
  });

  it('shows the shortened toggle row label text next to the switch (正常系: 折り返し対策後の文言)', async () => {
    renderSettingsScreen();

    expect(screen.getByText('毎日決まった時刻に通知する')).toBeTruthy();
    await screen.findByText(OFF_HINT_TEXT);
  });

  it('groups the hour stepper, colon separator, and minute stepper into a single row container, so the colon does not become isolated at a line-wrap boundary (境界値: レイアウト折り返し対策)', async () => {
    renderSettingsScreen();
    await screen.findByText(OFF_HINT_TEXT);

    const separator = screen.getByText(':');
    // ThemedText(合成コンポーネント)を2階層挟むため、実体のView(ThemedViewのホスト要素)は
    // 3階層上の祖先になる
    const group = separator.parent?.parent?.parent;
    expect(group).toBeTruthy();
    expect(StyleSheet.flatten(group!.props.style).flexDirection).toBe('row');
    expect(within(group!).getByLabelText(HOUR_DECREASE_LABEL)).toBeTruthy();
    expect(within(group!).getByLabelText(HOUR_INCREASE_LABEL)).toBeTruthy();
    expect(within(group!).getByLabelText(MINUTE_DECREASE_LABEL)).toBeTruthy();
    expect(within(group!).getByLabelText(MINUTE_INCREASE_LABEL)).toBeTruthy();
  });

  it('tightens the OFF hint text lineHeight so it does not look overly spaced at its small font size (境界値: 行間調整)', async () => {
    renderSettingsScreen();

    const hint = await screen.findByText(OFF_HINT_TEXT);
    expect(StyleSheet.flatten(hint.props.style).lineHeight).toBe(18);
  });

  it('requests OS permission, turns ON, and schedules the reminder when the toggle is pressed while permission is undetermined and the user grants it (正常系: 未確認から許可)', async () => {
    mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue('granted');
    renderSettingsScreen();

    await act(async () => {
      fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
    });

    expect(mockedDiaryReminderNotifications.requestReminderPermissionAsync).toHaveBeenCalledTimes(
      1,
    );
    await waitFor(() =>
      expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).toHaveBeenCalledWith(
        21,
        0,
      ),
    );
    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true);
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
  });

  it('shows the fallback message and keeps the toggle OFF when the user denies the permission request (異常系: 未確認から拒否)', async () => {
    mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue('denied');
    renderSettingsScreen();

    await act(async () => {
      fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
    });

    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
    await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());
    expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).not.toHaveBeenCalled();
  });

  it('shows the fallback message on mount when the permission is already denied at the OS level (正常系: 起動時点で拒否済み)', async () => {
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
    renderSettingsScreen();

    await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());
  });

  it('does not show the fallback message when permission is undetermined or granted (境界値: フォールバック非表示のケース)', async () => {
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    renderSettingsScreen();

    await waitFor(() =>
      expect(mockedDiaryReminderNotifications.getReminderPermissionStatusAsync).toHaveBeenCalled(),
    );
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
  });

  it('cancels the schedule and turns OFF when the toggle is pressed while ON (正常系: ON→OFF)', async () => {
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
    );
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
    );

    await act(async () => {
      fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', false);
    });

    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
    await waitFor(() =>
      expect(mockedDiaryReminderNotifications.cancelDailyReminderAsync).toHaveBeenCalledTimes(1),
    );
  });

  it('increases/decreases the hour by 1 via the time stepper, wrapping around 0-23 (正常系・境界値: 時のステッパー)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });
    expect(screen.getByText('22')).toBeTruthy();

    // 実機の連続タップは別々の(同期)イベントとして届き、都度再描画が挟まるため、
    // それぞれを個別の`act`で包んで1回ずつ確実に反映させる
    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_DECREASE_LABEL));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_DECREASE_LABEL));
    });
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('wraps the hour from 23 to 0 when increased past the maximum (境界値: 時の繰り上がり)', async () => {
    renderSettingsScreen();

    // 21時(既定値)から+3時間で0時に繰り上がることを確認する(21 -> 22 -> 23 -> 0)
    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });

    expect(screen.getByLabelText('時 00')).toBeTruthy();
  });

  it('renders the hour/minute values in the monospace font so the digit width stays stable while stepping (表示: 等幅フォント)', async () => {
    renderSettingsScreen();

    for (const label of ['時 21', '分 00']) {
      const value = await screen.findByLabelText(label);
      expect(StyleSheet.flatten(value.props.style).fontFamily).toBe(Fonts.mono);
    }
  });

  it('exposes the changed stepper value as a polite live region on Android without using the iOS announcement API', async () => {
    Platform.OS = 'android';
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    try {
      renderSettingsScreen();

      const initialHour = screen.getByLabelText('時 21');
      expect(initialHour.props.accessibilityLiveRegion).toBe('polite');
      expect(announceSpy).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
      });

      expect(screen.getByLabelText('時 22').props.accessibilityLiveRegion).toBe('polite');
      expect(announceSpy).not.toHaveBeenCalled();
    } finally {
      announceSpy.mockRestore();
    }
  });

  it('announces the changed stepper value on iOS without relying on the Android live region', async () => {
    Platform.OS = 'ios';
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    try {
      renderSettingsScreen();

      const initialHour = screen.getByLabelText('時 21');
      expect(initialHour.props.accessibilityLiveRegion).toBeUndefined();
      expect(announceSpy).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
      });

      expect(screen.getByLabelText('時 22').props.accessibilityLiveRegion).toBeUndefined();
      expect(announceSpy).toHaveBeenCalledWith('時 22');
    } finally {
      announceSpy.mockRestore();
    }
  });

  it('wraps the hour from 0 to 23 when decreased past the minimum (境界値: 時の繰り下がり)', async () => {
    renderSettingsScreen();

    // 21時(既定値)から-21時間で0時、さらに-1でと23時に繰り下がることを確認する
    for (let i = 0; i < 22; i += 1) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(HOUR_DECREASE_LABEL));
      });
    }

    expect(screen.getByText('23')).toBeTruthy();
  });

  it('increases/decreases the minute by 5 via the time stepper, wrapping around 0-59 (正常系・境界値: 分のステッパー)', async () => {
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(MINUTE_INCREASE_LABEL));
    });
    expect(screen.getByText('05')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(MINUTE_DECREASE_LABEL));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(MINUTE_DECREASE_LABEL));
    });
    // 0分から-5分で55分に繰り下がる
    expect(screen.getByText('55')).toBeTruthy();
  });

  describe('通知許可拒否時のTimeStepper無効化(境界値: permissionStatus)', () => {
    it('disables all four time stepper buttons (hour/minute, decrease/increase) when permission is denied at mount (異常系: 許可拒否時はボタン操作不可)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      renderSettingsScreen();

      await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());

      for (const label of [
        HOUR_INCREASE_LABEL,
        HOUR_DECREASE_LABEL,
        MINUTE_INCREASE_LABEL,
        MINUTE_DECREASE_LABEL,
      ]) {
        const button = screen.getByLabelText(label);
        expect(button.props.accessibilityState.disabled).toBe(true);
        // 操作できないことが見た目でも伝わるよう、半透明化(opacity: 0.4)されていることを確認する
        expect(StyleSheet.flatten(button.props.style).opacity).toBe(0.4);
      }
    });

    it('keeps all four time stepper buttons enabled when permission is granted (正常系: 許可済みの場合はボタン操作可能)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      renderSettingsScreen();

      await waitFor(() =>
        expect(
          mockedDiaryReminderNotifications.getReminderPermissionStatusAsync,
        ).toHaveBeenCalled(),
      );
      expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();

      for (const label of [
        HOUR_INCREASE_LABEL,
        HOUR_DECREASE_LABEL,
        MINUTE_INCREASE_LABEL,
        MINUTE_DECREASE_LABEL,
      ]) {
        const button = screen.getByLabelText(label);
        expect(button.props.accessibilityState.disabled).toBe(false);
        expect(StyleSheet.flatten(button.props.style).opacity).toBe(1);
      }
    });
  });

  // 通知未許可時のフォールバック文言の文字色も、削除ボタンと同様に
  // 固定のライトモード用エラー色ではなく、useThemeColor経由でライト/ダークそれぞれの
  // テーマに応じた色が適用されることを確認する。
  describe('ダークモード対応(フォールバック文言の文字色)', () => {
    // このブロックだけは配色切り替えの検証も必要なため、`DiaryReminderProvider`に加えて
    // `ThemePreferenceProvider`でもラップする(実機では`app/_layout.tsx`の`RootLayout`が
    // 両方でラップしている)。
    function renderSettingsScreenWithThemePreference() {
      return render(
        <ThemePreferenceProvider>
          <DiaryReminderProvider>
            <SettingsScreen />
          </DiaryReminderProvider>
        </ThemePreferenceProvider>,
      );
    }

    it('uses the light theme error color (not a hardcoded value) when the theme preference is light (正常系: ライトモード)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'light');
      renderSettingsScreenWithThemePreference();

      await waitFor(() => {
        const flattenedStyle = StyleSheet.flatten(screen.getByText(FALLBACK_TEXT).props.style);
        expect(flattenedStyle.color).toBe(Colors.light.error);
      });
    });

    it('uses the dark theme error color (not the light-mode hardcoded value) when the theme preference is dark (正常系: ダークモード)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
      renderSettingsScreenWithThemePreference();

      await waitFor(() => {
        const flattenedStyle = StyleSheet.flatten(screen.getByText(FALLBACK_TEXT).props.style);
        expect(flattenedStyle.color).toBe(Colors.dark.error);
      });
      // ライトモード用の固定色が使われていないことも明示的に確認する
      const flattenedStyle = StyleSheet.flatten(screen.getByText(FALLBACK_TEXT).props.style);
      expect(flattenedStyle.color).not.toBe(Colors.light.error);
    });
  });
});
