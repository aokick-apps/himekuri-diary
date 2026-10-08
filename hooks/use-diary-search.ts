import { useCallback, useMemo, useState } from 'react';

import { matchesSearchQuery } from '@/utils/diary-search';
import type { DiaryEntry } from '@/utils/diary-storage';

// ホーム画面の日記検索の入力値と検索結果を管理する
export function useDiarySearch(entries: DiaryEntry[]) {
  // 日記本文のキーワード検索用の入力値(composerの入力とは独立したstate)
  const [searchQuery, setSearchQuery] = useState('');

  // 検索キーワードの前後の空白を除いたもの。空文字列の間は「検索していない」状態として扱う
  const trimmedSearchQuery = searchQuery.trim();

  // 検索キーワードに本文が部分一致する(大文字小文字・全角半角・ひらがな/カタカナの表記ゆれを
  // 区別しない)エントリの一覧。日時の降順(新しい順)に並べ替える
  const searchResults = useMemo(() => {
    if (!trimmedSearchQuery) {
      return [];
    }
    return entries
      .filter((entry) => matchesSearchQuery(entry.text, trimmedSearchQuery))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, trimmedSearchQuery]);

  // 検索欄の「クリア」ボタン押下時、検索キーワードを空にしてカレンダー表示へ戻す
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return { searchQuery, setSearchQuery, trimmedSearchQuery, searchResults, clearSearch };
}
