/* eslint-disable @typescript-eslint/no-require-imports -- jest.mockの巻き上げ後にモックを取得するためrequireが必要 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, FlatList } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EMPTY_STATE_MESSAGE_MONTH } from '@/constants/diary-messages';
import { decryptText, getOrCreateEncryptionKey } from '@/utils/diary-encryption';
import {
  buildDiaryEntryKey,
  DIARY_LOAD_ERROR_MESSAGE,
  type DiaryEntry,
} from '@/utils/diary-storage';

export const mockRandomUUID = randomUUID as jest.Mock;
export const mockNotificationAsync = Haptics.notificationAsync as jest.Mock;
export const secureStoreMock = SecureStore as unknown as { __reset: () => void };
export const { __triggerRefocus: triggerRefocus, __mockPush: mockPush } =
  require('expo-router') as {
    __triggerRefocus: () => void;
    __mockPush: jest.Mock;
  };

export const STORAGE_KEY = 'diary-entries';
export const ENCRYPTED_PREFIX = 'encrypted:v1:';
export const INPUT_PLACEHOLDER = '今日の出来事や気持ちを書いてみましょう';
// 日記本文のキーワード検索用の入力欄
export const SEARCH_INPUT_PLACEHOLDER = '日記を検索';
export const CLOSE_BUTTON_TEXT = '閉じる';
// 日記が0件のときにカレンダーの上に表示される案内メッセージ
export const EMPTY_STATE_TEXT = EMPTY_STATE_MESSAGE_MONTH;
// 全件読み込みに失敗したときにカレンダーの上に表示されるエラーメッセージ(0件と区別するためのもの)
export const LOAD_ERROR_TEXT = DIARY_LOAD_ERROR_MESSAGE;
export const KEYBOARD_AVOIDING_VIEW_TEST_ID = 'keyboard-avoiding-view';

// `queryAllByRole('button')`は常に保存ボタンを含む。
// カレンダーの日付セルの個数だけを数えたいテストでは、保存ボタンを除外したこのヘルパーを使う。
export function queryCalendarDayButtons() {
  return screen
    .queryAllByRole('button')
    .filter((button) => button.props.accessibilityLabel !== '保存');
}

// queryCalendarDayButtonsのうち、実際に日記が存在する日(accessibilityLabelに「日記あり」を
// 含むセル。件数付きの「日記あり(N件)」も含めて拾うため終端一致ではなく部分一致で判定する)
// だけに絞り込むヘルパー。日記の無い日も新規作成用にタップ可能になったことで、
// 旧来「タップ可能=日記あり」だった前提が崩れたテストで、この用途に置き換えて使う。
export function queryCalendarDayButtonsWithEntry() {
  return queryCalendarDayButtons().filter((button) =>
    (button.props.accessibilityLabel as string | undefined)?.includes('日記あり'),
  );
}

// AsyncStorageに実際に永続化された値(暗号化済み文字列)を、テストで検証しやすいよう
// 復号してJSONとしてパースするヘルパー。エントリ単位のキー方式では
// 1つの暗号化文字列は常に1エントリ分のオブジェクトを表す。`getOrCreateEncryptionKey`は
// SecureStoreモックに永続化された鍵をそのまま返すため、画面側が使った鍵と同じ鍵が得られる。
export async function decryptPersistedEntry(encryptedValue: string): Promise<unknown> {
  const key = await getOrCreateEncryptionKey();
  return JSON.parse(decryptText(encryptedValue, key));
}

// 下書きの暗号化文字列を復号して元の本文に戻すヘルパー(JSONではなくプレーンテキストな点がdecryptPersistedEntryと異なる)
export async function decryptPersistedDraft(encryptedValue: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  return decryptText(encryptedValue, key);
}

// 個別キー方式で保存されているエントリを1件、AsyncStorageから直接読み取って復号するヘルパー
export async function readPersistedEntry(id: string): Promise<DiaryEntry | null> {
  const stored = await AsyncStorage.getItem(buildDiaryEntryKey(id));
  if (!stored) {
    return null;
  }
  return (await decryptPersistedEntry(stored)) as DiaryEntry;
}

// `Calendar`はcurrent/initialDate未指定のため実行時点の「今日」を含む月を表示する。
// 月初/月末の前後月「はみ出し」セル(最大前後6日程度)と重複しない10〜20日の範囲を使い、
// さらに`dayWithEntry`(10〜15日)と`dayWithoutEntry`(16〜20日)の範囲を分けて必ず異なる日付にする。
export function pickTestDays(now: Date): { dayWithEntry: number; dayWithoutEntry: number } {
  return {
    dayWithEntry: 10 + (now.getDate() % 6), // 10〜15
    dayWithoutEntry: 16 + (now.getDate() % 5), // 16〜20
  };
}

// pickTestDaysと同じ10〜20日の範囲から、「今日」バッジのセルと区別できるよう
// 実行時点の「今日」とは異なる日を1つ選ぶ。
export function pickNonTodayDayInRange(now: Date): number {
  const today = now.getDate();
  for (let day = 10; day <= 20; day += 1) {
    if (day !== today) {
      return day;
    }
  }
  // 10〜20日の11通りのうち「今日」と一致するのは高々1通りなので、実際には到達しない
  return 10;
}

// 実行時点の年月と、指定した日付・時刻から端末ローカル時刻ベースのISO文字列を作る
// (UTC表記のリテラルを直接組み立てるとテスト実行環境のタイムゾーンによって
// 日付がずれる恐れがあるため、必ずDateのローカルコンストラクタ経由で作成する)。
export function isoAt(now: Date, day: number, hour = 9, minute = 0): string {
  return new Date(now.getFullYear(), now.getMonth(), day, hour, minute, 0).toISOString();
}

// 実装側の`toDateKey`と同じ'YYYY-MM-DD'形式のキーを組み立てるテスト用ヘルパー。
// 日付タップ/検索結果タップ時に`router.push`へ渡される遷移先パスを検証するために使う
// (日付一覧モーダルを day-entries/[date] 画面への遷移に置き換えたことに伴う)
export function toDateKeyForTest(now: Date, day: number): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const paddedDay = `${day}`.padStart(2, '0');
  return `${year}-${month}-${paddedDay}`;
}

// `@types/react-test-renderer`が無く`screen.UNSAFE_getAllByType`等の戻り値は事実上`any`になるため、
// コールバック引数にも同じ`any`を明示注釈し`noImplicitAny`を回避する(実行時の挙動には影響しない)。
export type TestNode = any;

// 検索結果一覧の抜粋(prefix・ハイライト対象のmatch・suffixの3分割)を、実際に描画された
// ThemedTextツリーから取り出すヘルパー。実装側は抜粋表示用のThemedTextにだけ
// numberOfLines={2}を固定で付けており(検索結果一覧内で他に使われていない)、これを目印に
// 対象を絞り込む。マッチが見つからずハイライト要素がレンダリングされないフォールバック時は
// match: nullを返す。FlatListの描画順のまま配列で返すため、検索結果の並び順の検証にも使える
export type RenderedSearchExcerpt = { prefix: string; match: string | null; suffix: string };

export function getRenderedSearchExcerpts(): RenderedSearchExcerpt[] {
  return screen
    .UNSAFE_getAllByType(ThemedText)
    .filter((node: TestNode) => node.props.numberOfLines === 2)
    .map((node: TestNode) => {
      const [prefix, highlightElement, suffix] = node.props.children as [
        string,
        TestNode | null,
        string,
      ];
      const match = highlightElement ? (highlightElement.props.children as string) : null;
      return { prefix, match, suffix };
    });
}

// 各モーダルの背景オーバーレイPressableを特定するヘルパー。実装側は
// `testID="modal-overlay-pressable"`を目印として付けている。
export function getModalOverlayPressable(modal: TestNode): TestNode {
  const overlay = modal.findAll(
    (node: TestNode) => node.props.testID === 'modal-overlay-pressable',
  )[0];
  if (!overlay) {
    throw new Error('modal overlay (Pressable) not found');
  }
  return overlay;
}

// 各モーダルの「閉じる」ボタン(Pressable)を特定するヘルパー。実装側は
// accessibilityRole="button"・accessibilityLabel="閉じる"を目印として付けている。
export function getModalCloseButton(modal: TestNode): TestNode {
  const closeButton = modal.findAll(
    (node: TestNode) =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === '閉じる',
  )[0];
  if (!closeButton) {
    throw new Error('modal close button not found');
  }
  return closeButton;
}

// モーダル本文コンテナ(ThemedView)を包む、タップ伝播を止めるためだけのPressable
// (onPress={() => {}})を特定するヘルパー。他のPressable
// (背景オーバーレイ・閉じるボタン・保存ボタン)は`style`・`testID`・`accessibilityRole`の
// いずれかを必ず持つのに対し、このPressableだけは`onPress`と`children`しか持たないため、
// その組み合わせで一意に特定する。
export function getModalContentTouchAbsorber(modal: TestNode): TestNode {
  const candidates = modal.findAll(
    (node: TestNode) =>
      typeof node.props.onPress === 'function' &&
      node.props.style === undefined &&
      node.props.testID === undefined &&
      node.props.accessibilityRole === undefined,
  );
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one modal content touch-absorbing Pressable, found ${candidates.length}`,
    );
  }
  return candidates[0];
}

// renderを呼ばないテストではscreenへの問い合わせ自体が例外になるため、未描画は「FlatList無し」として扱う
export function isFlatListMounted(): boolean {
  try {
    return screen.UNSAFE_queryAllByType(FlatList).length > 0;
  } catch {
    return false;
  }
}

// 初回の日記読み込みが完了し、ローディング表示が消えるまで待つ(`getItem`の呼び出しだけでは
// `setEntries`等のstate更新の完了を保証できず、act警告や次のテストへの漏れの原因になる)
export async function waitForInitialLoad() {
  await waitFor(() => expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0));
}

// 実行日(特に月初)によって「10〜20日」が未来日になる等の差が出ないよう、基準日を月の下旬に固定する。
// タイマーまで偽装すると既存のwaitFor等の挙動が変わるためDateだけを偽装し、時刻は実時間で進める
export const FIXED_TEST_NOW = new Date(2026, 5, 25, 12, 0, 0);
export const NON_DATE_FAKEABLE_APIS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

// HomeScreenの各テストファイルで共通のタイマー固定・ストレージ初期化・FlatListタイマー待機を登録する。
// describeブロック内で呼び出して使う。
export function setupHomeScreenLifecycle() {
  beforeEach(async () => {
    jest.useFakeTimers({
      now: FIXED_TEST_NOW,
      advanceTimers: true,
      doNotFake: [...NON_DATE_FAKEABLE_APIS],
    });
    await AsyncStorage.clear();
    secureStoreMock.__reset();
    jest.clearAllMocks();

    // 各テストで一意なUUID風の値を返すデフォルト実装をセットしておく
    // (個別のテストで一意性を厳密に検証したい場合は mockReturnValueOnce 等で上書きする)。
    let uuidCounter = 0;
    mockRandomUUID.mockImplementation(() => `mock-uuid-${uuidCounter++}`);
  });

  // FlatList(VirtualizedList)はマウント中にセル範囲再計算のタイマー(既定50ms)を予約し、自動アンマウントの
  // 前後どちらで発火するかで act() 外の更新警告が出ることがある。実時間で待つのは遅いため、
  // FlatList(検索結果一覧)を表示しているテストに限り、アンマウント前に act() 内で発火させる
  afterEach(async () => {
    await act(async () => {
      if (isFlatListMounted()) {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    jest.useRealTimers();
  });
}
