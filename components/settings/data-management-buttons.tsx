import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildDiaryExportFileName, serializeDiaryEntriesForExport } from '@/utils/diary-export';
import { downloadOnWeb, readPickedFileContent } from '@/utils/diary-file-transfer';
import { readDiaryImagesAsBase64, restoreDiaryImagesFromBase64 } from '@/utils/diary-images';
import { parseDiaryEntriesForImport } from '@/utils/diary-import';
import {
  buildDiaryPartialCorruptionMessage,
  clearAllDiaryEntries,
  DIARY_LOAD_ERROR_MESSAGE,
  getAllDiaryEntries,
  saveDiaryEntry,
  type DiaryEntry,
} from '@/utils/diary-storage';

// 処理中はスピナーと進行中の文言に切り替え、他の保存ボタンと同じく実行中であることを明示する
function DataTransferButtonLabel({
  label,
  busyLabel,
}: {
  label: string;
  busyLabel: string | null;
}) {
  const linkColor = useThemeColor({}, 'link');

  if (busyLabel === null) {
    return <ThemedText type="link">{label}</ThemedText>;
  }
  return (
    <View style={styles.busyContent}>
      <ActivityIndicator size="small" color={linkColor} />
      <ThemedText type="link">{busyLabel}</ThemedText>
    </View>
  );
}

// 保存済みの日記データ(AsyncStorage上の全件)を削除する操作導線。
// Google Play/Apple双方のストア審査で求められる「ユーザーによるデータ削除手段」に対応する
export function DeleteAllDiaryDataButton() {
  const [isDeleting, setIsDeleting] = useState(false);
  const errorColor = useThemeColor({}, 'error');

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await clearAllDiaryEntries();
      Alert.alert('削除が完了しました', '保存されていた日記データをすべて削除しました。');
    } catch {
      Alert.alert('削除に失敗しました', 'もう一度お試しください。');
    } finally {
      setIsDeleting(false);
    }
  }, []);

  const handlePress = useCallback(() => {
    // 誤操作による日記データの消失を防ぐため、削除前に必ず確認ダイアログを挟む
    Alert.alert(
      '日記データを削除しますか?',
      'この端末に保存されているすべての日記データが削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: handleDelete },
      ],
    );
  }, [handleDelete]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDeleting}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDeleting }}
      style={[styles.dangerButton, { opacity: isDeleting ? 0.5 : 1 }]}
    >
      <ThemedText style={[styles.dangerButtonText, { color: errorColor }]}>
        日記データを全件削除
      </ThemedText>
    </Pressable>
  );
}

