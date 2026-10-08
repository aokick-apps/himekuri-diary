import { StyleSheet } from 'react-native';

// 設定画面の各セクションで共通の見出し・行レイアウト
export const settingsStyles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  item: {
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  toggleLabel: {
    flex: 1,
  },
  fallbackText: {
    marginTop: 12,
  },
});
