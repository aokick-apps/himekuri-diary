/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import HomeScreen from '@/app/(tabs)/index';
import {
  mockNotificationAsync,
  INPUT_PLACEHOLDER,
  waitForInitialLoad,
  setupHomeScreenLifecycle,
} from '../../helpers/home-screen-test-utils';

jest.mock('expo-router', () => require('../../helpers/home-screen-mocks').createExpoRouterMock());
jest.mock('expo-crypto', () => require('../../helpers/home-screen-mocks').createExpoCryptoMock());
jest.mock('expo-haptics', () => require('../../helpers/home-screen-mocks').createExpoHapticsMock());
jest.mock('expo-secure-store', () =>
  require('../../helpers/home-screen-mocks').createExpoSecureStoreMock(),
);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../helpers/home-screen-mocks').createAsyncStorageMock(),
);
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () =>
  require('../../helpers/home-screen-mocks').createKeyboardAvoidingViewMock(),
);

describe('HomeScreen', () => {
  setupHomeScreenLifecycle();

  describe('保存成功時のフィードバック', () => {
    // 実装はハプティックを`process.env.EXPO_OS === 'ios'`の条件下でのみ発火させるが、
    // `process.env.EXPO_OS`はbabel-preset-expo(jest-expoのデフォルトで'ios'固定)によって
    // ビルド時にインライン化されるため、テスト実行中に書き換えても分岐には反映されない。
    // そのため、常にiOS相当として振る舞う状態でのハプティック発火のみを検証する。
    it('shows a toast with a success message, exposed via accessibilityLiveRegion="polite", after a successful save', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(screen.queryByText('保存しました')).toBeNull();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '通知確認用の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());

      const toastMessage = await screen.findByText('保存しました');
      expect(toastMessage).toBeTruthy();
      const toast = screen.getByTestId('save-toast');
      expect(toast.props.accessibilityLiveRegion).toBe('polite');
    });

    it('automatically hides the success toast after a few seconds', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '自動的に消える日記');
        fireEvent.press(screen.getByText('保存'));

        await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
        expect(await screen.findByText('保存しました')).toBeTruthy();

        act(() => {
          jest.advanceTimersByTime(3000);
        });

        await waitFor(() => expect(screen.queryByText('保存しました')).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });

    it('still hides the toast after ~2.5s even if the user keeps editing the input while it is shown (onHide must be a stable callback, not recreated on every render)', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, '自動的に消えるはずの日記');
        fireEvent.press(screen.getByText('保存'));

        await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
        expect(await screen.findByText('保存しました')).toBeTruthy();

        // トースト表示中に入力を続けHomeScreenを再レンダーさせる。onHideが毎レンダーで
        // 再生成される実装だと、SaveToast側のuseEffectが再実行され続けタイマーが張り直されてしまう。
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        fireEvent.changeText(input, '続');
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        fireEvent.changeText(input, '続けて入力中');

        // 最初にトーストが表示されてから合計2.5秒経過した時点(トースト表示中の編集を挟んでも)
        // で自動的に消えることを確認する
        act(() => {
          jest.advanceTimersByTime(600);
        });

        await waitFor(() => expect(screen.queryByText('保存しました')).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });

    it('hides the toast ~2.5s after it was first shown, even if the user saves another entry (without dismissing it first) while it is still visible', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);

        // 1件目を保存し、トーストを表示させる
        fireEvent.changeText(input, '1件目の日記');
        fireEvent.press(screen.getByText('保存'));
        await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('保存しました')).toBeTruthy();

        // トーストがまだ消えていない(2.5秒経過前の)タイミングで、消さずに続けて2件目を保存する
        // (このアプリの保存成功メッセージは常に固定文言のため、setSaveToastMessageに渡す値自体は
        // 変わらないが、保存に伴うHomeScreenの再レンダー自体は発生する)
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        fireEvent.changeText(input, '2件目の日記');
        fireEvent.press(screen.getByText('保存'));
        await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
        expect(screen.getByText('保存しました')).toBeTruthy();

        // 最初にトーストが表示されてから合計2.5秒経過した時点で、2件目の保存を挟んでいても
        // 意図通り自動的に消える(onHideが安定した参照であるため、保存に伴う再レンダーで
        // タイマーが余計に張り直されない)
        act(() => {
          jest.advanceTimersByTime(1600);
        });
        await waitFor(() => expect(screen.queryByText('保存しました')).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });

    it('triggers a success haptic notification (Haptics.notificationAsync) after a successful save', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), 'ハプティック確認用');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
      await waitFor(() =>
        expect(mockNotificationAsync).toHaveBeenCalledWith(
          Haptics.NotificationFeedbackType.Success,
        ),
      );
    });

    it('does not show the success toast or trigger a haptic notification when the save fails', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write failed'));

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '失敗するはずの日記');
      fireEvent.press(screen.getByText('保存'));

      expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeTruthy();
      expect(screen.queryByText('保存しました')).toBeNull();
      expect(mockNotificationAsync).not.toHaveBeenCalled();
    });
  });
});
