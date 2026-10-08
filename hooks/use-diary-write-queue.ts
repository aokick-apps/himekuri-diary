import { useCallback, useRef } from 'react';

import { saveDiaryEntry, type DiaryEntry } from '@/utils/diary-storage';

// 日記の書き込みを直列化するキュー。保存が重なっても書き込み順が入れ替わらないようにする
export function useDiaryWriteQueue() {
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  // 未完了のタスク件数。getPendingWritesが待つべきか判定するのに使う
  const pendingWriteCountRef = useRef(0);

  const enqueueDiaryWrite = useCallback((entry: DiaryEntry): Promise<void> => {
    // 実行完了を待たず、積んだ時点で同期的にインクリメントする。これにより呼び出し直後に
    // getPendingWritesが呼ばれても未実行のタスクの存在を検知できる
    pendingWriteCountRef.current += 1;
    const task = writeQueueRef.current.then(async () => {
      await saveDiaryEntry(entry);
    });
    // キューは成否に関わらず先へ進める(失敗はtask側で呼び出し元に伝わる)
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

  // 未完了の書き込みがある場合のみ、その完了を表すPromiseを返す(無ければnull)。呼び出し側は
  // 必要な場合だけawaitできる。無条件にawaitすると実行順序が余分なマイクロタスク分ずれるため
  const getPendingWrites = useCallback((): Promise<void> | null => {
    return pendingWriteCountRef.current > 0 ? writeQueueRef.current : null;
  }, []);

  return { enqueueDiaryWrite, getPendingWrites };
}
