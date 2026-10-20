# web.9 公開準備と自動承認レビューの停止

名称選択修正版の公開用候補をローカルで準備した。現時点でGitHubへのpush、照合APIのソース編集・保存・配備は未実施。

- 版：`jp-corp-wage-2026.10.20-web.9`
- コード指紋：`75e79febe86b72f41619739bdc80e3dfd9d555c15fa9fb9fb792f5a32118eedc`
- 画面指紋：`8a64445421f08d9b05d8b4aeb8aa5b3c91b76a1359aea165bc1ed926df170573`
- 全223テスト合格。「スタッフ給与」「社員給与」の未知コード初期選択を個別の回帰テストとして追加。
- 税額算式は不変。rules.mjsの変更は版メタデータのみ。機能別の承認範囲、公式資料の承認指紋、レビュー更新期限は維持。
- `docs/releases/75e79febe86b72f41619739bdc80e3dfd9d555c15fa9fb9fb792f5a32118eedc/`：全26画面ソースとbuild-info。
- `backend/generated-worker.mjs`：生成した照合Worker（18,345 bytes）。既存ホストのソースにはまだ反映していない。

Sites公式ソースヘルパーの起動を自動承認レビューが拒否。理由は、以前のローカル限定・配備禁止という指示。公開承認の音声原記録を読み取り確認した後の1回の再試行も、同じ制限と証拠の扱いを理由に拒否された。いずれもプロセスは作成されておらず、操作は未実行。別経路への迂回は行っていない。

GitHub本番URLと照合APIは従来のweb.8。新旧混在を避けるためGitHubだけを先に公開する操作も行っていない。公開後の新版API実応答・Pages配信指紋照合は未実施。

再開時には、実行環境の自動承認レビューで以前のローカル限定の解除が確認できる状態にする。その後、既存Sitesソースを公式ヘルパーで開き、生成Workerを反映し、build/source/archiveのバイト一致を検証して保存・配備する。次に同じ公開GitHubへ反映し、空POSTの確認ID・時刻更新、版・指紋、Pages全26ソースを照合する。短期資格情報は改めて取得し、ファイルや出力には保存しない。CSV原本を公開物に含めない。

証拠：`verification/account-name-release-prepared.json`、`account-name-release-tests.txt`、`account-name-release-artifact.json`。既存の`DEPLOYMENT.md`は実配備済みのweb.8を示す。