// 保存済みの日記データ(復号済み)をJSON形式のファイルに書き出し、OS標準の共有シート経由で
// 保存・共有できるようにする操作導線。端末紛失・機種変更等でのデータ消失に備えたバックアップ手段
export function ExportDiaryDataButton() {
  const [isExporting, setIsExporting] = useState(false);
  // Alertの「再試行」からhandleExport自身を呼べるようにするための参照。useCallbackの
  // 依存配列に自身を含めずに済むよう、常に最新の関数をここへ同期させておく
  const handleExportRef = useRef<() => Promise<void>>(async () => {});

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // entries.length === 0だけでは「本当に0件」か「読み込み失敗」かを区別できないため、
      // onErrorで検知してメッセージを出し分ける
      let hasLoadError = false;
      let partialCorruptionCount = 0;
      const entries = await getAllDiaryEntries({
        onError: () => {
          hasLoadError = true;
        },
        onPartialCorruption: (invalidCount) => {
          partialCorruptionCount = invalidCount;
        },
      });
      if (hasLoadError) {
        Alert.alert('日記データを読み込めませんでした', DIARY_LOAD_ERROR_MESSAGE, [
          { text: 'キャンセル', style: 'cancel' },
          { text: '再試行', onPress: () => void handleExportRef.current() },
        ]);
        return;
      }
      if (entries.length === 0) {
        // 空の状態で共有シートを開いても意味が無いため、その旨を伝えて終了する
        Alert.alert(
          'エクスポートできる日記データがありません',
          '日記を書いてからもう一度お試しください。',
        );
        return;
      }

      // 破損分は成功分のみで続行しつつ、欠落があったことを後続の成功通知に含める
      const partialCorruptionNotice =
        partialCorruptionCount > 0
          ? `${buildDiaryPartialCorruptionMessage(partialCorruptionCount)}。それ以外のデータは書き出せました。`
          : null;

      const fileName = buildDiaryExportFileName();
      const content = serializeDiaryEntriesForExport(
        entries,
        await readDiaryImagesAsBase64(entries),
      );

      if (Platform.OS === 'web') {
        downloadOnWeb(fileName, content);
        if (partialCorruptionNotice) {
          Alert.alert('エクスポートが完了しました', partialCorruptionNotice);
        }
        return;
      }

      // ネイティブ(iOS/Android)は一旦キャッシュディレクトリにJSONファイルを書き出してから
      // OS標準の共有シートで共有する。ディレクトリ取得失敗時の例外は外側のtry-catchで捕捉される
      const file = new File(Paths.cache, fileName);
      file.write(content);
      const fileUri = file.uri;

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        Alert.alert(
          '共有機能を利用できません',
          'この端末では共有機能を利用できないため、エクスポートを完了できませんでした。',
        );
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: '日記データをエクスポート',
        UTI: 'public.json',
      });
      if (partialCorruptionNotice) {
        Alert.alert('エクスポートが完了しました', partialCorruptionNotice);
      }
    } catch {
      Alert.alert('エクスポートに失敗しました', 'もう一度お試しください。');
    } finally {
      setIsExporting(false);
    }
  }, []);

  useEffect(() => {
    handleExportRef.current = handleExport;
  }, [handleExport]);

  return (
    <Pressable
      onPress={handleExport}
      disabled={isExporting}
      accessibilityRole="button"
      accessibilityLabel="日記データをエクスポート"
      accessibilityState={{ disabled: isExporting, busy: isExporting }}
      style={[styles.exportButton, { opacity: isExporting ? 0.5 : 1 }]}
    >
      <DataTransferButtonLabel
        label="日記データをエクスポート"
        busyLabel={isExporting ? 'エクスポート中...' : null}
      />
    </Pressable>
  );
}

