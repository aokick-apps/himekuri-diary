/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Modal, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import HomeScreen from '@/app/(tabs)/index';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  STORAGE_KEY,
  CLOSE_BUTTON_TEXT,
  getModalOverlayPressable,
  getModalCloseButton,
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

  describe('カレンダーの年月ジャンプ用ピッカー', () => {
    // react-native-calendarsに設定しているロケール(実装側のJA_MONTH_NAMES)と同じ表記。
    // 実装からは直接importできないため、テスト側でも同じ配列を用意する
    const MONTH_NAMES_JA = [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];

    // react-native-calendarsのヘッダーは`importantForAccessibility="no-hide-descendants"`で
    // 内部テキストをアクセシビリティツリーから隠している(画面上には表示されている)ため、
    // `includeHiddenElements`を指定して検索する(既存の「カレンダー表示とモーダル」テストと同様)
    function findCalendarHeaderText(year: number, month: number) {
      return screen.findByText(`${year}年${month}月`, { includeHiddenElements: true });
    }

    // モーダルは[日付一覧, 編集, 新規作成, 年月ピッカー]の順でJSXに並んでいる
    // (実装側app/(tabs)/index.tsx参照)
    function getMonthPickerModal() {
      // 日付一覧・編集は専用画面への遷移に置き換えたため、この画面に残る
      // モーダルは新規作成モーダル(index 0)・年月ピッカーモーダル(index 1)の2つのみになった
      return screen.UNSAFE_getAllByType(Modal)[1];
    }

    async function openMonthPicker(now: Date) {
      const headerText = await findCalendarHeaderText(now.getFullYear(), now.getMonth() + 1);
      fireEvent.press(headerText);
      await screen.findByText('年月を選択');
    }

    it('opens the month picker modal, showing a year stepper and all 12 month buttons, when the calendar header heading is tapped (正常系)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      expect(screen.getByText(`${now.getFullYear()}年`)).toBeTruthy();
      for (const monthName of MONTH_NAMES_JA) {
        expect(screen.getByText(monthName)).toBeTruthy();
      }
    });

    it('renders all 12 month buttons inside the scrollable month grid (month-picker-scroll) laid out as wrapping rows (正常系: 月グリッドのスクロール領域)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const monthScroll = screen.getByTestId('month-picker-scroll');
      for (const monthName of MONTH_NAMES_JA) {
        expect(within(monthScroll).getByText(monthName)).toBeTruthy();
      }
      expect(StyleSheet.flatten(monthScroll.props.contentContainerStyle)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'wrap',
      });
    });

    it('shows a hint explaining that dimly displayed months have no diary entries and cannot be selected (正常系: 選択不可月の理由表示)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      expect(screen.getByText('薄く表示されている月は選択できません')).toBeTruthy();
    });

    it('adds the same bottom padding as the modal content to the month grid contentContainerStyle, so the last row is not hidden behind the tab bar when scrolled to the end (境界値: スクロール終端)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const monthScroll = screen.getByTestId('month-picker-scroll');
      const [modalContent] = getMonthPickerModal().findAllByType(ThemedView);
      expect(StyleSheet.flatten(monthScroll.props.contentContainerStyle).paddingBottom).toBe(
        StyleSheet.flatten(modalContent.props.style).paddingBottom,
      );
    });

    describe('モーダルの高さ上限(画面高さ基準)', () => {
      const originalWindow = Dimensions.get('window');

      afterEach(async () => {
        await act(async () => {
          Dimensions.set({ window: originalWindow });
        });
      });

      async function getMonthPickerMaxHeightAtWindowHeight(height: number) {
        Dimensions.set({ window: { ...originalWindow, height } });
        const now = new Date();
        render(<HomeScreen />);
        await waitForInitialLoad();
        await openMonthPicker(now);
        const [modalContent] = getMonthPickerModal().findAllByType(ThemedView);
        return StyleSheet.flatten(modalContent.props.style).maxHeight;
      }

      it('sets the month picker modal content maxHeight to 70% of the window height in px, not a percentage resolved against the parent wrapper', async () => {
        expect(await getMonthPickerMaxHeightAtWindowHeight(812)).toBe(812 * 0.7);
      });

      it('follows the window height so that a low screen gets a smaller maxHeight (境界値: 小さい画面・横向き)', async () => {
        expect(await getMonthPickerMaxHeightAtWindowHeight(500)).toBe(500 * 0.7);
      });
    });

    it('sets the new-entry modal content maxHeight to 70% of the window height in px, like the month picker modal', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();
      fireEvent.press(
        screen.getByLabelText(
          `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日、日記なし、タップして新規作成`,
        ),
      );
      await screen.findByText(
        `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日の日記を書く`,
      );

      const [modalContent] = screen.UNSAFE_getAllByType(Modal)[0].findAllByType(ThemedView);
      expect(StyleSheet.flatten(modalContent.props.style).maxHeight).toBe(
        Dimensions.get('window').height * 0.7,
      );
    });

    it('keeps the modal header and the year stepper outside the month ScrollView, so they stay fixed while only the month grid scrolls (正常系: 固定部分の分離)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const modal = getMonthPickerModal();
      const monthScroll = screen.getByTestId('month-picker-scroll');
      const fixedLabels = ['前の年', '次の年', CLOSE_BUTTON_TEXT];
      for (const label of fixedLabels) {
        expect(modal.findAllByProps({ accessibilityLabel: label }).length).toBeGreaterThan(0);
        expect(monthScroll.findAllByProps({ accessibilityLabel: label })).toHaveLength(0);
      }
      expect(monthScroll.findAllByProps({ children: '年月を選択' })).toHaveLength(0);
    });

    it('claims the touch start on the modal content via onStartShouldSetResponder, which keeps touches on the month ScrollView from reaching the overlay Pressable (正常系: タップ伝播制御)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      // テスト環境ではレスポンダーの調停(実際のタップ伝播)を再現できないため、プロパティ自体を検証する
      const [modalContent] = getMonthPickerModal().findAllByType(ThemedView);
      expect(modalContent.props.onStartShouldSetResponder()).toBe(true);
    });

    it('keeps the displayed month button selected and enabled even when it is exactly the upper-bound month (the current month), and closes the modal without moving the calendar when it is pressed (境界値: 上限月ちょうど)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const currentMonth = now.getMonth() + 1;
      const [currentMonthButton] = screen.UNSAFE_getAllByProps({
        accessibilityLabel: `${now.getFullYear()}年${currentMonth}月へ移動`,
      });
      expect(currentMonthButton.props.accessibilityState?.disabled).toBe(false);
      expect(currentMonthButton.props.accessibilityState?.selected).toBe(true);

      fireEvent.press(currentMonthButton);
      await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());
      expect(await findCalendarHeaderText(now.getFullYear(), currentMonth)).toBeTruthy();
    });

    it('sets accessibilityRole="button" and a descriptive accessibilityLabel on the header heading, so it is discoverable as a tappable control by screen readers (正常系)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      const headerButton = screen.getByLabelText(
        `${now.getFullYear()}年${now.getMonth() + 1}月、年月を選択して移動`,
        { includeHiddenElements: true },
      );
      expect(headerButton.props.accessibilityRole).toBe('button');
    });

    it('increments/decrements the picker year within the diary-backed year range, without jumping the calendar until a month button is pressed (正常系)', async () => {
      const now = new Date();
      const storedEntries = [
        {
          id: 'old',
          text: '前年の日記',
          createdAt: new Date(now.getFullYear() - 1, 0, 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      fireEvent.press(screen.getByLabelText('前の年'));
      expect(screen.getByText(`${now.getFullYear() - 1}年`)).toBeTruthy();

      fireEvent.press(screen.getByLabelText('次の年'));
      expect(screen.getByText(`${now.getFullYear()}年`)).toBeTruthy();

      // 年ステッパーの操作だけではカレンダー本体の表示月はまだジャンプしていない
      expect(await findCalendarHeaderText(now.getFullYear(), now.getMonth() + 1)).toBeTruthy();
    });

    it('disables the next-year stepper and future month buttons at the current year/month upper bound, so the picker cannot jump to an all-future calendar (境界値)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const nextYearButton = screen.getByLabelText('次の年');
      expect(nextYearButton.props.accessibilityState?.disabled).toBe(true);

      const nextMonth = now.getMonth() + 2;
      if (nextMonth <= 12) {
        const [futureMonthButton] = screen.UNSAFE_getAllByProps({
          accessibilityLabel: `${now.getFullYear()}年${nextMonth}月(選択できません)`,
        });
        expect(futureMonthButton.props.accessibilityState?.disabled).toBe(true);

        fireEvent.press(futureMonthButton);
        expect(screen.getByText('年月を選択')).toBeTruthy();
        expect(await findCalendarHeaderText(now.getFullYear(), now.getMonth() + 1)).toBeTruthy();
      }

      fireEvent.press(nextYearButton);
      expect(screen.queryByText(`${now.getFullYear() + 1}年`)).toBeNull();
      expect(await findCalendarHeaderText(now.getFullYear(), now.getMonth() + 1)).toBeTruthy();
    });

    it('refreshes the picker upper bound when opening it after the app stays mounted across a month boundary (境界値: 月またぎ)', async () => {
      jest.useFakeTimers();
      try {
        const beforeMonthBoundary = new Date(2026, 0, 31, 23, 59, 0);
        const afterMonthBoundary = new Date(2026, 1, 1, 0, 1, 0);
        jest.setSystemTime(beforeMonthBoundary);

        render(<HomeScreen />);
        await waitForInitialLoad();

        jest.setSystemTime(afterMonthBoundary);
        await openMonthPicker(beforeMonthBoundary);

        const februaryButton = screen.getByLabelText('2026年2月へ移動');
        expect(februaryButton.props.accessibilityState?.disabled).toBe(false);

        fireEvent.press(februaryButton);

        await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());
        expect(await findCalendarHeaderText(2026, 2)).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('refreshes both picker bounds when opening it after the app stays mounted across a year boundary with no diary entries (境界値: 年またぎ)', async () => {
      jest.useFakeTimers();
      try {
        const beforeYearBoundary = new Date(2026, 11, 31, 23, 59, 0);
        const afterYearBoundary = new Date(2027, 0, 1, 0, 1, 0);
        jest.setSystemTime(beforeYearBoundary);

        render(<HomeScreen />);
        await waitForInitialLoad();

        jest.setSystemTime(afterYearBoundary);
        await openMonthPicker(beforeYearBoundary);

        // 表示中の年(2026年)で開き、上限は年をまたいだ今日(2027年1月)まで広がっている
        expect(screen.getByText('2026年')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('次の年'));
        expect(screen.getByText('2027年')).toBeTruthy();
        expect(screen.getByLabelText('次の年').props.accessibilityState?.disabled).toBe(true);
        expect(screen.getByLabelText('2027年1月へ移動').props.accessibilityState?.disabled).toBe(
          false,
        );
        // 下限も年をまたいだ今日を基準に再計算され、日記が無くても10年前の1月まで遡れる
        for (let i = 0; i < 10; i += 1) {
          fireEvent.press(screen.getByLabelText('前の年'));
        }
        expect(screen.getByText('2017年')).toBeTruthy();
        expect(screen.getByLabelText('前の年').props.accessibilityState?.disabled).toBe(true);
        expect(screen.getByLabelText('2017年1月へ移動').props.accessibilityState?.disabled).toBe(
          false,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('renders the year stepper buttons as chevron-left/chevron-right IconSymbols, not text glyphs', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const prevYearButton = screen.getByLabelText('前の年');
      const nextYearButton = screen.getByLabelText('次の年');
      const [prevYearIcon] = prevYearButton.findAllByType(IconSymbol);
      const [nextYearIcon] = nextYearButton.findAllByType(IconSymbol);

      expect(prevYearIcon.props.name).toBe('chevron.left');
      expect(nextYearIcon.props.name).toBe('chevron.right');
    });

    it('jumps the calendar to the selected year/month and closes the modal when a month button is tapped (正常系)', async () => {
      const now = new Date();
      const targetYear = now.getFullYear() - 1;
      const storedEntries = [
        {
          id: 'old',
          text: '前年の日記',
          createdAt: new Date(targetYear, 0, 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      fireEvent.press(screen.getByLabelText('前の年'));
      fireEvent.press(screen.getByLabelText(`${targetYear}年3月へ移動`));

      // モーダルが閉じる
      await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());

      // ヘッダーの見出しがジャンプ先の年月に更新される
      expect(await findCalendarHeaderText(targetYear, 3)).toBeTruthy();

      // Calendar本体へもジャンプ先のinitialDateが渡され、実際にその月へジャンプする
      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      expect(calendar.props.initialDate).toBe(`${targetYear}-03-01`);
    });

    it('closes the month picker modal without jumping when the semi-transparent background overlay is tapped, discarding unselected year-stepper changes (正常系: モーダルを閉じる操作)', async () => {
      const now = new Date();
      const storedEntries = [
        {
          id: 'old',
          text: '前年の日記',
          createdAt: new Date(now.getFullYear() - 1, 0, 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      fireEvent.press(screen.getByLabelText('前の年'));

      const overlay = getModalOverlayPressable(getMonthPickerModal());
      fireEvent.press(overlay);

      await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());
      // 実際の表示年月は変わっていない
      expect(await findCalendarHeaderText(now.getFullYear(), now.getMonth() + 1)).toBeTruthy();
    });

    it('closes the month picker modal via its own close button ("閉じる"), matching the pattern used by the other modals (正常系)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      fireEvent.press(screen.getByText(CLOSE_BUTTON_TEXT));

      await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());
    });

    it('sets accessibilityRole="button" and accessibilityLabel="閉じる" on the month picker modal\'s close button (アクセシビリティ)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const closeButton = getModalCloseButton(getMonthPickerModal());
      expect(closeButton.props.accessibilityRole).toBe('button');
      expect(closeButton.props.accessibilityLabel).toBe(CLOSE_BUTTON_TEXT);
    });

    it('resets the picker to the currently displayed year each time it is reopened, discarding any unselected year-stepper changes from a previous open (境界値)', async () => {
      const now = new Date();
      const storedEntries = [
        {
          id: 'old',
          text: '一昨年の日記',
          createdAt: new Date(now.getFullYear() - 2, 0, 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      fireEvent.press(screen.getByLabelText('前の年'));
      fireEvent.press(screen.getByLabelText('前の年'));
      expect(screen.getByText(`${now.getFullYear() - 2}年`)).toBeTruthy();

      fireEvent.press(screen.getByText(CLOSE_BUTTON_TEXT));
      await waitFor(() => expect(screen.queryByText('年月を選択')).toBeNull());

      await openMonthPicker(now);
      expect(screen.getByText(`${now.getFullYear()}年`)).toBeTruthy();
      expect(screen.queryByText(`${now.getFullYear() - 2}年`)).toBeNull();
    });

    it("clamps the picker's initial year to the current year when the calendar reports a future year via swipe/arrow navigation (境界値: 未来年)", async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      const nextYear = now.getFullYear() + 1;
      act(() => {
        calendar.props.onMonthChange({
          year: nextYear,
          month: 1,
          day: 1,
          timestamp: new Date(nextYear, 0, 1).getTime(),
          dateString: `${nextYear}-01-01`,
        });
      });

      expect(await findCalendarHeaderText(nextYear, 1)).toBeTruthy();

      // ピッカーを開くと、未来年ではなく現在年を上限として初期選択する
      fireEvent.press(await findCalendarHeaderText(nextYear, 1));
      expect(await screen.findByText(`${now.getFullYear()}年`)).toBeTruthy();
      expect(screen.getByLabelText('次の年').props.accessibilityState?.disabled).toBe(true);
    });

    it('syncs the header heading to the new month when the calendar reports a month change crossing a year boundary backward (境界値: 1月→前年12月)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      const previousYear = now.getFullYear() - 1;
      act(() => {
        calendar.props.onMonthChange({
          year: previousYear,
          month: 12,
          day: 1,
          timestamp: new Date(previousYear, 11, 1).getTime(),
          dateString: `${previousYear}-12-01`,
        });
      });

      expect(await findCalendarHeaderText(previousYear, 12)).toBeTruthy();
    });

    it('marks the month button matching the currently displayed year/month as selected (accessibilityState.selected), and other months as not selected (正常系/境界値)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const currentMonthLabel = `${now.getFullYear()}年${MONTH_NAMES_JA[now.getMonth()]}へ移動`;
      const currentMonthButton = screen.getByLabelText(currentMonthLabel);
      expect(currentMonthButton.props.accessibilityState?.selected).toBe(true);

      // 日記が無いため、当月以外は選択不可(disabled)ラベルになる
      const otherMonthIndex = (now.getMonth() + 6) % 12;
      const otherMonthLabel = `${now.getFullYear()}年${MONTH_NAMES_JA[otherMonthIndex]}(選択できません)`;
      const otherMonthButton = screen.getByLabelText(otherMonthLabel);
      expect(otherMonthButton.props.accessibilityState?.selected).toBe(false);
    });

    it("does not mark any month button as selected once the picker year has been stepped away from the currently displayed year, since none of that year's months match the display (境界値/異常系)", async () => {
      const now = new Date();
      const previousYear = now.getFullYear() - 1;
      const storedEntries = [
        {
          id: 'old',
          text: '前年の日記',
          createdAt: new Date(previousYear, 0, 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      fireEvent.press(screen.getByLabelText('前の年'));

      for (const monthName of MONTH_NAMES_JA) {
        const button = screen.getByLabelText(`${previousYear}年${monthName}へ移動`);
        expect(button.props.accessibilityState?.selected).toBe(false);
      }
    });

    it('lets the picker go back to January ten years ago even with no diary entries, and disables earlier years (境界値: 日記が無い場合の下限)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      for (let i = 0; i < 10; i += 1) {
        fireEvent.press(screen.getByLabelText('前の年'));
      }
      const floorYear = now.getFullYear() - 10;
      expect(screen.getByText(`${floorYear}年`)).toBeTruthy();
      expect(screen.getByLabelText('前の年').props.accessibilityState?.disabled).toBe(true);
      expect(
        screen.getByLabelText(`${floorYear}年1月へ移動`).props.accessibilityState?.disabled,
      ).toBe(false);
    });

    it('lets the picker select past months that have no diary entries, so diaries can be backdated (正常系: 過去日の日記作成)', async () => {
      const now = new Date();
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: 'recent',
            text: '今月の日記',
            createdAt: new Date(now.getFullYear(), now.getMonth(), 15, 9, 0, 0).toISOString(),
          },
        ]),
      );
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      fireEvent.press(screen.getByLabelText('前の年'));
      const lastYearMonthButton = screen.getByLabelText(`${now.getFullYear() - 1}年3月へ移動`);
      expect(lastYearMonthButton.props.accessibilityState?.disabled).toBe(false);

      fireEvent.press(lastYearMonthButton);

      expect(await findCalendarHeaderText(now.getFullYear() - 1, 3)).toBeTruthy();
    });

    it('uses the oldest diary month as the lower bound when it is older than ten years ago, and disables earlier years/months in the picker (境界値)', async () => {
      const now = new Date();
      const minYear = now.getFullYear() - 12;
      const minMonth = 4;
      const storedEntries = [
        {
          id: 'oldest',
          text: '最古の日記',
          createdAt: new Date(minYear, minMonth - 1, 15, 9, 0, 0).toISOString(),
        },
        {
          id: 'newer',
          text: '新しい日記',
          createdAt: new Date(now.getFullYear(), now.getMonth(), 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);
      for (let i = 0; i < 12; i += 1) {
        fireEvent.press(screen.getByLabelText('前の年'));
      }
      expect(screen.getByText(`${minYear}年`)).toBeTruthy();

      const prevYearButton = screen.getByLabelText('前の年');
      expect(prevYearButton.props.accessibilityState?.disabled).toBe(true);

      const beforeMinMonthButton = screen.getByLabelText(
        `${minYear}年${minMonth - 1}月(選択できません)`,
      );
      expect(beforeMinMonthButton.props.accessibilityState?.disabled).toBe(true);

      const minMonthButton = screen.getByLabelText(`${minYear}年${minMonth}月へ移動`);
      expect(minMonthButton.props.accessibilityState?.disabled).toBe(false);
    });

    it('sets minDate to January 1st ten years ago on the underlying Calendar component when there are no diary entries yet (正常系)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      expect(calendar.props.minDate).toBe(`${now.getFullYear() - 10}-01-01`);
    });

    it('keeps minDate at January 1st ten years ago when the oldest diary entry is newer than that (境界値)', async () => {
      const now = new Date();
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: 'oldest',
            text: '最古の日記',
            createdAt: new Date(now.getFullYear() - 2, 3, 15, 9, 0, 0).toISOString(),
          },
        ]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      expect(calendar.props.minDate).toBe(`${now.getFullYear() - 10}-01-01`);
    });

    it('sets minDate to the first day of the oldest diary entry month on the underlying Calendar component when it is older than ten years ago (境界値)', async () => {
      const now = new Date();
      const minYear = now.getFullYear() - 12;
      const minMonth = 4;
      const storedEntries = [
        {
          id: 'oldest',
          text: '最古の日記',
          createdAt: new Date(minYear, minMonth - 1, 15, 9, 0, 0).toISOString(),
        },
        {
          id: 'newer',
          text: '新しい日記',
          createdAt: new Date(now.getFullYear(), now.getMonth(), 15, 9, 0, 0).toISOString(),
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      const [calendar] = screen.UNSAFE_getAllByType(Calendar);
      expect(calendar.props.minDate).toBe(`${minYear}-${`${minMonth}`.padStart(2, '0')}-01`);
    });

    // minDateにより、最古エントリの月より1日でも過去の日付セルは(未来日のmaxDateと同様に)
    // タップ不可・アクセシビリティdisabledになることを、スワイプ相当の移動後にも検証する
    it('disables the day cell immediately before the oldest diary entry month once the calendar is moved there, matching the same disabled treatment already used for future dates via maxDate', async () => {
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const minYear = 2012;
        const minMonth = 3;
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            {
              id: 'oldest',
              text: '最古の日記',
              createdAt: new Date(minYear, minMonth - 1, 15, 9, 0, 0).toISOString(),
            },
          ]),
        );

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 実際のスワイプ/矢印操作と同じ経路(onMonthChange)で最古エントリの月まで表示を移動する。
        // enableSwipeMonthsによる実際のジェスチャー自体はテストで再現できないため、
        // Calendar本体が発火するコールバックを直接呼ぶことで移動後の状態を再現する
        const [calendar] = screen.UNSAFE_getAllByType(Calendar);
        act(() => {
          calendar.props.onMonthChange({
            year: minYear,
            month: minMonth,
            day: 1,
            timestamp: new Date(minYear, minMonth - 1, 1).getTime(),
            dateString: `${minYear}-${`${minMonth}`.padStart(2, '0')}-01`,
          });
        });

        expect(
          await screen.findByText(`${minYear}年${minMonth}月`, { includeHiddenElements: true }),
        ).toBeTruthy();

        // 2012年3月1日(木曜)の直前、はみ出しセルとして描画される2012年2月29日はminDateにより
        // 過去日として無効化される
        const beforeMinDateCell = screen.getByLabelText(`${minYear}年2月29日、日記なし`);
        expect(beforeMinDateCell.props.accessibilityState?.disabled).toBe(true);

        // minDate当日(3月1日)自体は無効化されない
        const minDateCell = screen.getByLabelText(
          `${minYear}年${minMonth}月1日、日記なし、タップして新規作成`,
        );
        expect(minDateCell.props.accessibilityState?.disabled).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    // react-native-calendarsのminDate/maxDateは日付セルの見た目にのみ影響し、ヘッダー矢印タップ・
    // enableSwipeMonthsによるスワイプでの月送り自体はブロックしないため、範囲境界の実際の
    // 移動可否はonPressArrowLeft/onPressArrowRight/disableArrowLeft/disableArrowRightで検証する
    describe('カレンダーヘッダー矢印(タップ・スワイプ)による月送りの範囲制限', () => {
      it('enables the left arrow on the current month even when there are no diary entries yet, so past days can be backdated (正常系: 過去日の日記作成)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const [calendar] = screen.UNSAFE_getAllByType(Calendar);
        expect(calendar.props.disableArrowLeft).toBe(false);

        const subtractMonth = jest.fn();
        act(() => {
          calendar.props.onPressArrowLeft(subtractMonth);
        });

        expect(subtractMonth).toHaveBeenCalledTimes(1);
      });

      it('disables the left arrow once the calendar reaches January ten years ago with no diary entries (境界値: 日記が無い場合の下限)', async () => {
        const now = new Date();
        const floorYear = now.getFullYear() - 10;
        render(<HomeScreen />);
        await waitForInitialLoad();

        const [calendar] = screen.UNSAFE_getAllByType(Calendar);
        act(() => {
          calendar.props.onMonthChange({
            year: floorYear,
            month: 1,
            day: 1,
            timestamp: new Date(floorYear, 0, 1).getTime(),
            dateString: `${floorYear}-01-01`,
          });
        });
        expect(await findCalendarHeaderText(floorYear, 1)).toBeTruthy();
        expect(calendar.props.disableArrowLeft).toBe(true);

        const subtractMonth = jest.fn();
        act(() => {
          calendar.props.onPressArrowLeft(subtractMonth);
        });
        expect(subtractMonth).not.toHaveBeenCalled();
      });

      it('disables the right arrow and blocks moving to a future month when the calendar is showing the current month, since it is exactly the upper bound (境界値)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const [calendar] = screen.UNSAFE_getAllByType(Calendar);
        expect(calendar.props.disableArrowRight).toBe(true);

        const addMonth = jest.fn();
        act(() => {
          calendar.props.onPressArrowRight(addMonth);
        });

        expect(addMonth).not.toHaveBeenCalled();
      });

      it('disables the left arrow and blocks moving past the oldest diary entry month, while allowing it once the calendar has moved one month later than that boundary (境界値)', async () => {
        jest.useFakeTimers();
        try {
          const now = new Date(2026, 7, 25, 12, 0, 0);
          jest.setSystemTime(now);
          const minYear = 2012;
          const minMonth = 3;
          await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([
              {
                id: 'oldest',
                text: '最古の日記',
                createdAt: new Date(minYear, minMonth - 1, 15, 9, 0, 0).toISOString(),
              },
            ]),
          );

          render(<HomeScreen />);
          await waitForInitialLoad();

          const [calendar] = screen.UNSAFE_getAllByType(Calendar);
          act(() => {
            calendar.props.onMonthChange({
              year: minYear,
              month: minMonth,
              day: 1,
              timestamp: new Date(minYear, minMonth - 1, 1).getTime(),
              dateString: `${minYear}-${`${minMonth}`.padStart(2, '0')}-01`,
            });
          });
          expect(
            await screen.findByText(`${minYear}年${minMonth}月`, { includeHiddenElements: true }),
          ).toBeTruthy();
          expect(calendar.props.disableArrowLeft).toBe(true);

          const subtractMonth = jest.fn();
          act(() => {
            calendar.props.onPressArrowLeft(subtractMonth);
          });
          expect(subtractMonth).not.toHaveBeenCalled();

          // 最古月より1ヶ月新しい月へ移動すると、範囲の内側なので通常どおり左矢印が動作する
          act(() => {
            calendar.props.onMonthChange({
              year: minYear,
              month: minMonth + 1,
              day: 1,
              timestamp: new Date(minYear, minMonth, 1).getTime(),
              dateString: `${minYear}-${`${minMonth + 1}`.padStart(2, '0')}-01`,
            });
          });
          expect(
            await screen.findByText(`${minYear}年${minMonth + 1}月`, {
              includeHiddenElements: true,
            }),
          ).toBeTruthy();
          expect(calendar.props.disableArrowLeft).toBe(false);

          const secondSubtractMonth = jest.fn();
          act(() => {
            calendar.props.onPressArrowLeft(secondSubtractMonth);
          });
          expect(secondSubtractMonth).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });

      it('enables the right arrow and calls the passed callback once the calendar has moved one month earlier than the upper bound, since it is no longer exactly at the boundary (境界値)', async () => {
        jest.useFakeTimers();
        try {
          const now = new Date(2026, 7, 25, 12, 0, 0);
          jest.setSystemTime(now);

          render(<HomeScreen />);
          await waitForInitialLoad();

          const [calendar] = screen.UNSAFE_getAllByType(Calendar);
          act(() => {
            calendar.props.onMonthChange({
              year: 2026,
              month: 7,
              day: 1,
              timestamp: new Date(2026, 6, 1).getTime(),
              dateString: '2026-07-01',
            });
          });
          expect(
            await screen.findByText('2026年7月', { includeHiddenElements: true }),
          ).toBeTruthy();
          expect(calendar.props.disableArrowRight).toBe(false);

          const addMonth = jest.fn();
          act(() => {
            calendar.props.onPressArrowRight(addMonth);
          });
          expect(addMonth).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });
});
