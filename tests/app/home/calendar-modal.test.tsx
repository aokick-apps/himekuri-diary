/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  STORAGE_KEY,
  queryCalendarDayButtonsWithEntry,
  pickTestDays,
  isoAt,
  toDateKeyForTest,
  waitForInitialLoad,
  mockPush,
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

  describe('カレンダー表示とモーダル', () => {
    it('shows the current year and month heading in the calendar header', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      // react-native-calendarsのヘッダーは`importantForAccessibility="no-hide-descendants"`で
      // 内部テキストをアクセシビリティツリーから隠している(画面上には表示されている)ため、
      // `includeHiddenElements`を指定して検索する
      expect(
        await screen.findByText(`${now.getFullYear()}年${now.getMonth() + 1}月`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
    });

    it('shows a chevron-down IconSymbol next to the calendar header heading, indicating it opens the month picker', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const headerChevrons = screen
        .UNSAFE_getAllByType(IconSymbol)
        .filter((node) => node.props.name === 'chevron.down');
      expect(headerChevrons).toHaveLength(1);
    });

    it('shows a weekday header row (日 月 火 水 木 金 土)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      for (const dayName of ['日', '月', '火', '水', '木', '金', '土']) {
        expect(screen.getByText(dayName, { includeHiddenElements: true })).toBeTruthy();
      }
    });

    it('navigates to the day-entries screen (not the new-entry creation modal) for an entry whose text is an empty string after the first line is trimmed, since tap behavior is based on entriesByDate, not on the trimmed title (defensive boundary for directly-corrupted/legacy storage data, since the composer itself never saves an empty/whitespace-only entry)', async () => {
      // pickTestDaysが選ぶ10〜20日は、実行時点の「今日」がその範囲より前だと未来日になり
      // react-native-calendars側のmaxDate判定でonDayPress自体が発火しなくなる。
      // 2026年8月は1日が土曜日で自然に6週間ぴったり(showSixWeeksによる前後月のはみ出しが
      // 最小)になり、かつ25日を基準日にすることで10〜20日が確実に過去日になる
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: '   ', createdAt: isoAt(now, dayWithEntry) }]),
        );

        render(<HomeScreen />);
        await waitForInitialLoad();

        // セルへの表示テキスト(タイトル)は空文字列だが、isPressable/statusLabelは
        // タイトルの有無ではなくentriesByDateの有無(handleDayPressと同じ基準)で決まるため、
        // このセルは「日記が実際に存在するセル」として1件カウントされる
        expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);

        fireEvent.press(screen.getByText(String(dayWithEntry)));

        // handleDayPressはentriesByDateの有無で分岐するため、タイトル表示が空でも
        // 新規作成モーダルではなく日付一覧画面への遷移が発生する
        expect(mockPush).toHaveBeenCalledWith(
          `/day-entries/${toDateKeyForTest(now, dayWithEntry)}`,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('opens the new-entry creation modal (does not navigate) when tapping a day cell that has no diary entries at all', async () => {
      // dayWithoutEntryが未来日になると、日記の無いセル自体がCalendarのmaxDateで
      // 押せなくなってしまう。2026年8月は1日が土曜日で自然に6週間ぴったり(showSixWeeksに
      // よる前後月のはみ出しが最小)になり、かつ25日を基準日にすることで10〜20日が
      // 確実に過去日になる
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: '日記あり', createdAt: isoAt(now, dayWithEntry) }]),
        );

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 日記が実際に存在するセルは1つだけ(dayWithEntry分)である
        // (日記の無い日のセルも未来日でなければタップ可能になったため、
        // 全体のボタン数ではなく「日記が実際に存在するセル」のみで絞り込んで確認する)
        expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);

        const emptyDayCell = screen.getByText(String(dayWithoutEntry));
        fireEvent.press(emptyDayCell);

        // 下書き復元の非同期読み込み(getItem)がact()の外で解決し警告になるのを防ぐため、
        // 完了を待ってからアサーションへ進む
        await waitFor(() =>
          expect(AsyncStorage.getItem).toHaveBeenCalledWith(
            `diary-new-entry-draft-${toDateKeyForTest(now, dayWithoutEntry)}`,
          ),
        );

        // 日付一覧画面への遷移ではなく新規作成モーダルが開く
        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        expect(newEntryModal.props.visible).toBe(true);
        expect(mockPush).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    // スクリーンリーダー(VoiceOver/TalkBack)利用者にも、日付セルの数字だけでなく
    // 「何年何月何日か」と「その日に日記があるかどうか」が伝わるよう、accessibilityLabel/
    // accessibilityStateを検証する
    it('sets an accessibilityLabel with the full date and "日記あり(N件)" on a day cell that has a diary entry, and does not mark it as accessibility-disabled', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '日記あり', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const expectedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日、日記あり(1件)`;
      const dayCell = screen.getByLabelText(expectedLabel);
      expect(dayCell.props.accessibilityRole).toBe('button');
      expect(dayCell.props.accessibilityState?.disabled).toBe(false);
    });

    it('sets an accessibilityLabel with the full date, "日記なし" and "タップして新規作成" on a day cell without a diary entry that is today or in the past, and does not mark it as accessibility-disabled, made such cells tappable to create a new entry', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      // 「今日」自体は常に未来日ではないため、日記の無い日として確実に使える
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '日記あり', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const expectedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日、日記なし、タップして新規作成`;
      const dayCell = screen.getByLabelText(expectedLabel);
      expect(dayCell.props.accessibilityRole).toBe('button');
      expect(dayCell.props.accessibilityState?.disabled).toBe(false);
    });

    it('sets an accessibilityLabel with the full date and plain "日記なし" (without the "タップして新規作成" suffix) on a future day cell without a diary entry, and marks it as accessibility-disabled, since future dates cannot be used to create a new entry', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      render(<HomeScreen />);
      await waitForInitialLoad();

      const expectedLabel = `${tomorrow.getFullYear()}年${tomorrow.getMonth() + 1}月${tomorrow.getDate()}日、日記なし`;
      const dayCell = screen.getByLabelText(expectedLabel);
      expect(dayCell.props.accessibilityState?.disabled).toBe(true);
    });

    // showSixWeeksにより前後月の「はみ出し」日付セルも描画される。
    // それらのセルは常に日記が無い(entriesByDateには当月のキーしか存在しない)ため、
    // 実装が`title`のみを見てdisabled判定していることを踏まえ、はみ出しセルでも
    // 正しい年月日のaccessibilityLabelとaccessibilityState.disabled=trueが付くことを確認する
    it("sets a correct accessibilityLabel (with that day's own year/month, not the currently displayed month) and marks it as accessibility-disabled on overflow day cells belonging to an adjacent month", async () => {
      const now = new Date();

      render(<HomeScreen />);
      await waitForInitialLoad();

      const noEntryCells = screen.getAllByLabelText(/^\d{4}年\d{1,2}月\d{1,2}日、日記なし$/);
      const currentMonthPrefix = `${now.getFullYear()}年${now.getMonth() + 1}月`;
      const overflowCells = noEntryCells.filter(
        (cell) => !(cell.props.accessibilityLabel as string).startsWith(currentMonthPrefix),
      );

      // showSixWeeksで常に6週(42セル)分描画され、当月の日数は最大でも31日のため、
      // 前月または翌月のはみ出しセルが必ず1つ以上存在する
      expect(overflowCells.length).toBeGreaterThan(0);
      overflowCells.forEach((cell) => {
        expect(cell.props.accessibilityState?.disabled).toBe(true);
      });
    });

    it('treats a day that actually has an entry as non-pressable while entries are still loading (label stays "日記なし" instead of "日記あり"), and tapping it neither navigates nor opens the new-entry modal, since entriesByDate is not yet determined during the load (境界値: 読み込み中は日記の有無が未確定)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedValue = JSON.stringify([
        { id: '1', text: '日記あり', createdAt: isoAt(now, dayWithEntry) },
      ]);
      await AsyncStorage.setItem(STORAGE_KEY, storedValue);

      let resolveGetItem: (value: string | null) => void = () => {};
      jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveGetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

      const loadingLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日、日記なし`;
      const loadingCell = screen.getByLabelText(loadingLabel);
      expect(loadingCell.props.accessibilityState?.disabled).toBe(true);

      fireEvent.press(loadingCell);

      expect(mockPush).not.toHaveBeenCalled();
      const modalsWhileLoading = screen.UNSAFE_getAllByType(Modal);
      expect(modalsWhileLoading.every((modal) => modal.props.visible === false)).toBe(true);

      // 読み込み完了後は通常どおり、既存の日記へ遷移できることを確認する
      await act(async () => {
        resolveGetItem(storedValue);
      });
      await waitForInitialLoad();

      const loadedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日、日記あり(1件)`;
      const loadedCell = screen.getByLabelText(loadedLabel);
      expect(loadedCell.props.accessibilityState?.disabled).toBe(false);

      fireEvent.press(loadedCell);

      expect(mockPush).toHaveBeenCalledWith(`/day-entries/${toDateKeyForTest(now, dayWithEntry)}`);
    });

    it('does not open the new-entry modal when tapping a day that truly has no entries while entries are still loading, and opens it normally once loading finishes (境界値: 読み込み中は日記なしのセルも新規作成不可)', async () => {
      // 月初実行だとdayWithoutEntryが未来日になり新規作成不可となるため、基準日を固定する
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
        const storedValue = JSON.stringify([
          { id: '1', text: '日記あり', createdAt: isoAt(now, dayWithEntry) },
        ]);
        await AsyncStorage.setItem(STORAGE_KEY, storedValue);

        let resolveGetItem: (value: string | null) => void = () => {};
        jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveGetItem = resolve;
            }),
        );

        render(<HomeScreen />);
        await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

        const loadingLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithoutEntry}日、日記なし`;
        const loadingCell = screen.getByLabelText(loadingLabel);
        expect(loadingCell.props.accessibilityState?.disabled).toBe(true);

        fireEvent.press(loadingCell);

        expect(mockPush).not.toHaveBeenCalled();
        const modalsWhileLoading = screen.UNSAFE_getAllByType(Modal);
        expect(modalsWhileLoading.every((modal) => modal.props.visible === false)).toBe(true);
        expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(
          `diary-new-entry-draft-${toDateKeyForTest(now, dayWithoutEntry)}`,
        );

        // 読み込み完了後は通常どおり、日記の無い日のタップで新規作成モーダルが開くことを確認する
        await act(async () => {
          resolveGetItem(storedValue);
        });
        await waitForInitialLoad();

        const loadedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithoutEntry}日、日記なし、タップして新規作成`;
        const loadedCell = screen.getByLabelText(loadedLabel);
        expect(loadedCell.props.accessibilityState?.disabled).toBe(false);

        fireEvent.press(loadedCell);

        await waitFor(() =>
          expect(AsyncStorage.getItem).toHaveBeenCalledWith(
            `diary-new-entry-draft-${toDateKeyForTest(now, dayWithoutEntry)}`,
          ),
        );
        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        expect(newEntryModal.props.visible).toBe(true);
        expect(mockPush).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does nothing (does not navigate or open any modal) when tapping a future day cell, even though it has no diary entries, since future dates are excluded from both the day-entries and the new-entry-creation flow', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      render(<HomeScreen />);
      await waitForInitialLoad();

      const label = `${tomorrow.getFullYear()}年${tomorrow.getMonth() + 1}月${tomorrow.getDate()}日、日記なし`;
      const dayCell = screen.getByLabelText(label);

      fireEvent.press(dayCell);

      expect(mockPush).not.toHaveBeenCalled();
      const modals = screen.UNSAFE_getAllByType(Modal);
      expect(modals.every((modal) => modal.props.visible === false)).toBe(true);
    });

    it('navigates to the day-entries screen for the tapped date when it has diary entries (一覧の内容自体はtests/app/day-entries/[date].test.tsxで検証する)', async () => {
      // dayWithEntryが未来日になると、react-native-calendars側のmaxDate判定で
      // onDayPress自体が発火しなくなる。2026年8月は1日が土曜日で自然に6週間ぴったり
      // (showSixWeeksによる前後月のはみ出しが最小)になり、かつ25日を基準日にすることで
      // 10〜20日が確実に過去日になる
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry } = pickTestDays(now);
        const storedEntries = [
          { id: '1', text: '朝の出来事', createdAt: isoAt(now, dayWithEntry, 7, 0) },
          { id: '2', text: '昼の出来事', createdAt: isoAt(now, dayWithEntry, 12, 0) },
          { id: '3', text: '夜の出来事', createdAt: isoAt(now, dayWithEntry, 21, 0) },
        ];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 3件になったセルには件数バッジが表示されるため、日付の数字でタップする
        fireEvent.press(screen.getByText(String(dayWithEntry)));

        expect(mockPush).toHaveBeenCalledWith(
          `/day-entries/${toDateKeyForTest(now, dayWithEntry)}`,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    // 未来日に日記エントリが存在する場合(通常はあり得ないが端末時計変更などで発生しうる)、
    // そのセルは`hasEntries`によりisPressableがtrueになる。ライブラリ内部のonPress
    // (maxDate超過日では発火しない)ではなくhandleDayPressを直接呼ぶことで、見た目の
    // 操作可否と実際の遷移可否を一致させている
    it('navigates to the day-entries screen when tapping a future day cell that unexpectedly has a diary entry', async () => {
      jest.useFakeTimers();
      try {
        // 2026年8月は1日が土曜日で自然に6週間ぴったり(showSixWeeksによる前後月のはみ出しが
        // 最小)になり、5日を「今日」にすることで10〜20日の範囲を確実に未来日にできる
        const now = new Date(2026, 7, 5, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry: futureDay } = pickTestDays(now);
        const futureDateKey = toDateKeyForTest(now, futureDay);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: '未来の日記', createdAt: isoAt(now, futureDay) }]),
        );

        render(<HomeScreen />);
        await waitForInitialLoad();

        const dayCell = screen.getByLabelText(
          `${now.getFullYear()}年${now.getMonth() + 1}月${futureDay}日、日記あり(1件)`,
        );
        // hasEntriesがtrueのため、ライブラリ側のmaxDateによる'disabled'状態に関わらず
        // isPressableはtrueになり、アクセシビリティ上も操作可能として扱われる
        expect(dayCell.props.accessibilityState?.disabled).toBe(false);

        fireEvent.press(dayCell);

        expect(mockPush).toHaveBeenCalledWith(`/day-entries/${futureDateKey}`);
      } finally {
        jest.useRealTimers();
      }
    });

    it('sets statusBarTranslucent and navigationBarTranslucent on the new-entry creation modal and the month picker modal, so they match the edge-to-edge display of the screen behind them', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      // 新規作成モーダル・年月ピッカーモーダルの2つが常にツリーに存在する
      // (visibleプロパティで表示/非表示を切り替えているだけで、条件付きレンダリングではないため。
      // 日付一覧・編集は専用画面への遷移に置き換えたため対象外になった)
      const modals = screen.UNSAFE_getAllByType(Modal);
      expect(modals).toHaveLength(2);
      for (const modal of modals) {
        expect(modal.props.statusBarTranslucent).toBe(true);
        expect(modal.props.navigationBarTranslucent).toBe(true);
      }
    });
  });
});
