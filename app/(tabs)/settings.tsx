import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLockSection } from '@/components/settings/app-lock-section';
import { AppearanceSection } from '@/components/settings/appearance-section';
import { CalendarLayoutSection } from '@/components/settings/calendar-layout-section';
import {
  DeleteAllDiaryDataButton,
  ExportDiaryDataButton,
  ImportDiaryDataButton,
} from '@/components/settings/data-management-buttons';
import { DiaryReminderSection } from '@/components/settings/diary-reminder-section';
import { SettingsMenuLink } from '@/components/settings/settings-menu-link';
import { settingsStyles } from '@/components/settings/settings-styles';
import { TabScreenContainer } from '@/components/tab-screen-container';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SETTINGS_SECTIONS } from '@/constants/settings-menu';

// タブバー(デフォルト、セーフエリア分は含まない)のおおよそのコンテンツ高さ。ScrollView最下部が
// タブバーと重ならないよう、insets.bottomと合わせてpaddingBottomに加算する
const BOTTOM_TAB_BAR_CONTENT_HEIGHT = 49;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // ScrollViewの最下部(データ管理セクション)がタブバーの下に隠れて操作できなくならないよう、
  // セーフエリア下端の分もあわせてpaddingBottomに加算する
  const contentBottomPadding = 16 + insets.bottom + BOTTOM_TAB_BAR_CONTENT_HEIGHT;

  return (
    // ステータスバー/ノッチ領域とコンテンツが重ならないよう、TabScreenContainerでセーフエリア上端の余白を加算する
    <TabScreenContainer style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
        <AppearanceSection />
        <CalendarLayoutSection />
        <DiaryReminderSection />
        <AppLockSection />

        {SETTINGS_SECTIONS.map((section) => (
          <ThemedView key={section.key} style={settingsStyles.section}>
            <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
              {section.title}
            </ThemedText>
            {section.items.map((item) => (
              <ThemedView key={item.key} style={settingsStyles.item}>
                <SettingsMenuLink item={item} />
              </ThemedView>
            ))}
          </ThemedView>
        ))}

        <ThemedView style={settingsStyles.section}>
          <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
            データ管理
          </ThemedText>
          <ThemedView style={settingsStyles.item}>
            <ExportDiaryDataButton />
          </ThemedView>
          <ThemedView style={settingsStyles.item}>
            <ImportDiaryDataButton />
          </ThemedView>
          <ThemedView style={settingsStyles.item}>
            <DeleteAllDiaryDataButton />
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </TabScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
});
