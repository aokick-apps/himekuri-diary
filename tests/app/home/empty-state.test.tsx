/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActivityIndicator, StyleSheet } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { encryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import { buildDiaryEntryKey, buildDiaryPartialCorruptionMessage } from '@/utils/diary-storage';
import {
  STORAGE_KEY,
  ENCRYPTED_PREFIX,
  INPUT_PLACEHOLDER,
  EMPTY_STATE_TEXT,
  LOAD_ERROR_TEXT,
  queryCalendarDayButtonsWithEntry,
  pickTestDays,
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

  describe('空状態(日記が0件)の案内メッセージ', () => {
    // 初回読み込み中はentriesの初期値が空配列であることに起因して空状態メッセージが
    // 一瞬誤って表示されてしまわないよう、代わりにローディング表示(ActivityIndicator)を出す。
    it('shows a loading indicator instead of the empty state message before the async AsyncStorage load resolves (prevents the empty state from flashing)', async () => {
      // AsyncStorage.getItemの解決タイミングを呼び出し側から制御できるようにし、
      // 読み込みが完了する前の状態を確実に検証できるようにする
      let resolveGetItem: (value: string | null) => void = () => {};
      jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveGetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      // 読み込みを意図的に保留しているため、ロード開始(getItem呼び出し)だけを待つ
      await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

      // 読み込みが完了するまでの間は、空状態メッセージの代わりにローディング表示が出る
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);

      // カレンダー自体は読み込み中でも常に表示され続ける(曜日ヘッダーの存在で確認する)
      expect(screen.getByText('日', { includeHiddenElements: true })).toBeTruthy();

      // 読み込みを完了させ、テスト終了後にact()の外側でstate更新が起きないようにする
      await act(async () => {
        resolveGetItem(null);
      });
    });

    it('hides the loading indicator and shows the empty state message once the async load resolves with no stored entries', async () => {
      let resolveGetItem: (value: string | null) => void = () => {};
      jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveGetItem = resolve;
          }),
      );

      render(<HomeScreen />);
      await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);

      await act(async () => {
        resolveGetItem(null);
      });

      // 読み込み完了後はローディング表示が消え、代わりに空状態メッセージが表示される
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();
    });

    it('shows neither the loading indicator nor the empty state message once the async load resolves with existing entries', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '既存の日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    });

    // isLoadingは初回読み込み完了時にfalseへ遷移した後は二度とtrueへ戻らない仕様。
    // タブへ再フォーカスするたびにloadEntriesは再実行されるが、その都度ローディング表示が
    // ちらつかないことを確認する。
    it('does not show the loading indicator again on a subsequent focus refetch (isLoading only ever transitions true -> false, never back to true)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '既存の日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      // 1回目のフォーカス(初回マウント)。画面はアンマウントせず、そのままstate(isLoading)を
      // 保持し続ける(実機のexpo-router Tabsがタブ画面をアンマウントしないのと同じ状況)
      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);

      // 2回目の読み込み(再フォーカス時)がまだpending中の間の表示を検証できるようにする
      let resolveGetItem: (value: string | null) => void = () => {};
      jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveGetItem = resolve;
          }),
      );

      // マウント時には日記本文(STORAGE_KEY)に加えて下書き復元用(diary-draft)のgetItemも
      // 1回呼ばれているため、再フォーカス後の合計は3回になる
      act(() => {
        (triggerRefocus as () => void)();
      });
      await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(3));

      // isLoadingは既にfalseのまま維持されるため、読み込みがまだpending中でも
      // ローディング表示は再度出ない(空状態メッセージも、既存のentriesがまだ残っているため出ない)
      expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);

      await act(async () => {
        resolveGetItem(JSON.stringify([]));
      });
    });

    it('keeps showing the empty state message after the async load resolves with no stored entries', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();
    });

    it('hides the empty state message once at least one diary entry is loaded from storage (regression check)', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '既存の日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
    });

    it('hides the empty state message as soon as the first diary entry is saved', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '最初の日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
    });

    it('shows a load-error message instead of the empty state message when stored data is corrupted (invalid JSON), so it stays distinguishable from a truly empty state (boundary)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('not valid json');

      render(<HomeScreen />);

      // 壊れたデータは読み捨てられるが、「本当に0件」とは区別できるようエラー専用のメッセージが表示される
      expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeTruthy();
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
    });

    it('shows a load-error message instead of the empty state message when the encrypted payload fails to decrypt (corrupted ciphertext, boundary)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockResolvedValueOnce(`${ENCRYPTED_PREFIX}not-a-real-ciphertext`);

      render(<HomeScreen />);

      // 復号に失敗したデータも読み捨てられるが、「本当に0件」とは区別できるようエラー専用のメッセージが表示される
      expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeTruthy();
      expect(screen.queryByText(EMPTY_STATE_TEXT)).toBeNull();
    });

    it('shows the plain empty state message (not the load-error message) when nothing has been saved yet', async () => {
      render(<HomeScreen />);

      expect(await screen.findByText(EMPTY_STATE_TEXT)).toBeTruthy();
      expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull();
    });

    it('clears the load-error message and falls back to the plain empty state once a later reload succeeds (recovery)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('not valid json');

      render(<HomeScreen />);
      expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeTruthy();

      // 実ストレージは壊れていないため、再フォーカスによる再読み込みは成功し、
      // エラー専用メッセージは通常の空状態メッセージへ切り替わる
      triggerRefocus();

      await waitFor(() => expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull());
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();
    });

    // opacityを継承するemptyStateTextのままだとエラー表示のコントラストが下がってしまうため、
    // 専用スタイル(emptyStateErrorText)を使い分けていることを確認する
    it('renders the load-error message without the dimmed opacity applied to the plain empty-state message, to preserve contrast (視認性)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('not valid json');

      render(<HomeScreen />);
      const errorMessage = await screen.findByText(LOAD_ERROR_TEXT);
      expect(StyleSheet.flatten(errorMessage.props.style).opacity).toBeUndefined();

      // 実ストレージへ再試行すると通常の空状態メッセージに切り替わり、そちらはopacity 0.7で
      // 意図的に見た目のコントラストを落としている(エラー表示との違いの比較)
      fireEvent.press(screen.getByRole('button', { name: '再試行' }));
      const emptyMessage = await screen.findByText(EMPTY_STATE_TEXT);
      expect(StyleSheet.flatten(emptyMessage.props.style).opacity).toBe(0.7);
    });

    it('reloads the diary entries when the "再試行" button on the load-error message is pressed', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce('not valid json');

      render(<HomeScreen />);
      expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeTruthy();
      const getItemCallCountAfterError = (AsyncStorage.getItem as jest.Mock).mock.calls.length;

      // 実ストレージ自体は壊れていないため、再試行ボタンを押すとloadEntriesが再実行されて成功し、
      // エラー専用メッセージは通常の空状態メッセージへ切り替わる
      fireEvent.press(screen.getByRole('button', { name: '再試行' }));

      await waitFor(() =>
        expect((AsyncStorage.getItem as jest.Mock).mock.calls.length).toBeGreaterThan(
          getItemCallCountAfterError,
        ),
      );
      await waitFor(() => expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull());
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeTruthy();
    });

    it('shows a data-integrity toast with the corrupted entry count when only some stored entries are corrupted, while still showing the valid ones (境界値: 一部破損)', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      const key = await getOrCreateEncryptionKey();
      await AsyncStorage.setItem(
        buildDiaryEntryKey('1'),
        encryptText(
          JSON.stringify({ id: '1', text: '正常な日記', createdAt: isoAt(now, dayWithEntry) }),
          key,
        ),
      );
      await AsyncStorage.setItem(buildDiaryEntryKey('broken'), 'not valid json');

      render(<HomeScreen />);
      await waitForInitialLoad();

      const dataIntegrityToast = screen.getByTestId('data-integrity-toast');
      expect(dataIntegrityToast).toBeTruthy();
      // 保存成功トースト(緑色)と誤認しないよう、警告色(variant="warning")で表示されることを確認する
      expect(StyleSheet.flatten(dataIntegrityToast.props.style).backgroundColor).toBe('#bf360c');
      expect(screen.getByText(buildDiaryPartialCorruptionMessage(1))).toBeTruthy();
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
      expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull();
    });
  });
});
