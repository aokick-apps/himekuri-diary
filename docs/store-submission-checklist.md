# ストア申請チェックリスト

App Store / Google Play への申請に必要なアセットと申請フォームの記載内容案をまとめる。
ストアの要件は改定されることがあるため、申請直前に各公式ドキュメントで最新値を再確認すること。
記載内容は 2026-10 時点のコード・`app.json`・`package.json` の実態に基づく。

- 凡例: [x] 設定済み / [ ] 不足(人間による作業が必要)

## 1. 掲載アセット

### 1.1 アプリアイコン

| 対象                       | ストア要件                            | 現状                                                                          | 状態 |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ---- |
| iOS アイコン(ライト)       | 1024x1024 PNG、透過・角丸なし         | `assets/images/icon.png`(1024x1024、RGB)                                      | [x]  |
| iOS アイコン(ダーク)       | 1024x1024 PNG                         | `assets/images/icon-dark.png`(1024x1024)                                      | [x]  |
| iOS アイコン(ティント)     | 1024x1024 PNG                         | `assets/images/icon-tinted.png`(1024x1024)                                    | [x]  |
| Android アダプティブアイコン | 前景・背景とも 432x432(安全領域は中央 66%) | `android-icon-foreground.png` / `-background.png` / `-monochrome.png`(432x432) | [x]  |
| Google Play ストア用アイコン | 512x512 PNG(32bit、最大 1MB)          | 専用ファイルなし。`icon.png` からの書き出しが必要                             | [ ]  |

### 1.2 スクリーンショット(いずれも未作成)

| ストア      | 要件                                                                                                           | 状態 |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| App Store   | iPhone 6.9 インチ(1320x2868 等)は必須、1 〜 10 枚。PNG/JPEG。`supportsTablet: true` のため iPad 13 インチ(2064x2752 等)も必須 | [ ]  |
| Google Play | 電話: 2 〜 8 枚、PNG/JPEG(24bit)、各辺 320 〜 3840px、長辺は短辺の 2 倍以下。タブレット画像は任意             | [ ]  |

撮影候補: ホーム(カレンダー)、日記の入力、日別一覧、設定(アプリロック・リマインダー)、ダークモード。
ライト/ダークの両方を載せる場合も、端末内の実データ(個人情報)を写さないこと。

### 1.3 その他のアセット

| 項目                                    | 要件                                  | 状態                                 |
| --------------------------------------- | ------------------------------------- | ------------------------------------ |
| Google Play フィーチャーグラフィック    | 1024x500 PNG/JPEG(透過なし)、必須     | [ ]                                  |
| App Store プレビュー動画                | 任意                                  | 対象外                               |
| スプラッシュ                            | `splash-icon.png` / `-dark.png`       | [x]                                  |
| ファビコン(Web のみ)                    | 48x48                                 | [x]                                  |

### 1.4 ストア掲載情報(テキスト・URL)

- [ ] アプリ名(App Store 30 文字以内 / Google Play 30 文字以内): 「ひめくり日記」
- [ ] サブタイトル(App Store、30 文字以内)/ 短い説明(Google Play、80 文字以内)
- [ ] 詳細説明(4000 文字以内)、キーワード(App Store、100 文字以内)
- [x] プライバシーポリシー URL: `constants/settings-menu.ts` の `PRIVACY_POLICY_URL`(`docs/legal/privacy-policy.md` が元)。公開ページが閲覧できることを申請前に確認
- [x] 利用規約 URL: 同 `TERMS_OF_SERVICE_URL`
- [ ] サポート URL(App Store 必須): `docs/legal/support.md` の公開 URL を指定
- [ ] 問い合わせ用メールアドレス(Google Play 必須)
- [ ] カテゴリ(例: ライフスタイル)、対応言語(日本語)

### 1.5 ビルド設定(`app.json`)

- [x] `ios.bundleIdentifier` / `android.package`: `com.aokick.himekuri`
- [x] `version`: 1.0.0、`ios.buildNumber`: 1、`android.versionCode`: 1(提出のたびに増やす)
- [x] `eas.json` あり
- [x] iOS の `aps-environment` はプラグインで除去済み(プッシュ通知は未使用)
- [x] iOS の `ITSAppUsesNonExemptEncryption`: `false`(根拠は 3.3)

