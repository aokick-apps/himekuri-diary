import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

// Web(ブラウザ)はexpo-file-system/expo-sharingの端末ネイティブなファイルシステム・共有シートを
// 利用できないため、ブラウザ標準のBlob + <a download>によるダウンロードでエクスポートする
export function downloadOnWeb(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Webはexpo-file-systemのファイルシステムAPIに対応していないため、DocumentPickerAssetが
// ブラウザ標準の`File`として返す`asset.file`から直接読み込む(`downloadOnWeb`と同様の別経路)
export async function readPickedFileContent(asset: DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if (!asset.file) {
      throw new Error('選択したファイルを読み込めませんでした');
    }
    return asset.file.text();
  }
  return new File(asset.uri).text();
}
