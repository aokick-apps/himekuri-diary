import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import React from 'react';
import { FlatList } from 'react-native';

import OssLicensesScreen from '@/app/oss-licenses';
import licenses from '@/data/licenses.json';

type LicenseEntry = {
  name: string;
  version: string;
  license: string;
  repository?: string;
};

const licenseEntries = licenses as LicenseEntry[];

// `expo-router`'s `Link` (with its `Trigger`/`Preview`/`Menu` compound API) requires a
// navigation/router context that isn't set up when rendering the screen in isolation.
// We stub it out with simple pass-through components so the screen's own content can be
// asserted without pulling in the whole router (他のテストファイルと同じパターン)。
jest.mock('expo-router', () => {
  const PassThrough = ({ children }: PropsWithChildren) => children;

  const Link = PassThrough as unknown as typeof PassThrough & {
    Trigger: typeof PassThrough;
    Preview: () => null;
    Menu: typeof PassThrough;
    MenuAction: () => null;
  };
  function LinkPreview() {
    return null;
  }

  function LinkMenuAction() {
    return null;
  }

  Link.Trigger = PassThrough;
  Link.Preview = LinkPreview;
  Link.Menu = PassThrough;
  Link.MenuAction = LinkMenuAction;

  return { Link };
});

const DESCRIPTION_TEXT = 'このアプリは以下のオープンソースソフトウェア(OSS)を利用しています。';

describe('OssLicensesScreen (実データ: data/licenses.json)', () => {
  it('renders the header description explaining the screen purpose', () => {
    render(<OssLicensesScreen />);

    expect(screen.getByText(DESCRIPTION_TEXT)).toBeTruthy();
  });

  it('renders the "expo" entry (name/version/license and a repository link) via the FlatList\'s own renderItem', () => {
    render(<OssLicensesScreen />);

    // 件数が数百件規模になり、"expo"が既定のinitialNumToRender分の初期描画に
    // 含まれるとは限らないため、react-nativeエントリの検証と同様にrenderItemを
    // 直接呼び出して仮想化の影響を受けずに検証する。
    const list = screen.UNSAFE_getByType(FlatList);
    const expoEntry = licenseEntries.find((entry) => entry.name === 'expo');
    expect(expoEntry).toBeDefined();

    render(list.props.renderItem({ item: expoEntry, index: 0, separators: {} } as never));

    expect(screen.getByText('expo')).toBeTruthy();
    expect(screen.getByText(`v${expoEntry?.version} ・ ${expoEntry?.license}`)).toBeTruthy();
    // 複数のexpo系パッケージが同じリポジトリURL(https://github.com/expo/expo)を
    // 共有しているため、一意性を求めるgetByTextではなく「少なくとも1件表示されている」ことを確認する
    expect(screen.queryAllByText(expoEntry?.repository ?? '').length).toBeGreaterThan(0);
  });

  it('passes every license entry to the FlatList as data, so items outside the initial render window (e.g. "react-native") are not silently dropped', () => {
    render(<OssLicensesScreen />);

    const list = screen.UNSAFE_getByType(FlatList);
    // 初期描画には含まれないエントリ(例: react-native)も含めて、
    // FlatListのdataプロパティ自体には全件が渡っていることを確認する。
    expect(list.props.data).toEqual(licenseEntries);

    const reactNativeEntry = licenseEntries.find((entry) => entry.name === 'react-native');
    expect(reactNativeEntry).toBeDefined();
  });

  it("correctly renders the off-screen \"react-native\" entry's name/version/license/repository link via the FlatList's own renderItem (independent of FlatList's virtualization window)", () => {
    render(<OssLicensesScreen />);

    const list = screen.UNSAFE_getByType(FlatList);
    const reactNativeEntry = licenseEntries.find((entry) => entry.name === 'react-native');
    expect(reactNativeEntry).toBeDefined();

    // renderItemを直接呼び出し、実際にリストへ渡されている関数がreact-nativeの
    // エントリを正しくレンダリングできることを検証する。
    // (テスト環境ではFlatListの仮想化がonLayout/onScroll等のネイティブイベントに
    // 依存しており、スクロールのシミュレートでは後方の項目を決定的に描画できないため、
    // この方法を採用している)
    render(list.props.renderItem({ item: reactNativeEntry, index: 0, separators: {} } as never));

    expect(screen.getByText('react-native')).toBeTruthy();
    expect(
      screen.getByText(`v${reactNativeEntry?.version} ・ ${reactNativeEntry?.license}`),
    ).toBeTruthy();
    expect(screen.getByText(reactNativeEntry?.repository ?? '')).toBeTruthy();
  });

  it('includes the major dependency libraries (accept criteria: expo/react-native関連等のライセンスが表示される) with required fields populated', () => {
    for (const entry of licenseEntries) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.license.length).toBeGreaterThan(0);
    }

    const names = licenseEntries.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(['expo', 'react', 'react-native', 'expo-router']));
  });
});

describe('OssLicensesScreen (件数表示と検索)', () => {
  it('shows the total number of packages', () => {
    render(<OssLicensesScreen />);

    expect(screen.getByText(`全${licenseEntries.length}件`)).toBeTruthy();
  });

  it('filters the list by a case-insensitive partial match on the package name and shows the hit count', () => {
    render(<OssLicensesScreen />);

    fireEvent.changeText(screen.getByLabelText('パッケージ名で検索'), 'EXPO-ROUTER');

    const expected = licenseEntries.filter((entry) => entry.name.includes('expo-router'));
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual(expected);
    expect(screen.getByText(`${expected.length}件 / 全${licenseEntries.length}件`)).toBeTruthy();
  });

  it('ignores surrounding whitespace in the query', () => {
    render(<OssLicensesScreen />);

    fireEvent.changeText(screen.getByLabelText('パッケージ名で検索'), '  react-native  ');

    const data = screen.UNSAFE_getByType(FlatList).props.data as LicenseEntry[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((entry) => entry.name.includes('react-native'))).toBe(true);
  });

  it('shows an empty message when nothing matches, and restores the full list when cleared', () => {
    render(<OssLicensesScreen />);
    const input = screen.getByLabelText('パッケージ名で検索');

    fireEvent.changeText(input, 'zzz-no-such-package');
    expect(screen.getByText('該当するパッケージがありません')).toBeTruthy();
    expect(screen.getByText(`0件 / 全${licenseEntries.length}件`)).toBeTruthy();

    fireEvent.changeText(input, '');
    expect(screen.queryByText('該当するパッケージがありません')).toBeNull();
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual(licenseEntries);
  });
});
