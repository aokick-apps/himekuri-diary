import { Pressable, StyleSheet, View } from 'react-native';

import { DiaryImagePreview } from '@/components/diary-image-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatEntryDateTime } from '@/utils/diary-date';
import { isDiaryImageAttachmentSupported } from '@/utils/diary-images';
import type { DiaryEntry } from '@/utils/diary-storage';

// 日別一覧画面の日記1件分。本文・添付画像と、コピー・編集・削除の操作を並べる
export function DayEntryItem({
  entry,
  isHighlighted,
  onCopy,
  onEdit,
  onDelete,
}: {
  entry: DiaryEntry;
  // 検索結果から遷移してきた対象の日記を、一覧の中で見つけやすいよう一時的に強調する
  isHighlighted: boolean;
  onCopy: (entry: DiaryEntry) => void;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
}) {
  const linkColor = useThemeColor({}, 'link');
  const iconColor = useThemeColor({}, 'icon');
  const errorColor = useThemeColor({}, 'error');
  const highlightBackgroundColor = useThemeColor({}, 'searchHighlightBackground');

  return (
    <ThemedView
      testID={`day-entry-${entry.id}`}
      style={[
        styles.entry,
        { borderBottomColor: iconColor },
        isHighlighted ? [styles.highlighted, { backgroundColor: highlightBackgroundColor }] : null,
      ]}
      accessibilityHint={isHighlighted ? '検索で見つかった日記です' : undefined}
    >
      <ThemedText style={styles.entryDate}>{formatEntryDateTime(entry.createdAt)}</ThemedText>
      <ThemedText>{entry.text}</ThemedText>
      {isDiaryImageAttachmentSupported()
        ? entry.images?.map((image) => <DiaryImagePreview key={image.fileName} image={image} />)
        : null}
      <View style={styles.entryActions}>
        <View style={styles.mainActions}>
          <Pressable
            onPress={() => onCopy(entry)}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="日記本文をコピー"
          >
            <ThemedText style={[styles.entryActionText, { color: linkColor }]}>コピー</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => onEdit(entry)}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="この日記を編集"
          >
            <ThemedText style={[styles.entryActionText, { color: linkColor }]}>編集</ThemedText>
          </Pressable>
        </View>
        <Pressable
          onPress={() => onDelete(entry)}
          style={[styles.actionButton, styles.deleteButton]}
          accessibilityRole="button"
          accessibilityLabel="この日記を削除"
        >
          <ThemedText style={[styles.entryActionText, { color: errorColor }]}>削除</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  entry: {
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 背景色を付けても本文が端に張り付かないよう、強調時だけ内側に余白を取る
  highlighted: {
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  entryDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  // 削除は破壊的な操作のため、コピー・編集とは行の反対端へ離して誤タップを防ぐ
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // 各ボタンの横余白ぶん、テキストが本文の左端と揃うよう外側へ寄せる
  mainActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -12,
  },
  deleteButton: {
    marginRight: -12,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
