import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryEntryComposerModal } from '@/components/diary-entry-composer-modal';
import { DiarySearchInput, DiarySearchResults } from '@/components/home/diary-search';
import { MonthCalendar } from '@/components/home/month-calendar';
import { MonthPickerModal } from '@/components/home/month-picker-modal';
import { WeekCalendarView } from '@/components/home/week-calendar-view';
import { SaveToast } from '@/components/save-toast';
import { TabScreenContainer } from '@/components/tab-screen-container';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SAVE_SUCCESS_MESSAGE } from '@/constants/diary-messages';
import { useCalendarLayoutPreference } from '@/contexts/calendar-layout-preference-context';
import { useDraftAutoSave } from '@/hooks/use-draft-auto-save';
import { useDraftRestore } from '@/hooks/use-draft-restore';
import { useDiarySearch } from '@/hooks/use-diary-search';
import { useMonthNavigation } from '@/hooks/use-month-navigation';
import { useSaveDiaryEntry } from '@/hooks/use-save-diary-entry';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildCreatedAtForDateKeyAtTime, toDateKey } from '@/utils/diary-date';
import {
  DIARY_DRAFT_STORAGE_KEY,
  DIARY_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX,
} from '@/utils/diary-draft-storage';
import { BODY_MAX_LENGTH, splitIntoGraphemes, truncateToBodyMaxLength } from '@/utils/diary-text';
import {
  buildDiaryPartialCorruptionMessage,
  DIARY_LOAD_ERROR_MESSAGE,
  getAllDiaryEntries,
  saveDiaryEntry,
  type DiaryEntry,
} from '@/utils/diary-storage';

// タブバー(@react-navigation/bottom-tabsのデフォルト、tabBarStyle未カスタマイズ)のおおよその
// コンテンツ高さ(セーフエリア分は含まない)。ボトムシート系モーダルの下端がタブバーと重ならないよう、
// insets.bottomと合わせてpaddingBottomに加算する
const BOTTOM_TAB_BAR_CONTENT_HEIGHT = 49;

