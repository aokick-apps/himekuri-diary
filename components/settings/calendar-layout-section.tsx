import { SegmentedOptionSelector } from '@/components/segmented-option-selector';
import { settingsStyles } from '@/components/settings/settings-styles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useCalendarLayoutPreference,
  type CalendarLayoutPreference,
} from '@/contexts/calendar-layout-preference-context';

// ホーム画面のカレンダー部分で選べる表示レイアウトの選択肢。表示順もこの配列の並び順に従う
const CALENDAR_LAYOUT_OPTIONS: { value: CalendarLayoutPreference; label: string }[] = [
  { value: 'month', label: '月表示' },
  { value: 'week', label: '週表示' },
];

// ホーム画面のカレンダー部分を1ヶ月分まとめて表示するか、1週間分のみ表示するかを選ぶ操作導線。
// 無料ユーザーも利用可能(Pro限定にはしない)
export function CalendarLayoutSection() {
  const { layout, setLayout } = useCalendarLayoutPreference();

  return (
    <ThemedView style={settingsStyles.section}>
      <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
        カレンダー表示レイアウト
      </ThemedText>
      <SegmentedOptionSelector
        options={CALENDAR_LAYOUT_OPTIONS}
        selectedValue={layout}
        onChange={setLayout}
      />
    </ThemedView>
  );
}
