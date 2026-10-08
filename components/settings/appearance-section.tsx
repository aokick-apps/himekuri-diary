import { SegmentedOptionSelector } from '@/components/segmented-option-selector';
import { settingsStyles } from '@/components/settings/settings-styles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemePreference, type ThemePreference } from '@/contexts/theme-preference-context';

// 「外観」セクションで選べる配色設定の選択肢。表示順もこの配列の並び順に従う
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'system', label: '端末に合わせる' },
];

// アプリ内で配色(ライト/ダーク/端末に合わせる)を選択する操作導線。
// OSの設定に関わらずアプリ内だけで見た目を固定したい、というニーズに対応する。
export function AppearanceSection() {
  const { preference, setPreference } = useThemePreference();

  return (
    <ThemedView style={settingsStyles.section}>
      <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
        外観
      </ThemedText>
      <SegmentedOptionSelector
        options={THEME_OPTIONS}
        selectedValue={preference}
        onChange={setPreference}
      />
    </ThemedView>
  );
}
