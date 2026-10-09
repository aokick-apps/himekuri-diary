import { render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsScreen from '@/app/(tabs)/settings';
import { TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID } from '@/components/tab-screen-container';
import { SETTINGS_SECTIONS } from '@/constants/settings-menu';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/utils/diary-reminder-notifications', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createReminderNotificationsMock(),
);

jest.mock('@/utils/diary-images', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createDiaryImagesMock(),
);

jest.mock('@/utils/app-lock-authentication', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createAppLockAuthenticationMock(),
);

jest.mock('expo-file-system', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createFileSystemMock(),
);

jest.mock('expo-document-picker', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createDocumentPickerMock(),
);

jest.mock('expo-sharing', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createSharingMock(),
);

jest.mock('expo-crypto', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createCryptoMock(),
);

jest.mock('expo-secure-store', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createSecureStoreMock(),
);

jest.mock('expo-router', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../helpers/settings-screen-mocks').createRouterMock(),
);

describe('SettingsScreen', () => {
  it('renders every section title defined in SETTINGS_SECTIONS', () => {
    render(<SettingsScreen />);

    for (const section of SETTINGS_SECTIONS) {
      expect(screen.getByText(section.title)).toBeTruthy();
    }
  });

  it('renders a link for every menu item with the correct label and href', () => {
    render(<SettingsScreen />);

    for (const section of SETTINGS_SECTIONS) {
      for (const item of section.items) {
        const link = screen.getByTestId(`link-${item.href}`);
        expect(within(link).getByText(item.label)).toBeTruthy();
      }
    }
  });

  it('links "プライバシーポリシー" and "利用規約" to https:// URLs (external links)', () => {
    render(<SettingsScreen />);

    const legalSection = SETTINGS_SECTIONS.find((section) => section.key === 'legal');
    expect(legalSection).toBeDefined();

    const privacyPolicy = legalSection?.items.find((item) => item.key === 'privacy-policy');
    const termsOfService = legalSection?.items.find((item) => item.key === 'terms-of-service');
    expect(privacyPolicy).toBeDefined();
    expect(termsOfService).toBeDefined();

    expect(privacyPolicy?.type).toBe('external');
    if (privacyPolicy?.type === 'external') {
      expect(privacyPolicy.href).toBe('https://aokick-apps.github.io/himekuri/privacy-policy/');
    }
    expect(termsOfService?.type).toBe('external');
    if (termsOfService?.type === 'external') {
      expect(termsOfService.href).toBe('https://aokick-apps.github.io/himekuri/terms-of-service/');
    }
  });

  it('links "OSSライセンス" to the in-app /oss-licenses route (internal navigation)', () => {
    render(<SettingsScreen />);

    const legalSection = SETTINGS_SECTIONS.find((section) => section.key === 'legal');
    const ossLicenses = legalSection?.items.find((item) => item.key === 'oss-licenses');
    expect(ossLicenses).toBeDefined();
    expect(ossLicenses?.type).toBe('internal');
    expect(ossLicenses?.href).toBe('/oss-licenses');

    expect(screen.getByTestId('link-/oss-licenses')).toBeTruthy();
  });

  it('links "お問い合わせ" to a mailto: address (opens the mail app)', () => {
    render(<SettingsScreen />);

    const supportSection = SETTINGS_SECTIONS.find((section) => section.key === 'support');
    const contact = supportSection?.items.find((item) => item.key === 'contact');
    expect(contact).toBeDefined();
    expect(contact?.type).toBe('mailto');
    if (contact?.type === 'mailto') {
      expect(contact.href).toBe('mailto:aokick.apps@gmail.com');
    }

    const link = screen.getByTestId(`link-${contact?.href}`);
    expect(within(link).getByText('お問い合わせ')).toBeTruthy();
  });

  it('renders the "設定" tab content without crashing when the ThemedText/ThemedView wrap each link (regression check)', () => {
    render(<SettingsScreen />);

    expect(screen.UNSAFE_getAllByType(Text).length).toBeGreaterThan(0);
  });

  // セーフエリア対応は共通コンポーネント`TabScreenContainer`に委ねているため、
  // ここではその外側ラッパーに正しくインセットが伝播していることのみを検証する。
  describe('セーフエリア対応(ステータスバー/ノッチ領域との重なり防止)', () => {
    it('does not add extra top padding via TabScreenContainer when the safe area top inset is zero', () => {
      render(<SettingsScreen />);

      const safeAreaWrapper = screen.getByTestId(TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID);
      const flattenedStyle = StyleSheet.flatten(safeAreaWrapper.props.style);

      expect(flattenedStyle.paddingTop).toBe(0);
    });

    it('adds the safe area top inset as paddingTop on TabScreenContainer so content does not overlap the status bar/notch/Dynamic Island', () => {
      // iPhone 14 Pro (Dynamic Island) 相当のトップインセットを想定
      render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 59, left: 0, right: 0, bottom: 34 },
          }}
        >
          <SettingsScreen />
        </SafeAreaProvider>,
      );

      const safeAreaWrapper = screen.getByTestId(TAB_SCREEN_CONTAINER_SAFE_AREA_TEST_ID);
      const flattenedStyle = StyleSheet.flatten(safeAreaWrapper.props.style);

      expect(flattenedStyle.paddingTop).toBe(59);
    });
  });

  // 設定項目が増えて画面高さを超えても下部の操作(データ管理セクション等)に到達できることを確認する。
  describe('スクロール対応(画面高さを超える設定項目への到達)', () => {
    // タブバーのおおよそのコンテンツ高さ(セーフエリア分は含まない)。実装側の
    // BOTTOM_TAB_BAR_CONTENT_HEIGHTと同じ値(app/(tabs)/settings.tsx参照)
    const BOTTOM_TAB_BAR_CONTENT_HEIGHT = 49;

    it('wraps all sections (including the データ管理 section) in a ScrollView', () => {
      render(<SettingsScreen />);

      const scrollView = screen.UNSAFE_getByType(ScrollView);
      // 先頭(外観)と末尾(データ管理)の両方がScrollView配下にあることを確認し、
      // 一部のセクションだけがラップから漏れる回帰を防ぐ
      expect(within(scrollView).getByText('外観')).toBeTruthy();
      expect(within(scrollView).getByText('日記データを全件削除')).toBeTruthy();
    });

    it('keeps the base padding (top/left/right) of the scroll content unchanged by the paddingBottom override', () => {
      render(<SettingsScreen />);

      const scrollView = screen.UNSAFE_getByType(ScrollView);
      const flattenedStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

      // `padding`ショートハンドは`StyleSheet.flatten`ではpaddingTop/Left/Right個別には展開されない
      // ため、paddingBottomのみ上書きされ他方向は元の`padding: 16`のままであることを確認する
      expect(flattenedStyle.padding).toBe(16);
    });

    it('adds only the bottom tab bar height as paddingBottom on the scroll content when the safe area bottom inset is zero (default mock)', () => {
      render(<SettingsScreen />);

      const scrollView = screen.UNSAFE_getByType(ScrollView);
      const flattenedStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

      expect(flattenedStyle.paddingBottom).toBe(16 + BOTTOM_TAB_BAR_CONTENT_HEIGHT);
    });

    it('adds the safe area bottom inset plus the bottom tab bar height as paddingBottom on the scroll content, so it does not overlap the tab bar', () => {
      render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 59, left: 0, right: 0, bottom: 34 },
          }}
        >
          <SettingsScreen />
        </SafeAreaProvider>,
      );

      const scrollView = screen.UNSAFE_getByType(ScrollView);
      const flattenedStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

      expect(flattenedStyle.paddingBottom).toBe(16 + 34 + BOTTOM_TAB_BAR_CONTENT_HEIGHT);
    });
  });
});

describe('SETTINGS_SECTIONS data integrity (境界値・異常系)', () => {
  it('is not empty (boundary: at least 1 section must be defined)', () => {
    expect(SETTINGS_SECTIONS.length).toBeGreaterThan(0);
  });

  it('has at least 1 item in every section (boundary: no empty section)', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('has non-empty required fields (key/label/href) on every item', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.key.length).toBeGreaterThan(0);
      expect(section.title.length).toBeGreaterThan(0);

      for (const item of section.items) {
        expect(item.key.length).toBeGreaterThan(0);
        expect(item.label.length).toBeGreaterThan(0);
        expect(String(item.href).length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique section keys and unique item keys within each section (React key衝突の防止)', () => {
    // `section.key`/`item.key`はReactの`key` propとしてそのまま使われているため、
    // 重複すると意図しない再利用・警告が発生する。将来項目が追加された際の回帰を防ぐ。
    const sectionKeys = SETTINGS_SECTIONS.map((section) => section.key);
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);

    for (const section of SETTINGS_SECTIONS) {
      const itemKeys = section.items.map((item) => item.key);
      expect(new Set(itemKeys).size).toBe(itemKeys.length);
    }
  });
});
