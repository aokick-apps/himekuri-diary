import { act, renderHook } from '@testing-library/react-native';

import { useDiarySearch } from '@/hooks/use-diary-search';
import type { DiaryEntry } from '@/utils/diary-storage';

const ENTRIES: DiaryEntry[] = [
  { id: 'old', text: 'カフェで読書', createdAt: '2026-06-01T09:00:00.000Z' },
  { id: 'new', text: 'かふぇに行った', createdAt: '2026-06-20T09:00:00.000Z' },
  { id: 'other', text: '散歩した', createdAt: '2026-06-10T09:00:00.000Z' },
];

describe('useDiarySearch', () => {
  it('returns no results while the query is empty or whitespace only (境界値: 未入力)', () => {
    const { result } = renderHook(() => useDiarySearch(ENTRIES));
    expect(result.current.searchResults).toEqual([]);

    act(() => {
      result.current.setSearchQuery('   ');
    });
    expect(result.current.trimmedSearchQuery).toBe('');
    expect(result.current.searchResults).toEqual([]);
  });

  it('matches across hiragana/katakana and sorts the results newest first (正常系)', () => {
    const { result } = renderHook(() => useDiarySearch(ENTRIES));

    act(() => {
      result.current.setSearchQuery(' カフェ ');
    });

    expect(result.current.trimmedSearchQuery).toBe('カフェ');
    expect(result.current.searchResults.map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('returns an empty list when nothing matches (異常系: 不一致)', () => {
    const { result } = renderHook(() => useDiarySearch(ENTRIES));

    act(() => {
      result.current.setSearchQuery('映画');
    });

    expect(result.current.searchResults).toEqual([]);
  });

  it('clears the query back to the initial state (正常系: クリア)', () => {
    const { result } = renderHook(() => useDiarySearch(ENTRIES));
    act(() => {
      result.current.setSearchQuery('散歩');
    });

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.searchQuery).toBe('');
    expect(result.current.searchResults).toEqual([]);
  });
});
