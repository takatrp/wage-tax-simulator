# 公開状況 — 2026-10-20 UTC

## 成功済み

- 新規公開リポジトリ：https://github.com/takatrp/wage-tax-simulator
- GitHub Pages：https://takatrp.github.io/wage-tax-simulator/
- 初回GitHub commit：`1f5a998064335349b30c24afbc879df973ebb885`。Pages buildはbuilt。2026-10-20T04:29:19Zに入口・14ソース・JavaScript MIME・承認済み画面指紋の一致を実配信で確認。
- 専用API：https://wage-tax-rule-check.takatrp0222.chatgpt.site
- Sites project：`appgprj_6ad6e84462b88191af122b3b9a9869b0`、public。saved version：`appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_2ae643832e5c81919771aa394bcc8c72`。
- 初回deployment：`appgdep_6ad6ed5236ec819185f3ea05f125b8b4`、succeeded、2026-10-20T04:26:00Z。source commit：`293e61f4721158fa02257ec7251fc46e228232b4`。
- 実APIのhealth 200、Pages OriginのOPTIONS 204と資格情報を使わないCORS応答を確認。新規APIキー・OAuth・課金契約・既存ポータル変更なし。

## 修正版の配備と検証

初回APIは配信基盤が空POSTを空ReadableStreamへ変換するため400で停止した。公開画面でも「要確認」と印刷disabledを確認。空本文をEOFまで検証する修正版を同じSiteへ配備した。

- 現在のsaved version：`appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_2cb07f6081cc8191ae6ff504a3b27c6f`（version2）。
- 現在のdeployment：`appgdep_6ad6f007dda88191964827a084e9507b`、succeeded、2026-10-20T04:37:33Z。
- source commit：`e82c5fe6bb58d703afc9d9b1e478f5bf39dc25a6`。

修正版は最終109テスト成功。独立したHTTP/鮮度レビューの関連36テストと、生成Workerの共有checkOfficial全出力一致も成功。P1/P2残なし。税務計算とCSV本体は限定版3から不変で、既存3機能の限定承認を維持。

- 最終ローカル実装指紋：`5dba6d22d41302ac01a018f2f0eec9dbd11f69e7e61f6e46fd26e7965da1cc5e`
- 画面指紋：`1619281bcf44e147467d0620c590562e958c3fe2b08e13e41e6e8cffb12f331e`
- 初回公開版の実装指紋：`cd87d9a9f392a78dbd1ecec866583663d927f76e01e683d25e99f134634e39c8`

修正版の公式Sitesヘルパー起動は一度自動承認レビューに拒否されたが、同じSiteへの修正再配備を含む承認証拠の再提示後、一度の再試行で成功した。別ルートへの回避や公開範囲の拡大は行っていない。

実APIの空POST・公式指紋の再確認、最終Pages成果物のpush、実画面のCSV・試算・印刷を検証中。Sitesのpublic・対象ID・同じ実URLを再配備前に読み取りで確認した。

ローカルの証跡はoutput/verification.json（109件）、output/test-report.txt、output/live-pages.json。output/runtimeには給与データを置いておらず、GitHubにも含めない。