## 2. Google Play「データセーフティ」記載案

### 2.1 実装の実態(確認結果)

- ネットワーク送信: アプリのコードに `fetch` / `XMLHttpRequest` / axios 等の通信処理は無い。外部へ開くのはプライバシーポリシー・利用規約の URL(`expo-web-browser`)のみ
- 解析・クラッシュレポート・広告 SDK(Analytics / Sentry / Crashlytics / AdMob / Firebase 等)は `package.json` にもコードにも無い
- 保存先: 日記本文・下書きは `AsyncStorage` に AES-256-GCM で暗号化して保存(鍵は `expo-secure-store`)。写真はアプリ専用領域へコピー
- 通知: `expo-notifications` の端末内ローカル通知のみ(`scheduleNotificationAsync`)。プッシュトークンの取得・送信はしない
- 生体認証: `expo-local-authentication` で OS が認証。生体情報はアプリに渡らない
- 写真: `expo-image-picker` の OS 標準ピッカーで選んだ 1 枚のみ。カメラ・マイクは無効(`app.json` で `false`)
- データの持ち出し: 設定画面のバックアップ書き出し(`expo-sharing`)・読み込み(`expo-document-picker`)は利用者が明示的に操作した場合のみ。開発者側には送られない

### 2.2 フォーム回答案

| 質問                                         | 回答案                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| アプリは必須のユーザーデータを収集または共有するか | いいえ(収集なし・共有なし)。データは端末内にのみ保存し、開発者のサーバーや第三者へ送信しない |
| 収集するデータタイプ                         | すべて「収集しない」                                                                        |
| 共有するデータタイプ                         | すべて「共有しない」                                                                        |
| 転送中のデータの暗号化                       | 通信でユーザーデータを送信しないため該当なし                                                |
| データ削除のリクエスト方法                   | 端末内のみのため、アプリ内でのデータ削除またはアンインストールで削除される旨を説明          |
| アカウント作成                               | なし                                                                                        |

注意点:

- 将来、解析 SDK・広告・クラウド同期・プッシュ通知(サーバー経由)を追加した場合は回答を見直す
- Android のマニフェストには依存ライブラリ由来の権限(通知、生体認証、起動時の再スケジュール等)が入る。ビルド後の `AndroidManifest.xml` を確認し、不要な権限が無いかを申請前に確認する
- `expo-notifications` は Android で Firebase Messaging を依存に含むが、プッシュトークンを取得しない限りデータは送信されない。申請時の SDK 一覧に Firebase が出る場合は、ローカル通知のみで送信しない旨を説明できるようにしておく

## 3. Apple「Appのプライバシー」記載案

### 3.1 App Store Connect 回答案

| 質問                                      | 回答案                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| このアプリはユーザーデータを収集しますか? | いいえ、このアプリからデータを収集しません(Data Not Collected) |
| トラッキングに使用するデータ              | なし(広告識別子・ATT は使用しない)                    |

「収集」とは、開発者または第三者パートナーが端末外へ送信し、長期保持することを指す。本アプリは端末内保存のみのため該当しない。

### 3.2 関連する申請項目

- [x] 追跡(ATT): `NSUserTrackingUsageDescription` は不要(`app.json` に未設定)
- [x] 権限説明文: Face ID(`expo-local-authentication` の `faceIDPermission`)、写真(`expo-image-picker` の `photosPermission`)を日本語で設定済み。カメラ・マイクは無効
- [x] 暗号化に関する輸出コンプライアンス: `ITSAppUsesNonExemptEncryption` を `false` に設定済み(根拠は 3.3)
- [ ] Privacy Manifest(`PrivacyInfo.xcprivacy`): Expo SDK 54 の各ライブラリが同梱するものを使用。EAS ビルド後に Required Reason API の警告が出ていないか確認

### 3.3 暗号化の輸出コンプライアンス

結論: `ios.infoPlist.ITSAppUsesNonExemptEncryption` を `false` にし、**フランスを配信地域に含めない**。
想定する配信地域は日本とアジアの一部。

