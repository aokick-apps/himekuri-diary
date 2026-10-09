import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { DIARY_REMINDER_STORAGE_KEY, useDiaryReminder } from '@/contexts/diary-reminder-context';

import {
  mockedNotificationsUtil,
  resetDiaryReminderTestState,
  wrapper,
} from '../helpers/diary-reminder-test-helpers';

// ネイティブの`AsyncStorage`モジュールはJest環境では利用できないため、公式のインメモリモックに差し替える
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// コンテキストの状態管理・永続化ロジックを検証するため、expo-notificationsの薄いラッパーごとモック化する
jest.mock('@/utils/diary-reminder-notifications', () => ({
  getReminderPermissionStatusAsync: jest.fn(),
  requestReminderPermissionAsync: jest.fn(),
  scheduleDailyReminderAsync: jest.fn(() => Promise.resolve()),
  cancelDailyReminderAsync: jest.fn(() => Promise.resolve()),
}));

describe('DiaryReminderProvider / useDiaryReminder', () => {
  beforeEach(async () => {
    await resetDiaryReminderTestState();
  });

  describe('setTime', () => {
    it('persists the new time immediately (正常系: OFF状態での時刻変更は再スケジュールしない)', async () => {
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setTime(7, 15);
      });

      expect(result.current.hour).toBe(7);
      expect(result.current.minute).toBe(15);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: false, hour: 7, minute: 15 }),
      );
      // OFFのままなので再スケジュールは発生しない
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('re-schedules the reminder with the new time when enabled and permission is granted (正常系: ON状態での時刻変更)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      jest.clearAllMocks();

      await act(async () => {
        result.current.setTime(6, 5);
        await Promise.resolve();
      });

      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledWith(6, 5);
    });

    it('does not re-schedule when enabled but permission is not granted (境界値: ON扱いだが権限未許可)', async () => {
      // AsyncStorageの復元によって、通知許可が無い状態でもenabled=trueが復元されうる
      // (例: 端末のOS設定で後から通知をオフにされたケース)ことを想定する
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('denied');
      await AsyncStorage.setItem(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: true, hour: 21, minute: 0 }),
      );
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setTime(6, 5);
      });

      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).not.toHaveBeenCalled();
    });

    it('accepts the boundary time 0:00 (境界値: 最小値)', async () => {
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setTime(0, 0);
      });

      expect(result.current.hour).toBe(0);
      expect(result.current.minute).toBe(0);
    });

    it('accepts the boundary time 23:59 (境界値: 最大値)', async () => {
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setTime(23, 59);
      });

      expect(result.current.hour).toBe(23);
      expect(result.current.minute).toBe(59);
    });

    it('keeps the newly selected time reflected in the UI without crashing even when AsyncStorage.setItem rejects (異常系: 保存失敗)', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage write error'));
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setTime(10, 20);
      });

      expect(result.current.hour).toBe(10);
      expect(result.current.minute).toBe(20);
    });

    it('reverts enabled back to false and propagates the error from scheduleDailyReminderAsync when changing the time, while keeping the newly selected time (異常系: 再スケジュール失敗時はenabledをfalseへ戻し例外を伝播する)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      // ONにする時点では成功させ、次のsetTime呼び出し時にのみ失敗させる
      await act(async () => {
        await result.current.setEnabled(true);
      });
      // `mockRejectedValueOnce`を使い、この呼び出しのみを失敗させる(setEnabledの
      // 異常系テストと同じ理由で`mockRejectedValue`の永続的な上書きは避ける)
      mockedNotificationsUtil.scheduleDailyReminderAsync.mockRejectedValueOnce(
        new Error('schedule error'),
      );

      // setTimeの呼び出し自体(persistによる新しい時刻の即時反映)を、それを待ち受ける
      // act()とは別の同期act()に分離する。1つのact()内でsetTime呼び出しからPromiseの
      // 解決まで一気にawaitすると、内部で追跡している最新値(settingsRef.current)が
      // 更新される前に失敗時のenabled巻き戻し処理が走ってしまい、テスト環境特有のタイミングで
      // 新しい時刻が失われてしまう(実機では通知APIの呼び出し自体がネイティブブリッジを
      // またぐため、この分離と同等の再レンダー機会が自然に生まれる)
      let promise: Promise<void> = Promise.resolve();
      act(() => {
        promise = result.current.setTime(6, 0);
      });

      let caughtError: unknown;
      await act(async () => {
        try {
          await promise;
        } catch (error) {
          caughtError = error;
        }
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe('schedule error');
      // setEnabledと同様、「ONに見えるが実際には通知が届かない」状態を避けるため
      // enabledはfalseへ戻される(呼び出し元は例外を捕捉してユーザーへ案内する想定)。
      // 一方でhour/minuteは新しく選択した値のまま維持される
      expect(result.current.enabled).toBe(false);
      expect(result.current.hour).toBe(6);
      expect(result.current.minute).toBe(0);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        DIARY_REMINDER_STORAGE_KEY,
        JSON.stringify({ enabled: false, hour: 6, minute: 0 }),
      );
    });

    it('serializes rapid consecutive setTime calls so scheduleDailyReminderAsync ultimately runs in call order and settles on the last call even when earlier calls are mocked to resolve later (正常系: 連続呼び出しの直列化でレースコンディションを防ぐ)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      jest.clearAllMocks();

      jest.useFakeTimers();
      try {
        // 呼び出し順(10:00→11:00→12:00)とは逆に、最初の呼び出しほど解決が遅くなるよう
        // モックする。直列化されていなければ最後に解決した呼び出しが最終状態を決めてしまい
        // 表示時刻(12:00)とズレるが、Promiseチェーンで直列化されていれば呼び出し順どおりに
        // 実行されるため、解決の遅さに関わらず呼び出し順=実行順が保たれる
        const delaysMs = [300, 200, 100];
        let callIndex = 0;
        mockedNotificationsUtil.scheduleDailyReminderAsync.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              const delay = delaysMs[callIndex++];
              setTimeout(resolve, delay);
            }),
        );

        act(() => {
          result.current.setTime(10, 0);
          result.current.setTime(11, 0);
          result.current.setTime(12, 0);
        });

        // 画面表示上はすぐに最後の呼び出しの時刻へ更新される
        expect(result.current.hour).toBe(12);
        expect(result.current.minute).toBe(0);
        // キューの先頭(Promise.resolve())へのthen()登録はマイクロタスクとして次のtickで
        // 実行されるため、1回分だけマイクロタスクを進めてから呼び出し回数を確認する
        await act(async () => {
          await Promise.resolve();
        });
        // 直列化により、最初のタスクが完了するまで2番目以降はまだ実行されない
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledTimes(1);
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenNthCalledWith(
          1,
          10,
          0,
        );

        await act(async () => {
          jest.advanceTimersByTime(300);
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledTimes(2);
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenNthCalledWith(
          2,
          11,
          0,
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenCalledTimes(3);
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenNthCalledWith(
          3,
          12,
          0,
        );

        await act(async () => {
          jest.advanceTimersByTime(100);
          await Promise.resolve();
        });

        // 最終的に呼び出し順どおり(10→11→12)に実行され、最後の呼び出し引数で確定する
        expect(mockedNotificationsUtil.scheduleDailyReminderAsync.mock.calls).toEqual([
          [10, 0],
          [11, 0],
          [12, 0],
        ]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the schedule queue intact so a later setTime call still schedules even if an earlier call in the queue rejects (異常系: 途中の呼び出しが失敗してもキューは壊れない)', async () => {
      mockedNotificationsUtil.getReminderPermissionStatusAsync.mockResolvedValue('granted');
      const { result } = renderHook(() => useDiaryReminder(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.setEnabled(true);
      });
      jest.clearAllMocks();

      mockedNotificationsUtil.scheduleDailyReminderAsync.mockRejectedValueOnce(
        new Error('schedule error'),
      );
      mockedNotificationsUtil.scheduleDailyReminderAsync.mockResolvedValueOnce(undefined);

      // 1回目の失敗によって(呼び出し元のPromiseチェーンとは別に)enabledがfalseへ戻される
      // ため、間を空けて2回連続で呼び出すと2回目は再レンダー後のenabled=falseなクロージャを
      // 使ってしまいそもそもスケジュールされなくなる。TimeStepperの連続操作(前段の再レンダーが
      // 反映される前に次の呼び出しが来る状況)を再現するため、同じレンダリング内(enabled=trueの
      // クロージャ)で間を空けずに呼び出す。さらに、この2回の呼び出し自体は、それを待ち受ける
      // act()とは別の同期act()に分離する(理由は直前の異常系テストのコメントと同様。分離しないと
      // テスト環境特有のタイミングで1回目の失敗によるenabled巻き戻しが2回目の新しい時刻まで
      // 巻き戻してしまう)。1回目の返り値はrejectするため、未処理のrejectionにならないよう
      // 明示的に.catch()する
      let firstCall: Promise<void> = Promise.resolve();
      let secondCall: Promise<void> = Promise.resolve();
      act(() => {
        firstCall = result.current.setTime(9, 0);
        secondCall = result.current.setTime(13, 30);
      });

      await act(async () => {
        await Promise.all([firstCall.catch(() => {}), secondCall]);
      });

      // 1回目(9:00)は失敗したが、キュー自体は壊れず2回目(13:30)の再スケジュールも実行される
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenNthCalledWith(1, 9, 0);
      expect(mockedNotificationsUtil.scheduleDailyReminderAsync).toHaveBeenNthCalledWith(2, 13, 30);
      expect(result.current.hour).toBe(13);
      expect(result.current.minute).toBe(30);
    });
  });
});
