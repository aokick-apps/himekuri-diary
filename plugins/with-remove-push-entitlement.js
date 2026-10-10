const { withEntitlementsPlist } = require('expo/config-plugins');

// ローカル通知のみ使用のため aps-environment を除去する。将来プッシュ通知を使う場合はこのpluginを外すこと。
const withRemovePushEntitlement = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });

module.exports = withRemovePushEntitlement;
