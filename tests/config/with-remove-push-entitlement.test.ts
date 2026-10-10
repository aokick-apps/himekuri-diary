import { withEntitlementsPlist } from 'expo/config-plugins';

import withRemovePushEntitlement from '../../plugins/with-remove-push-entitlement';

jest.mock('expo/config-plugins', () => ({
  withEntitlementsPlist: jest.fn(),
}));

const mockedWithEntitlementsPlist = jest.mocked(withEntitlementsPlist);

const runPlugin = (entitlements: Record<string, unknown>) => {
  mockedWithEntitlementsPlist.mockImplementation(((
    config: unknown,
    action: (mod: { modResults: Record<string, unknown> }) => unknown,
  ) => action({ ...(config as object), modResults: entitlements })) as never);
  withRemovePushEntitlement({ name: 'test', slug: 'test' });
  return entitlements;
};

describe('with-remove-push-entitlement', () => {
  it('aps-environmentを削除する', () => {
    const result = runPlugin({ 'aps-environment': 'development' });
    expect(result).not.toHaveProperty('aps-environment');
  });

  it('ほかのキーは残す', () => {
    const result = runPlugin({
      'aps-environment': 'development',
      'com.apple.developer.associated-domains': ['applinks:example.com'],
    });
    expect(result).toEqual({
      'com.apple.developer.associated-domains': ['applinks:example.com'],
    });
  });

  it('aps-environmentが無くてもエラーにならない', () => {
    expect(() => runPlugin({})).not.toThrow();
  });
});
