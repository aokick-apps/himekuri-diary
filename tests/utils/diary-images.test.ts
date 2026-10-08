import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import {
  commitDiaryImageDrafts,
  deleteAllDiaryImages,
  deleteDiaryImages,
  getDiaryImageDraftUri,
  getDiaryImageFile,
  getRemovedDiaryImages,
  isDiaryImageAttachmentSupported,
  isSameDiaryImageDrafts,
  listStoredDiaryImageFileNames,
  pickDiaryImageAsync,
  saveDiaryImage,
  toDiaryImageDrafts,
} from '@/utils/diary-images';

// ネイティブのファイルシステムの代わりに、存在するパスの集合だけを持つインメモリの実装に差し替える
jest.mock('expo-file-system', () => {
  const existing = new Set<string>();
  const failingCopySources = new Set<string>();
  function join(parts: (string | { uri: string })[]) {
    return parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return existing.has(this.uri);
    }
    copy(destination: { uri: string }) {
      if (failingCopySources.has(this.uri)) {
        throw new Error('copy failed');
      }
      existing.add(destination.uri);
    }
    delete() {
      existing.delete(this.uri);
    }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return existing.has(this.uri);
    }
    create() {
      existing.add(this.uri);
    }
    list() {
      return [...existing]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new MockFile(path));
    }
    delete() {
      for (const path of [...existing]) {
        if (path === this.uri || path.startsWith(`${this.uri}/`)) {
          existing.delete(path);
        }
      }
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///documents' } },
    __existing: existing,
    __failingCopySources: failingCopySources,
  };
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: jest.fn(() => `uuid-${++counter}`) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedFileSystem = require('expo-file-system') as {
  __existing: Set<string>;
  __failingCopySources: Set<string>;
};
const mockedImagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const IMAGES_DIR = 'file:///documents/diary-images';
const originalOS = Platform.OS;

beforeEach(() => {
  mockedFileSystem.__existing.clear();
  mockedFileSystem.__failingCopySources.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
});

describe('isDiaryImageAttachmentSupported', () => {
  it('is available on native platforms but not on web (正常系/境界値)', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    expect(isDiaryImageAttachmentSupported()).toBe(true);
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    expect(isDiaryImageAttachmentSupported()).toBe(false);
  });
});

describe('pickDiaryImageAsync', () => {
  it('opens the library without requesting access to the whole photo library (正常系: 権限を求めない)', async () => {
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    await pickDiaryImageAsync();

    expect(mockedImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('returns "canceled" when the user closes the library without choosing (境界値: キャンセル)', async () => {
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickDiaryImageAsync()).resolves.toEqual({ status: 'canceled' });
  });

  it('opens the library for a single image and returns its uri (正常系)', async () => {
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/picked.png', width: 10, height: 10 }],
    });

    await expect(pickDiaryImageAsync()).resolves.toEqual({
      status: 'picked',
      uri: 'file:///tmp/picked.png',
    });
    expect(mockedImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], selectionLimit: 1 }),
    );
  });
});

describe('saveDiaryImage', () => {
  it('copies the picked file into the app directory under a new name keeping the extension (正常系)', () => {
    const image = saveDiaryImage('file:///tmp/photo.PNG');

    expect(image.fileName).toMatch(/^uuid-\d+\.png$/);
    expect(mockedFileSystem.__existing.has(`${IMAGES_DIR}/${image.fileName}`)).toBe(true);
    expect(getDiaryImageFile(image).uri).toBe(`${IMAGES_DIR}/${image.fileName}`);
  });

  it('falls back to jpg when the source uri has no extension (境界値: 拡張子なし)', () => {
    expect(saveDiaryImage('content://media/external/images/123').fileName).toMatch(/\.jpg$/);
  });
});