// ExportDiaryDataButtonで書き出したJSONファイルを選択し、日記データとして取り込む操作導線。
// 既存データは削除せず追加し、idが重複する場合はインポート側の内容で上書きする(全置換は行わない)。
// `saveDiaryEntry`がidをキーに個別保存するため、この上書き挙動は特別な実装なしに実現できる
export function ImportDiaryDataButton() {
  const [isImporting, setIsImporting] = useState(false);
  // ファイル選択・確認ダイアログの間は含めず、実際に保存している間だけ進捗を表示する
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const importEntries = useCallback(async (entries: DiaryEntry[], images: Map<string, string>) => {
    // 逐次保存のため、途中で失敗しても直前までのエントリは保存済みのまま残る。
    // 「全く反映されなかった」という誤認を防ぐため、失敗時は成功済み件数を伝える。
    let succeededCount = 0;
    try {
      // 日記が参照する画像を先に戻し、日記だけが取り込まれて画像が欠ける状態を避ける
      let failedImageCount = 0;
      try {
        failedImageCount = restoreDiaryImagesFromBase64(images);
      } catch {
        failedImageCount = images.size;
      }
      // 暗号鍵未生成の状態で並列保存すると、各呼び出しが別々の鍵を生成し合って
      // 書き込みを取り合い、データが消失し得るため、あえて逐次保存にしている
      setImportProgress({ done: 0, total: entries.length });
      for (const entry of entries) {
        await saveDiaryEntry(entry);
        succeededCount += 1;
        setImportProgress({ done: succeededCount, total: entries.length });
      }
      const imageNotice =
        failedImageCount > 0 ? `\n${failedImageCount}枚の添付写真は復元できませんでした。` : '';
      Alert.alert(
        'インポートが完了しました',
        `${entries.length}件の日記データを取り込みました。${imageNotice}`,
      );
    } catch {
      Alert.alert(
        'インポートに失敗しました',
        `${entries.length}件中${succeededCount}件を取り込んだ時点で失敗しました。もう一度お試しください。`,
      );
    } finally {
      setImportProgress(null);
      setIsImporting(false);
    }
  }, []);

  const confirmImport = useCallback(
    (entries: DiaryEntry[], invalidCount: number, images: Map<string, string>) => {
      // 誤操作による意図しない上書きを防ぐため、取り込み前に件数を示して確認する
      // (無効なエントリが除外されていた場合は、その件数もあわせて伝える)
      const skippedNotice =
        invalidCount > 0
          ? `\n${invalidCount}件のデータは形式が正しくないか文字数上限を超えていたためスキップされました。`
          : '';
      const imageNotice =
        images.size > 0 ? `\n添付写真${images.size}枚もあわせて取り込みます。` : '';
      Alert.alert(
        '日記データをインポートしますか?',
        `${entries.length}件の日記データを取り込みます。同じ日記が既にある場合は、ファイルの内容で上書きされます。${imageNotice}${skippedNotice}`,
        [
          { text: 'キャンセル', style: 'cancel', onPress: () => setIsImporting(false) },
          { text: '取り込む', onPress: () => importEntries(entries, images) },
        ],
        // Androidは既定でcancelable: falseのため、戻る操作・外側タップで閉じられるようにした上で、
        // ボタンのonPressが呼ばれずに閉じた場合もonDismissで解除し、取り込みボタンの固着を防ぐ
        { cancelable: true, onDismiss: () => setIsImporting(false) },
      );
    },
    [importEntries],
  );

  const handlePress = useCallback(async () => {
    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || result.assets.length === 0) {
        setIsImporting(false);
        return;
      }

      const content = await readPickedFileContent(result.assets[0]);
      const { validEntries, invalidCount, images } = parseDiaryEntriesForImport(content);

      if (invalidCount > 0) {
        // サイレントにスキップするとデータ欠落に誰も気づけないため、開発者向けにログを残す
        // (getAllDiaryEntriesの壊れたエントリ対応と同じ方針)
        console.warn(`ImportDiaryDataButton: ${invalidCount}件の不正なエントリをスキップしました`);
      }

      if (validEntries.length === 0) {
        Alert.alert(
          'インポートできる日記データがありません',
          '選択したファイルに有効な日記データが含まれていませんでした。',
        );
        setIsImporting(false);
        return;
      }

      confirmImport(validEntries, invalidCount, images);
    } catch {
      Alert.alert(
        'インポートに失敗しました',
        '選択したファイルを読み込めませんでした。ファイルの形式を確認してもう一度お試しください。',
      );
      setIsImporting(false);
    }
  }, [confirmImport]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isImporting}
      accessibilityRole="button"
      accessibilityLabel="日記データをインポート"
      accessibilityState={{ disabled: isImporting, busy: importProgress !== null }}
      accessibilityValue={
        importProgress
          ? { text: `${importProgress.total}件中${importProgress.done}件を取り込み済み` }
          : undefined
      }
      style={[styles.exportButton, { opacity: isImporting ? 0.5 : 1 }]}
    >
      <DataTransferButtonLabel
        label="日記データをインポート"
        busyLabel={
          importProgress
            ? `インポート中... (${importProgress.done}/${importProgress.total}件)`
            : null
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  busyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportButton: {
    alignSelf: 'flex-start',
  },
  dangerButton: {
    alignSelf: 'flex-start',
  },
  dangerButtonText: {
    fontWeight: '600',
  },
});
