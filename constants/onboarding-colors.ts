/** オンボーディング画面専用の色。ライト/ダークそれぞれに同じキーで定義する。 */

export type OnboardingIllustrationColors = {
  screen: string;
  text: string;
  subText: string;
  fill: string;
  divider: string;
  softSurface: string;
  accent: string;
  highlight: string;
};

export type OnboardingColorSet = {
  /** 背景を単色で塗る場合の色(ダークはグラデーションの中間色) */
  background: string;
  /** グラデーション背景の色の並び(上から下へ)。単色の場合は未指定 */
  backgroundGradient?: { color: string; offset: number }[];
  title: string;
  subtitle: string;
  sheet: string;
  sheetShadow: string;
  slideTitle: string;
  slideDescription: string;
  primaryButton: string;
  primaryButtonText: string;
  primaryButtonPressed: string;
  skip: string;
  dotActive: string;
  dotInactive: string;
  pressedSurface: string;
  illustration: OnboardingIllustrationColors;
};

export const OnboardingColors: { light: OnboardingColorSet; dark: OnboardingColorSet } = {
  light: {
    background: '#e9f8ff',
    title: '#0a303e',
    subtitle: '#006786',
    sheet: '#ffffff',
    sheetShadow: 'rgba(10,48,62,0.14)',
    slideTitle: '#201e1d',
    slideDescription: '#444141',
    primaryButton: '#0a7ea4',
    primaryButtonText: '#ffffff',
    primaryButtonPressed: '#006786',
    skip: '#605d5d',
    dotActive: '#0a7ea4',
    dotInactive: '#d7d3d3',
    pressedSurface: '#e9f8ff',
    illustration: {
      screen: '#ffffff',
      text: '#11181C',
      subText: '#687076',
      fill: '#f8f4f4',
      divider: '#eae7e7',
      softSurface: '#e9f8ff',
      accent: '#0a7ea4',
      highlight: '#cbeeff',
    },
  },
  dark: {
    background: '#0a303e',
    backgroundGradient: [
      { color: '#006786', offset: 0 },
      { color: '#0a303e', offset: 0.6 },
      { color: '#071d26', offset: 1 },
    ],
    title: '#ffffff',
    subtitle: '#cbeeff',
    sheet: '#07181f',
    sheetShadow: 'rgba(0,0,0,0.4)',
    slideTitle: '#f8f4f4',
    slideDescription: '#bab6b6',
    primaryButton: '#62c5ee',
    primaryButtonText: '#0a303e',
    primaryButtonPressed: '#99e0ff',
    skip: '#bab6b6',
    dotActive: '#62c5ee',
    dotInactive: '#605d5d',
    pressedSurface: 'rgba(255,255,255,0.08)',
    illustration: {
      screen: '#151718',
      text: '#ECEDEE',
      subText: '#9BA1A6',
      fill: '#1f2224',
      divider: '#2b2f31',
      softSurface: '#0e2a35',
      accent: '#62c5ee',
      highlight: '#0f4256',
    },
  },
};
