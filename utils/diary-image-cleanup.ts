import {
  deleteDiaryImages,
  isDiaryImageAttachmentSupported,
  listStoredDiaryImageFileNames,
} from '@/utils/diary-images';
import { getAllDiaryEntries } from '@/utils/diary-storage';

/**
 * どの日記からも参照されていない添付画像を削除する。削除の取り消し期限内にアプリが終了した場合や、
 * 同じidの日記を上書きインポートした場合に残る画像を、起動時に片付けるために使う。
 */
export async function cleanUpUnreferencedDiaryImagesAsync(): Promise<void> {
  if (!isDiaryImageAttachmentSupported()) {
    return;
  }
  try {
    // 一覧を先に取ることで、掃除中に新しく保存された画像(日記の保存前にコピーされる)を消さない
    const storedFileNames = listStoredDiaryImageFileNames();
    if (storedFileNames.length === 0) {
      return;
    }
    let isIncomplete = false;
    const entries = await getAllDiaryEntries({
      onError: () => {
        isIncomplete = true;
      },
      onPartialCorruption: () => {
        isIncomplete = true;
      },
    });
    // 読めなかった日記が参照している画像まで消してしまわないよう、全件読めた場合だけ掃除する
    if (isIncomplete) {
      return;
    }
    const referenced = new Set(
      entries.flatMap((entry) => (entry.images ?? []).map((image) => image.fileName)),
    );
    deleteDiaryImages(
      storedFileNames
        .filter((fileName) => !referenced.has(fileName))
        .map((fileName) => ({ fileName })),
    );
  } catch (error) {
    console.warn('cleanUpUnreferencedDiaryImagesAsync: 添付画像の掃除に失敗しました', error);
  }
}
