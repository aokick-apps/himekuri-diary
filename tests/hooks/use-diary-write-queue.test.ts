import { renderHook } from '@testing-library/react-native';

import { useDiaryWriteQueue } from '@/hooks/use-diary-write-queue';
import { saveDiaryEntry, type DiaryEntry } from '@/utils/diary-storage';

jest.mock('@/utils/diary-storage', () => ({
  saveDiaryEntry: jest.fn(),
}));

const mockedSaveDiaryEntry = saveDiaryEntry as jest.Mock;

function entry(id: string): DiaryEntry {
  return { id, text: id, createdAt: '2026-06-01T00:00:00.000Z' };
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useDiaryWriteQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSaveDiaryEntry.mockResolvedValue(undefined);
  });

  it('returns null from getPendingWrites when nothing has been enqueued (境界値: 未登録)', () => {
    const { result } = renderHook(() => useDiaryWriteQueue());

    expect(result.current.getPendingWrites()).toBeNull();
  });

  it('runs writes one at a time in the enqueued order (正常系: 直列化)', async () => {
    const first = createDeferred();
    mockedSaveDiaryEntry.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useDiaryWriteQueue());

    const firstTask = result.current.enqueueDiaryWrite(entry('1'));
    const secondTask = result.current.enqueueDiaryWrite(entry('2'));
    await Promise.resolve();

    expect(mockedSaveDiaryEntry).toHaveBeenCalledTimes(1);
    expect(mockedSaveDiaryEntry).toHaveBeenLastCalledWith(entry('1'));

    first.resolve();
    await Promise.all([firstTask, secondTask]);

    expect(mockedSaveDiaryEntry).toHaveBeenCalledTimes(2);
    expect(mockedSaveDiaryEntry).toHaveBeenLastCalledWith(entry('2'));
  });

  it('reports pending writes immediately after enqueueing and clears them once done (正常系: 未完了の検知)', async () => {
    const { result } = renderHook(() => useDiaryWriteQueue());

    const task = result.current.enqueueDiaryWrite(entry('1'));
    const pending = result.current.getPendingWrites();

    expect(pending).not.toBeNull();
    await task;
    await pending;

    expect(result.current.getPendingWrites()).toBeNull();
  });

  it('rejects the failed task but keeps the queue moving for later writes (異常系: 失敗後も継続)', async () => {
    mockedSaveDiaryEntry.mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(() => useDiaryWriteQueue());

    const failed = result.current.enqueueDiaryWrite(entry('1'));
    const succeeded = result.current.enqueueDiaryWrite(entry('2'));

    await expect(failed).rejects.toThrow('write failed');
    await expect(succeeded).resolves.toBeUndefined();
    await result.current.getPendingWrites();

    expect(mockedSaveDiaryEntry).toHaveBeenCalledTimes(2);
    expect(result.current.getPendingWrites()).toBeNull();
  });
});
