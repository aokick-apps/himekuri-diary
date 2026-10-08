/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text, useColorScheme } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { Colors } from '@/constants/theme';
import { formatDateHeading } from '@/utils/diary-date';
import {
  STORAGE_KEY,
  SEARCH_INPUT_PLACEHOLDER,
  queryCalendarDayButtonsWithEntry,
  pickTestDays,
  isoAt,
  toDateKeyForTest,
  getRenderedSearchExcerpts,
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

  describe('日記のキーワード検索', () => {
    it('does not show the search results list while the search input is empty (regular calendar view is shown)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      // 検索欄は表示されているが、キーワード未入力のうちは検索結果一覧(「見つかりませんでした」等)は表示されない
      expect(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER)).toBeTruthy();
      expect(screen.queryByText('見つかりませんでした')).toBeNull();
    });

    it('shows matching entries (case-insensitive, partial match) as a search results list once a keyword is entered', async () => {
      const now = new Date();
      const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
          { id: '2', text: '仕事で疲れた一日だった', createdAt: isoAt(now, dayWithoutEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);
      fireEvent.changeText(searchInput, '公園');

      expect(await screen.findByText(/公園/)).toBeTruthy();
      expect(screen.queryByText(/仕事で疲れた/)).toBeNull();
    });

    it('shows a "見つかりませんでした" message when no entry matches the keyword', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(
        screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER),
        '該当しないはずのキーワード',
      );

      expect(await screen.findByText('見つかりませんでした')).toBeTruthy();
    });

    it('restores the normal calendar view once the search keyword is cleared back to empty', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);
      fireEvent.changeText(searchInput, '該当しないはずのキーワード');
      expect(await screen.findByText('見つかりませんでした')).toBeTruthy();

      fireEvent.changeText(searchInput, '');
      await waitFor(() => expect(screen.queryByText('見つかりませんでした')).toBeNull());
      // 通常のカレンダー表示(セル)に戻っている
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
    });

    it('navigates to the day-entries screen for the date of the tapped search result, passing the entry id to highlight', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry, 9, 0) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
      const resultItem = await screen.findByText(/公園/);
      fireEvent.press(resultItem);

      expect(mockPush).toHaveBeenCalledWith(
        `/day-entries/${toDateKeyForTest(now, dayWithEntry)}?highlightEntryId=1`,
      );
    });

    it('sets accessibilityRole="button" and an accessibilityLabel combining the date heading and text on each search result item, so screen readers can identify it (アクセシビリティ)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
      await screen.findByText(/公園/);

      const dateKey = toDateKeyForTest(now, dayWithEntry);
      const resultButton = screen.getByLabelText(
        `${formatDateHeading(dateKey)}の日記: 今日は公園を散歩した`,
      );
      expect(resultButton.props.accessibilityRole).toBe('button');
    });

    it('truncates long search result text in the accessibilityLabel while keeping the rendered excerpt available', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const longEntryText = `検索キーワード${'あ'.repeat(60)}`;
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '検索キーワード');
      expect(await screen.findByText(/検索キーワード/)).toBeTruthy();

      const dateKey = toDateKeyForTest(now, dayWithEntry);
      expect(
        screen.getByLabelText(
          `${formatDateHeading(dateKey)}の日記: ${longEntryText.slice(0, 50)}…`,
        ),
      ).toBeTruthy();
      expect(
        screen.queryByLabelText(`${formatDateHeading(dateKey)}の日記: ${longEntryText}`),
      ).toBeNull();
    });

    it('keeps a multi-code-unit grapheme intact when truncating a search result accessibilityLabel', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const familyEmoji = '👨‍👩‍👧‍👦';
      const longEntryText = `${'あ'.repeat(49)}${familyEmoji}検索キーワード${'い'.repeat(5)}`;
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '検索キーワード');
      await screen.findByText(/検索キーワード/);

      const dateKey = toDateKeyForTest(now, dayWithEntry);
      expect(
        screen.getByLabelText(
          `${formatDateHeading(dateKey)}の日記: ${'あ'.repeat(49)}${familyEmoji}…`,
        ),
      ).toBeTruthy();
      expect(
        screen.queryByLabelText(`${formatDateHeading(dateKey)}の日記: ${'あ'.repeat(49)}👨‍👩‍👧…`),
      ).toBeNull();
    });

    it('excerpts the matched portion of the entry text (with surrounding context) rather than only the first line, unlike the calendar cell title', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      // 1行目には検索キーワードを含めず、本文の途中(2行目以降)にキーワードを配置する。
      // カレンダーセルのタイトル(1行目のみ)には現れないキーワードで検索結果に表示されることを確認する
      const longEntryText = 'あ'.repeat(30) + '\n' + 'ここに検索キーワードのりんごが登場する';
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'りんご');

      expect(await screen.findByText(/りんご/)).toBeTruthy();
    });

    it('shows the diary date above each search result excerpt', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
      await screen.findByText(/公園/);

      expect(
        screen.getByText(`${now.getFullYear()}年${now.getMonth() + 1}月${dayWithEntry}日`),
      ).toBeTruthy();
    });

    it('matches regardless of ASCII letter case (真の大文字小文字混在ケース。日本語の文字自体には大文字小文字の区別が無いため、既存テストとは別にASCII文字で検証する)', async () => {
      const now = new Date();
      const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日はAppleパイを食べた', createdAt: isoAt(now, dayWithEntry) },
          { id: '2', text: '仕事で疲れた一日だった', createdAt: isoAt(now, dayWithoutEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);

      // 本文中は先頭大文字の"Apple"だが、全て小文字の"apple"で検索してもヒットする
      fireEvent.changeText(searchInput, 'apple');
      expect(await screen.findByText(/Apple/)).toBeTruthy();
      expect(screen.queryByText(/仕事で疲れた/)).toBeNull();

      // 全て大文字の"APPLE"でもヒットする
      fireEvent.changeText(searchInput, 'APPLE');
      expect(await screen.findByText(/Apple/)).toBeTruthy();
    });

    it('treats a whitespace-only search query the same as an empty query (regular calendar view stays shown, no results list)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      // 空白のみのキーワードはtrim後に空文字列として扱われ、検索結果一覧(0件メッセージ含む)は表示されない
      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '   ');

      expect(screen.queryByText('見つかりませんでした')).toBeNull();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
    });

    it('sorts multiple matching search results by date, newest first', async () => {
      const now = new Date();
      const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'old', text: '古い日の公園散歩の記録', createdAt: isoAt(now, dayWithEntry, 8, 0) },
          {
            id: 'new',
            text: '新しい日の公園散歩の記録',
            createdAt: isoAt(now, dayWithoutEntry, 8, 0),
          },
        ]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園散歩');
      await screen.findByText(/新しい日の公園散歩/);
      expect(screen.getByText(/古い日の公園散歩/)).toBeTruthy();

      // 新しい日付のエントリ(dayWithoutEntry)が、古い日付のエントリ(dayWithEntry)より先に表示される。
      // getSearchExcerptの戻り値が3分割オブジェクトになったことで、抜粋全体が単一のテキストノードとして
      // 現れなくなったため、実際に描画されたThemedText(prefix/match/suffix)の並び順で検証する
      const excerpts = getRenderedSearchExcerpts();
      expect(excerpts).toHaveLength(2);
      expect(excerpts[0].prefix).toBe('新しい日の');
      expect(excerpts[1].prefix).toBe('古い日の');
    });

    it('truncates the excerpt with an ellipsis (…) on both sides when the match is surrounded by more than the context length on each side (boundary)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      // マッチ箇所(りんご)の前後にSEARCH_EXCERPT_CONTEXT_LENGTH(20文字)を超える文字を配置し、
      // 抜粋の前後両方が切り詰められて省略記号が付くケースを検証する
      const longEntryText = 'あ'.repeat(30) + 'りんご' + 'い'.repeat(30);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
      );
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'りんご');

      await screen.findByText(/りんご/);
      const [excerpt] = getRenderedSearchExcerpts();
      expect(excerpt.match).toBe('りんご');
      expect(excerpt.prefix.startsWith('…')).toBe(true);
      expect(excerpt.suffix.endsWith('…')).toBe(true);
      // マッチ全体(前後の文脈込み)は元の本文よりも短く切り詰められている
      const totalExcerptLength =
        excerpt.prefix.length + (excerpt.match?.length ?? 0) + excerpt.suffix.length;
      expect(totalExcerptLength).toBeLessThan(longEntryText.length);
    });

    it('sets maxLength={1000} (BODY_MAX_LENGTH) on the search input, so it cannot exceed the diary body max length itself', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);
      // composer/edit用のTextInputとは異なりgrapheme単位の切り詰めロジックは持たないため、
      // ネイティブのmaxLength propがBODY_MAX_LENGTH(1000)に設定されていることを直接確認する
      expect(searchInput.props.maxLength).toBe(1000);
    });

    describe('検索結果のマッチ箇所ハイライト表示', () => {
      // ダークモードをシミュレートするためのuseColorSchemeモック(「テーマに応じたエラー色」describe内と
      // 同様の理由・同様の使い方)。このdescribe専用に局所的に上書き・復元する
      const mockedUseColorScheme = useColorScheme as jest.Mock;

      afterEach(() => {
        mockedUseColorScheme.mockReturnValue('light');
      });

      it('splits the excerpt into prefix/match/suffix so that only the matched portion is separated out for highlighting (正常系)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は公園でランチを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
        await screen.findByText(/公園/);

        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('今日は');
        expect(excerpt.match).toBe('公園');
        expect(excerpt.suffix).toBe('でランチを食べた');
      });

      it('renders only the matched portion with the theme searchHighlightBackground color and a bold font weight, in light mode (正常系)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は公園でランチを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
        await screen.findByText(/公園/);

        // ハイライト対象(マッチ箇所)の背景色を目印に、実際に描画されたホストのTextノードを特定する
        const [highlightText] = screen.UNSAFE_getAllByType(Text).filter((node) => {
          const flattened = StyleSheet.flatten(node.props.style ?? {});
          return flattened.backgroundColor === Colors.light.searchHighlightBackground;
        });

        expect(highlightText).toBeTruthy();
        expect(highlightText.props.children).toBe('公園');
        expect(StyleSheet.flatten(highlightText.props.style).fontWeight).toBe('bold');
        // 抜粋の前後(prefix/suffix)にはハイライト背景色が付いていないことも確認する
        expect(
          screen.UNSAFE_getAllByType(Text).some((node) => {
            const flattened = StyleSheet.flatten(node.props.style ?? {});
            return (
              flattened.backgroundColor === Colors.light.searchHighlightBackground &&
              node.props.children !== '公園'
            );
          }),
        ).toBe(false);
      });

      it('uses Colors.dark.searchHighlightBackground (a different color from light mode) for the highlighted portion in dark mode (異常系/回帰防止: テーマ色の取り違え防止)', async () => {
        // ライト/ダークで同じ値だと、以下のテストが誤って"たまたま"パスしてしまうことを防ぐための前提確認
        expect(Colors.dark.searchHighlightBackground).not.toBe(
          Colors.light.searchHighlightBackground,
        );

        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は公園でランチを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();
        mockedUseColorScheme.mockReturnValue('dark');

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
        await screen.findByText(/公園/);

        const [highlightText] = screen.UNSAFE_getAllByType(Text).filter((node) => {
          const flattened = StyleSheet.flatten(node.props.style ?? {});
          return flattened.backgroundColor === Colors.dark.searchHighlightBackground;
        });
        expect(highlightText).toBeTruthy();
        expect(highlightText.props.children).toBe('公園');
      });

      it('leaves prefix empty when the match is located at the very beginning of the entry text (境界値)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: '公園に行った', createdAt: isoAt(now, dayWithEntry) }]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
        await screen.findByText(/公園/);

        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('');
        expect(excerpt.match).toBe('公園');
        expect(excerpt.suffix).toBe('に行った');
      });

      it('leaves suffix empty when the match is located at the very end of the entry text (境界値)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: '今日は公園', createdAt: isoAt(now, dayWithEntry) }]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');
        await screen.findByText(/公園/);

        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('今日は');
        expect(excerpt.match).toBe('公園');
        expect(excerpt.suffix).toBe('');
      });

      it('highlights the original script (katakana) found in the entry text, not the hiragana form typed in the query (表記ゆれ吸収との組み合わせ)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日はラーメンを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        // ひらがなの「らーめん」で検索しても、本文中のカタカナ表記「ラーメン」がそのまま
        // ハイライト対象になる(検索キーワードの表記に置き換わらない)ことを確認する
        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'らーめん');
        await screen.findByText(/ラーメン/);

        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('今日は');
        expect(excerpt.match).toBe('ラーメン');
        expect(excerpt.suffix).toBe('を食べた');
      });

      it('highlights the matched portion instead of falling back when the search query itself contains line breaks that fold the same way as the entry text (正常系)', async () => {
        // getSearchExcerptは本文・クエリ双方の連続する改行を半角スペース1つに畳んでから
        // マッチ位置を探すため、クエリ自体に改行が含まれていても畳んだ結果が本文側と一致し、
        // 一覧側のフィルタ(entries.filter)と同じ判定結果になってハイライトされる
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: 'メモa\n\nb残り', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'a\n\nb');

        await screen.findByText('a b');
        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('メモ');
        expect(excerpt.match).toBe('a b');
        expect(excerpt.suffix).toBe('残り');
      });

      it('shows no results when the entry text and the query have a different number of consecutive line breaks at the same position, because entries.filter itself compares the raw (un-folded) strings (境界値)', async () => {
        // getSearchExcerptは本文・クエリ双方の改行を畳むが、一覧側のentries.filterは改行を
        // 畳まずそのまま比較するため、改行の「本数」自体は依然として完全一致が必要になる。
        // このケースはentries.filterの時点で弾かれ、getSearchExcerptには到達しない
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: 'メモa\n\n\nb残り', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'a\nb');

        await screen.findByText('見つかりませんでした');
      });

      it('matches when the query contains multiple separate line-break runs at different positions (境界値)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: 'メモa\nb\n\nc残り', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'a\nb\n\nc');

        await screen.findByText('a b c');
        const [excerpt] = getRenderedSearchExcerpts();
        expect(excerpt.prefix).toBe('メモ');
        expect(excerpt.match).toBe('a b c');
        expect(excerpt.suffix).toBe('残り');
      });

      // getSearchExcerptのフォールバック分岐(実装コード側のコメント参照、20書記素での切り詰め・
      // 絵文字分断回避を含む)は、呼び出し元でtrim済みのクエリを使う限り、entries.filterを通過した
      // エントリに対しては到達しないことを、改行以外の入力パターンも含めた網羅的な検証で確認済み。
      // 到達手段が無い以上、この統合テストのスタイルで無理にフォールバック分岐を再現することはせず、
      // (関数を個別exportするなどのコード構造変更なしには)テスト対象から意図的に外している
    });

    describe('検索欄のクリアボタン', () => {
      it('does not show the clear button while the search input is empty', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        expect(screen.queryByLabelText('検索キーワードをクリア')).toBeNull();
      });

      it('shows the clear button once a keyword is entered', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');

        expect(screen.getByLabelText('検索キーワードをクリア')).toBeTruthy();
      });

      it('clears the search query and restores the normal calendar view when the clear button is pressed', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は公園を散歩した', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);
        fireEvent.changeText(searchInput, '公園');
        expect(await screen.findByText(/公園/)).toBeTruthy();

        fireEvent.press(screen.getByLabelText('検索キーワードをクリア'));

        expect(searchInput.props.value).toBe('');
        // クリア後は検索結果一覧ではなく通常のカレンダー表示(セル)に戻り、
        // クリアボタン自体も再び非表示になる
        await waitFor(() => expect(screen.queryByLabelText('検索キーワードをクリア')).toBeNull());
        expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
      });

      it('shows the clear button even for a whitespace-only query, even though the calendar view (not the results list) stays shown (boundary: clear button visibility uses the raw searchQuery, not the trimmed value)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '   ');

        // trim後は空文字列扱いのため検索結果一覧(0件メッセージ含む)は出さない一方、
        // クリアボタンは入力欄が空文字列そのものでない限り表示され続ける
        expect(screen.queryByText('見つかりませんでした')).toBeNull();
        expect(screen.getByLabelText('検索キーワードをクリア')).toBeTruthy();
      });

      it('clears a whitespace-only query when the clear button is pressed', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const searchInput = screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER);
        fireEvent.changeText(searchInput, '   ');

        fireEvent.press(screen.getByLabelText('検索キーワードをクリア'));

        expect(searchInput.props.value).toBe('');
        expect(screen.queryByLabelText('検索キーワードをクリア')).toBeNull();
      });

      it('sets accessibilityRole="button" in addition to accessibilityLabel on the clear button', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '公園');

        const clearButton = screen.getByLabelText('検索キーワードをクリア');
        expect(clearButton.props.accessibilityRole).toBe('button');
      });
    });

    describe('全角/半角・ひらがな/カタカナの表記ゆれ吸収', () => {
      it('matches a full-width digit query ("１２３") against an entry body containing half-width digits ("123")', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は123円のパンを買った', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '１２３');

        expect(await screen.findByText(/123/)).toBeTruthy();
      });

      it('matches a half-width digit query ("123") against an entry body containing full-width digits ("１２３")', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は１２３円のパンを買った', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '123');

        expect(await screen.findByText(/１２３/)).toBeTruthy();
      });

      it('matches a hiragana query ("らーめん") against an entry body containing katakana ("ラーメン")', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '昼にラーメンを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'らーめん');

        expect(await screen.findByText(/ラーメン/)).toBeTruthy();
      });

      it('matches a katakana query ("ラーメン") against an entry body containing hiragana ("らーめん")', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '昼にらーめんを食べた', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'ラーメン');

        expect(await screen.findByText(/らーめん/)).toBeTruthy();
      });

      it('matches a half-width katakana query ("ｺｰﾋｰ") against an entry body containing full-width katakana ("コーヒー")', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '朝はコーヒーを飲んだ', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'ｺｰﾋｰ');

        expect(await screen.findByText(/コーヒー/)).toBeTruthy();
      });

      it('still matches regardless of ASCII letter case even when combined with full-width normalization', async () => {
        const now = new Date();
        const { dayWithEntry, dayWithoutEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日はCafeでコーヒーを飲んだ', createdAt: isoAt(now, dayWithEntry) },
            { id: '2', text: '仕事で疲れた一日だった', createdAt: isoAt(now, dayWithoutEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 大文字小文字表記ゆれ(既存機能)と全角/半角表記ゆれ(今回の対応)が両方壊れていないことを、
        // 全て小文字の半角"cafe"で検索して確認する
        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), 'cafe');
        expect(await screen.findByText(/Cafe/)).toBeTruthy();
        expect(screen.queryByText(/仕事で疲れた/)).toBeNull();
      });

      it('shows no search results (見つかりませんでした) when the normalized query does not match any entry', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([
            { id: '1', text: '今日は123円のパンを買った', createdAt: isoAt(now, dayWithEntry) },
          ]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 全角へ正規化しても本文には存在しない数字なので、ヒットしない
        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '４５６');

        expect(await screen.findByText('見つかりませんでした')).toBeTruthy();
      });

      it('excerpts the original (non-normalized) text at the correct position even when the match was found via normalization', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        // マッチ箇所(全角の１２３)の前後にSEARCH_EXCERPT_CONTEXT_LENGTH(20文字)を超える文字を配置し、
        // 正規化後の文字列上で見つけたマッチ位置を、元の文字列(全角のまま)上の正しい位置へ
        // 復元できているかを検証する
        const longEntryText = 'あ'.repeat(25) + '１２３' + 'い'.repeat(25);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 半角の"123"で検索するが、抜粋には元の本文にある全角の"１２３"がそのまま現れるはず
        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '123');

        await screen.findByText(/１２３/);
        const [excerpt] = getRenderedSearchExcerpts();
        // マッチ位置(matchStart=25, matchEnd=28)から前後20文字ずつ、両端は省略記号付きで
        // 切り詰められた、元の文字列上の正しい範囲がそのままprefix/match/suffixに分かれて
        // 抜粋されていることを厳密に検証する。ハイライト対象のmatchには正規化前の
        // 全角"１２３"がそのまま入る(検索クエリの半角"123"ではない)
        expect(excerpt.prefix).toBe(`…${'あ'.repeat(20)}`);
        expect(excerpt.match).toBe('１２３');
        expect(excerpt.suffix).toBe(`${'い'.repeat(20)}…`);
      });

      it('excerpts the original text at the correct position even when the body contains surrogate-pair emoji before the match (regression)', async () => {
        const now = new Date();
        const { dayWithEntry } = pickTestDays(now);
        // マッチ箇所('123')より前にサロゲートペア絵文字(UTF-16で2コードユニット)を3つ配置し、
        // 正規化後の文字列と元の文字列の対応付け(startMap/endMap)が絵文字によってズレないかを検証する
        const longEntryText = '😀'.repeat(3) + 'あ'.repeat(30) + '123' + 'い'.repeat(30);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([{ id: '1', text: longEntryText, createdAt: isoAt(now, dayWithEntry) }]),
        );
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '123');

        await screen.findByText(/123/);
        const [excerpt] = getRenderedSearchExcerpts();
        // 絵文字によるズレが無ければ、マッチ箇所の前後はちょうど20文字ずつになるはず
        expect(excerpt.prefix).toBe(`…${'あ'.repeat(20)}`);
        expect(excerpt.match).toBe('123');
        expect(excerpt.suffix).toBe(`${'い'.repeat(20)}…`);
      });
    });
  });
});
