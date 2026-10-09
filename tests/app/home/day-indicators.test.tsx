/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import {} from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import {
  STORAGE_KEY,
  pickTestDays,
  pickNonTodayDayInRange,
  isoAt,
  toDateKeyForTest,
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

  describe('カレンダーセルの日記件数インジケーター(ドット/バッジ)', () => {
    // 日記が0件の日は何も表示せず、1件の日はドット(styles.entryDot)、2件以上の日は
    // 合計件数を表示する丸バッジ(styles.entryCountBadge)を表示する。
    // ドットは`width: 10, height: 10`、バッジ本体は`minWidth: 16, height: 16`という
    // 一意な組み合わせのスタイルを持つため、それぞれを目印にView自体を特定するヘルパーを用意する。
    function findEntryDotViews() {
      return screen.UNSAFE_getAllByType(View).filter((node) => {
        const flattened = StyleSheet.flatten(node.props.style ?? {});
        return flattened.width === 10 && flattened.height === 10;
      });
    }

    function findEntryCountBadgeViews() {
      return screen.UNSAFE_getAllByType(View).filter((node) => {
        const flattened = StyleSheet.flatten(node.props.style ?? {});
        return flattened.minWidth === 16 && flattened.height === 16;
      });
    }

    // バッジ内の件数テキスト(styles.entryCountText)を取得するヘルパー。日付セルの数字
    // (例: 二桁未満の日付は同じ文字列になりうる)と衝突しうるため、素朴なgetByText(String(count))
    // ではなく、バッジテキストに固有のスタイル(lineHeight: 11。詳細は下のテストを参照)を
    // 目印に絞り込む。
    function findEntryCountBadgeTexts() {
      return screen.UNSAFE_getAllByType(Text).filter((node) => {
        const flattened = StyleSheet.flatten(node.props.style ?? {});
        return flattened.lineHeight === 11;
      });
    }

    it('shows neither a dot nor a count badge when there are no diary entries at all (境界値: 0件)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(findEntryDotViews()).toHaveLength(0);
      expect(findEntryCountBadgeViews()).toHaveLength(0);
    });

    it('shows a dot (not a count badge, and not the entry title) when a day has exactly 1 diary entry (正常系/境界値: 単一件数)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '1件のみの日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(findEntryDotViews()).toHaveLength(1);
      expect(findEntryCountBadgeViews()).toHaveLength(0);
      // 1件目のタイトル文字列自体はセルには表示されない(モーダルを開いたときのみ表示される)
      expect(screen.queryByText('1件のみの日記')).toBeNull();
    });

    it('shows a count badge displaying the total "2" (not "+1") when a day has exactly 2 diary entries (正常系)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(findEntryDotViews()).toHaveLength(0);
      const badgeTexts = findEntryCountBadgeTexts();
      expect(badgeTexts).toHaveLength(1);
      expect(String(badgeTexts[0].props.children)).toBe('2');
      expect(screen.queryByText('+1')).toBeNull();
      expect(findEntryCountBadgeViews()).toHaveLength(1);
      // セル自体にはどちらの日記のタイトルも表示されない
      expect(screen.queryByText('朝の日記')).toBeNull();
      expect(screen.queryByText('夜の日記')).toBeNull();
    });

    it('shows a count badge displaying the total "3" (not "+2") when a day has exactly 3 diary entries (正常系)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '昼の日記', createdAt: isoAt(now, dayWithEntry, 12, 0) },
        { id: '3', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const badgeTexts = findEntryCountBadgeTexts();
      expect(badgeTexts).toHaveLength(1);
      expect(String(badgeTexts[0].props.children)).toBe('3');
      expect(screen.queryByText('+2')).toBeNull();
    });

    it('shows a count badge displaying the total "4" when a day has 4 diary entries (正常系: 最小の複数件数境界(2件)より先まで正しくスケールすることの確認)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [0, 1, 2, 3].map((i) => ({
        id: `${i}`,
        text: `${i}件目の日記`,
        createdAt: isoAt(now, dayWithEntry, 6 + i * 4, 0),
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const badgeTexts = findEntryCountBadgeTexts();
      expect(badgeTexts).toHaveLength(1);
      expect(String(badgeTexts[0].props.children)).toBe('4');
      expect(findEntryCountBadgeViews()).toHaveLength(1);
    });

    it('does not show a dot or badge on a day with no entries (entriesByDate has no key for it), even while another day in the same month has multiple entries (境界値: entriesByDateにキーが無い日付)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      // 複数件の日には1つだけバッジが表示され、日記の無い日(dayWithoutEntry)には表示されない。
      // dayWithEntryとdayWithoutEntryの範囲は重複しないため、バッジが1個のみであることの確認は
      // dayWithoutEntry側にバッジが無いことの確認を兼ねる
      expect(findEntryCountBadgeViews()).toHaveLength(1);
      expect(findEntryDotViews()).toHaveLength(0);
    });

    it('renders the dot with tintColor as its background, following the same theme-color convention as the count badge (正常系: 単一件数のテーマ色)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '1件のみの日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const [dotView] = findEntryDotViews();
      expect(StyleSheet.flatten(dotView.props.style).backgroundColor).toBe(Colors.light.tint);
    });

    it('renders the badge with tintColor as its background and backgroundColor as its text color, following the same theme-color convention as the today badge (異常系/回帰防止: テーマ色の取り違え防止)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const [badgeText] = findEntryCountBadgeTexts();
      expect(StyleSheet.flatten(badgeText.props.style).color).toBe(Colors.light.background);

      const [badgeView] = findEntryCountBadgeViews();
      expect(StyleSheet.flatten(badgeView.props.style).backgroundColor).toBe(Colors.light.tint);
    });

    it("sets an explicit lineHeight close to fontSize on the badge text, overriding ThemedText's inherited default lineHeight so the digit stays vertically centered within the circle (回帰防止)", async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const [badgeText] = findEntryCountBadgeTexts();
      const flattened = StyleSheet.flatten(badgeText.props.style);
      // ThemedTextのdefaultスタイルのlineHeight(24)をそのまま引き継ぐと、高さ16pxのバッジ内で
      // 数字が下寄りになるため、fontSizeに近い値が明示的に上書きされていることを確認する
      expect(flattened.lineHeight).toBe(11);
      expect(flattened.lineHeight).toBeLessThan(24);
    });

    it('shows a count badge displaying the total "11" (not "+10") when a day has 11 diary entries, confirming double-digit counts still render correctly inside the badge (境界値: 2桁の件数)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = Array.from({ length: 11 }, (_, i) => ({
        id: `${i}`,
        text: `${i}件目の日記`,
        createdAt: isoAt(now, dayWithEntry, i, 0),
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const badgeTexts = findEntryCountBadgeTexts();
      expect(badgeTexts).toHaveLength(1);
      expect(String(badgeTexts[0].props.children)).toBe('11');
      expect(screen.queryByText('+10')).toBeNull();
      expect(findEntryCountBadgeViews()).toHaveLength(1);
    });

    it('keeps the count badge visible after tapping the day cell to navigate to the day-entries screen (the badge does not disappear due to the navigation)', async () => {
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
          { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
          { id: '2', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
        ];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

        render(<HomeScreen />);
        await waitForInitialLoad();
        expect(findEntryCountBadgeViews()).toHaveLength(1);

        fireEvent.press(screen.getByText(String(dayWithEntry)));
        expect(mockPush).toHaveBeenCalledWith(
          `/day-entries/${toDateKeyForTest(now, dayWithEntry)}`,
        );

        expect(findEntryCountBadgeViews()).toHaveLength(1);
        expect(String(findEntryCountBadgeTexts()[0].props.children)).toBe('2');
      } finally {
        jest.useRealTimers();
      }
    });

    it('updates the badge from "2" to "3" once a third entry is saved for a day that already had 2 entries (正常系: 動的な件数増加への追従)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '昼の日記', createdAt: isoAt(now, dayWithEntry, 12, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(String(findEntryCountBadgeTexts()[0].props.children)).toBe('2');

      // 保存欄からの追加は「今日」の日付にしか保存できない実装のため、pickTestDaysが選ぶ範囲
      // (10〜20日)と実行日が一致しない限り直接は再現できない。そのためAsyncStorageへ直接
      // 3件目を追記して再フォーカス相当の再読み込みを模す。
      const key = await getOrCreateEncryptionKey();
      const threeEntries = [
        ...storedEntries,
        { id: '3', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, encryptText(JSON.stringify(threeEntries), key));
      triggerRefocus();

      await waitFor(() => expect(String(findEntryCountBadgeTexts()[0].props.children)).toBe('3'));
    });

    it('changes the dot to a count badge once a second entry is added to a day that had exactly 1 entry (正常系: ドットからバッジへの切り替わり)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '1件目の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(findEntryDotViews()).toHaveLength(1);
      expect(findEntryCountBadgeViews()).toHaveLength(0);

      const key = await getOrCreateEncryptionKey();
      const twoEntries = [
        ...storedEntries,
        { id: '2', text: '2件目の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, encryptText(JSON.stringify(twoEntries), key));
      triggerRefocus();

      await waitFor(() => expect(findEntryCountBadgeViews()).toHaveLength(1));
      expect(findEntryDotViews()).toHaveLength(0);
      expect(String(findEntryCountBadgeTexts()[0].props.children)).toBe('2');
    });

    it('includes the entry count in the accessibilityLabel of a day cell with diary entries, e.g. "日記あり(3件)" (アクセシビリティ)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const storedEntries = [
        { id: '1', text: '朝の日記', createdAt: isoAt(now, dayWithEntry, 7, 0) },
        { id: '2', text: '昼の日記', createdAt: isoAt(now, dayWithEntry, 12, 0) },
        { id: '3', text: '夜の日記', createdAt: isoAt(now, dayWithEntry, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      const expectedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日、日記あり(3件)`;
      expect(screen.getByLabelText(expectedLabel)).toBeTruthy();
    });

    it('includes the entry count of 1 in the accessibilityLabel of a day cell with a single diary entry, e.g. "日記あり(1件)" (アクセシビリティ/境界値)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '1件のみの日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const expectedLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日、日記あり(1件)`;
      expect(screen.getByLabelText(expectedLabel)).toBeTruthy();
    });
  });

  describe('日付セルのフォント拡大率の上限(maxFontSizeMultiplier)', () => {
    // OSの文字サイズ設定を拡大しても日付セル内テキストが際限なく拡大され最下段の週が
    // 見切れないよう、`maxFontSizeMultiplier`で上限が指定されていることを検証する。
    // react-native-calendars自体の月見出し・曜日行は常に`allowFontScaling={false}`のため対象外。
    const EXPECTED_MAX_FONT_SCALE = 1.5;

    it('caps the font scale multiplier at a value greater than 1 but not unbounded (sanity check on the constant itself)', () => {
      // 実装側の定数はモジュール外にexportされていないため、期待値自体が1(拡大なし)や
      // 極端に大きい値(実質無制限)ではない妥当な範囲であることをここで明記する
      expect(EXPECTED_MAX_FONT_SCALE).toBeGreaterThan(1);
      expect(EXPECTED_MAX_FONT_SCALE).toBeLessThanOrEqual(2);
    });

    it("sets maxFontSizeMultiplier on a regular (non-today) day cell's day number", async () => {
      // 実行時点の「今日」が月初(1〜9日)だと、pickNonTodayDayInRangeが選ぶ10〜20日が
      // 未来日になり、Calendarのmaxdateで無効化された当月のセルと、6週分の枠を埋めるため
      // 表示される翌月のはみ出しセル(同じく無効化扱い)の両方に同じ日番号が現れて
      // 一意に特定できなくなる。2026年8月は1日が土曜日で自然に6週間ぴったり
      // (showSixWeeksによる前後月のはみ出しが最小)になり、かつ25日を基準日にすることで
      // pickNonTodayDayInRangeが選ぶ10〜20日と重ならない
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const day = pickNonTodayDayInRange(now);

        render(<HomeScreen />);
        await waitForInitialLoad();

        const dayNumber = screen.getByText(String(day));
        expect(dayNumber.props.maxFontSizeMultiplier).toBe(EXPECTED_MAX_FONT_SCALE);
      } finally {
        jest.useRealTimers();
      }
    });

    it("sets maxFontSizeMultiplier on today's badge day number", async () => {
      // 「今日」の判定はreact-native-calendars側がモジュール読み込み時点の実Dateで行うため、実時刻に戻す
      jest.useRealTimers();
      const now = new Date();

      render(<HomeScreen />);
      await waitForInitialLoad();

      // 月初/月末の「はみ出し」表示で前後の月にも同じ日付番号が重複することがあるため、
      // 今日バッジ特有のスタイル(丸背景に合わせた太字)を持つものだけを絞り込む
      const candidates = screen.getAllByText(String(now.getDate()));
      const todayNumber = candidates.find((node) => {
        const flattenedStyle = StyleSheet.flatten(node.props.style);
        return flattenedStyle.fontWeight === '700';
      });

      expect(todayNumber).toBeTruthy();
      expect(todayNumber?.props.maxFontSizeMultiplier).toBe(EXPECTED_MAX_FONT_SCALE);
    });

    it('sets maxFontSizeMultiplier on the entry-count badge text shown inside a day cell with 2 or more entries', async () => {
      const now = new Date();
      const day = pickNonTodayDayInRange(now);
      const storedEntries = [
        { id: '1', text: 'フォント拡大確認用の日記1', createdAt: isoAt(now, day, 7, 0) },
        { id: '2', text: 'フォント拡大確認用の日記2', createdAt: isoAt(now, day, 21, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

      render(<HomeScreen />);
      await waitForInitialLoad();

      // 日付セルの数字(例: 二桁未満の日付)と表示内容が衝突しうるため、バッジテキストに
      // 固有のスタイル(lineHeight: 11)を目印に絞り込む
      const [badgeText] = screen.UNSAFE_getAllByType(Text).filter((node) => {
        const flattened = StyleSheet.flatten(node.props.style ?? {});
        return flattened.lineHeight === 11;
      });
      expect(badgeText.props.maxFontSizeMultiplier).toBe(EXPECTED_MAX_FONT_SCALE);
    });

    it('shows the day number and the entry-count badge on a day cell with entries', async () => {
      // 実行時点の「今日」が月初(1〜9日)だと、pickNonTodayDayInRangeが選ぶ10〜20日が
      // 未来日になり、Calendarのmaxdateで無効化された当月のセルと、6週分の枠を埋めるため
      // 表示される翌月のはみ出しセル(同じく無効化扱い)の両方に同じ日番号が現れて
      // 一意に特定できなくなる。2026年8月は1日が土曜日で自然に6週間ぴったり
      // (showSixWeeksによる前後月のはみ出しが最小)になり、かつ25日を基準日にすることで
      // pickNonTodayDayInRangeが選ぶ10〜20日と重ならない
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const day = pickNonTodayDayInRange(now);
        const storedEntries = [
          { id: '1', text: '回帰確認用の日記1', createdAt: isoAt(now, day, 7, 0) },
          { id: '2', text: '回帰確認用の日記2', createdAt: isoAt(now, day, 21, 0) },
        ];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));

        render(<HomeScreen />);
        await waitForInitialLoad();

        const badgeViews = screen.UNSAFE_getAllByType(View).filter((node) => {
          const flattened = StyleSheet.flatten(node.props.style ?? {});
          return flattened.minWidth === 16 && flattened.height === 16;
        });
        expect(badgeViews).toHaveLength(1);
        expect(screen.getByText(String(day))).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
