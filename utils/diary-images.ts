import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { DiaryImage } from '@/utils/diary-storage';

const DIARY_IMAGES_DIRECTORY_NAME = 'diary-images';

/** Webは`expo-file-system`のファイルシステムAPIに対応していないため、画像の添付自体を提供しない */
export function isDiaryImageAttachmentSupported(): boolean {
  return Platform.OS !== 'web';
}

export function getDiaryImagesDirectory(): Directory {
  return new Directory(Paths.document, DIARY_IMAGES_DIRECTORY_NAME);
}

export function getDiaryImageFile(image: DiaryImage): File {
  return new File(getDiaryImagesDirectory(), image.fileName);
}

export type PickDiaryImageResult = { status: 'picked'; uri: string } | { status: 'canceled' };

/**
 * フォトライブラリから画像を1枚選ばせる。OS標準の選択画面は選ばれた写真だけをアプリに渡すため、
 * 写真ライブラリ全体へのアクセス許可は求めない
 */
export async function pickDiaryImageAsync(): Promise<PickDiaryImageResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    selectionLimit: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) {
    return { status: 'canceled' };
  }
  return { status: 'picked', uri: asset.uri };
}

function getExtension(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * 選択した画像をアプリ専用ディレクトリへコピーし、日記に保存する参照を返す。
 * 選択元(フォトライブラリの一時ファイル等)は後から消えうるため、必ずコピーしてから参照する。
 */
export function saveDiaryImage(sourceUri: string): DiaryImage {
  const directory = getDiaryImagesDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  const image: DiaryImage = { fileName: `${randomUUID()}.${getExtension(sourceUri)}` };
  new File(sourceUri).copy(getDiaryImageFile(image));
  return image;
}

/**
 * 添付画像のファイルを削除する。既に存在しない・削除に失敗した場合も日記本体の操作は続けられるため、
 * 例外は投げずに警告だけ残す。
 */
export function deleteDiaryImages(images: readonly DiaryImage[] | undefined): void {
  for (const image of images ?? []) {
    try {
      const file = getDiaryImageFile(image);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      console.warn('deleteDiaryImages: 添付画像の削除に失敗しました', error);
    }
  }
}

/**
 * 全件削除時に、どの日記からも参照されなくなる添付画像をディレクトリごと削除する。
 * 日記データ本体の削除は完了しているため、失敗しても例外は投げずに警告だけ残す。
 */
export function deleteAllDiaryImages(): void {
  if (!isDiaryImageAttachmentSupported()) {
    return;
  }
  try {
    const directory = getDiaryImagesDirectory();
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    console.warn('deleteAllDiaryImages: 添付画像の削除に失敗しました', error);
  }
}

/**
 * 入力画面で編集中の添付画像。保存済みの画像と、選んだだけでまだコピーしていない画像を区別する
 * (選んだ時点でコピーすると、保存せずに閉じた場合に参照されないファイルが残るため)。
 */
export type DiaryImageDraft =
  { kind: 'stored'; image: DiaryImage } | { kind: 'picked'; uri: string };

export function toDiaryImageDrafts(images: readonly DiaryImage[] | undefined): DiaryImageDraft[] {
  return (images ?? []).map((image) => ({ kind: 'stored', image }));
}

export function getDiaryImageDraftUri(draft: DiaryImageDraft): string {
  return draft.kind === 'stored' ? getDiaryImageFile(draft.image).uri : draft.uri;
}

/**
 * 編集中の添付画像を保存用の参照に確定する。新しく選んだ画像だけをアプリ専用ディレクトリへコピーし、
 * 保存に失敗した場合に呼び出し側が後始末できるよう、今回コピーした画像も返す。
 */
export function commitDiaryImageDrafts(drafts: readonly DiaryImageDraft[]): {
  images: DiaryImage[];
  newlySaved: DiaryImage[];
} {
  const newlySaved: DiaryImage[] = [];
  try {
    const images = drafts.map((draft) => {
      if (draft.kind === 'stored') {
        return draft.image;
      }
      const saved = saveDiaryImage(draft.uri);
      newlySaved.push(saved);
      return saved;
    });
    return { images, newlySaved };
  } catch (error) {
    deleteDiaryImages(newlySaved);
    throw error;
  }
}

/** 保存前後の添付画像を比べ、どの日記からも参照されなくなった画像を返す */
export function getRemovedDiaryImages(
  before: readonly DiaryImage[] | undefined,
  after: readonly DiaryImage[] | undefined,
): DiaryImage[] {
  const remaining = new Set((after ?? []).map((image) => image.fileName));
  return (before ?? []).filter((image) => !remaining.has(image.fileName));
}

/** 添付画像に未保存の変更があるか(破棄確認の要否)を判定するため、並びと中身が同じかを比べる */
export function isSameDiaryImageDrafts(
  a: readonly DiaryImageDraft[],
  b: readonly DiaryImageDraft[],
): boolean {
  return (
    a.length === b.length &&
    a.every((draft, i) => getDiaryImageDraftKey(draft) === getDiaryImageDraftKey(b[i]))
  );
}

function getDiaryImageDraftKey(draft: DiaryImageDraft): string {
  return draft.kind === 'stored' ? `stored:${draft.image.fileName}` : `picked:${draft.uri}`;
}

/** 添付画像ディレクトリにある画像ファイル名の一覧。ディレクトリがまだ無い場合は空 */
export function listStoredDiaryImageFileNames(): string[] {
  if (!isDiaryImageAttachmentSupported()) {
    return [];
  }
  const directory = getDiaryImagesDirectory();
  if (!directory.exists) {
    return [];
  }
  return directory
    .list()
    .filter((item): item is File => item instanceof File)
    .map((file) => file.name);
}
