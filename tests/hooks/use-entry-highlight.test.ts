import { act, renderHook } from '@testing-library/react-native';

import { HIGHLIGHT_DURATION_MS, useEntryHighlight } from '@/hooks/use-entry-highlight';
import type { DiaryEntry } from '@/utils/diary-storage';

const entries: DiaryEntry[] = [
  { id: 'a', text: 'A', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'b', text: 'B', createdAt: '2026-01-01T01:00:00.000Z' },
];

function attachList(result: { current: ReturnType<typeof useEntryHighlight> }) {
  const list = { scrollToIndex: jest.fn(), scrollToOffset: jest.fn() };
  (result.current.listRef as { current: unknown }).current = list;
  return list;
}

describe('useEntryHighlight', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('highlights the target entry, scrolls to it and clears after the duration (正常系)', () => {
    const { result, rerender } = renderHook(
      ({ loaded }: { loaded: boolean }) => useEntryHighlight(entries, loaded, 'b'),
      { initialProps: { loaded: false } },
    );
    const list = attachList(result);
    expect(result.current.highlightedEntryId).toBeNull();

    rerender({ loaded: true });
    expect(result.current.highlightedEntryId).toBe('b');
    expect(list.scrollToIndex).toHaveBeenCalledWith({
      index: 1,
      animated: true,
      viewPosition: 0.2,
    });

    act(() => {
      jest.advanceTimersByTime(HIGHLIGHT_DURATION_MS);
    });
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('does nothing when the target entry does not exist (境界値)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, 'missing'));
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('does not highlight again for an already applied id (異常系)', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DiaryEntry[] }) => useEntryHighlight(list, true, 'a'),
      { initialProps: { list: entries } },
    );
    act(() => {
      jest.advanceTimersByTime(HIGHLIGHT_DURATION_MS);
    });
    expect(result.current.highlightedEntryId).toBeNull();

    rerender({ list: [...entries] });
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('retries scrolling after moving near the index on scroll failure (正常系)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, undefined));
    const list = attachList(result);

    act(() => {
      result.current.handleScrollToIndexFailed({ index: 3, averageItemLength: 50 });
    });
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 150, animated: false });
    expect(list.scrollToIndex).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(list.scrollToIndex).toHaveBeenCalledWith({
      index: 3,
      animated: true,
      viewPosition: 0.2,
    });
  });

  it('cancels a pending scroll retry on unmount (異常系)', () => {
    const { result, unmount } = renderHook(() => useEntryHighlight(entries, true, undefined));
    const list = attachList(result);
    act(() => {
      result.current.handleScrollToIndexFailed({ index: 3, averageItemLength: 50 });
    });
    unmount();
    jest.advanceTimersByTime(100);
    expect(list.scrollToIndex).not.toHaveBeenCalled();
  });
  it('does not highlight while entries are not loaded yet (境界値)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, false, 'a'));
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('does not highlight when no target id is given (境界値)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, undefined));
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('highlights once the target entry appears in a later entries update (正常系)', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DiaryEntry[] }) => useEntryHighlight(list, true, 'b'),
      { initialProps: { list: [entries[0]] } },
    );
    expect(result.current.highlightedEntryId).toBeNull();
    rerender({ list: entries });
    expect(result.current.highlightedEntryId).toBe('b');
  });

  it('highlights a new target id after the previous one was applied (正常系)', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useEntryHighlight(entries, true, id),
      { initialProps: { id: 'a' } },
    );
    expect(result.current.highlightedEntryId).toBe('a');
    rerender({ id: 'b' });
    expect(result.current.highlightedEntryId).toBe('b');
  });

  it('keeps the highlight until just before the duration elapses (境界値)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, 'a'));
    act(() => {
      jest.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 1);
    });
    expect(result.current.highlightedEntryId).toBe('a');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.highlightedEntryId).toBeNull();
  });

  it('does not throw when the list ref is not attached (異常系)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, 'a'));
    expect(result.current.highlightedEntryId).toBe('a');
    act(() => {
      result.current.handleScrollToIndexFailed({ index: 1, averageItemLength: 10 });
      jest.advanceTimersByTime(100);
    });
  });

  it('keeps only the latest retry when scroll fails repeatedly (境界値)', () => {
    const { result } = renderHook(() => useEntryHighlight(entries, true, undefined));
    const list = attachList(result);
    act(() => {
      result.current.handleScrollToIndexFailed({ index: 1, averageItemLength: 10 });
      jest.advanceTimersByTime(99);
      result.current.handleScrollToIndexFailed({ index: 2, averageItemLength: 10 });
      jest.advanceTimersByTime(100);
    });
    expect(list.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(list.scrollToIndex).toHaveBeenCalledWith({
      index: 2,
      animated: true,
      viewPosition: 0.2,
    });
  });
});
