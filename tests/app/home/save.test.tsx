/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {} from 'expo-crypto';
import { ActivityIndicator, StyleSheet } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import {} from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import { buildDiaryEntryKey } from '@/utils/diary-storage';
import {
  mockRandomUUID,
  STORAGE_KEY,
  ENCRYPTED_PREFIX,
  INPUT_PLACEHOLDER,
  EMPTY_STATE_TEXT,
  queryCalendarDayButtonsWithEntry,
  decryptPersistedEntry,
  readPersistedEntry,
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

  describe('日記の保存', () => {
    it('does not save and does not call AsyncStorage.setItem when the input is empty', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.press(screen.getByText('保存'));

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(0);
    });

    it('does not save an entry consisting only of whitespace', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '   \n   ');
      fireEvent.press(screen.getByText('保存'));

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(0);
    });

    it('clears the text input after saving', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '入力内容');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
      expect(input.props.value).toBe('');
    });

    it('shows a character counter that updates as the user types', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      expect(screen.getByText('0/1000')).toBeTruthy();

      fireEvent.changeText(input, '何か書く');
      expect(screen.getByText('4/1000')).toBeTruthy();
    });

    it('truncates input exceeding the max length via onChangeText (TextInput no longer has a maxLength prop, since it only limits UTF-16 code units, not grapheme clusters)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      // maxLength propは指定していないため、handleChangeDraft内のgrapheme単位の切り詰めを直接確認する
      fireEvent.changeText(input, 'あ'.repeat(1001));

      expect(input.props.value).toBe('あ'.repeat(1000));
      expect(screen.getByText('1000/1000')).toBeTruthy();
    });

    it('allows saving when the text length is exactly at the max length (boundary), and persists it encrypted (not as plain JSON)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      const exactlyMaxLength = 'あ'.repeat(1000);
      fireEvent.changeText(input, exactlyMaxLength);
      expect(screen.getByText('1000/1000')).toBeTruthy();

      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];

      // AsyncStorageには平文JSONではなく、暗号化済みの文字列が保存される
      expect(typeof value).toBe('string');
      expect((value as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);
      expect(() => JSON.parse(value)).toThrow();

      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe(exactlyMaxLength);
    });

    it('renders the character counter in red once the max length is reached, and in the normal color just below it (boundary)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);

      // 上限の1文字手前(999文字)では強調色にならない
      fireEvent.changeText(input, 'あ'.repeat(999));
      const counterBelowLimit = screen.getByText('999/1000');
      expect(StyleSheet.flatten(counterBelowLimit.props.style).color).not.toBe(Colors.light.error);

      // 上限ちょうど(1000文字)では、テーマ定数化されたエラー色(Colors.light.error)で強調される
      fireEvent.changeText(input, 'あ'.repeat(1000));
      const counterAtLimit = screen.getByText('1000/1000');
      expect(StyleSheet.flatten(counterAtLimit.props.style).color).toBe(Colors.light.error);
    });

    describe('絵文字(サロゲートペア・ZWJ結合絵文字)を含む本文の文字数カウント・切り詰め', () => {
      // ZWJ(Zero Width Joiner)で複数の絵文字コードポイントを結合した家族の絵文字。
      // 見た目上は1文字(1書記素クラスタ)だが、'👨'+ZWJ+'👩'+ZWJ+'👧'+ZWJ+'👦'を構成する
      // サロゲートペア4つ(各2ユニット)とZWJ3つ(各1ユニット)で、UTF-16コードユニットは11個ある
      const familyEmoji = '👨‍👩‍👧‍👦';
      // シンプルなサロゲートペア絵文字(UTF-16コードユニット2個で1書記素クラスタ)
      const simpleEmoji = '😀';
      // 地域指示記号(Regional Indicator)のサロゲートペア2つを組み合わせた旗の絵文字
      // (UTF-16コードユニット4個で1書記素クラスタ)
      const flagEmoji = '🇯🇵';

      it('counts each surrogate-pair/ZWJ emoji as a single grapheme in the character counter, not by UTF-16 code units', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        const text = `${familyEmoji}${simpleEmoji}${flagEmoji}`;
        // UTF-16コードユニット単位では11+2+4=17だが、書記素クラスタ単位では3文字
        expect(text.length).toBe(17);

        fireEvent.changeText(input, text);

        // grapheme単位でカウントされ、カウンター表示は実際の見た目通り3文字になる
        expect(screen.getByText('3/1000')).toBeTruthy();
        expect(screen.queryByText('17/1000')).toBeNull();
      });

      it('does not split a ZWJ-joined family emoji in the middle when truncating overlong input via onChangeText (boundary: exactly at the limit)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        // 999文字の'あ' + 家族の絵文字(1000文字目) + さらに超過する10文字、という構成。
        // grapheme単位で正しく切り詰めれば、家族の絵文字は途中で壊れず1000文字目として残り、
        // それ以降の10文字だけが切り捨てられるはず
        const overLimitText = `${'あ'.repeat(999)}${familyEmoji}${'あ'.repeat(10)}`;
        fireEvent.changeText(input, overLimitText);

        const expectedTruncated = `${'あ'.repeat(999)}${familyEmoji}`;
        expect(input.props.value).toBe(expectedTruncated);
        expect(screen.getByText('1000/1000')).toBeTruthy();
      });

      it('does not split a surrogate-pair emoji in the middle when truncating overlong input via onChangeText (boundary: exactly at the limit)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        // 999文字の'い' + サロゲートペア絵文字(1000文字目) + さらに超過する5文字。
        // UTF-16コードユニット単位でslice(0, 1000)してしまうと、絵文字の
        // サロゲートの片割れだけが残って文字化けするはずの境界を狙う
        const overLimitText = `${'い'.repeat(999)}${simpleEmoji}${'い'.repeat(5)}`;
        fireEvent.changeText(input, overLimitText);

        const expectedTruncated = `${'い'.repeat(999)}${simpleEmoji}`;
        expect(input.props.value).toBe(expectedTruncated);
        expect(screen.getByText('1000/1000')).toBeTruthy();
      });

      it('keeps an emoji-ending body of exactly BODY_MAX_LENGTH graphemes intact (boundary: exactly at the limit, no truncation)', async () => {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        // ちょうど1000文字(999文字の'う' + 絵文字1文字)で、超過していない境界値
        const exactlyMaxLength = `${'う'.repeat(999)}${familyEmoji}`;
        fireEvent.changeText(input, exactlyMaxLength);

        expect(input.props.value).toBe(exactlyMaxLength);
        expect(screen.getByText('1000/1000')).toBeTruthy();
      });
    });

    it('disables the save button while the input is empty and enables it once text is entered', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      // `getByText('保存')` resolves the innermost `Text` node; the rendered `Pressable`
      // (which carries the `disabled` prop as `accessibilityState.disabled`) is three
      // levels up in the tree (Text -> Text -> ThemedText -> Pressable's host View).
      const saveButton = screen.getByText('保存').parent?.parent?.parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '何か書く');

      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });

    // スクリーンリーダー利用者にも入力欄・保存ボタンの役割が伝わるよう、
    // accessibilityLabel/accessibilityRole/accessibilityStateを検証する
    it('sets accessibilityLabel="日記本文" on the composer TextInput, and accessibilityRole="button"/accessibilityLabel="保存" on the save button so screen readers can identify each control', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      // placeholderはフォーカス後に読み上げられない環境があるため、accessibilityLabelで
      // 入力欄を直接特定できることを確認する
      const input = screen.getByLabelText('日記本文');
      expect(input.props.placeholder).toBe(INPUT_PLACEHOLDER);

      // accessibilityRole/accessibilityLabelにより、保存ボタンがロール・名前の両方で
      // 一意に特定できる(disabled中でもroleは'button'のまま変わらない)
      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton.props.accessibilityLabel).toBe('保存');
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);

      fireEvent.changeText(input, '何か書く');
      expect(saveButton.props.accessibilityState?.disabled).toBe(false);
    });

    it('renders the save button at reduced opacity (0.5) while the input is empty, and at full opacity (1) once text is entered, so the disabled state is also visible', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const saveButton = screen.getByText('保存').parent?.parent?.parent;
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(0.5);

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '何か書く');
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(1);

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '');
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(0.5);
    });

    it('keeps the save button at reduced opacity (0.5) when the input contains only whitespace, matching the disabled condition', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      const saveButton = screen.getByText('保存').parent?.parent?.parent;
      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '   \n   ');

      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(0.5);
    });

    it('keeps the save button at reduced opacity (0.5) while a save is in flight (isSaving), even once the user has typed a new non-empty draft, and restores full opacity once the save completes (境界値: isSaving overrides draft content in the opacity condition)', async () => {
      let resolveSetItem: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      const saveButton = screen.getByText('保存').parent?.parent?.parent;

      fireEvent.changeText(input, '保存中の日記');
      fireEvent.press(screen.getByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      // pending中(isSaving=true)にユーザーが新しい非空の下書きを入力しても、
      // isSavingがtrueである限りボタンは半透明のまま(disabled={!draft.trim() || isSaving}と対応)
      fireEvent.changeText(input, '書きかけの新しい下書き');
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(0.5);

      resolveSetItem();
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      // isSavingがfalseに戻ると、非空の下書きが残っているため通常の不透明度に戻る
      await waitFor(() => expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(1));
    });

    it('shows a spinner and "保存中..." label on the inline composer save button while a save is in flight, and reverts to "保存" if it fails', async () => {
      let rejectSetItem: (error: Error) => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSetItem = reject;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(
        screen.getByPlaceholderText(INPUT_PLACEHOLDER),
        '保存中表示を確認する日記',
      );
      fireEvent.press(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      expect(screen.getByText('保存中...')).toBeTruthy();
      expect(screen.queryByText('保存')).toBeNull();

      await act(async () => {
        rejectSetItem(new Error('write failed'));
      });

      await screen.findByText('保存に失敗しました。もう一度お試しください。');
      expect(screen.getByText('保存')).toBeTruthy();
      expect(screen.queryByText('保存中...')).toBeNull();
    });

    it('restores previously saved plaintext entries (from before encryption was introduced) from AsyncStorage, showing a count badge, and navigates to the day-entries screen for that date when tapped', async () => {
      // pickTestDaysが選ぶ10〜20日はreact-native-calendars側のmaxDate判定(実行時点の
      // 「今日」より後の日付はhasEntriesの有無に関わらずonDayPress自体が発火しない)の対象に
      // なり得るため、月初にテストを実行しても該当日が必ず過去になるよう基準日を固定する
      jest.useFakeTimers();
      try {
        const now = new Date(2026, 7, 25, 12, 0, 0);
        jest.setSystemTime(now);
        const { dayWithEntry } = pickTestDays(now);
        const storedEntries = [
          { id: '1', text: '2件目の日記', createdAt: isoAt(now, dayWithEntry, 20, 0) },
          { id: '2', text: '1件目の日記', createdAt: isoAt(now, dayWithEntry, 8, 0) },
        ];
        // 暗号化対応前に保存された想定の平文JSONをそのままAsyncStorageに書き込む
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
        jest.clearAllMocks();

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 2件あるため、セルには件数バッジ「2」が表示され、タップするとその日の一覧画面へ遷移する
        // (一覧の内容自体・時刻の昇順表示はtests/app/day-entries/[date].test.tsxで検証する)
        expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
        fireEvent.press(screen.getByText(String(dayWithEntry)));

        expect(mockPush).toHaveBeenCalledWith(
          `/day-entries/${toDateKeyForTest(now, dayWithEntry)}`,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('migrates a legacy plaintext entry into its own encrypted per-entry key on load, and persists newly saved entries independently', async () => {
      const now = new Date();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      // 暗号化対応前に保存された想定の平文JSON(レガシーの単一キー形式)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      // マウント時の読み込みで、レガシーの単一キーは個別キー方式(暗号化済み)へ移行済みになっている
      expect(await readPersistedEntry('old')).toEqual(storedEntries[0]);
      expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '今日の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [key, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      // 新規保存は自分専用の個別キーにのみ書き込まれ、移行済みの過去の日記のキーには触れない
      expect(key).not.toBe(STORAGE_KEY);
      expect((value as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);

      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe('今日の日記');
      // 移行済みの過去の日記はそのまま残っている
      expect(await readPersistedEntry('old')).toEqual(storedEntries[0]);

      // 同じ日に2件になったため、セルには件数バッジ「2」が表示される
      const cellsWithEntry = queryCalendarDayButtonsWithEntry();
      expect(cellsWithEntry).toHaveLength(1);

      // タップするとその日の一覧画面へ遷移する
      // (一覧の内容自体はtests/app/day-entries/[date].test.tsxで検証する)
      fireEvent.press(cellsWithEntry[0]);
      expect(mockPush).toHaveBeenCalledWith(`/day-entries/${toDateKeyForTest(now, now.getDate())}`);
    });

    it('persists diary entries encrypted and correctly reloads/decrypts them after remounting (simulating an app restart)', async () => {
      const { unmount } = render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '再起動後も読める日記');
      fireEvent.press(screen.getByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      const [, storedValue] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect((storedValue as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);

      // アプリの再起動を模して画面をアンマウントし、新しいインスタンスとして再度マウントする。
      // SecureStoreモックの鍵は永続化されたままなので、暗号化データを正しく復号できるはず。
      unmount();

      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
    });

    it('reloads from AsyncStorage when the screen regains focus, so data deleted elsewhere (e.g. from the settings tab) is not resurrected by a later save', async () => {
      const now = new Date();
      const key = await getOrCreateEncryptionKey();
      const storedEntries = [
        { id: 'old', text: '削除されるはずの日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, encryptText(JSON.stringify(storedEntries), key));

      // 日記タブを開いて表示する(expo-routerのTabsは実機ではこの画面をアンマウントしないが、
      // このテストのモックではフォーカス再取得を模すために一度unmountし、下で再度renderする)
      const { unmount } = render(<HomeScreen />);
      await waitForInitialLoad();
      unmount();

      // 設定タブでの「日記データを全件削除」操作を模して、移行済みの個別キーを直接削除する
      // (マウント時の読み込みでレガシーの単一キーは既に個別キー方式へ移行済みになっている)
      await AsyncStorage.removeItem(buildDiaryEntryKey('old'));

      // 日記タブに戻ってくる(再フォーカス)と、保持していたstateではなくAsyncStorageを読み直す
      render(<HomeScreen />);
      await waitFor(() => expect(screen.queryByText('削除されるはずの日記')).toBeNull());
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();

      // 新しい日記を保存しても、stateに残っていた削除済みの古いエントリが復活しない
      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '新しい日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
      const setItemMock = AsyncStorage.setItem as jest.Mock;
      const [, value] = setItemMock.mock.calls[setItemMock.mock.calls.length - 1];
      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe('新しい日記');
      // 削除済みだった過去のエントリは復活していない
      expect(await readPersistedEntry('old')).toBeNull();
    });

    it('saves a new entry, persists it to AsyncStorage encrypted, and shows it together with an existing entry for the same day', async () => {
      const now = new Date();
      const key = await getOrCreateEncryptionKey();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      // すでに暗号化されている状態を想定してAsyncStorageに直接書き込む
      await AsyncStorage.setItem(STORAGE_KEY, encryptText(JSON.stringify(storedEntries), key));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '今日の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [savedKey, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      // 新規保存は自分専用の個別キー(diary-entry:<uuid>)に書き込まれる
      expect(savedKey).not.toBe(STORAGE_KEY);

      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe('今日の日記');
      // 既存(移行済み)の過去の日記もそのまま残っている
      expect(await readPersistedEntry('old')).toEqual(storedEntries[0]);

      // 同じ日に2件になったため、セルには件数バッジ「2」が表示される
      const cellsWithEntry = queryCalendarDayButtonsWithEntry();
      expect(cellsWithEntry).toHaveLength(1);

      // タップするとその日の一覧画面へ遷移する
      // (一覧の内容自体はtests/app/day-entries/[date].test.tsxで検証する)
      fireEvent.press(cellsWithEntry[0]);
      expect(mockPush).toHaveBeenCalledWith(`/day-entries/${toDateKeyForTest(now, now.getDate())}`);
    });

    it('shows the empty state when stored data is corrupted (invalid JSON)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('not valid json');

      render(<HomeScreen />);

      // 壊れたデータは読み捨てられ、空の状態から始まるため、日記が実際に存在するセルは無い
      await waitFor(() => expect(queryCalendarDayButtonsWithEntry()).toHaveLength(0));
      await waitFor(() => expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0));
    });

    it('shows the empty state when stored data has the encrypted-payload marker but fails to decrypt (corrupted ciphertext)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockResolvedValueOnce(`${ENCRYPTED_PREFIX}not-a-real-ciphertext`);

      render(<HomeScreen />);

      // 復号に失敗したデータは読み捨てられ、空の状態から始まるため、日記が実際に存在するセルは無い
      await waitFor(() => expect(queryCalendarDayButtonsWithEntry()).toHaveLength(0));
      await waitFor(() => expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0));
    });

    it('rolls back entries and draft and shows an error message when AsyncStorage.setItem fails', async () => {
      const now = new Date();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      render(<HomeScreen />);
      await waitForInitialLoad();

      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write failed'));

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '今日の日記');
      fireEvent.press(screen.getByText('保存'));

      const errorMessage = await screen.findByText('保存に失敗しました。もう一度お試しください。');
      expect(errorMessage).toBeTruthy();
      // エラーメッセージの文字色は、ハードコードではなくテーマ定数化されたColors.light.errorを使う
      expect(StyleSheet.flatten(errorMessage.props.style).color).toBe(Colors.light.error);

      // 保存前の状態にロールバックされているため、日記は1件(既存の「過去の日記」)のみのまま
      expect(input.props.value).toBe('今日の日記');
      const cellsWithEntry = queryCalendarDayButtonsWithEntry();
      expect(cellsWithEntry).toHaveLength(1);

      // タップするとその日の一覧画面へ遷移する
      // (一覧の内容自体はtests/app/day-entries/[date].test.tsxで検証する)
      fireEvent.press(cellsWithEntry[0]);
      expect(mockPush).toHaveBeenCalled();
    });

    it('does not overwrite draft text the user typed while a save was still in flight, when that save later fails', async () => {
      const now = new Date();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      // AsyncStorage.setItemの解決/拒否を保存処理の呼び出し側から任意のタイミングで
      // 制御できるようにするため、resolve/reject関数を外側に取り出しておく
      let rejectSetItem: (reason: unknown) => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSetItem = reject;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '保存中の日記');
      fireEvent.press(screen.getByText('保存'));

      // 保存(AsyncStorage.setItem)がまだpendingの間に、入力欄は一旦空になる
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      expect(input.props.value).toBe('');

      // pendingの間にユーザーが新しい下書きを書き始める
      fireEvent.changeText(input, '書きかけの新しい下書き');

      rejectSetItem(new Error('write failed'));

      expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeTruthy();

      // ロールバックによって「保存前のdraft(保存中の日記)」で上書きされず、
      // ユーザーが新しく入力した内容がそのまま保持される
      expect(input.props.value).toBe('書きかけの新しい下書き');
      expect(screen.queryByText('保存中の日記')).toBeNull();
    });

    it('keeps the draft empty (does not roll back) when the user typed something while a save was in flight and then deleted it all themselves, and that save later fails', async () => {
      // pending中に一度何か入力したあと、ユーザー自身がそれを全部消して空文字列に戻した場合は
      // 「何も入力していない」ケースと区別し、ロールバックでpreviousDraftを復活させてはいけない
      const now = new Date();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      let rejectSetItem: (reason: unknown) => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSetItem = reject;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '保存中の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      expect(input.props.value).toBe('');

      // pendingの間にユーザーが新しい下書きを書き始めるが、自分で全部消して空文字列に戻す
      fireEvent.changeText(input, '書きかけの新しい下書き');
      fireEvent.changeText(input, '');

      rejectSetItem(new Error('write failed'));

      expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeTruthy();

      // ユーザーが意図的に空にした結果なので、previousDraft(保存中の日記)へロールバックされず
      // 空文字列のまま維持される
      expect(input.props.value).toBe('');
      expect(screen.queryByText('保存中の日記')).toBeNull();
    });

    it('does not clear draft text the user typed while a save was still in flight, when that save later succeeds (boundary)', async () => {
      // 失敗時だけでなく成功時も、保存処理中(pending中)に入力された下書きが
      // 意図せず消されないことを確認する(catch節以外の経路でdraftが上書きされないことの確認)
      const now = new Date();
      const storedEntries = [
        { id: 'old', text: '過去の日記', createdAt: isoAt(now, now.getDate(), 0, 0) },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedEntries));
      jest.clearAllMocks();

      let resolveSetItem: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '保存中の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      expect(input.props.value).toBe('');

      // pendingの間にユーザーが新しい下書きを書き始める
      fireEvent.changeText(input, '書きかけの新しい下書き');

      resolveSetItem();
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      // 送信した「保存中の日記」自体は正しく永続化される(ただし過去の日記の方が時刻が早いため、
      // カレンダーセルのタイトルは引き続き「過去の日記」のまま)
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe('保存中の日記');

      // 成功パスはcatch節を通らずdraftに触れないため、ユーザーが新しく入力した内容が
      // そのまま保持され、保存中に編集された下書きキーも削除されず、エラーメッセージも表示されない
      expect(input.props.value).toBe('書きかけの新しい下書き');
      expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('diary-draft');
      expect(screen.queryByText('保存に失敗しました。もう一度お試しください。')).toBeNull();
    });

    it('ignores a second press of the save button while a save is still in flight, preventing a duplicate entry', async () => {
      // 保存ボタンの連打(タップと同時に発生する複数のonPressイベントを含む)によって
      // 同一内容の日記が重複保存されないことを確認する。AsyncStorage.setItemの解決を
      // 意図的に遅延させ、その完了前に2回目のpressを発火させる
      let resolveSetItem: () => void = () => {};
      jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);

      fireEvent.changeText(input, '連打される日記');
      fireEvent.press(screen.getByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      // 1回目の保存(AsyncStorage.setItem)がまだpendingの間は「保存中...」表示になり、
      // 保存ボタンを連打する対象自体が「保存」ラベルの要素では見つからなくなる
      expect(screen.queryByText('保存')).toBeNull();
      fireEvent.press(screen.getByText('保存中...'));
      fireEvent.press(screen.getByText('保存中...'));

      // pending中の連打はガードされ、AsyncStorage.setItemは追加で呼ばれない
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockRandomUUID).toHaveBeenCalledTimes(1);

      resolveSetItem();
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      // 永続化された内容にも1件のみ含まれ、重複していない
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const persisted = (await decryptPersistedEntry(value)) as { text: string };
      expect(persisted.text).toBe('連打される日記');

      // pending解消後は再度保存できる(実行中フラグが正しく戻っている)
      fireEvent.changeText(input, '次の日記');
      fireEvent.press(await screen.findByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
    });

    it('assigns a unique id (via expo-crypto randomUUID) to each entry saved consecutively', async () => {
      // `randomUUID` を呼び出しごとに異なる値を返すようスタブし、
      // 同一ミリ秒での `Date.now().toString()` による衝突が起きないことを検証する。
      mockRandomUUID
        .mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2')
        .mockReturnValueOnce('uuid-3');

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);

      fireEvent.changeText(input, '1件目');
      fireEvent.press(screen.getByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      fireEvent.changeText(input, '2件目');
      fireEvent.press(await screen.findByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));

      fireEvent.changeText(input, '3件目');
      fireEvent.press(await screen.findByText('保存'));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(3));

      expect(mockRandomUUID).toHaveBeenCalledTimes(3);

      // 各保存は自分専用の個別キーに書き込まれるため、3回のsetItem呼び出しそれぞれから
      // 1件ずつ復号し、idの一意性を確認する
      const setItemMock = AsyncStorage.setItem as jest.Mock;
      const persistedEntries = (await Promise.all(
        setItemMock.mock.calls.map(([, value]) => decryptPersistedEntry(value)),
      )) as { id: string }[];

      expect(persistedEntries).toHaveLength(3);
      const ids = persistedEntries.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);

      // 同じ日に書かれた3件すべてが保存され、セルには件数バッジ「3」が表示される
      // (一覧の内容自体はtests/app/day-entries/[date].test.tsxで検証する)
      const cellsWithEntry = queryCalendarDayButtonsWithEntry();
      expect(cellsWithEntry).toHaveLength(1);
      fireEvent.press(cellsWithEntry[0]);
      expect(mockPush).toHaveBeenCalled();
    });
  });
});
