# 公式資料照合専用Worker

GitHub Pagesはサーバ処理を実行できないため、固定公式資料の取得だけを独立Workerへ分離します。給与・社名・CSV・年度を送るAPIはありません。データベース・ストレージ・外部ライブラリ・APIキーは使いません。

## 生成と配備

1. 最終コードと公式出典を独立レビューし、限定する機能だけをreview-manifest.jsonで承認します。
2. `node scripts/build-public.mjs` と `node scripts/build-worker.mjs` を実行します。manifestのコード・画面指紋が違えば生成を停止します。
3. WorkerのESMを専用Sitesフォルダのworker/index.jsへ出力し、Sitesの公式ビルド・保存・配備手順を使います。Sites project_idはGitHubとは別の対象です。
4. GitHub Pagesからの実リクエストでCORS、指紋、固定公式本文の取得、変更・失敗時の停止を確認します。Pagesの表示だけでは稼働確認になりません。

候補の専用Sites projectは `appgprj_6ad6e84462b88191af122b3b9a9869b0`、予定URLは `https://wage-tax-rule-check.takatrp0222.chatgpt.site` です。一般公開への設定変更は、対象・影響を説明した後のユーザー明示承認に基づき反映済みです。配備・到達性・実際の公式取得の確認結果はDEPLOYMENT.mdに記録します。

## 公開境界

- `POST /api/check`：`Origin: https://takatrp.github.io` と空本文のみ。11本の固定URLを毎回取得し、検証済みルールの指紋と照合します。結果はno-storeです。任意URL・query・給与JSON・stream本文を拒否します。
- `OPTIONS /api/check`：上記OriginだけにPOST用CORSを返します。Cookie・Authorization・CORS credentialsは使いません。
- `GET /health`：実装版・コード指紋とpayrollAccepted=falseを返します。公式資料の取得や最新性の証明には使いません。

許可Originはブラウザ内の制限であり、認証や第三者のHTTP呼出防止ではありません。isolate内の同時確認を429で抑えますが、分散した総呼出数は制御しません。新規キー・OAuth・課金を勝手に設定せず、継続運用にはSites側の利用枠・運用担当・レビュー更新担当を確認する必要があります。プラットフォーム側の通常アクセスログにはIP等が残り得ます。アプリコードは給与・案件データを収集・記録しません。

取得成功を法改正反映済みと扱いません。本文変更・取得失敗・未対応年度・レビュー期限切れ・版不一致は対象機能を停止します。公式サイト側でこの配備元を遮断する場合も停止し、取得経路の偽装や過去の成功結果で代替しません。
