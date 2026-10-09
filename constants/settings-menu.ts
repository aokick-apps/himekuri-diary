import type { Href } from 'expo-router';

/**
 * 設定画面のメニュー項目定義。セクション・配列駆動の構成にすることで、追加項目を
 * 配列要素として足すだけで拡張できるようにしている。
 * (テーマ切替はボタン形式のインタラクティブなUIのためこの型に当てはまらず、
 * `app/(tabs)/settings.tsx`に直接JSXで実装している)
 */

// 外部ブラウザ(アプリ内ブラウザ)で開くリンク項目
type ExternalLinkItem = {
  key: string;
  label: string;
  type: 'external';
  href: `${string}:${string}`;
};

// アプリ内の別画面へ遷移するリンク項目
type InternalLinkItem = {
  key: string;
  label: string;
  type: 'internal';
  href: Href;
};

// メールクライアントを開くリンク項目
type MailtoLinkItem = {
  key: string;
  label: string;
  type: 'mailto';
  href: `mailto:${string}`;
};

export type SettingsMenuItem = ExternalLinkItem | InternalLinkItem | MailtoLinkItem;

export type SettingsSection = {
  key: string;
  title: string;
  items: SettingsMenuItem[];
};

// 原本は docs/legal/。公開サイト(aokick-apps/aokick-apps.github.io)にも同じ内容を掲載する
const PRIVACY_POLICY_URL = 'https://aokick-apps.github.io/himekuri/privacy-policy/';
const TERMS_OF_SERVICE_URL = 'https://aokick-apps.github.io/himekuri/terms-of-service/';

// docs/legal/privacy-policy.md, docs/legal/terms-of-service.md の連絡先と揃える
const CONTACT_EMAIL = 'aokick.apps@gmail.com';

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'legal',
    title: '法的情報',
    items: [
      {
        key: 'privacy-policy',
        label: 'プライバシーポリシー',
        type: 'external',
        href: PRIVACY_POLICY_URL,
      },
      {
        key: 'terms-of-service',
        label: '利用規約',
        type: 'external',
        href: TERMS_OF_SERVICE_URL,
      },
      {
        key: 'oss-licenses',
        label: 'OSSライセンス',
        type: 'internal',
        href: '/oss-licenses',
      },
    ],
  },
  {
    key: 'support',
    title: 'サポート',
    items: [
      {
        key: 'contact',
        label: 'お問い合わせ',
        type: 'mailto',
        href: `mailto:${CONTACT_EMAIL}`,
      },
    ],
  },
  // 将来的に通知設定のセクションをここに追加する想定
];
