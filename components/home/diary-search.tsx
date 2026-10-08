import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatDateHeading, toDateKey } from '@/utils/diary-date';
import { getSearchExcerpt } from '@/utils/diary-search';
import type { DiaryEntry } from '@/utils/diary-storage';
import { BODY_MAX_LENGTH, truncateForAccessibilityLabel } from '@/utils/diary-text';

// ホーム画面の日記検索欄。入力中は右端にクリアボタンを表示する
export function DiarySearchInput({
  query,
  onChangeQuery,
  onClear,
}: {
  query: string;
  onChangeQuery: (text: string) => void;
  onClear: () => void;
}) {
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');

  return (
    <View style={styles.searchContainer}>
      <TextInput
        style={[
          styles.searchInput,
          // クリアボタンと文字が重ならないよう、入力中のみ右側の余白を広げる
          query ? styles.searchInputWithClear : null,
          { color: textColor, borderColor: iconColor },
        ]}
        placeholder="日記を検索"
        placeholderTextColor={iconColor}
        value={query}
        onChangeText={onChangeQuery}
        returnKeyType="search"
        accessibilityLabel="日記を検索"
        // 検索欄は本文入力ほど厳密な制御は不要なため、標準のmaxLength(UTF-16コードユニット単位)を使う
        maxLength={BODY_MAX_LENGTH}
      />
      {query ? (
        // clearButtonModeはiOS専用のため、カスタムボタンでクリア操作をクロスプラットフォームに実現する
        <Pressable
          style={styles.searchClearButton}
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="検索キーワードをクリア"
        >
          <ThemedText style={[styles.searchClearButtonText, { color: iconColor }]}>✕</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

// 検索キーワードに一致した日記の一覧。マッチ箇所をハイライトした抜粋を表示する
export function DiarySearchResults({
  query,
  results,
  onResultPress,
}: {
  query: string;
  results: DiaryEntry[];
  onResultPress: (entry: DiaryEntry) => void;
}) {
  const iconColor = useThemeColor({}, 'icon');
  const searchHighlightBackgroundColor = useThemeColor({}, 'searchHighlightBackground');

  return (
    <FlatList
      style={styles.searchResultsList}
      data={results}
      keyExtractor={(item) => item.id}
      // 一覧をスクロールした際にもキーボードを閉じられるようにする
      keyboardDismissMode="on-drag"
      // キーボード表示中でも1回のタップで検索結果を選択できるようにする
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const excerpt = getSearchExcerpt(item.text, query);
        return (
          <Pressable
            style={[styles.searchResultItem, { borderBottomColor: iconColor }]}
            onPress={() => onResultPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${formatDateHeading(toDateKey(new Date(item.createdAt)))}の日記: ${truncateForAccessibilityLabel(item.text)}`}
          >
            <ThemedText style={[styles.searchResultDate, { color: iconColor }]}>
              {formatDateHeading(toDateKey(new Date(item.createdAt)))}
            </ThemedText>
            <ThemedText numberOfLines={2}>
              {excerpt.prefix}
              {excerpt.match ? (
                <ThemedText
                  style={[
                    styles.searchResultHighlight,
                    { backgroundColor: searchHighlightBackgroundColor },
                  ]}
                >
                  {excerpt.match}
                </ThemedText>
              ) : null}
              {excerpt.suffix}
            </ThemedText>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        // 検索結果が0件のときは、カレンダーが何も表示されず戸惑わないよう明示的に案内する
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>見つかりませんでした</ThemedText>
        </ThemedView>
      }
    />
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    gap: 8,
    // クリアボタンを入力欄の右側に重ねて配置するための基準
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  searchInputWithClear: {
    paddingRight: 36,
  },
  searchClearButton: {
    position: 'absolute',
    right: 8,
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearButtonText: {
    fontSize: 16,
    lineHeight: 16,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultDate: {
    fontSize: 12,
  },
  searchResultHighlight: {
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  emptyStateText: {
    opacity: 0.7,
  },
});
