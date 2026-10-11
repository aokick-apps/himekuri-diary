# iOS 実機検証・TestFlight 配布手順

iOS の実機検証から TestFlight 配布までの手順をまとめる。
ストア掲載アセットや申請フォームの記載内容は [ストア申請チェックリスト](../store-submission-checklist.md) を参照。
リリース前に毎回確認する項目は [リリース前チェックリスト](./pre-release-checklist.md) を参照。

> 有料登録(Apple Developer Program、年額)はオーナー本人が行う作業である。エージェントや自動化では実行しない。

## 前提

- bundle id: `com.aokick.himekuri`(`app.json` の `ios.bundleIdentifier`)
- `eas.json` の `production` プロファイルは `autoIncrement: true`、`appVersionSource` は `remote`。ビルド番号は EAS 側で自動採番される
- Apple Developer Program に登録済みで、App Store Connect にサインインできること

## 1. App Store Connect にアプリを登録する

1. App Store Connect の「マイApp」から新規 App を追加する
2. プラットフォームは iOS、名前は「ひめくり日記」、プライマリ言語は日本語を選ぶ
3. バンドル ID は `com.aokick.himekuri` を選ぶ(未登録の場合は Apple Developer の Identifiers で先に登録する)
4. SKU は任意の一意な文字列にする

## 2. ビルドを作る

### 方法 A: EAS Build(推奨)

```bash
npm install -g eas-cli   # 未導入の場合
eas login
eas build --platform ios --profile production
```

- 初回は Apple アカウントでのログインと、証明書・プロビジョニングプロファイルの自動生成を求められる
- `autoIncrement` によりビルド番号は自動で加算される。`version`(`app.json`)を上げるのは新しい公開バージョンにする時のみ
- EAS Build の無料枠には上限がある。課金が発生するプランへの変更はオーナーが判断する

### 方法 B: Xcode Archive

1. `npx expo prebuild --platform ios` でネイティブプロジェクトを生成する
2. Xcode で `ios/*.xcworkspace` を開き、Signing & Capabilities でチームを選ぶ
3. 実行先を「Any iOS Device (arm64)」にして Product > Archive を実行する
4. Organizer から Distribute App > App Store Connect でアップロードする

この方法ではビルド番号(`ios.buildNumber`)を手動で増やす必要がある。

## 3. App Store Connect へ提出する

### 方法 A: `eas submit`

```bash
eas submit --platform ios --profile production --latest
```

直近の EAS ビルドを App Store Connect へアップロードする。初回は Apple アカウントの認証を求められる。

### 方法 B: Transporter

Xcode Archive などで作成した `.ipa` を Mac の Transporter アプリで App Store Connect にアップロードする。

アップロード後、App Store Connect 側の処理(通常は数分から数十分)が終わるまで TestFlight には表示されない。

## 4. TestFlight で配布する

1. App Store Connect の対象アプリの TestFlight タブで、処理が完了したビルドを選ぶ
2. 輸出コンプライアンスの質問に答える
   - 本アプリは暗号化を端末内の日記データ保護(AES-256-GCM)に利用している。通信には独自の暗号化を使っていない
   - 質問の最終的な回答は Apple の最新の定義に従ってオーナーが判断する
3. 内部テスターを追加する
   - ユーザとアクセスで App Store Connect ユーザを追加し、TestFlight の内部テストグループに加える(最大 100 人)
   - 内部テストは Apple の審査なしで配布できる
4. テスターは iPhone に TestFlight アプリを入れ、招待(メールまたは自動表示)からインストールする

外部テスターへ配布する場合は、ベータ App 審査が必要になる。

## 5. 確認項目

インストール後、[リリース前チェックリスト](./pre-release-checklist.md) の全項目を実機で確認する。特に次は実機でしか確認できない。

- Face ID によるアプリロック(権限ダイアログの文言を含む)
- ローカル通知(リマインダー)の許可と実際の発火
- 写真ライブラリの権限ダイアログと添付
- Release ビルドでの全画面のタップ可否(開発ビルドでは再現しない不具合があるため)
