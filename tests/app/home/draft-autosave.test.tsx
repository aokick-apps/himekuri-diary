/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import HomeScreen from '@/app/(tabs)/index';
import {
  STORAGE_KEY,
  INPUT_PLACEHOLDER,
  decryptPersistedDraft,
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

  describe('下書きの自動保存', () => {
    // 実装(`app/(tabs)/index.tsx`)の`diary-draft`キー・デバウンス間隔(1000ms)と対応させる
    const DRAFT_STORAGE_KEY = 'diary-draft';
    const DRAFT_AUTO_SAVE_DEBOUNCE_MS = 1000;

    it('does not immediately persist the draft key when the user types (debounced)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '書きかけの下書き');

      // デバウンス時間が経過するまでは、下書きキーへの書き込みはまだ発生しない
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(DRAFT_STORAGE_KEY, expect.any(String));
    });

    it('auto-saves the draft under a separate AsyncStorage key once the debounce interval elapses', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '書きかけの下書き');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        await waitFor(() =>
          expect(AsyncStorage.setItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY, expect.any(String)),
        );
        const [, persistedDraft] = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
          ([key]) => key === DRAFT_STORAGE_KEY,
        );
        // 保存済みエントリと同じくAES-256-GCMで暗号化され、平文のままでは保存されない
        expect(persistedDraft).not.toBe('書きかけの下書き');
        await expect(decryptPersistedDraft(persistedDraft)).resolves.toBe('書きかけの下書き');
        // 日記本文の保存キー(diary-entries)とは別キーで保存されている
        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
      } finally {
        jest.useRealTimers();
      }
    });

    it('coalesces rapid successive edits into a single debounced write of the latest content', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, '書');
        act(() => {
          jest.advanceTimersByTime(500);
        });
        fireEvent.changeText(input, '書き');
        act(() => {
          jest.advanceTimersByTime(500);
        });
        fireEvent.changeText(input, '書きか');

        // 連続した編集の間隔がデバウンス時間(1000ms)未満のため、まだ書き込まれていない
        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
          DRAFT_STORAGE_KEY,
          expect.any(String),
        );

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        const draftWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
          ([key]) => key === DRAFT_STORAGE_KEY,
        );
        expect(draftWrites).toHaveLength(1);
        await expect(decryptPersistedDraft(draftWrites[0][1])).resolves.toBe('書きか');
      } finally {
        jest.useRealTimers();
      }
    });

    it('restores a previously auto-saved draft into the text input on mount', async () => {
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, '前回の続きから書きかけの下書き');

      render(<HomeScreen />);

      const input = await screen.findByPlaceholderText(INPUT_PLACEHOLDER);
      await waitFor(() => expect(input.props.value).toBe('前回の続きから書きかけの下書き'));
    });

    it('does not overwrite in-progress user input with an older auto-saved draft when the user starts typing before the initial restore resolves', async () => {
      let resolveDraftRead: (value: string | null) => void = () => {};
      // async-storage-mockは元々jest.fn()のため、jest.spyOnの`mockRestore()`では元の実装に
      // 戻らない(既知の挙動)。上書き前の実装を保存しておき、finallyで明示的に復元する
      const originalGetItemImpl = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => {
        if (key === DRAFT_STORAGE_KEY) {
          return new Promise<string | null>((resolve) => {
            resolveDraftRead = resolve;
          });
        }
        return Promise.resolve(null);
      });

      try {
        render(<HomeScreen />);
        await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY));

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, 'ユーザーが入力中の新しい内容');

        // 復元処理未解決の間にユーザーが入力を始めた後、保存済みの古い下書きの読み込みが解決する
        await act(async () => {
          resolveDraftRead('保存済みの古い下書き');
          await Promise.resolve();
          await Promise.resolve();
        });

        // 復元前の編集が記録され、入力済みの内容が古い下書きで上書きされない
        expect(input.props.value).toBe('ユーザーが入力中の新しい内容');
      } finally {
        if (originalGetItemImpl) {
          getItemSpy.mockImplementation(originalGetItemImpl);
        }
      }
    });

    it('does not restore an older draft after the user edits the input back to empty before restore resolves', async () => {
      let resolveDraftRead: (value: string | null) => void = () => {};
      const originalGetItemImpl = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => {
        if (key === DRAFT_STORAGE_KEY) {
          return new Promise<string | null>((resolve) => {
            resolveDraftRead = resolve;
          });
        }
        return Promise.resolve(null);
      });

      try {
        render(<HomeScreen />);
        await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY));

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, '一時的な入力');
        fireEvent.changeText(input, '');

        await act(async () => {
          resolveDraftRead('保存済みの古い下書き');
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(input.props.value).toBe('');
      } finally {
        if (originalGetItemImpl) {
          getItemSpy.mockImplementation(originalGetItemImpl);
        }
      }
    });

    it('clears the auto-saved draft key once the entry is successfully saved', async () => {
      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        await waitForInitialLoad();

        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, '保存される日記');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });
        await waitFor(() =>
          expect(AsyncStorage.setItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY, expect.any(String)),
        );

        fireEvent.press(screen.getByText('保存'));

        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('removes the draft key once the input is cleared back to empty and the debounce interval elapses', async () => {
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, '消される下書き');

      jest.useFakeTimers();
      try {
        render(<HomeScreen />);
        const input = await screen.findByPlaceholderText(INPUT_PLACEHOLDER);
        await waitFor(() => expect(input.props.value).toBe('消される下書き'));

        fireEvent.changeText(input, '');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        await waitFor(() =>
          expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not persist the debounced draft write once the screen unmounts before the debounce interval elapses', async () => {
      jest.useFakeTimers();
      try {
        const { unmount } = render(<HomeScreen />);
        await waitForInitialLoad();

        fireEvent.changeText(
          screen.getByPlaceholderText(INPUT_PLACEHOLDER),
          'アンマウント直前まで入力していた下書き',
        );

        // デバウンスのタイマーが発火する前に画面がアンマウントされる
        // (例: タブを離れて別のタブへ遷移する等)
        unmount();

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        // クリーンアップ(clearTimeout)により、アンマウント後にタイマーが発火して
        // 書き込みが発生することはない
        expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
          DRAFT_STORAGE_KEY,
          expect.any(String),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not warn about updating state after unmount when the initial draft restore resolves after the screen has already been unmounted', async () => {
      let resolveDraftRead: (value: string | null) => void = () => {};
      // `@react-native-async-storage/async-storage/jest/async-storage-mock`の各メソッドは
      // 元々jest.fn()として定義されているため、`jest.spyOn`はそれを新規にラップし直さず
      // 既存のmock関数をそのまま返す。その状態で`mockRestore()`を呼んでも「スパイ前の
      // 実装」には戻らず、常に`undefined`を返す空のmockにリセットされてしまう
      // (`jest.spyOn`は非mock関数に対して使う場合のみ本来の意味で機能する既知の挙動)。
      // そのため、他のテストへ実装を安全に戻すには、上書き前の実装を明示的に保存しておき、
      // finallyで`mockImplementation(元の実装)`により復元する
      const originalGetItemImpl = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => {
        if (key === DRAFT_STORAGE_KEY) {
          return new Promise<string | null>((resolve) => {
            resolveDraftRead = resolve;
          });
        }
        return Promise.resolve(null);
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { unmount } = render(<HomeScreen />);
        unmount();

        await act(async () => {
          resolveDraftRead('マウント解除後に届いた下書き');
          await Promise.resolve();
          await Promise.resolve();
        });

        // isCancelledフラグにより、アンマウント後に届いた読み込み結果でsetState(setDraft/
        // setIsDraftRestored)を呼び出さないため、Reactの「アンマウント済みコンポーネントへの
        // state更新」警告は発生しない
        const unmountWarning = consoleErrorSpy.mock.calls.some(
          ([message]) =>
            typeof message === 'string' &&
            message.includes("Can't perform a React state update on an unmounted component"),
        );
        expect(unmountWarning).toBe(false);
      } finally {
        if (originalGetItemImpl) {
          getItemSpy.mockImplementation(originalGetItemImpl);
        }
        consoleErrorSpy.mockRestore();
      }
    });

    it('does not clear the auto-saved draft key when saving the diary entry fails, so it remains recoverable on next launch', async () => {
      // 下書きキーのクリア(removeItem)はhandleSave成功時のみ実行される。
      // 保存失敗時に下書きまで消えると、次回起動時の復元対象も失われてしまうため、この境界を検証する
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, '保存に失敗する日記');
      jest.clearAllMocks();

      render(<HomeScreen />);
      const input = await screen.findByPlaceholderText(INPUT_PLACEHOLDER);
      await waitFor(() => expect(input.props.value).toBe('保存に失敗する日記'));

      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write failed'));
      fireEvent.press(screen.getByText('保存'));

      await screen.findByText('保存に失敗しました。もう一度お試しください。');

      expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(DRAFT_STORAGE_KEY);
    });

    it('does not leave an unhandled promise rejection when the initial draft restore getItem() call rejects, and still enables auto-save afterward', async () => {
      // async-storage-mockは元々jest.fn()のため、jest.spyOnの`mockRestore()`では元の実装に
      // 戻らない(既知の挙動)。上書き前の実装を保存しておき、finallyで明示的に復元する
      const originalGetItemImpl = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
      // 下書きキー(diary-draft)へのgetItemのみrejectさせ、他のキーへの呼び出しは通常通り解決させる
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => {
        if (key === DRAFT_STORAGE_KEY) {
          return Promise.reject(new Error('read failed'));
        }
        return Promise.resolve(null);
      });

      // 未処理のPromise rejectionが発生していないことを検知するため、一時的にリスナーを登録する
      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown) => {
        unhandledRejections.push(reason);
      };
      process.on('unhandledRejection', onUnhandledRejection);

      jest.useFakeTimers();
      try {
        render(<HomeScreen />);

        await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY));

        // rejectしたPromiseのcatch/finally節が実行されるまでマイクロタスクキューをフラッシュする
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(unhandledRejections).toHaveLength(0);

        // 復元処理が失敗してもisDraftRestoredはtrueになり、自動保存が無効化されたままにならない
        const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
        fireEvent.changeText(input, '復元失敗後も自動保存される下書き');

        await act(async () => {
          jest.advanceTimersByTime(DRAFT_AUTO_SAVE_DEBOUNCE_MS);
        });

        await waitFor(() =>
          expect(AsyncStorage.setItem).toHaveBeenCalledWith(DRAFT_STORAGE_KEY, expect.any(String)),
        );
        const [, persistedDraft] = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
          ([key]) => key === DRAFT_STORAGE_KEY,
        );
        await expect(decryptPersistedDraft(persistedDraft)).resolves.toBe(
          '復元失敗後も自動保存される下書き',
        );
      } finally {
        jest.useRealTimers();
        process.off('unhandledRejection', onUnhandledRejection);
        if (originalGetItemImpl) {
          getItemSpy.mockImplementation(originalGetItemImpl);
        }
      }
    });
  });
});
