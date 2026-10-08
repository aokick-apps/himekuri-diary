// `@/utils/diary-images`はネイティブのファイルシステム・フォトライブラリに依存するため、画面のテストでは
// jest.mock('@/utils/diary-images', () => require('<このファイル>'))で差し替え、呼び出し内容だけを検証する
type Image = { fileName: string };
type Draft = { kind: 'stored'; image: Image } | { kind: 'picked'; uri: string };

export const IMAGE_BASE_URI = 'file:///documents/diary-images';

export const isDiaryImageAttachmentSupported = jest.fn(() => true);
export const pickDiaryImageAsync = jest.fn();
export const deleteDiaryImages = jest.fn();
export const deleteAllDiaryImages = jest.fn();

export function getDiaryImageFile(image: Image) {
  return { uri: `${IMAGE_BASE_URI}/${image.fileName}`, exists: true };
}

export function getDiaryImageDraftUri(draft: Draft) {
  return draft.kind === 'stored' ? getDiaryImageFile(draft.image).uri : draft.uri;
}

export function toDiaryImageDrafts(images: readonly Image[] | undefined): Draft[] {
  return (images ?? []).map((image) => ({ kind: 'stored', image }));
}

// 選んだ画像は「saved-<元のファイル名>」として保存されたことにする
export const commitDiaryImageDrafts = jest.fn((drafts: readonly Draft[]) => {
  const newlySaved: Image[] = [];
  const images = drafts.map((draft) => {
    if (draft.kind === 'stored') {
      return draft.image;
    }
    const saved = { fileName: `saved-${draft.uri.split('/').pop()}` };
    newlySaved.push(saved);
    return saved;
  });
  return { images, newlySaved };
});

export function getRemovedDiaryImages(
  before: readonly Image[] | undefined,
  after: readonly Image[] | undefined,
): Image[] {
  const remaining = new Set((after ?? []).map((image) => image.fileName));
  return (before ?? []).filter((image) => !remaining.has(image.fileName));
}

export function isSameDiaryImageDrafts(a: readonly Draft[], b: readonly Draft[]): boolean {
  const key = (draft: Draft) =>
    draft.kind === 'stored' ? `stored:${draft.image.fileName}` : `picked:${draft.uri}`;
  return a.length === b.length && a.every((draft, i) => key(draft) === key(b[i]));
}
