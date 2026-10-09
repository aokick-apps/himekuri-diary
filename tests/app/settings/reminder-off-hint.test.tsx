import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import {
  DIARY_REMINDER_STORAGE_KEY,
  DiaryReminderProvider,
} from '@/contexts/diary-reminder-context';

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

  describe('リマインダーOFF時の時刻変更に関する案内', () => {
    it('shows the OFF hint while the reminder is OFF and keeps the time steppers operable (正常系: OFF時は案内を表示し、時刻はONにする前に決められる)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      renderSettingsScreen();

      await waitFor(() => expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy());
      for (const label of [
        HOUR_INCREASE_LABEL,
        HOUR_DECREASE_LABEL,
        MINUTE_INCREASE_LABEL,
        MINUTE_DECREASE_LABEL,
      ]) {
        expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(false);
      }
    });

    it('does not show the OFF hint on the first render, and shows it only after the permission status has been loaded while OFF (境界値: 初回描画時は案内を保留)', async () => {
      let resolvePermission!: (status: 'granted') => void;
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockReturnValue(
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
      );
      renderSettingsScreen();

      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();

      await act(async () => {
        resolvePermission('granted');
      });

      await waitFor(() => expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy());
    });

    it('does not show the OFF hint before the saved ON setting has been restored, and never shows it once restored (境界値: 保存済みONの復元完了前は案内を出さない)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      let resolveStorage!: (value: string | null) => void;
      jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(
        new Promise<string | null>((resolve) => {
          resolveStorage = resolve;
        }),
      );
      renderSettingsScreen();

      await waitFor(() =>
        expect(
          mockedDiaryReminderNotifications.getReminderPermissionStatusAsync,
        ).toHaveBeenCalled(),
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();

      await act(async () => {
        resolveStorage(JSON.stringify({ enabled: true, hour: 21, minute: 0 }));
      });

      await waitFor(() =>
        expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
      );
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('does not show the OFF hint at any point while mounting with a stored ON setting and granted permission (境界値: 保存済みON×許可済みの起動で誤表示しない)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
      renderSettingsScreen();

      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
      await waitFor(() =>
        expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
      );
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('does not show the OFF hint while the reminder is ON (境界値: ON時は案内を表示しない)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
      renderSettingsScreen();

      await waitFor(() =>
        expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
      );
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('shows only the permission fallback message, not the OFF hint, when permission is denied (境界値: 許可拒否時は既存の案内のみ)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      renderSettingsScreen();

      await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('hides the hint when the toggle is turned ON and shows it again when turned OFF (正常系: トグル操作に追従する)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      renderSettingsScreen();
      await waitFor(() => expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy());

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
      });
      await waitFor(() => expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull());

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', false);
      });
      await waitFor(() => expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy());
    });

    it('schedules the reminder with the time chosen while OFF once the toggle is turned ON (正常系: OFFのうちに決めた時刻でONにできる)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      renderSettingsScreen();
      await waitFor(() => expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy());

      await act(async () => {
        fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
      });
      expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
      });

      await waitFor(() =>
        expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).toHaveBeenCalledWith(
          22,
          0,
        ),
      );
    });

    it('shows the OFF hint (and no permission fallback) once permission is confirmed as granted while OFF (正常系: 許可済み×OFF)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      renderSettingsScreen();
      // 許可状態の取得完了後の表示を検証するため、非同期の初期化を流し切る
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy();
      expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
    });

    it('shows the OFF hint (and no permission fallback) while permission is still undetermined and OFF (正常系: 未確認×OFF)', async () => {
      renderSettingsScreen();
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy();
      expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
    });

    it('shows only the permission fallback message when a stored ON setting is corrected to OFF because permission is denied (境界値: 保存済みONだが許可拒否)', async () => {
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
      renderSettingsScreen();

      await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('swaps the OFF hint for the permission fallback message (never showing both) when the user denies the permission request while turning ON (異常系: 未確認からONを試みて拒否)', async () => {
      mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue('denied');
      renderSettingsScreen();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy();
      expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
      });

      await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy());
      expect(screen.queryByText(OFF_HINT_TEXT)).toBeNull();
    });

    it('shows the OFF hint again after turning ON fails to schedule and the toggle reverts to OFF (異常系: ON時の通知登録失敗でOFFへ戻った場合)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockRejectedValue(
        new Error('schedule error'),
      );
      renderSettingsScreen();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
      });

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
      expect(screen.getByText(OFF_HINT_TEXT)).toBeTruthy();
    });

    it('schedules with the hour and minute chosen while OFF when turning ON after the user grants the permission request (正常系: 未確認×OFFで決めた時刻でONにする)', async () => {
      mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue('granted');
      renderSettingsScreen();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.press(screen.getByLabelText(HOUR_DECREASE_LABEL));
      });
      await act(async () => {
        fireEvent.press(screen.getByLabelText(MINUTE_INCREASE_LABEL));
      });
      expect(screen.getByText('20')).toBeTruthy();
      expect(screen.getByText('05')).toBeTruthy();
      expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
      });

      await waitFor(() =>
        expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).toHaveBeenCalledWith(
          20,
          5,
        ),
      );
      expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).toHaveBeenCalledTimes(1);
      expect(await AsyncStorage.getItem(DIARY_REMINDER_STORAGE_KEY)).toBe(
        JSON.stringify({ enabled: true, hour: 20, minute: 5 }),
      );
    });
  });

  it('restores a previously saved ON/time setting from AsyncStorage on mount (正常系: 起動時の復元)', async () => {
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 6, minute: 30 }),
    );

    renderSettingsScreen();

    await waitFor(() =>
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
    );
    expect(screen.getByText('06')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });
});
