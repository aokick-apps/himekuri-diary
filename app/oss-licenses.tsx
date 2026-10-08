import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import licenses from '@/data/licenses.json';
import { useThemeColor } from '@/hooks/use-theme-color';

type LicenseEntry = {
  name: string;
  version: string;
  license: string;
  repository?: string;
};

// data/licenses.json は `npm run generate-licenses` で package-lock.json から自動生成される静的ファイル
// (直接依存だけでなくtransitive依存も含む)。
// 依存関係を追加・更新した際は、このコマンドを再実行して最新の内容にしてから差分をコミットする。
const licenseEntries = licenses as LicenseEntry[];

export default function OssLicensesScreen() {
  const [query, setQuery] = useState('');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');

  // 数百件規模の一覧のため、入力のたびに全件を再走査しないようメモ化する
  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return licenseEntries;
    }
    return licenseEntries.filter((entry) => entry.name.toLowerCase().includes(keyword));
  }, [query]);
  const isFiltering = query.trim().length > 0;

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={filteredEntries}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => `${item.name}@${item.version}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ThemedText style={styles.description}>
              このアプリは以下のオープンソースソフトウェア(OSS)を利用しています。
            </ThemedText>
            <ThemedText style={styles.count} accessibilityLiveRegion="polite">
              {isFiltering
                ? `${filteredEntries.length}件 / 全${licenseEntries.length}件`
                : `全${licenseEntries.length}件`}
            </ThemedText>
            <TextInput
              style={[styles.searchInput, { color: textColor, borderColor: iconColor }]}
              placeholder="パッケージ名で検索"
              placeholderTextColor={iconColor}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel="パッケージ名で検索"
            />
          </>
        }
        ListEmptyComponent={
          isFiltering ? (
            <ThemedText style={styles.empty}>該当するパッケージがありません</ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.item}>
            <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
            <ThemedText style={styles.meta}>
              v{item.version} ・ {item.license}
            </ThemedText>
            {item.repository ? (
              <ExternalLink href={item.repository as `${string}:${string}`}>
                <ThemedText type="link" style={styles.link}>
                  {item.repository}
                </ThemedText>
              </ExternalLink>
            ) : null}
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  description: {
    marginBottom: 8,
  },
  count: {
    marginBottom: 12,
    opacity: 0.7,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  empty: {
    textAlign: 'center',
    opacity: 0.7,
  },
  item: {
    marginBottom: 20,
  },
  meta: {
    marginTop: 2,
    opacity: 0.7,
  },
  link: {
    marginTop: 2,
    fontSize: 14,
  },
});
