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

  describe('長押しでの連続増減(オートリピート)', () => {
    it('starts repeatedly increasing the hour after the button is held past the initial delay, then stops once released (正常系: 長押しでの連続増加と指を離した際の停止)', async () => {
      jest.useFakeTimers();
      try {
        renderSettingsScreen();
        const increaseButton = screen.getByLabelText(HOUR_INCREASE_LABEL);

        fireEvent(increaseButton, 'pressIn');

        // 長押し開始直後(初回リピートまでの遅延未満)はまだ増加しない
        await act(async () => {
          jest.advanceTimersByTime(499);
          await Promise.resolve();
        });
        expect(screen.getByText('21')).toBeTruthy();

        // 初回リピートの発火
        await act(async () => {
          jest.advanceTimersByTime(1);
          await Promise.resolve();
        });
        expect(screen.getByText('22')).toBeTruthy();

        // 以降は一定間隔で増加し続ける
        await act(async () => {
          jest.advanceTimersByTime(120);
          await Promise.resolve();
        });
        expect(screen.getByText('23')).toBeTruthy();

        fireEvent(increaseButton, 'pressOut');

        // 指を離した後はタイマーが止まり、それ以上時間が経過しても増加しない
        await act(async () => {
          jest.advanceTimersByTime(1000);
          await Promise.resolve();
        });
        expect(screen.getByText('23')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not decrease the value an extra time via the subsequent onPress once auto-repeat has already fired for a long press (境界値: 長押し後のonPressによる二重発火防止)', async () => {
      jest.useFakeTimers();
      try {
        renderSettingsScreen();
        const decreaseButton = screen.getByLabelText(HOUR_DECREASE_LABEL);

        fireEvent(decreaseButton, 'pressIn');
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });
        expect(screen.getByText('20')).toBeTruthy();

        fireEvent(decreaseButton, 'pressOut');
        // 実機では指を離した後にonPressも届くが、長押しで既に減算済みのため無視される
        fireEvent(decreaseButton, 'press');

        expect(screen.getByText('20')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('still increases the value exactly once for a quick tap that is released before the auto-repeat delay elapses (正常系: 通常のタップは単発増加のまま)', async () => {
      jest.useFakeTimers();
      try {
        renderSettingsScreen();
        const increaseButton = screen.getByLabelText(MINUTE_INCREASE_LABEL);

        fireEvent(increaseButton, 'pressIn');
        fireEvent(increaseButton, 'pressOut');
        fireEvent(increaseButton, 'press');

        expect(screen.getByText('05')).toBeTruthy();

        // 既にpressOutでタイマーが止まっているため、その後時間が経過しても増加しない
        await act(async () => {
          jest.advanceTimersByTime(2000);
          await Promise.resolve();
        });
        expect(screen.getByText('05')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('stops the pending auto-repeat timer on unmount so no state update on an unmounted component is attempted (アンマウント時のクリーンアップ)', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { unmount } = renderSettingsScreen();
        const increaseButton = screen.getByLabelText(HOUR_INCREASE_LABEL);

        fireEvent(increaseButton, 'pressIn');
        unmount();

        // アンマウント前に長押し開始しているため、クリーンアップされていなければ
        // ここでアンマウント済みコンポーネントへのstate更新が発生してしまう
        act(() => {
          jest.advanceTimersByTime(5000);
        });

        expect(consoleErrorSpy).not.toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('wraps the hour from 23 to 0 while continuing to hold the button through multiple auto-repeat ticks (境界値: 長押し中の時の繰り上がり)', async () => {
      jest.useFakeTimers();
      try {
        renderSettingsScreen();
        const increaseButton = screen.getByLabelText(HOUR_INCREASE_LABEL);

        // 分の初期値も"00"のため、時が繰り上がって"00"になった際にgetByTextが一意に定まらなく
        // ならないよう、あらかじめ分を動かしておく
        await act(async () => {
          fireEvent.press(screen.getByLabelText(MINUTE_INCREASE_LABEL));
        });
        expect(screen.getByText('05')).toBeTruthy();

        // 21時(既定値)から長押しを離さずに保持し続け、初回リピート(500ms)以降120ms間隔で
        // 22 -> 23 -> 0 と繰り上がることを確認する
        fireEvent(increaseButton, 'pressIn');
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });
        expect(screen.getByText('22')).toBeTruthy();

        await act(async () => {
          jest.advanceTimersByTime(120);
          await Promise.resolve();
        });
        expect(screen.getByText('23')).toBeTruthy();

        await act(async () => {
          jest.advanceTimersByTime(120);
          await Promise.resolve();
        });
        expect(screen.getByText('00')).toBeTruthy();

        fireEvent(increaseButton, 'pressOut');
      } finally {
        jest.useRealTimers();
      }
    });

    it('wraps the minute from 0 to 55 while continuing to hold the decrease button through auto-repeat (境界値: 長押し中の分の繰り下がり)', async () => {
      jest.useFakeTimers();
      try {
        renderSettingsScreen();
        const decreaseButton = screen.getByLabelText(MINUTE_DECREASE_LABEL);

        // 0分(既定値)から長押しで-5分し、55分に繰り下がることを確認する
        fireEvent(decreaseButton, 'pressIn');
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });
        expect(screen.getByText('55')).toBeTruthy();

        fireEvent(decreaseButton, 'pressOut');
      } finally {
        jest.useRealTimers();
      }
    });

    it('suspends further auto-repeat ticks while the previous time change is still pending, then resumes once it settles (異常系: 非同期処理中のオートリピート抑制)', async () => {
      jest.useFakeTimers();
      // isTimePendingによる抑制が機能する前提条件として、リマインダーがONかつ通知許可済みで
      // 実際にscheduleDailyReminderAsyncが呼ばれる(=Promiseが未解決のままになりうる)状態にする
      mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue(
        'granted',
      );
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
      let resolvePendingSchedule: (() => void) | undefined;
      mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          resolvePendingSchedule = resolve;
        }),
      );
      try {
        renderSettingsScreen();
        await waitFor(() =>
          expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
        );
        const increaseButton = screen.getByLabelText(HOUR_INCREASE_LABEL);

        fireEvent(increaseButton, 'pressIn');
        // 初回リピートの発火。setTime(内部のscheduleDailyReminderAsync)が未解決のまま
        // isTimePendingがtrueになり、TimeStepperのdisabledに伝播する
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });
        expect(screen.getByText('22')).toBeTruthy();
        expect(increaseButton.props.accessibilityState.disabled).toBe(true);

        // 非同期処理が未解決の間はインターバルが発火しても値を進めない
        await act(async () => {
          jest.advanceTimersByTime(120);
          await Promise.resolve();
        });
        expect(screen.getByText('22')).toBeTruthy();

        // 非同期処理が解決すると再度有効になり、以降のインターバルで増加を再開する
        mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockResolvedValue(undefined);
        await act(async () => {
          resolvePendingSchedule?.();
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(increaseButton.props.accessibilityState.disabled).toBe(false);

        await act(async () => {
          jest.advanceTimersByTime(120);
          await Promise.resolve();
        });
        expect(screen.getByText('23')).toBeTruthy();

        fireEvent(increaseButton, 'pressOut');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('re-schedules the reminder with the new time via AsyncStorage persistence when ON and permission is granted (正常系: 通知許可済みでの時刻変更)', async () => {
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
    );
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
    );
    jest.clearAllMocks();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });

    await waitFor(() =>
      expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).toHaveBeenCalledWith(
        22,
        0,
      ),
    );
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 22, minute: 0 }),
      ),
    );
  });

  it('disables the toggle and time steppers while the ON/OFF switch is being processed, to prevent duplicate taps (境界値: 連続タップ防止)', async () => {
    // `setEnabled`が完了するまで解決しないPromiseにして、処理中の一瞬の状態を検証する
    let resolveRequestPermission: (status: string) => void = () => {};
    mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveRequestPermission = resolve;
      }),
    );
    renderSettingsScreen();

    act(() => {
      fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
    });

    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.disabled).toBe(true);
    // Switch(RCTSwitch)は`disabled`propをそのまま持つが、`Pressable`ベースのステッパーボタンは
    // `accessibilityState.disabled`として反映される
    expect(screen.getByLabelText(HOUR_INCREASE_LABEL).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(MINUTE_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
      true,
    );

    await act(async () => {
      resolveRequestPermission('granted');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.disabled).toBe(false);
    expect(screen.getByLabelText(HOUR_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('shows a failure alert and reverts the toggle to OFF when scheduling the reminder fails even though permission is granted (異常系: 通知登録失敗時のフィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedDiaryReminderNotifications.requestReminderPermissionAsync.mockResolvedValue('granted');
    mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockRejectedValue(
      new Error('schedule error'),
    );
    renderSettingsScreen();

    await act(async () => {
      fireEvent(screen.getByLabelText(REMINDER_TOGGLE_LABEL), 'valueChange', true);
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'リマインダーの設定に失敗しました',
        '通知を設定できませんでした。もう一度お試しください。',
      ),
    );
    // 通知の登録に失敗しているため、見た目上もONに確定させずOFFへ戻す
    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
    // 連続タップ防止用の無効化状態も、失敗を経て正しく解除されている
    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.disabled).toBe(false);
  });

  it('shows a failure alert and reverts the toggle to OFF when re-scheduling fails after changing the time via the hour stepper (異常系: 時刻変更(時)時の通知登録失敗時のフィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
    );
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
    );
    mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockRejectedValue(
      new Error('schedule error'),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'リマインダー時刻の変更に失敗しました',
        '新しい時刻を通知に反映できませんでした。もう一度お試しください。',
      ),
    );
    // 選択した時刻自体は変更後の値のまま維持される
    expect(screen.getByText('22')).toBeTruthy();
    // 通知の再スケジュールに失敗しているため、トグルの見た目もOFFへ戻る
    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
  });

  it('shows a failure alert and reverts the toggle to OFF when re-scheduling fails after changing the time via the minute stepper (異常系: 時刻変更(分)時の通知登録失敗時のフィードバック)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedDiaryReminderNotifications.getReminderPermissionStatusAsync.mockResolvedValue('granted');
    await AsyncStorage.setItem(
      DIARY_REMINDER_STORAGE_KEY,
      JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
    );
    renderSettingsScreen();
    await waitFor(() =>
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(true),
    );
    mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockRejectedValue(
      new Error('schedule error'),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText(MINUTE_INCREASE_LABEL));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'リマインダー時刻の変更に失敗しました',
        '新しい時刻を通知に反映できませんでした。もう一度お試しください。',
      ),
    );
    // 選択した時刻自体は変更後の値のまま維持される
    expect(screen.getByText('05')).toBeTruthy();
    // 通知の再スケジュールに失敗しているため、トグルの見た目もOFFへ戻る
    expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.value).toBe(false);
  });

  describe('時刻変更中の連続タップ防止(isTimePending)', () => {
    it('disables both the hour and minute stepper buttons (increase/decrease) while the time change is being scheduled, then re-enables them once it settles (境界値: 時刻変更中の連続タップ防止)', async () => {
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
      // `scheduleDailyReminderAsync`が完了するまで解決しないPromiseにして、処理中の一瞬の状態を検証する
      let resolveSchedule: (value?: void | PromiseLike<void>) => void = () => {};
      mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockReturnValue(
        new Promise((resolve) => {
          resolveSchedule = resolve;
        }),
      );

      act(() => {
        fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
      });

      expect(screen.getByLabelText(HOUR_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );
      expect(screen.getByLabelText(HOUR_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );
      expect(screen.getByLabelText(MINUTE_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );
      expect(screen.getByLabelText(MINUTE_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );
      // トグル自体は`isTogglePending`のみに連動するため、時刻変更中でも無効化されない
      expect(screen.getByLabelText(REMINDER_TOGGLE_LABEL).props.disabled).toBe(false);

      await act(async () => {
        resolveSchedule();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByLabelText(HOUR_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
        false,
      );
      expect(screen.getByLabelText(HOUR_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        false,
      );
      expect(screen.getByLabelText(MINUTE_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
        false,
      );
      expect(screen.getByLabelText(MINUTE_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        false,
      );
    });

    it('re-enables the stepper buttons via the finally handler even when re-scheduling fails after a minute change (異常系: 時刻変更失敗時もpending状態が解除される)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
      let rejectSchedule: (error: Error) => void = () => {};
      mockedDiaryReminderNotifications.scheduleDailyReminderAsync.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectSchedule = reject;
        }),
      );

      act(() => {
        fireEvent.press(screen.getByLabelText(MINUTE_INCREASE_LABEL));
      });

      expect(screen.getByLabelText(MINUTE_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );
      expect(screen.getByLabelText(MINUTE_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        true,
      );

      await act(async () => {
        rejectSchedule(new Error('schedule error'));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByLabelText(MINUTE_INCREASE_LABEL).props.accessibilityState.disabled).toBe(
          false,
        ),
      );
      expect(screen.getByLabelText(MINUTE_DECREASE_LABEL).props.accessibilityState.disabled).toBe(
        false,
      );
      // 失敗時もエラー案内自体は既存の異常系テストで検証済みだが、ここではpending解除の
      // 副作用として発火することも合わせて確認する
      expect(Alert.alert).toHaveBeenCalledWith(
        'リマインダー時刻の変更に失敗しました',
        '新しい時刻を通知に反映できませんでした。もう一度お試しください。',
      );
    });
  });

  it('does not show a failure alert when changing the time while OFF, since no re-scheduling is attempted (境界値: OFF状態での時刻変更は失敗しようがない)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderSettingsScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(HOUR_INCREASE_LABEL));
    });

    expect(screen.getByText('22')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockedDiaryReminderNotifications.scheduleDailyReminderAsync).not.toHaveBeenCalled();
  });
});