describe('commitDiaryImageDrafts', () => {
  it('keeps stored images as-is and saves only newly picked ones (正常系)', () => {
    const { images, newlySaved } = commitDiaryImageDrafts([
      { kind: 'stored', image: { fileName: 'old.jpg' } },
      { kind: 'picked', uri: 'file:///tmp/new.jpg' },
    ]);

    expect(images[0]).toEqual({ fileName: 'old.jpg' });
    expect(newlySaved).toEqual([images[1]]);
  });

  it('removes the files copied so far and rethrows when a copy fails (異常系: 途中で失敗)', () => {
    mockedFileSystem.__failingCopySources.add('file:///tmp/broken.jpg');

    expect(() =>
      commitDiaryImageDrafts([
        { kind: 'picked', uri: 'file:///tmp/ok.jpg' },
        { kind: 'picked', uri: 'file:///tmp/broken.jpg' },
      ]),
    ).toThrow('copy failed');
    expect([...mockedFileSystem.__existing].filter((p) => p.endsWith('.jpg'))).toEqual([]);
  });
});

describe('deleteDiaryImages / deleteAllDiaryImages', () => {
  it('deletes existing files and silently skips missing ones or undefined input (正常系/境界値)', () => {
    const image = saveDiaryImage('file:///tmp/a.jpg');

    expect(() => deleteDiaryImages([image, { fileName: 'missing.jpg' }])).not.toThrow();
    expect(() => deleteDiaryImages(undefined)).not.toThrow();
    expect(getDiaryImageFile(image).exists).toBe(false);
  });

  it('removes the whole image directory (正常系: 全件削除)', () => {
    saveDiaryImage('file:///tmp/a.jpg');
    saveDiaryImage('file:///tmp/b.jpg');

    deleteAllDiaryImages();

    expect(mockedFileSystem.__existing.size).toBe(0);
  });
});

describe('draft helpers', () => {
  it('converts stored images into drafts and resolves their display uri (正常系)', () => {
    const drafts = toDiaryImageDrafts([{ fileName: 'a.jpg' }]);

    expect(drafts).toEqual([{ kind: 'stored', image: { fileName: 'a.jpg' } }]);
    expect(getDiaryImageDraftUri(drafts[0])).toBe(`${IMAGES_DIR}/a.jpg`);
    expect(getDiaryImageDraftUri({ kind: 'picked', uri: 'file:///tmp/x.jpg' })).toBe(
      'file:///tmp/x.jpg',
    );
    expect(toDiaryImageDrafts(undefined)).toEqual([]);
  });

  it('lists only images that are no longer referenced after saving (正常系: 差し替え・削除)', () => {
    expect(
      getRemovedDiaryImages(
        [{ fileName: 'a.jpg' }, { fileName: 'b.jpg' }],
        [{ fileName: 'b.jpg' }],
      ),
    ).toEqual([{ fileName: 'a.jpg' }]);
    expect(getRemovedDiaryImages(undefined, [{ fileName: 'a.jpg' }])).toEqual([]);
    expect(getRemovedDiaryImages([{ fileName: 'a.jpg' }], undefined)).toEqual([
      { fileName: 'a.jpg' },
    ]);
  });

  it('detects whether attachments were changed (正常系/境界値)', () => {
    const stored = toDiaryImageDrafts([{ fileName: 'a.jpg' }]);

    expect(isSameDiaryImageDrafts(stored, toDiaryImageDrafts([{ fileName: 'a.jpg' }]))).toBe(true);
    expect(isSameDiaryImageDrafts(stored, [])).toBe(false);
    expect(isSameDiaryImageDrafts(stored, [{ kind: 'picked', uri: 'file:///tmp/a.jpg' }])).toBe(
      false,
    );
  });
});

describe('listStoredDiaryImageFileNames', () => {
  it('lists the file names in the image directory (正常系)', () => {
    const a = saveDiaryImage('file:///tmp/a.jpg');
    const b = saveDiaryImage('file:///tmp/b.png');

    expect(listStoredDiaryImageFileNames().sort()).toEqual([a.fileName, b.fileName].sort());
  });

  it('returns an empty list before any image has been saved (境界値: ディレクトリ未作成)', () => {
    expect(listStoredDiaryImageFileNames()).toEqual([]);
  });
});
