import { fireEvent, render, screen } from '@testing-library/react-native';
import { openBrowserAsync } from 'expo-web-browser';
import React from 'react';

import { ExternalLink } from '@/components/external-link';

// Linkはルーター文脈が必要なため、onPressを持つ単純なTextに差し替える
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Link: ({ children, href, target, ...rest }: any) => (
      <Text accessibilityHint={`${href}|${target}`} {...rest}>
        {children}
      </Text>
    ),
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue(undefined),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

describe('ExternalLink', () => {
  const href = 'https://example.com/';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes href and target="_blank" to Link', () => {
    render(<ExternalLink href={href}>リンク</ExternalLink>);

    expect(screen.getByText('リンク').props.accessibilityHint).toBe(`${href}|_blank`);
  });

  // process.env.EXPO_OSはbabel-preset-expoによりjest-expoのデフォルト('ios')へビルド時に
  // インライン化されるため、実行時に'web'へ切り替えられずネイティブ側の分岐のみ検証する
  it('calls preventDefault and opens the in-app browser on native', () => {
    const preventDefault = jest.fn();

    render(<ExternalLink href={href}>リンク</ExternalLink>);
    fireEvent.press(screen.getByText('リンク'), { preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openBrowserAsync).toHaveBeenCalledWith(href, { presentationStyle: 'AUTOMATIC' });
  });
});
