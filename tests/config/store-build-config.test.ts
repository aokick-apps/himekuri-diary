import appJson from '../../app.json';
import easJson from '../../eas.json';

const expo = appJson.expo;

describe('app.json', () => {
  it('アプリ名・slug・schemeが設定されている', () => {
    expect(expo.name).toBe('ひめくり日記');
    expect(expo.slug).toBe('himekuri');
    expect(expo.scheme).toBe('himekuri');
  });

  it('iOS/Androidの識別子とビルド番号の初期値が設定されている', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.aokick.himekuri');
    expect(expo.ios.buildNumber).toBe('1');
    expect(expo.android.package).toBe('com.aokick.himekuri');
    expect(expo.android.versionCode).toBe(1);
  });

  it('versionがセマンティックバージョン形式である', () => {
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('eas.json', () => {
  it('バージョン管理をEASのremoteで行う', () => {
    expect(easJson.cli.appVersionSource).toBe('remote');
  });

  it('productionプロファイルでビルド番号を自動加算する', () => {
    expect(easJson.build.production.autoIncrement).toBe(true);
  });

  it('developmentはdevelopment client、previewはinternal配布である', () => {
    expect(easJson.build.development).toEqual({
      developmentClient: true,
      distribution: 'internal',
    });
    expect(easJson.build.preview.distribution).toBe('internal');
  });

  it('submit.productionが定義されている', () => {
    expect(easJson.submit.production).toEqual({});
  });
});
