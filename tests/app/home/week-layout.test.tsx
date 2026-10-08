/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import HomeScreen from '@/app/(tabs)/index';
import { EMPTY_STATE_MESSAGE_MONTH, EMPTY_STATE_MESSAGE_WEEK } from '@/constants/diary-messages';
import { ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH } from '@/utils/diary-text';
import {
  CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY,
  CalendarLayoutPreferenceProvider,
} from '@/contexts/calendar-layout-preference-context';
import {
  buildCreatedAtForDateKey,
  formatDateHeading,
  getWeekDays,
  toDateKey,
} from '@/utils/diary-date';
import {
  STORAGE_KEY,
  isoAt,
  type TestNode,
  waitForInitialLoad,
  triggerRefocus,
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

  describe('週表示レイアウト', () => {
    // カレンダー表示レイアウトの設定は`app/_layout.tsx`で`CalendarLayoutPreferenceProvider`が
    // ルートに配線されているが、単体レンダリングではそのラップが無いため、
    // 明示的に`CalendarLayoutPreferenceProvider`でラップして実機と同じ構成を再現する
    // (tests/app/settings.test.tsxの外観セクションのテストと同じ方針)。
    function renderHomeScreenWithLayoutProvider() {
      return render(
        <CalendarLayoutPreferenceProvider>
          <HomeScreen />
        </CalendarLayoutPreferenceProvider>,
      );
    }

    async function renderInWeekLayout() {
      await AsyncStorage.setItem(CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY, 'week');
      renderHomeScreenWithLayoutProvider();
      // CalendarLayoutPreferenceProviderの起動時読み込み(既定値'month'→'week')が
      // 反映されるのを待つ
      await waitFor(() => expect(screen.UNSAFE_queryAllByType(Calendar)).toHaveLength(0));
    }

    // 週表示カレンダーの日記項目Pressableを、実装側が付与する
    // `accessibilityLabel="<見出し>の日記: <本文>"`を目印に絞り込むヘルパー
    function queryWeekEntryButtons() {
      return screen
        .queryAllByRole('button')
        .filter((button) =>
          (button.props.accessibilityLabel as string | undefined)?.includes('の日記:'),
        );
    }

    // 週ヘッダーの日付フォーカス切り替えボタン(`accessibilityLabel="<見出し>にフォーカスを移動"`)を、
    // 対象の日付キーで1件取得するヘルパー
    function getWeekDayFocusButton(dateKey: string) {
      return screen.getByLabelText(`${formatDateHeading(dateKey)}にフォーカスを移動`);
    }

    // フォーカス中の日の見出し(ナビゲーションバー中央のテキスト)を取得するヘルパー
    function getFocusedDayHeading() {
      return screen.getByText(/^\d{4}年\d{1,2}月\d{1,2}日$/);
    }

    it('renders the week-view weekday header (日 月 火 水 木 金 土) instead of the month Calendar when the layout preference is "week" (正常系)', async () => {
      await renderInWeekLayout();

      expect(screen.UNSAFE_queryAllByType(Calendar)).toHaveLength(0);
      for (const dayName of ['日', '月', '火', '水', '木', '金', '土']) {
        expect(screen.getByText(dayName)).toBeTruthy();
      }
    });

    it('shows all 7 day numbers of the week containing today, including today itself (正常系: 初回表示は当日を含む週)', async () => {
      const now = new Date();
      const weekDays = getWeekDays(now);
      await renderInWeekLayout();

      for (const weekDay of weekDays) {
        expect(screen.getByText(String(weekDay.day))).toBeTruthy();
      }
    });

    it("renders the month Calendar when the layout preference is the default 'month' (既定の月表示)", async () => {
      renderHomeScreenWithLayoutProvider();
      await waitForInitialLoad();

      expect(screen.UNSAFE_queryAllByType(Calendar)).toHaveLength(1);
      expect(queryWeekEntryButtons()).toHaveLength(0);
    });

    it("shows a diary entry under today's column and navigates to the day-entries screen for today's date when it is pressed (正常系)", async () => {
      const now = new Date();
      const todayKey = toDateKey(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日の出来事', createdAt: buildCreatedAtForDateKey(todayKey) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons();
      expect(entryButtons).toHaveLength(1);
      expect(entryButtons[0].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: 今日の出来事`,
      );

      fireEvent.press(entryButtons[0]);
      expect(mockPush).toHaveBeenCalledWith(`/day-entries/${todayKey}`);
    });

    it('truncates a long diary entry text in the accessibilityLabel of a week-view entry while keeping the full text rendered (正常系)', async () => {
      const todayKey = toDateKey(new Date());
      const longText = 'あ'.repeat(ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH + 30);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: longText, createdAt: buildCreatedAtForDateKey(todayKey) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons();
      expect(entryButtons).toHaveLength(1);
      expect(entryButtons[0].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: ${'あ'.repeat(ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH)}…`,
      );
      expect(screen.getByText(longText)).toBeTruthy();
    });

    it('keeps the full text in the accessibilityLabel of a week-view entry whose text is exactly at the limit, and truncates one grapheme over it (境界値)', async () => {
      const todayKey = toDateKey(new Date());
      const now = new Date();
      const exactText = 'あ'.repeat(ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH);
      const overText = 'い'.repeat(ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH + 1);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'exact', text: exactText, createdAt: isoAt(now, now.getDate(), 7, 0) },
          { id: 'over', text: overText, createdAt: isoAt(now, now.getDate(), 21, 0) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons();
      expect(entryButtons).toHaveLength(2);
      expect(entryButtons[0].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: ${exactText}`,
      );
      expect(entryButtons[1].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: ${'い'.repeat(ACCESSIBILITY_LABEL_TEXT_MAX_LENGTH)}…`,
      );
    });

    it('sorts multiple diary entries on the same day within the week in ascending order of createdAt (正常系: 作成日時昇順)', async () => {
      const now = new Date();
      const todayKey = toDateKey(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'late', text: '夜の日記', createdAt: isoAt(now, now.getDate(), 21, 0) },
          { id: 'early', text: '朝の日記', createdAt: isoAt(now, now.getDate(), 7, 0) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons().filter((button) =>
        (button.props.accessibilityLabel as string).startsWith(formatDateHeading(todayKey)),
      );
      expect(entryButtons).toHaveLength(2);
      expect(entryButtons[0].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: 朝の日記`,
      );
      expect(entryButtons[1].props.accessibilityLabel).toBe(
        `${formatDateHeading(todayKey)}の日記: 夜の日記`,
      );
    });

    it('does not show a diary entry under a day of the week that has no entries, even when another day in the same week has one (境界値: entriesByDateにキーが無い日付)', async () => {
      const now = new Date();
      const weekDays = getWeekDays(now);
      const todayKey = toDateKey(now);
      // 今日以外の週内の日付を1つ選ぶ(週は7日あるため必ず1つ以上存在する)
      const otherDay = weekDays.find((day) => day.dateKey !== todayKey);
      if (!otherDay) {
        throw new Error('expected at least one other day in the week');
      }

      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日の日記', createdAt: buildCreatedAtForDateKey(todayKey) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons();
      // otherDay列には日記が無いため、週全体で表示される日記項目は1件のみ
      expect(entryButtons).toHaveLength(1);
      expect(
        entryButtons.some((button) =>
          (button.props.accessibilityLabel as string).startsWith(
            formatDateHeading(otherDay.dateKey),
          ),
        ),
      ).toBe(false);
    });

    it('shows diary entries grouped under the correct day column across different days within the same week (正常系)', async () => {
      const now = new Date();
      const weekDays = getWeekDays(now);
      const todayKey = toDateKey(now);
      const otherDay = weekDays.find((day) => day.dateKey !== todayKey);
      if (!otherDay) {
        throw new Error('expected at least one other day in the week');
      }

      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日の日記', createdAt: buildCreatedAtForDateKey(todayKey) },
          { id: '2', text: '別の日の日記', createdAt: buildCreatedAtForDateKey(otherDay.dateKey) },
        ]),
      );
      jest.clearAllMocks();

      await renderInWeekLayout();

      const entryButtons = queryWeekEntryButtons();
      expect(entryButtons).toHaveLength(2);
      expect(
        entryButtons.some(
          (button) =>
            button.props.accessibilityLabel === `${formatDateHeading(todayKey)}の日記: 今日の日記`,
        ),
      ).toBe(true);
      expect(
        entryButtons.some(
          (button) =>
            button.props.accessibilityLabel ===
            `${formatDateHeading(otherDay.dateKey)}の日記: 別の日の日記`,
        ),
      ).toBe(true);
    });

    describe('日記の無い日の新規作成ボタン', () => {
      // 2026-06-15(月)。同じ週の前日(6/14)が過去日、6/16以降が未来日になる
      const FIXED_NOW = new Date(2026, 5, 15, 9, 34, 17);
      const PAST_DATE_KEY = '2026-06-14';
      const TODAY_DATE_KEY = '2026-06-15';

      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_NOW);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      // 日記の読み込み完了(ローディング表示の消滅)まで待ってから検証に入る
      async function renderInWeekLayoutAfterLoad() {
        await renderInWeekLayout();
        await waitForInitialLoad();
      }

      function queryWeekCreateButtons() {
        return screen
          .queryAllByRole('button')
          .filter((button) =>
            (button.props.accessibilityLabel as string | undefined)?.endsWith('の日記を新規作成'),
          );
      }

      function getWeekCreateButton(dateKey: string) {
        return screen.getByLabelText(`${formatDateHeading(dateKey)}の日記を新規作成`);
      }

      function getNewEntryInput() {
        const input = screen
          .getAllByLabelText('日記本文')
          .find(
            (candidate) =>
              candidate.props.placeholder === 'その日の出来事や気持ちを書いてみましょう',
          );
        expect(input).toBeTruthy();
        return input!;
      }

      it('shows a create button only for days without entries that are today or in the past, and none for future days (正常系・境界値: 今日と未来日の境界)', async () => {
        await renderInWeekLayoutAfterLoad();

        const createButtons = queryWeekCreateButtons();
        expect(createButtons.map((button) => button.props.accessibilityLabel)).toEqual([
          `${formatDateHeading(PAST_DATE_KEY)}の日記を新規作成`,
          `${formatDateHeading(TODAY_DATE_KEY)}の日記を新規作成`,
        ]);
      });

      it('does not show any create button while the entries are still loading, and shows them once loading has finished (境界値: 読み込み中は日記の有無が未確定)', async () => {
        let resolveGetAllKeys: (value: string[]) => void = () => {};
        jest.spyOn(AsyncStorage, 'getAllKeys').mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveGetAllKeys = resolve as (value: string[]) => void;
            }),
        );

        await AsyncStorage.setItem(CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY, 'week');
        renderHomeScreenWithLayoutProvider();
        await waitFor(() => expect(screen.UNSAFE_queryAllByType(Calendar)).toHaveLength(0));

        expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
        expect(queryWeekCreateButtons()).toHaveLength(0);

        await act(async () => {
          resolveGetAllKeys([]);
        });

        expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
        expect(queryWeekCreateButtons()).toHaveLength(2);
      });

      it('does not show a create button for a day that already has an entry (正常系)', async () => {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日の日記', createdAt: buildCreatedAtForDateKey(TODAY_DATE_KEY) },
          ]),
        );
        jest.clearAllMocks();

        await renderInWeekLayoutAfterLoad();

        expect(queryWeekCreateButtons()).toHaveLength(1);
        expect(
          screen.queryByLabelText(`${formatDateHeading(TODAY_DATE_KEY)}の日記を新規作成`),
        ).toBeNull();
        expect(getWeekCreateButton(PAST_DATE_KEY)).toBeTruthy();
      });

      it('gives the create button a button role and a touch target of at least 44pt (アクセシビリティ)', async () => {
        await renderInWeekLayoutAfterLoad();

        const button = getWeekCreateButton(PAST_DATE_KEY);
        expect(button.props.accessibilityRole).toBe('button');
        expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
      });

      it('gives the create button a hitSlop to enlarge the tap area (アクセシビリティ)', async () => {
        await renderInWeekLayoutAfterLoad();

        expect(getWeekCreateButton(PAST_DATE_KEY).props.hitSlop).toBe(8);
      });

      it('shows a single week-specific empty message at the top instead of the in-week hint when there are no diary entries at all (正常系: 空状態の案内の一本化)', async () => {
        await renderInWeekLayoutAfterLoad();

        expect(screen.getByText(EMPTY_STATE_MESSAGE_WEEK)).toBeTruthy();
        expect(screen.queryByText(EMPTY_STATE_MESSAGE_MONTH)).toBeNull();
        expect(screen.queryByText(/「\+」をタップすると/)).toBeNull();
        expect(
          StyleSheet.flatten(getWeekCreateButton(TODAY_DATE_KEY).props.style).borderWidth,
        ).toBe(2);
      });

      it('shows a hint explaining the "+" button and emphasizes only the today column when the displayed week has no entries but other weeks do (正常系)', async () => {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '先月の日記', createdAt: buildCreatedAtForDateKey('2026-05-10') },
          ]),
        );
        jest.clearAllMocks();

        await renderInWeekLayoutAfterLoad();

        expect(screen.queryByText(EMPTY_STATE_MESSAGE_WEEK)).toBeNull();
        expect(screen.getByText(/「\+」をタップすると/)).toBeTruthy();
        expect(
          StyleSheet.flatten(getWeekCreateButton(TODAY_DATE_KEY).props.style).borderWidth,
        ).toBe(2);
        expect(StyleSheet.flatten(getWeekCreateButton(PAST_DATE_KEY).props.style).borderWidth).toBe(
          1,
        );
      });

      it('does not show the hint nor emphasize the today column when the week has an entry (境界値)', async () => {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '過去の日記', createdAt: buildCreatedAtForDateKey(PAST_DATE_KEY) },
          ]),
        );
        jest.clearAllMocks();

        await renderInWeekLayoutAfterLoad();

        expect(screen.queryByText(/「\+」をタップすると/)).toBeNull();
        expect(
          StyleSheet.flatten(getWeekCreateButton(TODAY_DATE_KEY).props.style).borderWidth,
        ).toBe(1);
      });

      it('shows a create button on every day of a fully past week (境界値: 全日が過去の週)', async () => {
        await renderInWeekLayoutAfterLoad();

        fireEvent.press(screen.getByLabelText('前の日へ移動'));
        fireEvent.press(screen.getByLabelText('前の日へ移動'));

        expect(queryWeekCreateButtons()).toHaveLength(7);
      });

      it('opens the new-entry modal for the tapped past day without navigating or moving the focus (正常系)', async () => {
        await renderInWeekLayoutAfterLoad();

        fireEvent.press(getWeekCreateButton(PAST_DATE_KEY));

        expect(
          await screen.findByText(`${formatDateHeading(PAST_DATE_KEY)}の日記を書く`),
        ).toBeTruthy();
        expect(getNewEntryInput()).toBeTruthy();
        expect(mockPush).not.toHaveBeenCalled();
        expect(screen.getByText(formatDateHeading(TODAY_DATE_KEY))).toBeTruthy();
      });

      it('saves an entry anchored to the tapped day and replaces its create button with the entry (正常系: 保存後の反映)', async () => {
        await renderInWeekLayoutAfterLoad();

        fireEvent.press(getWeekCreateButton(PAST_DATE_KEY));
        fireEvent.changeText(getNewEntryInput(), '過去日の日記');
        fireEvent.press(screen.getAllByText('保存')[1]);

        await waitFor(() => expect(queryWeekEntryButtons()).toHaveLength(1));
        expect(queryWeekEntryButtons()[0].props.accessibilityLabel).toBe(
          `${formatDateHeading(PAST_DATE_KEY)}の日記: 過去日の日記`,
        );
        expect(
          screen.queryByLabelText(`${formatDateHeading(PAST_DATE_KEY)}の日記を新規作成`),
        ).toBeNull();
        expect(getWeekCreateButton(TODAY_DATE_KEY)).toBeTruthy();
      });

      it('keeps moving the focus, not opening the modal, when a day header is pressed (日付ヘッダーの操作は新規作成ボタンと独立している)', async () => {
        await renderInWeekLayoutAfterLoad();

        fireEvent.press(
          screen.getByLabelText(`${formatDateHeading(PAST_DATE_KEY)}にフォーカスを移動`),
        );

        expect(screen.getByText(formatDateHeading(PAST_DATE_KEY))).toBeTruthy();
        expect(screen.queryByText(/の日記を書く$/)).toBeNull();
      });
    });

    describe('「今日」判定の自動更新', () => {
      // 今日バッジ特有のスタイル(丸背景に合わせた太字)を持つ、指定した日番号のテキストを取得する
      function getTodayBadgeDayText(day: number) {
        return screen
          .getAllByText(String(day))
          .find((node) => StyleSheet.flatten(node.props.style ?? {}).fontWeight === '700');
      }

      afterEach(() => {
        jest.useRealTimers();
      });

      it('moves the "today" highlight to the next day after the date changes while the week view stays mounted across midnight (境界値: 日付をまたいで表示し続けた場合)', async () => {
        // 2026-09-09(水)23:59から日をまたいで2026-09-10(木)0:00になる
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 23, 59, 30));

        await renderInWeekLayout();
        expect(getTodayBadgeDayText(9)).toBeTruthy();
        expect(getTodayBadgeDayText(10)).toBeUndefined();

        jest.setSystemTime(new Date(2026, 8, 10, 0, 0, 30));
        act(() => {
          jest.advanceTimersByTime(2 * 60 * 1000);
        });

        expect(getTodayBadgeDayText(9)).toBeUndefined();
        expect(getTodayBadgeDayText(10)).toBeTruthy();
      });

      it('immediately refreshes the "today" highlight on refocus, without waiting for the periodic timer (正常系: useFocusEffectによる即時更新)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 23, 59, 30));

        await renderInWeekLayout();
        expect(getTodayBadgeDayText(9)).toBeTruthy();

        jest.setSystemTime(new Date(2026, 8, 10, 0, 0, 30));
        // 再フォーカスで走る非同期の再読み込み(setEntries等)まで含めてactで流し切る
        await act(async () => {
          (triggerRefocus as () => void)();
        });

        expect(getTodayBadgeDayText(9)).toBeUndefined();
        expect(getTodayBadgeDayText(10)).toBeTruthy();
      });

      it('does not refresh the "today" highlight before a full refresh interval elapses, and refreshes right at the interval boundary (境界値: 再評価タイマーの周期(60秒)ちょうど)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 23, 59, 0));

        await renderInWeekLayout();
        expect(getTodayBadgeDayText(9)).toBeTruthy();

        jest.setSystemTime(new Date(2026, 8, 10, 0, 0, 0));
        act(() => {
          jest.advanceTimersByTime(59_999);
        });
        expect(getTodayBadgeDayText(9)).toBeTruthy();
        expect(getTodayBadgeDayText(10)).toBeUndefined();

        act(() => {
          jest.advanceTimersByTime(1);
        });
        expect(getTodayBadgeDayText(9)).toBeUndefined();
        expect(getTodayBadgeDayText(10)).toBeTruthy();
      });

      it('clears the periodic re-evaluation timer when the week view unmounts (異常系: アンマウント後のタイマーリーク防止)', async () => {
        jest.useFakeTimers();
        // アプリ全体でこの機能以外にsetIntervalを使っている箇所は無いため、
        // clearIntervalの呼び出し回数からクリーンアップの実行を直接検証できる
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
        try {
          await AsyncStorage.setItem(CALENDAR_LAYOUT_PREFERENCE_STORAGE_KEY, 'week');
          const { unmount } = renderHomeScreenWithLayoutProvider();
          await waitFor(() => expect(screen.UNSAFE_queryAllByType(Calendar)).toHaveLength(0));
          expect(clearIntervalSpy).not.toHaveBeenCalled();

          unmount();

          expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
        } finally {
          // 復元しないと以降のテストでもspyが残り続け、jest.useRealTimers()後に
          // フェイクタイマー用の実装を参照したままのclearIntervalが呼ばれて壊れる
          clearIntervalSpy.mockRestore();
        }
      });
    });

    describe('日付フォーカスの移動(ヘッダーの日付タップ・前後日ボタンのタップ・週をまたぐ移動)', () => {
      afterEach(() => {
        jest.useRealTimers();
      });

      it('focuses today by default, and moves focus to the tapped date when a different day in the week header is pressed (正常系)', async () => {
        // 2026-09-09は水曜日で、週は2026-09-06(日)〜2026-09-12(土)
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-09'));
        expect(getWeekDayFocusButton('2026-09-09').props.accessibilityState.selected).toBe(true);
        expect(getWeekDayFocusButton('2026-09-07').props.accessibilityState.selected).toBe(false);

        fireEvent.press(getWeekDayFocusButton('2026-09-07'));

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-07'));
        expect(getWeekDayFocusButton('2026-09-07').props.accessibilityState.selected).toBe(true);
        expect(getWeekDayFocusButton('2026-09-09').props.accessibilityState.selected).toBe(false);
      });

      it('moves the focused date forward/backward by one day when the next/previous day buttons are tapped (正常系)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        fireEvent.press(screen.getByLabelText('次の日へ移動'));
        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-10'));

        fireEvent.press(screen.getByLabelText('前の日へ移動'));
        fireEvent.press(screen.getByLabelText('前の日へ移動'));
        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-08'));
      });

      it('switches to the next week (without breaking) when the next-day button crosses the end of the current week (境界値: 週をまたぐ移動)', async () => {
        // 2026-09-12は週の最終日(土曜日)。次の日(2026-09-13、日曜日)は次の週に属する
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 12, 12, 0, 0));

        await renderInWeekLayout();
        // 移動前は2026-09-06(日)〜2026-09-12(土)の週が表示されている
        expect(getWeekDayFocusButton('2026-09-06')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('次の日へ移動'));

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-13'));
        expect(getWeekDayFocusButton('2026-09-13').props.accessibilityState.selected).toBe(true);
        // 表示週が次の週(2026-09-13〜2026-09-19)に切り替わっている
        expect(getWeekDayFocusButton('2026-09-19')).toBeTruthy();
        expect(
          screen.queryByLabelText(`${formatDateHeading('2026-09-06')}にフォーカスを移動`),
        ).toBeNull();
      });

      it('switches to the previous week (without breaking) when the previous-day button crosses the start of the current week (境界値: 週をまたぐ移動)', async () => {
        // 2026-09-06は週の最初の日(日曜日)。前の日(2026-09-05、土曜日)は前の週に属する
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 6, 12, 0, 0));

        await renderInWeekLayout();

        fireEvent.press(screen.getByLabelText('前の日へ移動'));

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-05'));
        expect(getWeekDayFocusButton('2026-09-05').props.accessibilityState.selected).toBe(true);
        // 表示週が前の週(2026-08-30〜2026-09-05)に切り替わっている
        expect(getWeekDayFocusButton('2026-08-30')).toBeTruthy();
        expect(
          screen.queryByLabelText(`${formatDateHeading('2026-09-12')}にフォーカスを移動`),
        ).toBeNull();
      });
    });

    describe('スワイプ操作によるフォーカス移動(PanResponderによる左右スワイプ)', () => {
      afterEach(() => {
        jest.useRealTimers();
      });

      // PanResponderは実際のタッチイベント系列(touchHistory)からgestureStateのdx/dyを内部で
      // 累積計算するため、fireEventで単純にdx/dyを渡すことはできない。react-native本体の
      // TouchHistoryMathの計算式に沿って、start(0,0)からend(dx,dy)へ移動した単一タッチの履歴を
      // 組み立て、実際のジェスチャーレスポンダーシステムがPanResponderの内部gestureStateを
      // 更新するのに使う捕捉フェーズハンドラ(onMoveShouldSetResponderCapture)経由でdx/dyを
      // 反映させたうえで、リリース(onResponderRelease)を発火させる
      function buildSingleTouchHistory(dx: number, dy: number) {
        return {
          touchBank: [
            {
              touchActive: true,
              currentTimeStamp: 100,
              currentPageX: dx,
              currentPageY: dy,
              previousPageX: 0,
              previousPageY: 0,
            },
          ],
          numberActiveTouches: 1,
          indexOfSingleActiveTouch: 0,
          mostRecentTimeStamp: 100,
        };
      }

      // WeekCalendarViewの外枠View(PanResponder.panHandlersがスプレッドされている)を、
      // onMoveShouldSetResponderCapture/onResponderReleaseを両方持つホストViewであることを
      // 目印に特定する(Pressable内部の実装はこの2つを同時には持たないため一意に絞り込める)
      function getWeekSwipeResponderView() {
        const candidates = screen.root.findAll(
          (node: TestNode) =>
            node.type === View &&
            typeof node.props.onMoveShouldSetResponderCapture === 'function' &&
            typeof node.props.onResponderRelease === 'function',
        );
        if (candidates.length !== 1) {
          throw new Error(
            `expected exactly one week swipe responder view, found ${candidates.length}`,
          );
        }
        return candidates[0];
      }

      function simulateWeekSwipe(dx: number, dy: number) {
        const responderView = getWeekSwipeResponderView();
        const touchHistory = buildSingleTouchHistory(dx, dy);
        act(() => {
          responderView.props.onMoveShouldSetResponderCapture({ touchHistory });
        });
        act(() => {
          responderView.props.onResponderRelease({ touchHistory });
        });
      }

      it('moves focus to the next day on a leftward swipe past the threshold (正常系)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        simulateWeekSwipe(-50, 0);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-10'));
      });

      it('moves focus to the previous day on a rightward swipe past the threshold (正常系)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        simulateWeekSwipe(50, 0);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-08'));
      });

      it('does not move focus when the horizontal swipe distance is below the threshold (境界値)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        simulateWeekSwipe(-20, 0);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-09'));
      });

      it('does not move focus when the vertical movement is greater than or equal to the horizontal movement, to avoid conflicting with vertical scrolling (境界値)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));

        await renderInWeekLayout();

        simulateWeekSwipe(-50, 60);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-09'));
      });

      it('switches to the next week on a leftward swipe that crosses the end of the current week, and shows the diary entry that belongs to the newly focused day (境界値: 週をまたぐスワイプ移動)', async () => {
        // 2026-09-12は週の最終日(土曜日)。スワイプで次の日(2026-09-13、日曜日、次の週)へ移動する
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 12, 12, 0, 0));
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '次の週の日記', createdAt: buildCreatedAtForDateKey('2026-09-13') },
          ]),
        );
        jest.clearAllMocks();

        await renderInWeekLayout();
        expect(getWeekDayFocusButton('2026-09-06')).toBeTruthy();
        expect(queryWeekEntryButtons()).toHaveLength(0);

        simulateWeekSwipe(-50, 0);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-13'));
        expect(getWeekDayFocusButton('2026-09-13').props.accessibilityState.selected).toBe(true);
        expect(getWeekDayFocusButton('2026-09-19')).toBeTruthy();
        expect(
          screen.queryByLabelText(`${formatDateHeading('2026-09-06')}にフォーカスを移動`),
        ).toBeNull();
        // 週が切り替わったことで、新しい週に属する日記が一覧に表示されるようになる
        const entryButtons = queryWeekEntryButtons();
        expect(entryButtons).toHaveLength(1);
        expect(entryButtons[0].props.accessibilityLabel).toBe(
          `${formatDateHeading('2026-09-13')}の日記: 次の週の日記`,
        );
      });

      it('switches to the previous week on a rightward swipe that crosses the start of the current week (境界値: 週をまたぐスワイプ移動)', async () => {
        // 2026-09-06は週の最初の日(日曜日)。スワイプで前の日(2026-09-05、土曜日、前の週)へ移動する
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 8, 6, 12, 0, 0));

        await renderInWeekLayout();

        simulateWeekSwipe(50, 0);

        expect(getFocusedDayHeading()).toHaveTextContent(formatDateHeading('2026-09-05'));
        expect(getWeekDayFocusButton('2026-09-05').props.accessibilityState.selected).toBe(true);
        expect(getWeekDayFocusButton('2026-08-30')).toBeTruthy();
        expect(
          screen.queryByLabelText(`${formatDateHeading('2026-09-12')}にフォーカスを移動`),
        ).toBeNull();
      });
    });
  });
});
