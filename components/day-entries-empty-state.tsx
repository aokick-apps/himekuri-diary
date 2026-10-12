import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DIARY_LOAD_ERROR_MESSAGE } from '@/utils/diary-storage';

export const EMPTY_STATE_MESSAGE = 'この日の日記はまだありません';

type DayEntriesEmptyStateProps = {
  hasLoadError: boolean;
  onRetry: () => void;
};

// 日記が0件のときの表示。読み込み失敗時はエラーメッセージと再試行ボタンを出す
export function DayEntriesEmptyState({ hasLoadError, onRetry }: DayEntriesEmptyStateProps) {
  const tintColor = useThemeColor({}, 'tint');
  const linkColor = useThemeColor({}, 'link');
  const errorColor = useThemeColor({}, 'error');

  return (
    <ThemedView style={styles.emptyState}>
      {hasLoadError ? (
        // emptyStateTextのopacityはコントラストを下げるため、エラー表示には適用しない
        <>
          <ThemedText style={[styles.emptyStateErrorText, { color: errorColor }]}>
            {DIARY_LOAD_ERROR_MESSAGE}
          </ThemedText>
          <Pressable
            onPress={onRetry}
            style={[styles.retryButton, { borderColor: tintColor }]}
            accessibilityRole="button"
            accessibilityLabel="再試行"
          >
            <ThemedText style={[styles.retryButtonText, { color: linkColor }]}>再試行</ThemedText>
          </Pressable>
        </>
      ) : (
        <ThemedText style={styles.emptyStateText}>{EMPTY_STATE_MESSAGE}</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.7,
    textAlign: 'center',
  },
  // エラー表示はコントラスト確保のためemptyStateTextのopacityを継承しない
  emptyStateErrorText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    fontWeight: '600',
  },
});