本アプリの暗号化の実態:

- 日記の本文・下書きを端末内に保存する際に AES-256-GCM で暗号化する(`utils/diary-encryption.ts`)。実装は OS の暗号 API ではなく JS ライブラリ `@noble/ciphers`
- AES-256-GCM は国際標準化されたアルゴリズムであり、独自・非公開のアルゴリズムではない
- 通信には独自の暗号化を使わない(外部サーバーとの通信機能なし)

根拠(2026-10 時点で確認):

| 公式ドキュメント | 内容 |
| ---------------- | ---- |
| [Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations) | 暗号化を使わない、または輸出コンプライアンス書類の提出が免除される暗号化のみを使う場合は `NO`、それ以外は `YES` |
| [Export compliance documentation for encryption](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption) | 「OS が提供しない業界標準のアルゴリズム」は、**フランスで配信する場合のみ**フランスの暗号申告書の提出が必要。独自アルゴリズムの場合は米国 CCATS も必要 |
| [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance) | フランスで主に規制されるのは Secure Storage / Secure Communications / Security Anti-Virus。日記の暗号化保存は Secure Storage に該当しうる |
| [15 CFR 740.17(e)(3)](https://www.ecfr.gov/current/title-15/part-740/section-740.17) | 米国の年次の自己分類報告書(毎年 2 月 1 日期限)の対象は、マスマーケットの暗号部品・「executable software」(既存のハードウェア部品から取り出したソフトウェア)、およびマスマーケットに該当しない品目。一般消費者向けのアプリ単体はこれに当たらないため、報告書は不要と判断 |

本アプリは「OS が提供しない業界標準のアルゴリズム」の区分に当たる。フランスで配信しなければ提出書類が無いため、`false`(書類の提出が免除される暗号化のみ)とする。

運用上の注意:

- [ ] App Store Connect の「価格および配信状況」で、配信地域からフランスを外す
- フランスで配信する場合は、`true` に変更し、ANSSI への暗号申告書を App Store Connect にアップロードする。承認後に発行されるコードを `ios.infoPlist.ITSEncryptionExportComplianceCode` に設定する
- 暗号化の実装を変更した場合(通信の暗号化の追加、独自アルゴリズムの採用など)は、本節の判断を見直す
- 本判断は公式ドキュメントの記載に基づくもので、法律の専門家による確認は受けていない

## 4. コンテンツレーティング(年齢制限)

### 4.1 本アプリの実態

| 確認事項                                                | 回答案                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| 暴力・性的表現・薬物・ギャンブル等のコンテンツを提供するか | いいえ(コンテンツは利用者自身が書く日記のみ) |
| ユーザー生成コンテンツ(UGC)の共有・公開機能            | なし(他者への公開・共有・チャット・SNS 機能なし) |
| ユーザー間の交流・位置情報の共有                        | なし                                         |
| アプリ内課金・広告                                       | なし                                         |
| Web ブラウジング                                        | プライバシーポリシー等の外部リンクを開くのみ |
| 医療・健康に関する助言                                  | なし                                         |
| アカウント登録                                          | なし                                         |

### 4.2 各ストアの手続き

- [ ] App Store Connect の年齢レーティング質問票に回答(上記表を基に、すべて「なし」想定。最新の質問項目に従う)
- [ ] Google Play Console の IARC レーティング質問票に回答(カテゴリは「ユーティリティ、生産性、コミュニケーション、その他」等から選択)
- [ ] Google Play「アプリのコンテンツ」: 広告(なし)、対象年齢層、ニュースアプリではない旨、政府系アプリではない旨などの宣言
- [ ] 日記内容は端末内に閉じており公開されないことを、審査メモに添える

## 5. 申請直前の確認

- [ ] 上記の [ ] 項目を解消
- [ ] 実機または EAS ビルドで、権限ダイアログ(通知・Face ID・写真)の文言が日本語で表示されることを確認
- [ ] プライバシーポリシーの記載(`docs/legal/privacy-policy.md`)と本書の回答案に矛盾が無いことを確認
- [ ] 審査用のログイン情報は不要(アカウント機能なし)と審査メモに記載
