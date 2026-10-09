/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockのファクトリ内では巻き上げの都合でrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList, Keyboard, Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from '@/app/(tabs)/index';
import { TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID } from '@/components/tab-screen-container';
import { ThemedView } from '@/components/themed-view';
import {
  STORAGE_KEY,
  INPUT_PLACEHOLDER,
  SEARCH_INPUT_PLACEHOLDER,
  KEYBOARD_AVOIDING_VIEW_TEST_ID,
  pickTestDays,
  isoAt,
  type TestNode,
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

  it('renders the diary title', async () => {
    render(<HomeScreen />);

    expect(screen.getByText('日記')).toBeTruthy();

    // 初回読み込みのeffectを完了させ、次のテストに漏れ出さないようにする
    await waitForInitialLoad();
  });

  it('keeps the title margin at the fixed base value regardless of the safe area top inset (spacing is handled by TabScreenContainer)', async () => {
    render(<HomeScreen />);
    await waitForInitialLoad();

    const title = screen.getByText('日記');
    const flattenedStyle = StyleSheet.flatten(title.props.style);

    expect(flattenedStyle.marginTop).toBe(8);
  });

  it('does not add extra top padding via TabScreenContainer when the safe area top inset is zero (e.g. Android without a notch)', async () => {
    render(<HomeScreen />);
    await waitForInitialLoad();

    const safeAreaWrapper = screen.getByTestId(TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID);
    const flattenedStyle = StyleSheet.flatten(safeAreaWrapper.props.style);

    expect(flattenedStyle.paddingTop).toBe(0);
  });

  it('adds the safe area top inset as paddingTop on TabScreenContainer so content does not overlap the status bar/notch/Dynamic Island', async () => {
    // iPhone 14 Pro (Dynamic Island) 相当のトップインセットを想定
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 59, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen />
      </SafeAreaProvider>,
    );
    await waitForInitialLoad();

    const safeAreaWrapper = screen.getByTestId(TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID);
    const flattenedStyle = StyleSheet.flatten(safeAreaWrapper.props.style);

    // paddingTopがセーフエリアの上端インセット(59)そのものになる。タイトル自体の
    // marginTop(8)と合わせて、リファクタ前と同じ合計の上端余白(59 + 8)を維持する
    expect(flattenedStyle.paddingTop).toBe(59);

    const title = screen.getByText('日記');
    expect(StyleSheet.flatten(title.props.style).marginTop).toBe(8);
  });

  describe('ボトムシート系モーダル(新規作成・年月ピッカー)のpaddingBottom', () => {
    // タブバーのおおよそのコンテンツ高さ(セーフエリア分は含まない)。実装側の
    // BOTTOM_TAB_BAR_CONTENT_HEIGHTと同じ値(app/(tabs)/index.tsx参照)
    const BOTTOM_TAB_BAR_CONTENT_HEIGHT = 49;

    // モーダルは[新規作成, 年月ピッカー]の順でJSXに並んでいる(実装側app/(tabs)/index.tsx参照)
    function getNewEntryModal() {
      return screen.UNSAFE_getAllByType(Modal)[0];
    }

    function getMonthPickerModal() {
      return screen.UNSAFE_getAllByType(Modal)[1];
    }

    // 各モーダル配下にある本文コンテナ(ThemedView、styles.modalContent)を特定するヘルパー。
    // どちらのモーダルもThemedViewを1つだけ含む(実装側app/(tabs)/index.tsx参照)。
    function getModalContent(modal: TestNode): TestNode {
      const [modalContent] = modal.findAllByType(ThemedView);
      if (!modalContent) {
        throw new Error('modal content (ThemedView) not found');
      }
      return modalContent;
    }

    async function openNewEntryModalForToday(now: Date) {
      const label = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日、日記なし、タップして新規作成`;
      fireEvent.press(screen.getByLabelText(label));
      await screen.findByText(
        `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日の日記を書く`,
      );
    }

    async function openMonthPicker(now: Date) {
      const headerText = await screen.findByText(`${now.getFullYear()}年${now.getMonth() + 1}月`, {
        includeHiddenElements: true,
      });
      fireEvent.press(headerText);
      await screen.findByText('年月を選択');
    }

    it('adds only the bottom tab bar height as paddingBottom on the new-entry modal content when the safe area bottom inset is zero (default mock)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openNewEntryModalForToday(now);

      const modalContent = getModalContent(getNewEntryModal());
      expect(StyleSheet.flatten(modalContent.props.style).paddingBottom).toBe(
        BOTTOM_TAB_BAR_CONTENT_HEIGHT,
      );
    });

    it('adds the safe area bottom inset plus the bottom tab bar height as paddingBottom on the new-entry modal content, so it does not overlap the tab bar', async () => {
      const now = new Date();
      render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 59, left: 0, right: 0, bottom: 34 },
          }}
        >
          <HomeScreen />
        </SafeAreaProvider>,
      );
      await waitForInitialLoad();

      await openNewEntryModalForToday(now);

      const modalContent = getModalContent(getNewEntryModal());
      expect(StyleSheet.flatten(modalContent.props.style).paddingBottom).toBe(
        34 + BOTTOM_TAB_BAR_CONTENT_HEIGHT,
      );
    });

    it('adds only the bottom tab bar height as paddingBottom on the month picker modal content when the safe area bottom inset is zero (default mock)', async () => {
      const now = new Date();
      render(<HomeScreen />);
      await waitForInitialLoad();

      await openMonthPicker(now);

      const modalContent = getModalContent(getMonthPickerModal());
      expect(StyleSheet.flatten(modalContent.props.style).paddingBottom).toBe(
        BOTTOM_TAB_BAR_CONTENT_HEIGHT,
      );
    });

    it('adds the safe area bottom inset plus the bottom tab bar height as paddingBottom on the month picker modal content, so it does not overlap the tab bar', async () => {
      const now = new Date();
      render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 59, left: 0, right: 0, bottom: 34 },
          }}
        >
          <HomeScreen />
        </SafeAreaProvider>,
      );
      await waitForInitialLoad();

      await openMonthPicker(now);

      const modalContent = getModalContent(getMonthPickerModal());
      expect(StyleSheet.flatten(modalContent.props.style).paddingBottom).toBe(
        34 + BOTTOM_TAB_BAR_CONTENT_HEIGHT,
      );
    });
  });

  describe('KeyboardAvoidingView のプラットフォーム別挙動', () => {
    // `Platform.OS` はテスト間で状態を共有するモジュールレベルの値のため、
    // 変更したテストの後は必ず元の値(デフォルトの 'ios')へ戻す。
    const originalPlatformOS = Platform.OS;

    afterEach(() => {
      Platform.OS = originalPlatformOS;
    });

    it('uses behavior="height" on Android so the input and save button are not hidden by the keyboard', async () => {
      Platform.OS = 'android';

      render(<HomeScreen />);
      await waitForInitialLoad();

      const keyboardAvoidingView = screen.getByTestId(KEYBOARD_AVOIDING_VIEW_TEST_ID);
      expect(keyboardAvoidingView.props.accessibilityValue.text).toBe('height');
    });

    it('keeps behavior="padding" on iOS (regression check)', async () => {
      Platform.OS = 'ios';

      render(<HomeScreen />);
      await waitForInitialLoad();

      const keyboardAvoidingView = screen.getByTestId(KEYBOARD_AVOIDING_VIEW_TEST_ID);
      expect(keyboardAvoidingView.props.accessibilityValue.text).toBe('padding');
    });
  });

  describe('背景タップでキーボードを閉じる', () => {
    // `Pressable`はReact.memoでラップされているため、react-test-rendererの内部実装上
    // メモ化された`type`が内側のアンラップ済み関数になり`screen.UNSAFE_getAllByType(Pressable)`
    // では一致しない。そのため型ではなく`accessible={false}` + `onPress`のprops組み合わせを
    // 手がかりに`screen.root.findAll`で探す(`getModalOverlayPressable`も同じ理由)。
    function getBackgroundDismissPressable() {
      const candidates = screen.root.findAll(
        (node: TestNode) =>
          node.props.accessible === false && typeof node.props.onPress === 'function',
      );
      if (candidates.length !== 1) {
        throw new Error(
          `expected exactly one background dismiss Pressable, found ${candidates.length}`,
        );
      }
      return candidates[0];
    }

    it('calls Keyboard.dismiss when the background wrapper is tapped (正常系)', async () => {
      const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.press(getBackgroundDismissPressable());

      expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('sets accessible={false} on the background wrapper so the individual accessibility info of the title/composer/buttons inside is not merged into a single element (境界値: アクセシビリティ設定の確認)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(getBackgroundDismissPressable().props.accessible).toBe(false);
    });

    it('does not call Keyboard.dismiss when pressing the save button; the save button handles its own tap independently of the background wrapper (保存ボタンのタップが背景ラッパーに邪魔されない)', async () => {
      const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

      render(<HomeScreen />);
      await waitForInitialLoad();

      fireEvent.changeText(screen.getByPlaceholderText(INPUT_PLACEHOLDER), '入力内容');
      fireEvent.press(screen.getByText('保存'));

      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
      expect(dismissSpy).not.toHaveBeenCalled();
    });

    it('does not call Keyboard.dismiss when typing into the composer TextInput; the input handles its own event independently of the background wrapper (入力操作が背景ラッパーに邪魔されない)', async () => {
      const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

      render(<HomeScreen />);
      await waitForInitialLoad();

      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
      fireEvent.changeText(input, '入力内容');

      expect(input.props.value).toBe('入力内容');
      expect(dismissSpy).not.toHaveBeenCalled();
    });

    // FlatListはメモ化されていない素のクラスコンポーネントのため`screen.UNSAFE_queryAllByType(FlatList)`
    // で直接特定できる。
    function queryAllFlatLists() {
      return screen.UNSAFE_queryAllByType(FlatList);
    }

    it('does not mount any FlatList until a search keyword is entered (前提条件の確認)', async () => {
      render(<HomeScreen />);
      await waitForInitialLoad();

      expect(queryAllFlatLists()).toHaveLength(0);
    });

    it('sets keyboardDismissMode="on-drag" on the search results FlatList once a keyword is entered (正常系)', async () => {
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

      // 日付一覧モーダルは未オープンのため、検索結果一覧用のFlatListのみが該当する
      const flatLists = queryAllFlatLists();
      expect(flatLists).toHaveLength(1);
      expect(flatLists[0].props.keyboardDismissMode).toBe('on-drag');
    });

    it('sets keyboardShouldPersistTaps="handled" on the search results FlatList once a keyword is entered, so a search result can be selected with a single tap even while the keyboard is shown (正常系)', async () => {
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

      // HomeScreenに残るFlatListは検索結果一覧のみなので、これが該当する
      const flatLists = queryAllFlatLists();
      expect(flatLists).toHaveLength(1);
      expect(flatLists[0].props.keyboardShouldPersistTaps).toBe('handled');
    });
  });
});