export default function HomeScreen() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  // 初回のloadEntries完了までtrueの読み込み中フラグ。useFocusEffectで再フォーカス時にも
  // loadEntriesは呼ばれるが、都度trueに戻すとローディング表示がちらつくため一方向にのみ遷移させる
  const [isLoading, setIsLoading] = useState(true);
  // 直近のloadEntriesが読み込みエラーだったか。「日記が0件」と見た目上区別できるよう、
  // 空状態メッセージの表示を切り替えるために使う
  const [hasLoadError, setHasLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  // 保存成功時に一時的に表示するトーストのメッセージ。nullの間は非表示
  const [saveToastMessage, setSaveToastMessage] = useState<string | null>(null);
  // 一部エントリの破損を検知した際に一時的に表示するトーストのメッセージ。保存成功トーストとは
  // 独立したstateにし、それぞれ別のSaveToastとして同時に表示できるようにする
  const [corruptionToastMessage, setCorruptionToastMessage] = useState<string | null>(null);
  // handleSaveの実行中かどうか・エラー内容。連打による重複保存を防ぐため、実行中は早期returnしボタンもdisabledにする
  const { isSaving, error: saveError, save: saveDraftEntry } = useSaveDiaryEntry();
  // 新規作成モーダルの対象日付('YYYY-MM-DD')。nullの間はモーダルを閉じている
  const [newEntryDate, setNewEntryDate] = useState<string | null>(null);
  const draftEditRevisionRef = useRef(0);

  const router = useRouter();
  // 月表示/週表示のどちらでホーム画面のカレンダー部分を表示するかの設定
  const { layout: calendarLayout } = useCalendarLayoutPreference();
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');
  const errorColor = useThemeColor({}, 'error');
  // ボトムシート系モーダル(新規作成・年月ピッカー)の下端がタブバーと重ならないよう、
  // セーフエリア下端の分だけ余分にpaddingBottomへ加算する。TabScreenContainerが担うのは
  // 上端のセーフエリア対応のみで下端は扱わないため、ここでの加算は二重加算にはならない
  const insets = useSafeAreaInsets();
  const modalContentBottomPadding = insets.bottom + BOTTOM_TAB_BAR_CONTENT_HEIGHT;

  // この画面内の保存処理(新規保存・日付指定の新規作成)を直列化するキュー。
  // 編集・削除は専用画面で直接永続化するため対象外。loadEntriesが参照するため宣言順を前にしている
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  // キューに積まれ未完了のタスク件数。loadEntriesがwriteQueueRef.currentを待つべきか判定するのに使う
  const pendingWriteCountRef = useRef(0);

  const loadEntries = useCallback(async () => {
    // pending中の書き込みがある場合、待たずに読み込むと楽観的更新後の内容が一瞬古い内容に
    // 戻ってちらつくため、直近の書き込み完了を待ってから読み込む。pending無しでも無条件にawaitすると
    // 他の非同期処理との実行順序が余分な1マイクロタスク分ずれるため、必要な場合のみ待つ
    if (pendingWriteCountRef.current > 0) {
      await writeQueueRef.current;
    }
    // getAllDiaryEntriesはストレージが空・壊れている場合も例外を投げず空配列を返すため、
    // ここで個別にtry/catchする必要はない。読み込みエラーの有無はonErrorで受け取り、
    // 「日記0件」の空状態表示と区別する
    let loadFailed = false;
    let partialCorruptionCount = 0;
    const loadedEntries = await getAllDiaryEntries({
      onError: () => {
        loadFailed = true;
      },
      onPartialCorruption: (invalidCount) => {
        partialCorruptionCount = invalidCount;
      },
    });
    setEntries(loadedEntries);
    setHasLoadError(loadFailed);
    if (partialCorruptionCount > 0) {
      setCorruptionToastMessage(buildDiaryPartialCorruptionMessage(partialCorruptionCount));
    }
    // 初回読み込み完了を示す(isLoadingは一方向にのみ遷移し、trueへ戻す処理は無い)
    setIsLoading(false);
  }, []);

  // エントリ単位の個別キーで保存するため、他のエントリの読み書きは発生しない
  const enqueueDiaryWrite = useCallback((entry: DiaryEntry): Promise<void> => {
    // 実行完了を待たず、積んだ時点で同期的にインクリメントする。これにより呼び出し直後に
    // loadEntriesが走っても未実行のタスクの存在を検知できる
    pendingWriteCountRef.current += 1;
    const task = writeQueueRef.current.then(async () => {
      await saveDiaryEntry(entry);
    });
    // キューは成否に関わらず先へ進める(失敗はtask側で呼び出し元に伝わる)。
    // pendingWriteCountRefも成否問わず完了時点でデクリメントする
    writeQueueRef.current = task.then(
      () => {
        pendingWriteCountRef.current -= 1;
      },
      () => {
        pendingWriteCountRef.current -= 1;
      },
    );
    return task;
  }, []);

  // expo-routerの`Tabs`はタブ画面をアンマウントせず保持するため、マウント時一度きりのuseEffectだと
  // 他画面(設定タブの全件削除等)によるAsyncStorageの変更がstateに反映されないまま残り、
  // 古いエントリを巻き込んで上書き保存してしまう。useFocusEffectで再フォーカス毎に読み直し防ぐ
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries]),
  );

  // 起動時・画面マウント時に、自動保存されていた下書きが残っていればTextInputへ復元する。
  // 画面はアンマウントされず保持されるため、マウント時に一度だけ読めば済む
  const isDraftRestored = useDraftRestore({
    draftKey: DIARY_DRAFT_STORAGE_KEY,
    onRestore: setDraft,
    editRevisionRef: draftEditRevisionRef,
  });
  const { clearDraft } = useDraftAutoSave({
    draftKey: DIARY_DRAFT_STORAGE_KEY,
    draft,
    isRestored: isDraftRestored,
  });

  const handleSave = useCallback(async () => {
    // ロールバック用に保存前の状態をpersist内で退避し、失敗時にonErrorから参照する
    let previousEntries: DiaryEntry[] = [];
    let previousDraft = '';
    const editRevisionAtSave = draftEditRevisionRef.current;

    await saveDraftEntry({
      text: draft,
      persist: async (trimmed) => {
        const newEntry: DiaryEntry = {
          // Date.now().toString()は同一ミリ秒での衝突リスクがあるため、UUID v4を生成するrandomUUID()を使う
          id: randomUUID(),
          text: trimmed,
          createdAt: new Date().toISOString(),
        };
        previousEntries = entries;
        previousDraft = draft;
        // 体感速度を落とさないよう、即座に現在のReact stateから計算した内容で楽観的にUIを更新する
        setEntries([newEntry, ...entries]);
        setDraft('');
        // 本文はSecureStoreで保護した鍵でAES-256-GCM暗号化して保存する。他の保存処理と競合しないよう
        // 書き込みはキュー経由で直列化する
        await enqueueDiaryWrite(newEntry);
      },
      onSuccess: async () => {
        // 保存成功時は自動保存済みの下書きキーも削除する。残したままだと次回起動時に
        // 既に保存済みの内容を誤って復元してしまう。ただし保存中に編集された下書きは残す
        // 必要があるため、保存開始時からrevisionが変わっていない場合だけ削除する
        if (draftEditRevisionRef.current === editRevisionAtSave) {
          await clearDraft();
        }

        // 保存成功をユーザーに明示するため、トーストとハプティックフィードバックを発火する
        setSaveToastMessage(SAVE_SUCCESS_MESSAGE);
        if (process.env.EXPO_OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
      onError: () => {
        // 保存中に入力が更新されていない場合だけ、保存前の内容を復元する
        setEntries(previousEntries);
        if (draftEditRevisionRef.current === editRevisionAtSave) {
          setDraft(previousDraft);
        }
      },
      errorMessage: '保存に失敗しました。もう一度お試しください。',
    });
  }, [draft, entries, enqueueDiaryWrite, saveDraftEntry, clearDraft]);

  // 入力が空文字列に戻った場合も、復元や保存失敗による古い内容で上書きしないよう編集revisionを進める
  const handleChangeDraft = useCallback((text: string) => {
    draftEditRevisionRef.current += 1;
    setDraft(truncateToBodyMaxLength(text));
  }, []);

  // 日記の無い日をタップして開いたモーダルからの新規保存。createdAtの日付部分は選択日付に
  // 固定しつつ、時分秒は実際に保存した瞬間の時刻にする(buildCreatedAtForDateKeyAtTime)
  const handlePersistNewEntry = useCallback(
    async (trimmed: string) => {
      // 対象日付が無いまま成功扱いにしないよう、失敗として伝える
      if (!newEntryDate) {
        throw new Error('対象日付が未設定です');
      }
      const newEntry: DiaryEntry = {
        id: randomUUID(),
        text: trimmed,
        createdAt: buildCreatedAtForDateKeyAtTime(newEntryDate),
      };
      // 体感速度を落とさないよう、即座にReact stateを楽観的に更新する
      setEntries((current) => [newEntry, ...current]);
      try {
        // 他の保存処理と競合しないよう、書き込みはキュー経由で直列化する
        await enqueueDiaryWrite(newEntry);
      } catch (err) {
        // 永続化に失敗した場合は楽観的に追加した分を取り除いてロールバックする
        setEntries((current) => current.filter((entry) => entry.id !== newEntry.id));
        throw err;
      }
    },
    [newEntryDate, enqueueDiaryWrite],
  );

  const handleCloseNewEntryModal = useCallback(() => {
    setNewEntryDate(null);
  }, []);

  // 日付指定モーダルからの保存成功時も、通常保存と同じトースト・ハプティクスでフィードバックを揃える
  const handleNewEntrySaved = useCallback(() => {
    setNewEntryDate(null);
    setSaveToastMessage(SAVE_SUCCESS_MESSAGE);
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  // トーストを非表示にする。SaveToastのuseEffect依存配列に含まれるため、参照を安定させないと
  // 再レンダーのたびにタイマーが張り直され、トーストが仕様通りの時間で消えなくなる
  const handleHideSaveToast = useCallback(() => {
    setSaveToastMessage(null);
  }, []);

  const handleHideCorruptionToast = useCallback(() => {
    setCorruptionToastMessage(null);
  }, []);

  // 日付ごとに日記をまとめる(カレンダーセルへの表示・タップ時の一覧表示の両方で利用する)
  const entriesByDate = useMemo(() => {
    const map: Record<string, DiaryEntry[]> = {};
    for (const entry of entries) {
      const key = toDateKey(new Date(entry.createdAt));
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(entry);
    }
    // 各日付内は書かれた時刻の昇順に揃える(「その日最初の1件」が常に先頭に来るように)
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return map;
  }, [entries]);

  const { searchQuery, setSearchQuery, trimmedSearchQuery, searchResults, clearSearch } =
    useDiarySearch(entries);
  const monthNavigation = useMonthNavigation(entries);

  // 検索結果の項目がタップされたら、そのエントリが書かれた日付の一覧画面へ遷移する
  const handleSearchResultPress = useCallback(
    (entry: DiaryEntry) => {
      router.push(`/day-entries/${toDateKey(new Date(entry.createdAt))}`);
    },
    [router],
  );

  // 週表示カレンダーの日記項目がタップされたら、その日の一覧画面へ遷移する(検索結果と同じ導線)
  const handleWeekEntryPress = useCallback(
    (dateKey: string) => {
      router.push(`/day-entries/${dateKey}`);
    },
    [router],
  );

  // 未来日は新規作成の対象外。月表示ではmaxDateで既に押せなくなっている(renderDay参照)が、
  // 週表示と共通の入口として念のため二重にチェックする
  const openNewEntryModal = useCallback((dateKey: string) => {
    if (dateKey > toDateKey(new Date())) {
      return;
    }
    setNewEntryDate(dateKey);
  }, []);

  const handleDayPress = useCallback(
    (date: DateData) => {
      // 読み込み中はentriesByDateが未確定で日記の有無を判定できないため、
      // 既存日記と誤認して新規作成モーダルを開いてしまわないよう何もしない
      if (isLoading) {
        return;
      }
      if (entriesByDate[date.dateString]?.length) {
        // 日付タップ時は専用の一覧画面へ遷移する
        router.push(`/day-entries/${date.dateString}`);
        return;
      }
      openNewEntryModal(date.dateString);
    },
    [isLoading, entriesByDate, router, openNewEntryModal],
  );

  // 文字数カウンター表示用に、grapheme単位で数え直す(絵文字などでUTF-16の.lengthとずれるため)
  const draftGraphemeCount = useMemo(() => splitIntoGraphemes(draft).length, [draft]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Android SDK 54のedge-to-edge対応でwindowSoftInputModeの自動リサイズが効かないケースがあるため明示指定する
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ステータスバー/ノッチ領域とタイトルが重ならないよう、TabScreenContainerでセーフエリア上端インセットぶんの余白を自動的に加算する */}
      <TabScreenContainer style={styles.container}>
        {/* 背景タップでキーボードを閉じる。accessible={false}で内側要素がまとめて読み上げられるのを防ぐ */}
        <Pressable
          style={styles.contentWrapper}
          onPress={() => Keyboard.dismiss()}
          accessible={false}
        >
          <ThemedText type="title" style={styles.title}>
            日記
          </ThemedText>

          {corruptionToastMessage ? (
            <SaveToast
              message={corruptionToastMessage}
              onHide={handleHideCorruptionToast}
              testID="data-integrity-toast"
              variant="warning"
            />
          ) : null}

          <ThemedView style={styles.composer}>
            <TextInput
              style={[styles.input, { color: textColor, borderColor: tintColor }]}
              placeholder="今日の出来事や気持ちを書いてみましょう"
              placeholderTextColor={iconColor}
              value={draft}
              onChangeText={handleChangeDraft}
              multiline
              // placeholderはフォーカス後に読み上げられない環境があるため、明示的なラベルを付ける
              accessibilityLabel="日記本文"
              // maxLengthはUTF-16コードユニット単位でしか制限できないため使わず、grapheme単位で切り詰める
            />
            <View style={styles.composerFooter}>
              {/* 文字数カウンター(上限に近づいた/達したことがひと目で分かるよう常に表示する) */}
              <ThemedText
                style={[
                  styles.charCount,
                  draftGraphemeCount >= BODY_MAX_LENGTH
                    ? { color: errorColor }
                    : { color: iconColor },
                ]}
              >
                {draftGraphemeCount}/{BODY_MAX_LENGTH}
              </ThemedText>
              <Pressable
                style={[
                  styles.saveButton,
                  { backgroundColor: tintColor },
                  // 押せない状態であることが見た目でも分かるよう、無効時は半透明にする
                  { opacity: !draft.trim() || isSaving ? 0.5 : 1 },
                ]}
                onPress={handleSave}
                disabled={!draft.trim() || isSaving}
                accessibilityRole="button"
                accessibilityLabel="保存"
                accessibilityState={{ disabled: !draft.trim() || isSaving }}
              >
                {isSaving ? (
                  <View style={styles.saveButtonContent}>
                    <ActivityIndicator size="small" color={backgroundColor} />
                    <ThemedText style={[styles.saveButtonText, { color: backgroundColor }]}>
                      保存中...
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText style={[styles.saveButtonText, { color: backgroundColor }]}>
                    保存
                  </ThemedText>
                )}
              </Pressable>
            </View>
            {saveError ? (
              <ThemedText style={[styles.errorText, { color: errorColor }]}>{saveError}</ThemedText>
            ) : null}
            {saveToastMessage ? (
              <SaveToast message={saveToastMessage} onHide={handleHideSaveToast} />
            ) : null}
          </ThemedView>

          {/* 日記検索用の入力欄。composerとは独立し、キーワード入力中は下に検索結果一覧を表示する */}
          <DiarySearchInput
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            onClear={clearSearch}
          />

          {trimmedSearchQuery ? (
            // 検索キーワードが入力されている間は、通常のカレンダー表示の代わりに検索結果一覧を表示する
            <DiarySearchResults
              query={trimmedSearchQuery}
              results={searchResults}
              onResultPress={handleSearchResultPress}
            />
          ) : (
            <>
              {isLoading ? (
                // 初回読み込み中はentriesが空配列なだけで空状態メッセージが誤表示されないよう、ローディング表示にする
                <ThemedView style={styles.emptyState}>
                  <ActivityIndicator color={tintColor} />
                </ThemedView>
              ) : entries.length === 0 && hasLoadError ? (
                // 読み込み失敗時は「日記が0件」と見た目上区別が付かなくなるため、専用のメッセージを表示する。
                // emptyStateTextのopacityはコントラストを下げるため、エラー表示には適用しない
                <ThemedView style={styles.emptyState}>
                  <ThemedText style={[styles.emptyStateErrorText, { color: errorColor }]}>
                    {DIARY_LOAD_ERROR_MESSAGE}
                  </ThemedText>
                  <Pressable
                    onPress={loadEntries}
                    style={[styles.retryButton, { borderColor: tintColor }]}
                    accessibilityRole="button"
                    accessibilityLabel="再試行"
                  >
                    <ThemedText style={[styles.retryButtonText, { color: tintColor }]}>
                      再試行
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ) : entries.length === 0 ? (
                // 日記が1件も無い場合、案内メッセージを表示する(カレンダー自体は書く導線として表示し続ける)
                <ThemedView style={styles.emptyState}>
                  <ThemedText style={styles.emptyStateText}>
                    まだ日記がありません。最初の日記を書いてみましょう。
                  </ThemedText>
                </ThemedView>
              ) : null}

              {calendarLayout === 'week' ? (
                // 週表示: 1ヶ月分をまとめて表示する月表示だと情報が細かすぎるという
                // フィードバックに対応した、当日を含む週のみを表示するレイアウト
                <WeekCalendarView
                  entriesByDate={entriesByDate}
                  onEntryPress={handleWeekEntryPress}
                  onCreateEntry={openNewEntryModal}
                  isLoading={isLoading}
                />
              ) : (
                <MonthCalendar
                  entriesByDate={entriesByDate}
                  isLoading={isLoading}
                  navigation={monthNavigation}
                  onDayPress={handleDayPress}
                />
              )}
            </>
          )}
        </Pressable>

        <DiaryEntryComposerModal
          dateKey={newEntryDate}
          draftStorageKeyPrefix={DIARY_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}
          contentBottomPadding={modalContentBottomPadding}
          persist={handlePersistNewEntry}
          onSaved={handleNewEntrySaved}
          onClose={handleCloseNewEntryModal}
        />

        <MonthPickerModal
          navigation={monthNavigation}
          contentBottomPadding={modalContentBottomPadding}
        />
      </TabScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  // 背景タップでキーボードを閉じるPressableラッパー。直接の親がこちらに変わったため、
  // 元containerのgapもここへ移動している
  contentWrapper: {
    flex: 1,
    gap: 16,
  },
  title: {
    // セーフエリア上端インセットぶんの余白はTabScreenContainer側で加算済みのため、
    // ここではタイトル自体のベース余白のみを指定する
    marginTop: 8,
  },
  composer: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: 12,
  },
  saveButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveButtonText: {
    fontWeight: '600',
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  emptyStateText: {
    opacity: 0.7,
  },
  // エラー表示はコントラスト確保のためemptyStateTextのopacityを継承しない
  emptyStateErrorText: {
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    fontWeight: '600',
  },
});
