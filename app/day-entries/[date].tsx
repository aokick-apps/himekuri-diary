import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayEntryItem } from '@/components/day-entry-item';
import { DiaryEntryComposerModal } from '@/components/diary-entry-composer-modal';
import { SaveToast } from '@/components/save-toast';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SAVE_SUCCESS_MESSAGE } from '@/constants/diary-messages';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildCreatedAtForDateKeyAtTime, formatDateHeading, toDateKey } from '@/utils/diary-date';
import { DIARY_DAY_ENTRIES_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX } from '@/utils/diary-draft-storage';
import { deleteDiaryImages } from '@/utils/diary-images';
import {
  buildDiaryPartialCorruptionMessage,
  deleteDiaryEntry,
  DIARY_LOAD_ERROR_MESSAGE,
  getAllDiaryEntries,
  saveDiaryEntry,
  type DiaryEntry,
  type DiaryImage,
} from '@/utils/diary-storage';

const COPY_SUCCESS_MESSAGE = 'コピーしました';
const EMPTY_STATE_MESSAGE = 'この日の日記はまだありません';
const DELETE_UNDO_DELAY_MS = 5000;

function sortEntriesByCreatedAt(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => {
    const timeDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return timeDifference !== 0 ? timeDifference : a.id.localeCompare(b.id);
  });
}

// 検索結果から遷移した日記を強調表示しておく時間(ミリ秒)
const HIGHLIGHT_DURATION_MS = 4000;
// 強調する日記を画面のどの高さに表示するか(0: 上端〜1: 下端)。直前の日記も少し見えるようにする
const HIGHLIGHT_VIEW_POSITION = 0.2;
const SCROLL_RETRY_DELAY_MS = 100;

