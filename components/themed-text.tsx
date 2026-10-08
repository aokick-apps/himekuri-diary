import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextFont = keyof typeof Fonts;

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  // 文字サイズ・太さ(type)とは独立に書体だけを差し替える。未指定時は各typeの既定(sans)
  font?: ThemedTextFont;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  font,
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  // リンクの色はテーマごとにコントラスト比を確保した専用色(Colors.light/dark.link)を使う
  const linkColor = useThemeColor({ light: lightColor, dark: darkColor }, 'link');

  return (
    <Text
      style={[
        { color: type === 'link' ? linkColor : color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        font ? { fontFamily: Fonts[font] } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.sans,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
    fontFamily: Fonts.sans,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    fontFamily: Fonts.sans,
  },
});
