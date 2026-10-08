/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, useColorScheme } from 'react-native';
import { Calendar } from 'react-native-calendars';
import HomeScreen from '@/app/(tabs)/index';
import { Colors } from '@/constants/theme';
import {
  STORAGE_KEY,
  INPUT_PLACEHOLDER,
  queryCalendarDayButtonsWithEntry,
  decryptPersistedEntry,
  readPersistedEntry,
  pickTestDays,
  pickNonTodayDayInRange,
  isoAt,
  waitForInitialLoad,
  triggerRefocus,
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

  describe('タブ再フォーカス時にpending中の書き込みキューを待ってから読み直す', () => {
    it('does not flicker back to stale data when useFocusEffect refires while a save is still pending in the write queue', async () => {
      const now = new Date();
      // 新規保存したエントリはcreatedAtが実行時点の「今日」になるため、既存エントリは
      // 「今日」とは別の日にしておき、カレンダー上で2つのタイトルを独立して検証できるようにする
      const existingDay = pickNonTodayDayInRange(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'existing', text: '既存の日記', createdAt: isoAt(now, existingDay) },
        ]),
      );
      jest.clearAllMocks();

      // 保存の永続化書き込み(enqueueDiaryWrite内のsetItem)の完了タイミングを制御できるようにする。
      // 既存の直列化テストと同様、実際のAsyncStorageへの書き込み自体は元の実装
      // 経由で行い、完了タイミングだけを遅延させる
      const originalSetItem = AsyncStorage.setItem;
      let resolveSaveWrite: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        (key: string, value: string) =>
          new Promise<void>((resolve) => {
            resolveSaveWrite = () => {
              originalSetItem(key, value).then(resolve);
            };
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);

      // 新規保存を開始する。楽観的UI更新は同期的に反映されるが、AsyncStorageへの実際の
      // 書き込み(enqueueDiaryWrite内のsetItem)はpendingのまま止まる
      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '新しい日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      // 楽観的UI更新により、書き込みが完了する前から新しい日記のセルが一覧に加わっている
      // (既存の日記の日・新規保存(今日)の日、あわせて2セル)
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(2);

      const getItemMock = AsyncStorage.getItem as jest.Mock;
      const getItemCallsWhilePending = getItemMock.mock.calls.length;

      // 書き込みがまだpending中に、useFocusEffectの再発火(タブへの再フォーカス)を模す
      act(() => {
        (triggerRefocus as () => void)();
      });

      // pending中の書き込みを待たずに読み直すと、まだ反映されていない古い内容で一覧を上書きしてしまうため、
      // キューの完了を待ち、この時点では追加のgetItem呼び出しが発生しない
      expect(getItemMock.mock.calls.length).toBe(getItemCallsWhilePending);
      // 読み直しがブロックされている間も、楽観的更新済みの新しい日記のセルが古い状態へ
      // 巻き戻ってちらつくことはない
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(2);

      // pending中の書き込みを完了させる
      await act(async () => {
        resolveSaveWrite();
      });

      // 書き込み完了後、待たされていた読み直しが実行され、AsyncStorage.getItemが追加で呼ばれる
      await waitFor(() =>
        expect(getItemMock.mock.calls.length).toBeGreaterThan(getItemCallsWhilePending),
      );

      // 最終的に画面には、pending中だった書き込みが反映された最新の状態(既存+新規)が
      // 表示され続けている(一時的にせよ新しい日記のセルが消えることはなかった)
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(2);

      // 実際に永続化された内容にも新しい日記が反映されている(新規保存は自分専用の個別キーに書き込まれる)
      const setItemMock = AsyncStorage.setItem as jest.Mock;
      const [, lastValue] = setItemMock.mock.calls[setItemMock.mock.calls.length - 1];
      const persisted = (await decryptPersistedEntry(lastValue)) as { id: string; text: string };
      expect(persisted.text).toBe('新しい日記');
      // 既存のエントリも(個別キー方式へ移行済みのまま)引き続き残っている
      expect(await readPersistedEntry('existing')).not.toBeNull();
    });

    // pending中の書き込みが無い通常時は、余分な待ち合わせをせず即座に読み直すことを確認する
    // (loadEntries冒頭のawaitはpendingWriteCountRef.current > 0のときのみ行われる)
    it('reloads immediately on refocus when there is no pending write in the queue (通常時の再取得)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'existing', text: '既存の日記', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);

      const getItemMock = AsyncStorage.getItem as jest.Mock;
      const callsBeforeRefocus = getItemMock.mock.calls.length;

      // pending中の書き込みが存在しない状態で再フォーカスした場合、待ち合わせ無く
      // 即座に読み直しが実行される
      act(() => {
        (triggerRefocus as () => void)();
      });

      await waitFor(() =>
        expect(getItemMock.mock.calls.length).toBeGreaterThan(callsBeforeRefocus),
      );
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
    });
  });

  describe('テーマに応じたエラー色', () => {
    // `hooks/use-color-scheme.ts`はreact-nativeの`useColorScheme`をそのままre-exportしているため、
    // jest-expo(react-native)のオートモック(常に'light'を返すjest.fn)を直接上書きすることで
    // ダークモードをシミュレートできる
    const mockedUseColorScheme = useColorScheme as jest.Mock;

    afterEach(() => {
      // このdescribe内で上書きしたダークモードの戻り値が他のテスト(既定のライトモード想定)に
      // 波及しないよう明示的に戻す。beforeEachの`jest.clearAllMocks()`は呼び出し履歴のみをクリアし、
      // `mockReturnValue`で差し替えた実装自体はクリアされないため、ここで戻す必要がある
      mockedUseColorScheme.mockReturnValue('light');
    });

    it('sanity check: Colors.light.error and Colors.dark.error are different values', () => {
      // ライト/ダークで同じ値だと、以下のテストが誤って"たまたま"パスしてしまう
      // (ライトモードの色のままでもテストが通ってしまう)ことを防ぐための前提確認
      expect(Colors.dark.error).not.toBe(Colors.light.error);
    });

    it('renders the character counter in Colors.dark.error once the max length is reached, when in dark mode', async () => {
      mockedUseColorScheme.mockReturnValue('dark');
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, 'あ'.repeat(1000));
      const counterAtLimit = screen.getByText('1000/1000');
      expect(StyleSheet.flatten(counterAtLimit.props.style).color).toBe(Colors.dark.error);
    });

    it('shows the save-failure error message in Colors.dark.error when in dark mode', async () => {
      mockedUseColorScheme.mockReturnValue('dark');
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write failed'));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '今日の日記');
      fireEvent.press(screen.getByText('保存'));

      const errorMessage = await screen.findByText('保存に失敗しました。もう一度お試しください。');
      expect(StyleSheet.flatten(errorMessage.props.style).color).toBe(Colors.dark.error);
    });

    // 編集失敗時のエラーメッセージ・削除リンクのダークモード配色は、それぞれ専用画面へ移動したため
    // tests/app/edit-entry/[id].test.tsx・tests/app/day-entries/[date].test.tsxで検証する

    // react-native-calendarsの`Calendar`はtheme由来のスタイル
    // (曜日ヘッダー行の色など、dayComponentで差し替えていない部分)をマウント時に一度だけ
    // `useRef`で計算してキャッシュし、マウント後にtheme propが変わっても再計算しない実装のため、
    // マウント後に配色設定(ダークモード)が変わってもカレンダー本体だけ元の配色のまま
    // 取り残されてしまう。`Calendar`にcolorSchemeをkeyとして渡し強制的に再マウントさせることで
    // 追従させる対策(app/(tabs)/index.tsxのkey={colorScheme})が効いていることを確認する
    it('re-applies the current color scheme to react-native-calendars-managed styling (e.g. the weekday header row) after the color scheme changes post-mount', async () => {
      mockedUseColorScheme.mockReturnValue('light');
      const { rerender } = render(<HomeScreen />);
      await waitForInitialLoad();

      mockedUseColorScheme.mockReturnValue('dark');
      rerender(<HomeScreen />);

      const dayHeader = screen.getByText('日', { includeHiddenElements: true });
      expect(StyleSheet.flatten(dayHeader.props.style).color).toBe(Colors.dark.text);
    });

    // 月ピッカーを使わずスワイプ・矢印操作(ここでは
    // それらと同じ経路であるCalendarのonMonthChangeを直接呼び出して再現する)で表示月を進めた後に
    // テーマを切り替えると、key={colorScheme}によるCalendarの強制再マウントが発生する。
    // react-native-calendarsのCalendarは`useDidUpdate`(初回マウント時はスキップされるフック)
    // 経由でしかonMonthChangeを呼ばないため、再マウント時(新規インスタンスの初回マウント扱い)には
    // onMonthChangeが発火せず、calendarInitialDateを同期していないとヘッダー表示(進めた月のまま)と
    // 実際の日付グリッド(calendarInitialDateが古いままなら今日の月へ巻き戻る)が食い違ってしまう
    it('keeps the actually rendered day grid in sync with the month reached via swipe/arrow navigation (not the month picker) after a theme-driven remount (回帰)', async () => {
      const now = new Date();
      mockedUseColorScheme.mockReturnValue('light');
      const { rerender } = render(<HomeScreen />);
      await waitForInitialLoad();

      // 月ピッカーを使わず、カレンダー本体のスワイプ・矢印操作と同じ経路(onMonthChange)で
      // 表示月を翌月へ進める
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthYear = nextMonthDate.getFullYear();
      const nextMonthMonth = nextMonthDate.getMonth() + 1;
      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      act(() => {
        calendar.props.onMonthChange({
          year: nextMonthYear,
          month: nextMonthMonth,
          day: 1,
          timestamp: nextMonthDate.getTime(),
          dateString: `${nextMonthYear}-${`${nextMonthMonth}`.padStart(2, '0')}-01`,
        });
      });
      expect(
        await screen.findByText(`${nextMonthYear}年${nextMonthMonth}月`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();

      // 月ピッカーを開かないままテーマをダークへ切り替える(key={colorScheme}によりCalendarが
      // 強制的に再マウントされる)
      mockedUseColorScheme.mockReturnValue('dark');
      rerender(<HomeScreen />);

      // ヘッダーは進めた月のままで、かつ実際に描画される日付グリッドも同じ月の日付セルを含んでいる
      // (元の今日の月へ静かに巻き戻っていない)ことを確認する
      expect(
        await screen.findByText(`${nextMonthYear}年${nextMonthMonth}月`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
      expect(
        screen.queryAllByLabelText(new RegExp(`^${nextMonthYear}年${nextMonthMonth}月15日`)),
      ).not.toHaveLength(0);
    });
  });
});