// 指定した日付('YYYY-MM-DD')の日記一覧を表示する専用画面。
// カレンダー画面のモーダルではなく独立した画面にすることで、削除時のフェードアウトや
// 編集画面への遷移を画面単位で扱えるようにしている。
export default function DayEntriesScreen() {
  const { date, highlightEntryId } = useLocalSearchParams<{
    date: string;
    highlightEntryId?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [hasLoadedEntries, setHasLoadedEntries] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [copyToastMessage, setCopyToastMessage] = useState<string | null>(null);
  const [saveToastMessage, setSaveToastMessage] = useState<string | null>(null);
  const [corruptionToastMessage, setCorruptionToastMessage] = useState<string | null>(null);
  const [pendingDeletedEntries, setPendingDeletedEntries] = useState<DiaryEntry[]>([]);
  const [isRestoringDeletedEntries, setIsRestoringDeletedEntries] = useState(false);
  const [hasUndoError, setHasUndoError] = useState(false);
  const pendingDeletedEntriesRef = useRef<DiaryEntry[]>([]);
  const isRestoringDeletedEntriesRef = useRef(false);
  // 同じエントリの多重削除だけを防ぎ、別エントリの削除は並行して受け付けるためIDごとに管理する
  const deletingEntryIdsRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);
  const activeDateRef = useRef(date);
  const previousDateRef = useRef(date);
  // loadEntriesの呼び出し順序を追跡し、後発の呼び出しより先に完了した古い呼び出しの結果で
  // stateを上書きしないようにする(日付切り替え・連続フォーカス時の競合対策)
  const loadRequestIdRef = useRef(0);
  activeDateRef.current = date;
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const listRef = useRef<FlatList<DiaryEntry>>(null);
  // 検索結果から遷移してきた場合に強調表示中の日記。同じ遷移で何度も強調し直さないよう適用済みのidも持つ
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const appliedHighlightEntryIdRef = useRef<string | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tintColor = useThemeColor({}, 'tint');
  const linkColor = useThemeColor({}, 'link');
  const errorColor = useThemeColor({}, 'error');
  // この画面はタブバーを持たないため、セーフエリア下端ぶんのみモーダルコンテンツの下端に加算する
  const insets = useSafeAreaInsets();

  // 削除の取り消し期限が過ぎた日記は二度と復元されないため、添付画像のファイルもこの時点で消す
  const expirePendingDeletedEntries = useCallback(() => {
    for (const entry of pendingDeletedEntriesRef.current) {
      deleteDiaryImages(entry.images);
    }
    pendingDeletedEntriesRef.current = [];
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      expirePendingDeletedEntries();
      if (scrollRetryTimerRef.current !== null) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    };
  }, [expirePendingDeletedEntries]);

  useEffect(() => {
    if (
      !hasLoadedEntries ||
      !highlightEntryId ||
      appliedHighlightEntryIdRef.current === highlightEntryId
    ) {
      return;
    }
    const index = entries.findIndex((entry) => entry.id === highlightEntryId);
    if (index === -1) {
      return;
    }
    appliedHighlightEntryIdRef.current = highlightEntryId;
    setHighlightedEntryId(highlightEntryId);
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: HIGHLIGHT_VIEW_POSITION,
    });
  }, [hasLoadedEntries, entries, highlightEntryId]);

  useEffect(() => {
    if (highlightedEntryId === null) {
      return;
    }
    const timer = setTimeout(() => setHighlightedEntryId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightedEntryId]);

  // 未描画の位置へのscrollToIndexは失敗するため、平均の高さから近くまで移動して描画させてから再試行する
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      if (scrollRetryTimerRef.current !== null) {
        clearTimeout(scrollRetryTimerRef.current);
      }
      scrollRetryTimerRef.current = setTimeout(() => {
        scrollRetryTimerRef.current = null;
        listRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: HIGHLIGHT_VIEW_POSITION,
        });
      }, SCROLL_RETRY_DELAY_MS);
    },
    [],
  );

  useEffect(() => {
    if (previousDateRef.current !== date) {
      expirePendingDeletedEntries();
      setPendingDeletedEntries([]);
      setHasUndoError(false);
      previousDateRef.current = date;
    }
  }, [date, expirePendingDeletedEntries]);

  const handleOpenComposer = useCallback(() => {
    setIsComposerOpen(true);
  }, []);

  // ルートごとの静的なタイトルしか設定できない`_layout.tsx`側の代わりに、
  // paramsに応じた動的なタイトル・ヘッダーボタンをここで設定する
  useEffect(() => {
    navigation.setOptions({
      title: date ? formatDateHeading(date) : '',
      headerRight: () => (
        <Pressable
          onPress={handleOpenComposer}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="この日の日記を新規作成"
        >
          <IconSymbol name="plus" size={24} color={tintColor} />
        </Pressable>
      ),
    });
  }, [navigation, date, tintColor, handleOpenComposer]);

  const loadEntries = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    if (!date) {
      setEntries([]);
      setHasLoadError(false);
      setHasLoadedEntries(true);
      return;
    }
    let loadFailed = false;
    let partialCorruptionCount = 0;
    const allEntries = await getAllDiaryEntries({
      onError: () => {
        loadFailed = true;
      },
      onPartialCorruption: (invalidCount) => {
        partialCorruptionCount = invalidCount;
      },
    });
    // 完了時点で自分より新しいリクエストが既に発火していれば、この結果は古いため反映しない
    if (loadRequestIdRef.current !== requestId) {
      return;
    }
    setEntries(
      sortEntriesByCreatedAt(
        allEntries.filter((entry) => toDateKey(new Date(entry.createdAt)) === date),
      ),
    );
    setHasLoadError(loadFailed);
    setHasLoadedEntries(true);
    if (partialCorruptionCount > 0) {
      setCorruptionToastMessage(buildDiaryPartialCorruptionMessage(partialCorruptionCount));
    }
  }, [date]);

  // 編集画面から戻ってきた際にも最新の内容を反映できるよう、フォーカスが戻るたびに読み直す
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries]),
  );

  const handleCloseComposer = useCallback(() => {
    setIsComposerOpen(false);
  }, []);

  // 新規作成モーダルの保存処理本体。createdAtの日付部分はこの画面が表示している日付に
  // 固定しつつ、時分秒は実際に保存した瞬間の時刻にする(buildCreatedAtForDateKeyAtTime)
  const handlePersistNewEntry = useCallback(
    async (trimmed: string, images: DiaryImage[]) => {
      // 対象日付が無いまま成功扱いにしないよう、失敗として伝える
      if (!date) {
        throw new Error('対象日付が未設定です');
      }
      const newEntry: DiaryEntry = {
        id: randomUUID(),
        text: trimmed,
        createdAt: buildCreatedAtForDateKeyAtTime(date),
        ...(images.length > 0 ? { images } : {}),
      };
      // 体感速度を落とさないよう楽観的にUIを更新する(一覧は時刻昇順のため末尾に追加)
      setEntries((current) => [...current, newEntry]);
      try {
        await saveDiaryEntry(newEntry);
      } catch (err) {
        // 永続化に失敗した場合は楽観的に追加した分を取り除いてロールバックする
        setEntries((current) => current.filter((entry) => entry.id !== newEntry.id));
        throw err;
      }
    },
    [date],
  );

  // ホーム画面の保存成功時と同じトースト・ハプティクスでフィードバックを揃える
  const handleComposerSaved = useCallback(() => {
    setIsComposerOpen(false);
    setSaveToastMessage(SAVE_SUCCESS_MESSAGE);
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const handleHideCopyToast = useCallback(() => {
    setCopyToastMessage(null);
  }, []);

  const handleHideSaveToast = useCallback(() => {
    setSaveToastMessage(null);
  }, []);

  const handleHideCorruptionToast = useCallback(() => {
    setCorruptionToastMessage(null);
  }, []);

  const handleHideDeleteUndoToast = useCallback(() => {
    if (isRestoringDeletedEntriesRef.current) {
      return;
    }
    expirePendingDeletedEntries();
    setPendingDeletedEntries([]);
    setHasUndoError(false);
  }, [expirePendingDeletedEntries]);

  const handleCopyEntry = useCallback(async (entry: DiaryEntry) => {
    try {
      await Clipboard.setStringAsync(entry.text);
      setCopyToastMessage(COPY_SUCCESS_MESSAGE);
    } catch {
      Alert.alert('コピーに失敗しました', 'もう一度お試しください。');
    }
  }, []);

  const handleStartEdit = useCallback(
    (entry: DiaryEntry) => {
      router.push(`/edit-entry/${entry.id}`);
    },
    [router],
  );

  const handleUndoDelete = useCallback(async () => {
    if (isRestoringDeletedEntriesRef.current || pendingDeletedEntriesRef.current.length === 0) {
      return;
    }

    isRestoringDeletedEntriesRef.current = true;
    setIsRestoringDeletedEntries(true);
    setHasUndoError(false);
    const entriesToRestore = [...pendingDeletedEntriesRef.current];
    const restoreDate = activeDateRef.current;

    try {
      const results = await Promise.allSettled(entriesToRestore.map(saveDiaryEntry));
      const restoredEntries = entriesToRestore.filter(
        (_, index) => results[index].status === 'fulfilled',
      );
      const restoredIds = new Set(restoredEntries.map((entry) => entry.id));

      if (!isMountedRef.current || activeDateRef.current !== restoreDate) {
        return;
      }

      setEntries((current) =>
        sortEntriesByCreatedAt([
          ...current.filter((entry) => !restoredIds.has(entry.id)),
          ...restoredEntries,
        ]),
      );
      setPendingDeletedEntries((current) => {
        const remaining = current.filter((entry) => !restoredIds.has(entry.id));
        pendingDeletedEntriesRef.current = remaining;
        return remaining;
      });

      if (restoredEntries.length !== entriesToRestore.length) {
        setHasUndoError(true);
        Alert.alert(
          '復元に失敗しました',
          '復元できなかった日記があります。もう一度お試しください。',
        );
      }
    } finally {
      isRestoringDeletedEntriesRef.current = false;
      if (isMountedRef.current) {
        setIsRestoringDeletedEntries(false);
      }
    }
  }, []);

  const handleDeleteEntry = useCallback(
    async (entry: DiaryEntry) => {
      if (deletingEntryIdsRef.current.has(entry.id)) {
        return;
      }
      deletingEntryIdsRef.current.add(entry.id);
      const deleteDate = date;
      setEntries((current) => current.filter((item) => item.id !== entry.id));

      try {
        await deleteDiaryEntry(entry.id);
        if (!isMountedRef.current || activeDateRef.current !== deleteDate) {
          return;
        }
        setPendingDeletedEntries((current) => {
          const next = [...current.filter((item) => item.id !== entry.id), entry];
          pendingDeletedEntriesRef.current = next;
          return next;
        });
        setHasUndoError(false);
      } catch {
        if (!isMountedRef.current || activeDateRef.current !== deleteDate) {
          return;
        }
        deletingEntryIdsRef.current.delete(entry.id);
        await loadEntries();
        if (isMountedRef.current) {
          // 再読み込み結果には並行して削除中の別エントリがまだ残っているため除外する
          setEntries((current) =>
            current.filter((item) => !deletingEntryIdsRef.current.has(item.id)),
          );
          Alert.alert('削除に失敗しました', 'もう一度お試しください。');
        }
      } finally {
        deletingEntryIdsRef.current.delete(entry.id);
      }
    },
    [date, loadEntries],
  );

  const handleDeletePress = useCallback(
    (entry: DiaryEntry) => {
      Alert.alert(
        '日記を削除しますか?',
        `削除後、${DELETE_UNDO_DELAY_MS / 1000}秒間は元に戻せます。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '削除', style: 'destructive', onPress: () => handleDeleteEntry(entry) },
        ],
      );
    },
    [handleDeleteEntry],
  );

  const renderEmptyEntries = useCallback(
    () =>
      hasLoadedEntries ? (
        <ThemedView style={styles.emptyState}>
          {hasLoadError ? (
            // emptyStateTextのopacityはコントラストを下げるため、エラー表示には適用しない
            <>
              <ThemedText style={[styles.emptyStateErrorText, { color: errorColor }]}>
                {DIARY_LOAD_ERROR_MESSAGE}
              </ThemedText>
              <Pressable
                onPress={loadEntries}
                style={[styles.retryButton, { borderColor: tintColor }]}
                accessibilityRole="button"
                accessibilityLabel="再試行"
              >
                <ThemedText style={[styles.retryButtonText, { color: linkColor }]}>
                  再試行
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText style={styles.emptyStateText}>{EMPTY_STATE_MESSAGE}</ThemedText>
          )}
        </ThemedView>
      ) : null,
    [hasLoadedEntries, hasLoadError, errorColor, tintColor, linkColor, loadEntries],
  );

  return (
    <ThemedView style={styles.container}>
      {copyToastMessage ? (
        <SaveToast message={copyToastMessage} onHide={handleHideCopyToast} testID="copy-toast" />
      ) : null}
      {saveToastMessage ? (
        <SaveToast message={saveToastMessage} onHide={handleHideSaveToast} testID="save-toast" />
      ) : null}
      {corruptionToastMessage ? (
        <SaveToast
          message={corruptionToastMessage}
          onHide={handleHideCorruptionToast}
          testID="data-integrity-toast"
          variant="warning"
        />
      ) : null}
      {pendingDeletedEntries.length > 0 ? (
        <SaveToast
          message={
            isRestoringDeletedEntries
              ? '日記を復元しています'
              : hasUndoError
                ? '復元できなかった日記があります'
                : pendingDeletedEntries.length === 1
                  ? '日記を削除しました'
                  : `${pendingDeletedEntries.length}件の日記を削除しました`
          }
          onHide={handleHideDeleteUndoToast}
          testID="delete-undo-toast"
          actionLabel={isRestoringDeletedEntries ? undefined : hasUndoError ? '再試行' : '元に戻す'}
          onAction={isRestoringDeletedEntries ? undefined : handleUndoDelete}
          autoHideDelayMs={isRestoringDeletedEntries ? null : DELETE_UNDO_DELAY_MS}
        />
      ) : null}
      <FlatList
        ref={listRef}
        data={entries}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyEntries}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <DayEntryItem
            entry={item}
            isHighlighted={item.id === highlightedEntryId}
            onCopy={handleCopyEntry}
            onEdit={handleStartEdit}
            onDelete={handleDeletePress}
          />
        )}
      />
      <DiaryEntryComposerModal
        dateKey={isComposerOpen ? (date ?? null) : null}
        draftStorageKeyPrefix={DIARY_DAY_ENTRIES_NEW_ENTRY_DRAFT_STORAGE_KEY_PREFIX}
        contentBottomPadding={insets.bottom}
        persist={handlePersistNewEntry}
        onSaved={handleComposerSaved}
        onClose={handleCloseComposer}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.7,
    textAlign: 'center',
  },
  // エラー表示はコントラスト確保のためemptyStateTextのopacityを継承しない
  emptyStateErrorText: {
    fontSize: 16,
    fontWeight: '600',
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
