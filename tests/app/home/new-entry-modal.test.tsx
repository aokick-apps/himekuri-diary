/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert, Modal, StyleSheet } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { type DiaryEntry } from '@/utils/diary-storage';
import {
  mockNotificationAsync,
  STORAGE_KEY,
  ENCRYPTED_PREFIX,
  INPUT_PLACEHOLDER,
  CLOSE_BUTTON_TEXT,
  queryCalendarDayButtonsWithEntry,
  decryptPersistedEntry,
  decryptPersistedDraft,
  pickTestDays,
  isoAt,
  toDateKeyForTest,
  getModalOverlayPressable,
  getModalCloseButton,
  getModalContentTouchAbsorber,
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

  describe('日記の無い日をタップした新規作成モーダル', () => {
    // 「昨日」の計算に実行時のシステム時刻をそのまま使うため、月初にCIが実行されると
    // 「昨日」が前月末になりカレンダー(当月分のみ描画)からセルが見つからず失敗する。
    // 月またぎの影響を受けない月の中頃を基準日として固定する。
    // 実際の保存時刻がcreatedAtに使われることを正午固定と区別して検証できるよう、あえて正午以外の時刻にする
    const FIXED_NOW = new Date(2026, 5, 15, 9, 34, 17);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // 対象日('YYYY年M月D日、日記なし、タップして新規作成')のアクセシビリティラベルからセルを特定する
    function pastOrTodayCellLabel(date: Date): string {
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日、日記なし、タップして新規作成`;
    }

    function openNewEntryModalFor(date: Date) {
      fireEvent.press(screen.getByLabelText(pastOrTodayCellLabel(date)));
    }

    // 新規作成モーダルの保存ボタンは、composer(画面上部の入力欄)と同じ文言「保存」を使うため、
    // `getByText('保存')`だと2件ヒットする(編集モーダルを一度も開いていなければ、その分は
    // マウントされない)。JSXの描画順(composerが先、新規作成モーダルが後)に依存して2件目を取得する。
    function getNewEntrySaveButton() {
      const saveButtons = screen.getAllByText('保存');
      expect(saveButtons).toHaveLength(2);
      return saveButtons[1];
    }

    // 新規作成モーダルのTextInputは、composerと同じaccessibilityLabel「日記本文」を使うため、
    // placeholderの違いで特定する
    function getNewEntryInput() {
      const inputs = screen.getAllByLabelText('日記本文');
      const input = inputs.find(
        (candidate) => candidate.props.placeholder === 'その日の出来事や気持ちを書いてみましょう',
      );
      expect(input).toBeTruthy();
      return input!;
    }

    it('opens the new-entry modal (does not navigate to the day-entries screen) with a heading and placeholder for the tapped date, when a day without any diary entries that is today or in the past is tapped (正常系)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();

      openNewEntryModalFor(yesterday);

      const heading = `${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日の日記を書く`;
      expect(await screen.findByText(heading)).toBeTruthy();
      expect(getNewEntryInput().props.placeholder).toBe('その日の出来事や気持ちを書いてみましょう');

      const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
      expect(newEntryModal.props.visible).toBe(true);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("saves a new entry anchored to the tapped date but with the actual save-time time-of-day as createdAt, persists it encrypted, closes the modal, and reflects the entry in that day's calendar cell", async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      openNewEntryModalFor(yesterday);
      fireEvent.changeText(getNewEntryInput(), '過去日の新規日記');
      fireEvent.press(getNewEntrySaveButton());

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect((value as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);

      const persisted = (await decryptPersistedEntry(value)) as DiaryEntry;
      expect(persisted.text).toBe('過去日の新規日記');

      // createdAtの日付部分はタップした日付に固定されるが、時分秒は正午固定ではなく
      // 実際に保存した瞬間(FIXED_NOW)の時刻になる
      const createdAt = new Date(persisted.createdAt);
      expect(createdAt.getFullYear()).toBe(yesterday.getFullYear());
      expect(createdAt.getMonth()).toBe(yesterday.getMonth());
      expect(createdAt.getDate()).toBe(yesterday.getDate());
      expect(createdAt.getHours()).toBe(FIXED_NOW.getHours());
      expect(createdAt.getMinutes()).toBe(FIXED_NOW.getMinutes());
      expect(createdAt.getSeconds()).toBe(FIXED_NOW.getSeconds());

      // 保存に成功するとモーダルが閉じる
      await waitFor(() => {
        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        expect(newEntryModal.props.visible).toBe(false);
      });

      // entriesByDateはcreatedAtの日付(=タップした日付)をキーにするため、
      // 対象日のカレンダーセルに日記件数インジケーターとして反映される
      expect(queryCalendarDayButtonsWithEntry()).toHaveLength(1);
    });

    it('shows the shared success toast and triggers a success haptic notification after saving from the date-specific new-entry modal, matching the top composer feedback (正常系)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      openNewEntryModalFor(yesterday);
      fireEvent.changeText(getNewEntryInput(), '日付指定モーダルの保存フィードバック確認');
      fireEvent.press(getNewEntrySaveButton());

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));

      expect(await screen.findByText('保存しました')).toBeTruthy();
      expect(screen.getByTestId('save-toast')).toBeTruthy();
      await waitFor(() =>
        expect(mockNotificationAsync).toHaveBeenCalledWith(
          Haptics.NotificationFeedbackType.Success,
        ),
      );
    });

    it('uses the save-moment time-of-day (not a fixed noon) for createdAt on each save, so consecutive saves at different times produce different createdAt values (境界値)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      openNewEntryModalFor(yesterday);
      fireEvent.changeText(getNewEntryInput(), '1件目の新規日記');
      fireEvent.press(getNewEntrySaveButton());
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [, firstValue] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const firstPersisted = (await decryptPersistedEntry(firstValue)) as DiaryEntry;

      // 別日付に、異なる時刻で2件目を保存する
      jest.setSystemTime(new Date(2026, 5, 15, 21, 12, 3));

      openNewEntryModalFor(twoDaysAgo);
      fireEvent.changeText(getNewEntryInput(), '2件目の新規日記');
      fireEvent.press(getNewEntrySaveButton());
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
      const [, secondValue] = (AsyncStorage.setItem as jest.Mock).mock.calls[1];
      const secondPersisted = (await decryptPersistedEntry(secondValue)) as DiaryEntry;

      expect(secondPersisted.createdAt).not.toBe(firstPersisted.createdAt);
      const secondCreatedAt = new Date(secondPersisted.createdAt);
      expect(secondCreatedAt.getHours()).toBe(21);
      expect(secondCreatedAt.getMinutes()).toBe(12);
      expect(secondCreatedAt.getSeconds()).toBe(3);
    });

    it('shows an error message and rolls back the optimistic calendar update when persisting the new entry fails, keeping the modal open with the input preserved (異常系)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write failed'));

      openNewEntryModalFor(yesterday);
      fireEvent.changeText(getNewEntryInput(), '保存失敗する新規日記');
      fireEvent.press(getNewEntrySaveButton());

      expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeTruthy();

      // ロールバックにより、カレンダーセルにはタイトルが反映されない
      expect(screen.queryByText('保存失敗する新規日記')).toBeNull();

      // モーダルは開いたままで、入力内容も保持されている
      const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
      expect(newEntryModal.props.visible).toBe(true);
      expect(getNewEntryInput().props.value).toBe('保存失敗する新規日記');
    });

    it('disables the save button while the new-entry input is empty or whitespace-only, and does not call AsyncStorage.setItem, matching disabled={!newEntryDraft.trim()} (異常系/境界値)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      openNewEntryModalFor(yesterday);
      // 下書き復元の非同期読み込み(getItem)がact()の外で解決し警告になるのを防ぐため、
      // 完了を待ってからアサーションへ進む
      await waitFor(() =>
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
          `diary-new-entry-draft-${toDateKeyForTest(yesterday, yesterday.getDate())}`,
        ),
      );
      const saveButton = getNewEntrySaveButton().parent?.parent?.parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(0.5);

      fireEvent.changeText(getNewEntryInput(), '   \n   ');
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();

      fireEvent.changeText(getNewEntryInput(), '空でなくなった');
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
      expect(StyleSheet.flatten(saveButton?.props.style).opacity).toBe(1);
    });

    it('truncates input exceeding BODY_MAX_LENGTH via onChangeText (grapheme-based, no maxLength prop), and allows saving when the text is exactly at the limit (境界値)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      openNewEntryModalFor(yesterday);
      const input = getNewEntryInput();

      // 上限を1文字超えるテキストは、grapheme単位でちょうど上限文字数まで切り詰められる
      fireEvent.changeText(input, 'あ'.repeat(1001));
      expect(input.props.value).toBe('あ'.repeat(1000));
      expect(screen.getByText('1000/1000')).toBeTruthy();

      // 上限ちょうどの文字数は切り詰められず、そのまま保存できる
      fireEvent.press(getNewEntrySaveButton());
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const persisted = (await decryptPersistedEntry(value)) as DiaryEntry;
      expect(persisted.text).toBe('あ'.repeat(1000));
    });

    describe('新規作成モーダルを閉じる際の未保存入力の破棄確認ダイアログ', () => {
      async function pressAlertButton(label: string) {
        const alertMock = Alert.alert as jest.Mock;
        const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
        const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
        const button = buttons.find((b) => b.text === label);
        expect(button).toBeDefined();
        await act(async () => {
          button?.onPress?.();
        });
      }

      it('closes the modal immediately without any confirmation dialog via the close button when the input is still empty (正常系)', async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        const heading = `${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日の日記を書く`;
        await screen.findByText(heading);

        const closeButtons = screen.getAllByText(CLOSE_BUTTON_TEXT);
        fireEvent.press(closeButtons[closeButtons.length - 1]);

        await waitFor(() => expect(screen.queryByText(heading)).toBeNull());
        expect(Alert.alert).not.toHaveBeenCalled();
      });

      it('sets accessibilityRole="button" and accessibilityLabel="閉じる" on the new-entry modal\'s close button (アクセシビリティ)', async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        const heading = `${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日の日記を書く`;
        await screen.findByText(heading);

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        const closeButton = getModalCloseButton(newEntryModal);
        expect(closeButton.props.accessibilityRole).toBe('button');
        expect(closeButton.props.accessibilityLabel).toBe(CLOSE_BUTTON_TEXT);
      });

      it('shows the discard confirmation dialog when the background overlay is tapped after typing, and keeps the modal open until "破棄" is chosen (正常系)', async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '破棄されるはずの下書き');

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        const overlay = getModalOverlayPressable(newEntryModal);
        fireEvent.press(overlay);

        // ダイアログが出た段階ではまだモーダルは開いたままで、破棄もされていない
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(newEntryModal.props.visible).toBe(true);
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();

        await pressAlertButton('破棄');

        await waitFor(() => expect(newEntryModal.props.visible).toBe(false));
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      });

      it('keeps the modal open and preserves the unsaved draft when "キャンセル" is chosen in the discard confirmation dialog (異常系)', async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), 'キャンセルで残るはずの下書き');

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        const overlay = getModalOverlayPressable(newEntryModal);
        fireEvent.press(overlay);

        await pressAlertButton('キャンセル');

        expect(newEntryModal.props.visible).toBe(true);
        expect(getNewEntryInput().props.value).toBe('キャンセルで残るはずの下書き');
      });

      it('does not show the discard confirmation dialog or close the modal when a tap lands inside the modal content area (e.g. around the TextInput), unlike tapping the background overlay', async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        // 下書き復元の非同期読み込み(getItem)がact()の外で解決し警告になるのを防ぐため、
        // 完了を待ってから入力する
        await waitFor(() =>
          expect(AsyncStorage.getItem).toHaveBeenCalledWith(
            `diary-new-entry-draft-${toDateKeyForTest(yesterday, yesterday.getDate())}`,
          ),
        );
        fireEvent.changeText(getNewEntryInput(), '入力中に消えては困る下書き');

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);

        // 本文コンテナを包むタップ吸収用Pressableへのタップは、
        // 背景オーバーレイのPressable(handleCancelNewEntry)まで伝播しないため、
        // 未保存の下書きがあっても破棄確認ダイアログは出ず、モーダルも閉じない
        const contentTouchAbsorber = getModalContentTouchAbsorber(newEntryModal);
        fireEvent.press(contentTouchAbsorber);

        expect(Alert.alert).not.toHaveBeenCalled();
        expect(newEntryModal.props.visible).toBe(true);
        expect(getNewEntryInput().props.value).toBe('入力中に消えては困る下書き');

        // 対照実験: 同じ状態で背景オーバーレイを直接タップした場合は破棄確認ダイアログが表示される。
        // これにより、上の検証が正しくタップ吸収用Pressableを対象にできていたことを確認する
        const overlay = getModalOverlayPressable(newEntryModal);
        fireEvent.press(overlay);
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(newEntryModal.props.visible).toBe(true);
      });
    });

    it('does not open the new-entry modal when tapping a day that already has diary entries; navigates to the day-entries screen instead', async () => {
      const now = new Date();
      const { dayWithEntry } = pickTestDays(now);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: '1', text: '既存の日記', createdAt: isoAt(now, dayWithEntry) }]),
      );

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.press(screen.getByText(String(dayWithEntry)));

      expect(mockPush).toHaveBeenCalledWith(`/day-entries/${toDateKeyForTest(now, dayWithEntry)}`);
      const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
      expect(newEntryModal.props.visible).toBe(false);
    });

    it("keeps the top composer's save flow (createdAt = the current moment, not local noon of a tapped date) unaffected by the new per-date creation modal", async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();
      jest.clearAllMocks();

      const beforeSave = Date.now();
      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '今日書いた日記');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
      const afterSave = Date.now();
      const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const persisted = (await decryptPersistedEntry(value)) as DiaryEntry;

      const createdAtMs = new Date(persisted.createdAt).getTime();
      expect(createdAtMs).toBeGreaterThanOrEqual(beforeSave);
      expect(createdAtMs).toBeLessThanOrEqual(afterSave);
    });

    describe('新規作成モーダルの下書き自動保存', () => {
      // 実装(`app/(tabs)/index.tsx`)の`diary-new-entry-draft-`接頭辞・デバウンス間隔(1000ms)と対応させる
      const DRAFT_AUTO_SAVE_DEBOUNCE_MS = 1000;

      function getYesterday(): Date {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      }

      // toDateKeyForTestは(now, day)の組で'YYYY-MM-DD'を組み立てるヘルパーのため、
      // 対象日自身をnow・dayの両方に使い回して同じ日付キーを導出する
      function draftKeyFor(date: Date): string {
        return `diary-new-entry-draft-${toDateKeyForTest(date, date.getDate())}`;
      }

      async function pressLatestAlertButton(label: string) {
        const alertMock = Alert.alert as jest.Mock;
        const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
        const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
        const button = buttons.find((b) => b.text === label);
        expect(button).toBeDefined();
        await act(async () => {
          button?.onPress?.();
        });
      }

      it('does not immediately persist the new-entry draft key when the user types (debounced)', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);
        // 下書き復元の非同期読み込み(getItem)がact()の外で解決し警告になるのを防ぐため、
        // 完了を待ってから入力する
        await waitFor(() =>
          expect(AsyncStorage.getItem).toHaveBeenCalledWith(draftKeyFor(yesterday)),
        );
        fireEvent.changeText(getNewEntryInput(), '書きかけの新規下書き');

        // デバウンス時間が経過するまでは、下書きキーへの書き込みはまだ発生しない
        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
          draftKeyFor(yesterday),
          expect.any(String),
        );
      });

      it('auto-saves the new-entry draft under a date-specific AsyncStorage key once the debounce interval elapses', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();
        jest.clearAllMocks();

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '書きかけの新規下書き');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        await waitFor(() =>
          expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            draftKeyFor(yesterday),
            expect.any(String),
          ),
        );
        const [, persistedDraft] = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
          ([key]) => key === draftKeyFor(yesterday),
        );
        await expect(decryptPersistedDraft(persistedDraft)).resolves.toBe('書きかけの新規下書き');
      });

      it('restores a previously auto-saved draft into the modal input when reopened for the same date', async () => {
        const yesterday = getYesterday();
        await AsyncStorage.setItem(draftKeyFor(yesterday), '前回の続きから書きかけの下書き');

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);

        await waitFor(() =>
          expect(getNewEntryInput().props.value).toBe('前回の続きから書きかけの下書き'),
        );
      });

      it('clears the auto-saved draft key once the new entry is successfully saved', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();
        jest.clearAllMocks();

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '保存される新規日記');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });
        await waitFor(() =>
          expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            draftKeyFor(yesterday),
            expect.any(String),
          ),
        );

        fireEvent.press(getNewEntrySaveButton());

        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(draftKeyFor(yesterday)),
        );
      });

      it('clears the auto-saved draft key once "破棄" is chosen to close the modal without saving', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();
        jest.clearAllMocks();
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '破棄されるはずの新規下書き');

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        fireEvent.press(getModalOverlayPressable(newEntryModal));
        await pressLatestAlertButton('破棄');

        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(draftKeyFor(yesterday)),
        );
      });

      it("keeps auto-saved drafts separate per date so they do not bleed into another date's modal", async () => {
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
        await AsyncStorage.setItem(draftKeyFor(yesterday), '昨日専用の下書き');

        render(<HomeScreen />);
        await waitForInitialLoad();

        // 無関係な別日(2日前)のモーダルを開いても、昨日専用の下書きは混入しない
        openNewEntryModalFor(twoDaysAgo);
        await waitFor(() =>
          expect(AsyncStorage.getItem).toHaveBeenCalledWith(draftKeyFor(twoDaysAgo)),
        );
        expect(getNewEntryInput().props.value).toBe('');
        expect(screen.queryByDisplayValue('昨日専用の下書き')).toBeNull();
      });

      it('truncates a restored draft to BODY_MAX_LENGTH when the auto-saved draft itself exceeds the limit (境界値)', async () => {
        const yesterday = getYesterday();
        const overLimitDraft = 'あ'.repeat(1010);
        const truncatedDraft = 'あ'.repeat(1000);
        await AsyncStorage.setItem(draftKeyFor(yesterday), overLimitDraft);

        render(<HomeScreen />);
        await waitForInitialLoad();

        openNewEntryModalFor(yesterday);

        await waitFor(() => expect(getNewEntryInput().props.value).toBe(truncatedDraft));
        expect(screen.getByText('1000/1000')).toBeTruthy();
      });

      it('does not resurrect the discarded draft when the pending debounce timer fires after "破棄" is confirmed (race condition regression)', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();
        jest.clearAllMocks();
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '破棄されるはずの内容');

        const [newEntryModal] = screen.UNSAFE_getAllByType(Modal);
        fireEvent.press(getModalOverlayPressable(newEntryModal));
        await pressLatestAlertButton('破棄');

        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(draftKeyFor(yesterday)),
        );
        (AsyncStorage.setItem as jest.Mock).mockClear();

        // 破棄確定時点で残っていたはずのデバウンスタイマーが発火しても、
        // 明示的にキャンセルされているため下書きが復活しない
        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
          draftKeyFor(yesterday),
          expect.any(String),
        );
      });

      it('does not re-persist the just-cleared draft when the pending debounce timer fires after a successful save (race condition regression)', async () => {
        const yesterday = getYesterday();
        render(<HomeScreen />);
        await waitForInitialLoad();
        jest.clearAllMocks();

        openNewEntryModalFor(yesterday);
        fireEvent.changeText(getNewEntryInput(), '保存される新規日記2');

        // デバウンスタイマーが発火する(1000ms経過する)前に保存する
        fireEvent.press(getNewEntrySaveButton());
        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(draftKeyFor(yesterday)),
        );
        (AsyncStorage.setItem as jest.Mock).mockClear();

        // 保存完了時点で残っていたはずのデバウンスタイマーが発火しても、
        // 明示的にキャンセルされているため下書きキーへの書き込みが復活しない
        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
          draftKeyFor(yesterday),
          expect.any(String),
        );
      });

      it('falls back to an empty input and keeps auto-save working afterward when restoring the draft fails (AsyncStorage.getItem rejects) (異常系)', async () => {
        const yesterday = getYesterday();
        const key = draftKeyFor(yesterday);
        // async-storage-mockは元々jest.fn()のため、jest.spyOnの`mockRestore()`では元の実装に
        // 戻らない(既知の挙動)。上書き前の実装を保存しておき、finallyで明示的に復元する
        const originalGetItemImpl = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
        const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((k: string) => {
          if (k === key) {
            return Promise.reject(new Error('read failed'));
          }
          return originalGetItemImpl ? originalGetItemImpl(k) : Promise.resolve(null);
        });

        // 未処理のPromise rejectionが発生していないことを検知するため、一時的にリスナーを登録する
        const unhandledRejections: unknown[] = [];
        const onUnhandledRejection = (reason: unknown) => {
          unhandledRejections.push(reason);
        };
        process.on('unhandledRejection', onUnhandledRejection);

        try {
          render(<HomeScreen />);
          await waitForInitialLoad();

          openNewEntryModalFor(yesterday);
          await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(key));

          // rejectしたPromiseのcatch/finally節が実行されるまでマイクロタスクキューをフラッシュする
          await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
          });

          expect(unhandledRejections).toHaveLength(0);
          expect(getNewEntryInput().props.value).toBe('');

          // 復元処理が失敗してもisNewEntryDraftRestoredはtrueになり、以降の自動保存が無効化されたままにならない
          fireEvent.changeText(getNewEntryInput(), '復元失敗後も自動保存される下書き');
          await act(async () => {
            jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
          });

          await waitFor(() =>
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, expect.any(String)),
          );
          const [, persistedDraft] = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
            ([writtenKey]) => writtenKey === key,
          );
          await expect(decryptPersistedDraft(persistedDraft)).resolves.toBe(
            '復元失敗後も自動保存される下書き',
          );
        } finally {
          process.off('unhandledRejection', onUnhandledRejection);
          if (originalGetItemImpl) {
            getItemSpy.mockImplementation(originalGetItemImpl);
          }
        }
      });

      it('silently ignores an auto-save write failure (AsyncStorage.setItem rejects for the draft key) without showing an error or losing the in-progress input (異常系)', async () => {
        const yesterday = getYesterday();
        const key = draftKeyFor(yesterday);
        const originalSetItemImpl = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(AsyncStorage, 'setItem').mockImplementation((k: string, v: string) => {
          if (k === key) {
            return Promise.reject(new Error('write failed'));
          }
          return originalSetItemImpl ? originalSetItemImpl(k, v) : Promise.resolve();
        });

        const unhandledRejections: unknown[] = [];
        const onUnhandledRejection = (reason: unknown) => {
          unhandledRejections.push(reason);
        };
        process.on('unhandledRejection', onUnhandledRejection);

        try {
          render(<HomeScreen />);
          await waitForInitialLoad();

          openNewEntryModalFor(yesterday);
          fireEvent.changeText(getNewEntryInput(), '保存に失敗するはずの下書き');

          await act(async () => {
            jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
          });
          await waitFor(() =>
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, expect.any(String)),
          );

          // 下書きの自動保存(補助的な処理)が失敗しても、入力は継続でき、
          // 本保存用のエラーメッセージは表示されない
          expect(screen.queryByText('保存に失敗しました。もう一度お試しください。')).toBeNull();
          expect(getNewEntryInput().props.value).toBe('保存に失敗するはずの下書き');
          expect(unhandledRejections).toHaveLength(0);
        } finally {
          process.off('unhandledRejection', onUnhandledRejection);
          consoleErrorSpy.mockRestore();
        }
      });
    });
  });
});
