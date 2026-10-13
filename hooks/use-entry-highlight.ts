import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList } from 'react-native';

import type { DiaryEntry } from '@/utils/diary-storage';

// 検索結果から遷移した日記を強調表示しておく時間(ミリ秒)
export const HIGHLIGHT_DURATION_MS = 4000;
// 強調する日記を画面のどの高さに表示するか(0: 上端〜1: 下端)。直前の日記も少し見えるようにする
const HIGHLIGHT_VIEW_POSITION = 0.2;
const SCROLL_RETRY_DELAY_MS = 100;

// 指定した日記へスクロールして一定時間強調表示する。同じ遷移で何度も強調し直さないよう適用済みのidを保持する
export function useEntryHighlight(
  entries: DiaryEntry[],
  hasLoadedEntries: boolean,
  highlightEntryId: string | undefined,
) {
  const listRef = useRef<FlatList<DiaryEntry>>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const appliedHighlightEntryIdRef = useRef<string | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollRetryTimerRef.current !== null) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    };
  }, []);

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

  return { listRef, highlightedEntryId, handleScrollToIndexFailed };
}
