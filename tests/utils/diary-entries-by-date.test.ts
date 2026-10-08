import { groupEntriesByDate } from '@/utils/diary-entries-by-date';
import type { DiaryEntry } from '@/utils/diary-storage';

// toDateKeyはローカル時刻で日付を求めるため、タイムゾーンに依存しないようローカル時刻から生成する
function entryAt(id: string, year: number, month: number, day: number, hour: number): DiaryEntry {
  return { id, text: id, createdAt: new Date(year, month - 1, day, hour).toISOString() };
}

describe('groupEntriesByDate', () => {
  it('returns an empty object when there are no entries (境界値: 0件)', () => {
    expect(groupEntriesByDate([])).toEqual({});
  });

  it('groups entries by their local date key (正常系)', () => {
    const result = groupEntriesByDate([
      entryAt('a', 2026, 6, 1, 9),
      entryAt('b', 2026, 6, 2, 9),
      entryAt('c', 2026, 6, 1, 18),
    ]);

    expect(Object.keys(result).sort()).toEqual(['2026-06-01', '2026-06-02']);
    expect(result['2026-06-01'].map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(result['2026-06-02'].map((entry) => entry.id)).toEqual(['b']);
  });

  it('sorts entries within a day by createdAt ascending regardless of input order (並び順)', () => {
    const result = groupEntriesByDate([
      entryAt('late', 2026, 6, 1, 20),
      entryAt('early', 2026, 6, 1, 7),
      entryAt('middle', 2026, 6, 1, 12),
    ]);

    expect(result['2026-06-01'].map((entry) => entry.id)).toEqual(['early', 'middle', 'late']);
  });

  it('does not mutate the input array (副作用なし)', () => {
    const entries = [entryAt('late', 2026, 6, 1, 20), entryAt('early', 2026, 6, 1, 7)];

    groupEntriesByDate(entries);

    expect(entries.map((entry) => entry.id)).toEqual(['late', 'early']);
  });
});
