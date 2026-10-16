import { StyleSheet, Text, View } from 'react-native';

import type { OnboardingIllustrationColors } from '@/constants/onboarding-colors';
import { Fonts } from '@/constants/theme';

export const ILLUSTRATION_WIDTH = 270;

type IllustrationProps = { colors: OnboardingIllustrationColors };

function Frame({ colors, children }: IllustrationProps & { children: React.ReactNode }) {
  return (
    <View style={[styles.frame, { backgroundColor: colors.screen, borderColor: colors.divider }]}>
      {children}
    </View>
  );
}

function WriteIllustration({ colors }: IllustrationProps) {
  return (
    <Frame colors={colors}>
      <View style={[styles.weekdayBand, { backgroundColor: colors.softSurface }]}>
        <Text style={[styles.strong, { color: colors.accent }]}>10月9日 木曜日</Text>
      </View>
      <View
        style={[styles.inputBox, { backgroundColor: colors.fill, borderColor: colors.divider }]}
      >
        <Text style={[styles.small, { color: colors.text }]}>今日はカフェで本を読んだ。</Text>
        <Text style={[styles.small, { color: colors.subText }]}>のんびりできた一日。</Text>
      </View>
      <View style={[styles.saveButton, { backgroundColor: colors.accent }]}>
        <Text style={[styles.saveText, { color: colors.screen }]}>保存</Text>
      </View>
    </Frame>
  );
}

const CALENDAR_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const CALENDAR_DOT_DAYS = [2, 5, 9, 12, 16, 23];

function CalendarIllustration({ colors }: IllustrationProps) {
  return (
    <Frame colors={colors}>
      <Text style={[styles.strong, styles.monthTitle, { color: colors.text }]}>2025年10月</Text>
      <View style={styles.grid}>
        {CALENDAR_DAYS.map((day) => (
          <View key={day} style={styles.cell}>
            <View style={[styles.dayCircle, day === 9 ? { backgroundColor: colors.accent } : null]}>
              <Text style={[styles.day, { color: day === 9 ? colors.screen : colors.text }]}>
                {day}
              </Text>
            </View>
            <View
              style={[
                styles.dayDot,
                CALENDAR_DOT_DAYS.includes(day) ? { backgroundColor: colors.accent } : null,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={[styles.selectedBar, { backgroundColor: colors.softSurface }]}>
        <Text style={[styles.strong, { color: colors.text }]}>10月9日</Text>
        <Text style={[styles.small, { color: colors.subText }]}>2件</Text>
      </View>
    </Frame>
  );
}

const SEARCH_RESULTS = [
  { date: '10月9日', before: '駅前の', match: 'カフェ', after: 'で読書' },
  { date: '9月21日', before: '新しい', match: 'カフェ', after: 'を見つけた' },
  { date: '8月30日', before: '友達と', match: 'カフェ', after: 'でお茶' },
];

function SearchIllustration({ colors }: IllustrationProps) {
  return (
    <Frame colors={colors}>
      <View
        style={[styles.searchField, { backgroundColor: colors.fill, borderColor: colors.divider }]}
      >
        <Text style={[styles.small, { color: colors.text }]}>カフェ</Text>
      </View>
      {SEARCH_RESULTS.map((result) => (
        <View key={result.date} style={[styles.resultRow, { borderColor: colors.divider }]}>
          <Text style={[styles.tiny, { color: colors.subText }]}>{result.date}</Text>
          <Text style={[styles.small, { color: colors.text }]}>
            {result.before}
            <Text style={{ backgroundColor: colors.highlight }}>{result.match}</Text>
            {result.after}
          </Text>
        </View>
      ))}
    </Frame>
  );
}

const SETTINGS_ROWS = [
  { label: 'リマインダー', value: '毎日21:00 オン' },
  { label: 'アプリロック', value: 'オン' },
  { label: '日記データをエクスポート', value: '›' },
  { label: '日記データをインポート', value: '›' },
];

function SettingsIllustration({ colors }: IllustrationProps) {
  return (
    <Frame colors={colors}>
      {SETTINGS_ROWS.map((row) => (
        <View key={row.label} style={[styles.settingsRow, { borderColor: colors.divider }]}>
          <Text style={[styles.small, { color: colors.text }]}>{row.label}</Text>
          <Text style={[styles.small, { color: colors.accent }]}>{row.value}</Text>
        </View>
      ))}
    </Frame>
  );
}

/** スライドのkeyに対応する簡略化したアプリ画面のイラスト(View/Textのみで描画)。 */
export function OnboardingIllustration({
  slideKey,
  colors,
}: IllustrationProps & { slideKey: string }) {
  switch (slideKey) {
    case 'write-diary':
      return <WriteIllustration colors={colors} />;
    case 'view-calendar':
      return <CalendarIllustration colors={colors} />;
    case 'search-diary':
      return <SearchIllustration colors={colors} />;
    default:
      return <SettingsIllustration colors={colors} />;
  }
}

const styles = StyleSheet.create({
  frame: {
    width: ILLUSTRATION_WIDTH,
    flex: 1,
    marginBottom: -24,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: 'hidden',
  },
  weekdayBand: { borderRadius: 10, padding: 10, marginBottom: 12 },
  inputBox: { borderRadius: 10, borderWidth: 1, padding: 12, minHeight: 90, gap: 4 },
  saveButton: {
    alignSelf: 'flex-end',
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  saveText: { fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  monthTitle: { textAlign: 'center', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { fontFamily: Fonts.sans, fontSize: 11 },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  selectedBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  searchField: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  resultRow: { borderBottomWidth: 1, paddingVertical: 8, gap: 2 },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  strong: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  small: { fontFamily: Fonts.sans, fontSize: 12 },
  tiny: { fontFamily: Fonts.sans, fontSize: 10 },
});
