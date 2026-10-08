// `expo-file-system`(新API)のうち、バックアップの読み書きに使う部分だけを再現するインメモリ実装。
// jest.mock('expo-file-system', () => require('<このファイル>').createMemoryFileSystemMock())の形で使う。

export function createMemoryFileSystemMock() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  // 指定した部分文字列を含むURIのファイルへの書き込みを失敗させる
  const failWritesTo = new Set<string>();
  const openedHandles = { open: 0 };

  type Part = string | { uri: string };
  const join = (parts: Part[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');

  class MockFileHandle {
    offset = 0;
    constructor(
      private readonly uri: string,
      private readonly canWrite: boolean,
    ) {
      openedHandles.open += 1;
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    readBytes(length: number) {
      const data = files.get(this.uri) ?? new Uint8Array(0);
      const bytes = data.slice(this.offset, this.offset + length);
      this.offset += bytes.length;
      return bytes;
    }
    writeBytes(bytes: Uint8Array) {
      if (!this.canWrite || [...failWritesTo].some((part) => this.uri.includes(part))) {
        throw new Error('write failed');
      }
      const data = files.get(this.uri) ?? new Uint8Array(0);
      const next = new Uint8Array(Math.max(data.length, this.offset + bytes.length));
      next.set(data);
      next.set(bytes, this.offset);
      files.set(this.uri, next);
      this.offset += bytes.length;
    }
    close() {
      openedHandles.open -= 1;
    }
  }

  class MockFile {
    uri: string;
    constructor(...parts: Part[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    create() {
      files.set(this.uri, new Uint8Array(0));
    }
    write(content: string | Uint8Array) {
      files.set(
        this.uri,
        typeof content === 'string' ? new TextEncoder().encode(content) : content,
      );
    }
    async text() {
      const data = files.get(this.uri);
      if (!data) {
        throw new Error('not found');
      }
      return new TextDecoder().decode(data);
    }
    open() {
      if (!files.has(this.uri)) {
        throw new Error('not found');
      }
      return new MockFileHandle(this.uri, true);
    }
    copy(destination: { uri: string }) {
      files.set(destination.uri, files.get(this.uri) ?? new Uint8Array(0));
    }
    move(destination: { uri: string }) {
      files.set(destination.uri, files.get(this.uri) ?? new Uint8Array(0));
      files.delete(this.uri);
      this.uri = destination.uri;
    }
    delete() {
      files.delete(this.uri);
    }
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: Part[]) {
      this.uri = join(parts);
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      directories.add(this.uri);
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new MockFile(uri));
    }
    delete() {
      directories.delete(this.uri);
      for (const uri of [...files.keys()]) {
        if (uri.startsWith(`${this.uri}/`)) {
          files.delete(uri);
        }
      }
    }
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///documents' }, cache: { uri: 'file:///cache' } },
    __files: files,
    __directories: directories,
    __failWritesTo: failWritesTo,
    __openedHandles: openedHandles,
  };
}
