import { Platform } from 'react-native';

import { downloadOnWeb, readPickedFileContent } from '@/utils/diary-file-transfer';

jest.mock('expo-file-system', () => {
  const text = jest.fn((_uri: string) => Promise.resolve('native-content'));
  class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    text() {
      return text(this.uri);
    }
  }
  return { File: MockFile, __mockText: text };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedFileSystem = require('expo-file-system') as { __mockText: jest.Mock };

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

afterEach(() => {
  setPlatform(originalOS);
  jest.clearAllMocks();
});

describe('readPickedFileContent', () => {
  it('reads the picked file through expo-file-system on native platforms (正常系: ネイティブ)', async () => {
    setPlatform('ios');

    await expect(
      readPickedFileContent({ uri: 'file:///picked.json', name: 'picked.json', lastModified: 0 }),
    ).resolves.toBe('native-content');
    expect(mockedFileSystem.__mockText).toHaveBeenCalledWith('file:///picked.json');
  });

  it('reads the browser File object directly on web (正常系: Web)', async () => {
    setPlatform('web');
    const file = { text: jest.fn(() => Promise.resolve('web-content')) } as unknown as File;

    await expect(
      readPickedFileContent({ uri: 'blob:x', name: 'picked.json', lastModified: 0, file }),
    ).resolves.toBe('web-content');
    expect(mockedFileSystem.__mockText).not.toHaveBeenCalled();
  });

  it('rejects on web when the picker did not provide a File object (異常系: Webでファイル実体が無い)', async () => {
    setPlatform('web');

    await expect(
      readPickedFileContent({ uri: 'blob:x', name: 'picked.json', lastModified: 0 }),
    ).rejects.toThrow('選択したファイルを読み込めませんでした');
  });
});

describe('downloadOnWeb', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it('clicks a download link with the given file name and revokes the object URL (正常系)', () => {
    const link = { href: '', download: '', click: jest.fn() };
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => link) };
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();

    downloadOnWeb('diary.json', '{"entries":[]}');

    expect(link.href).toBe('blob:mock-url');
    expect(link.download).toBe('diary.json');
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('still revokes the object URL when clicking the link throws (異常系: 後始末の保証)', () => {
    const link = {
      href: '',
      download: '',
      click: jest.fn(() => {
        throw new Error('blocked');
      }),
    };
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => link) };
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();

    expect(() => downloadOnWeb('diary.json', '{}')).toThrow('blocked');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
