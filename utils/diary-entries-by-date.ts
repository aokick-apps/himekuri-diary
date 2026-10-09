import { toDateKey } from '@/utils/diary-date';
import type { DiaryEntry } from '@/utils/diary-storage';

// 日付キー('YYYY-MM-DD')ごとに日記をまとめる。各日付内は書かれた時刻の昇順に揃え、
// 「その日最初の1件」が常に先頭に来るようにする
export function groupEntriesByDate(entries: DiaryEntry[]): Record<string, DiaryEntry[]> {
  const map: Record<string, DiaryEntry[]> = {};
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.createdAt));
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(entry);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return map;
}
