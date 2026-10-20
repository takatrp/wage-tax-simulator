# 現在の配備 — web.10（2026-10-21）

公開ツール：https://takatrp.github.io/wage-tax-simulator/
制度確認API：https://wage-tax-rule-check.takatrp0222.chatgpt.site

名称候補だけを先に表示し、他科目は明示追加する方式へ修正しました。科目選択・区分・期間変更から通常給与累計、別表示の年換算額、賞与、前年通年額、概算へ自動反映します。再集計・概算ボタンと金額の再転記は不要です。仕様・原因と実額表は [AUTO-PAYROLL.md](AUTO-PAYROLL.md)。

全247件合格（今回追加24件）、独立UIレビュー15件に重大な未解消所見なし。ローカルと公開Chromeで、候補のみ表示→解除→賞与再分類→他科目追加→完了月変更→全解除の保留→再取込→既知0円を確認しました。同じCSVの再選択時にchangeが発火しない問題も実機で発見して修正・回帰済みです。旧223件ではボタン操作後の集計を主に検証し、今回の自動反映を確認できていませんでした。

架空例：通常給与累計750,000円・年換算1,500,000円・既払賞与20,000円から年間見込1,520,000円、控除目安96,000円。スタッフ給与解除で累計600,000円・年換算1,200,000円・年間見込1,220,000円・控除目安3,000円へ自動更新。同科目の賞与変更では既払賞与170,000円・年間見込1,370,000円・控除目安51,000円。前年通年1,200,000円を用いた上限前の例で、法人税額1,000,000円を入力した上限200,000円内でも96,000円を確認しました。

実装commit：1e734891041368ef2adedbd0ef3c14b736a3b2e5
実装版：jp-corp-wage-2026.10.21-web.10
コード指紋：860c832c71c37bb8772b3f37d8024dcd4cf5581fe9a544f277cde61b17fc9c24
画面指紋：88dd4b84e8a364e20074d29d3fc86d0bbb1c499301d1a71602f535b1141294e5
API source：414301d9ea8cf6b4e06fe561c73aad09cdba7be8
Sites保存版11：appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_8663972e15148191ab9279c75e5098ac
配備：appgdep_6ad7fe3cc394819193b9274c173cb448（succeeded、2026-10-20T23:50:25.930125+00:00）

空POST 2026-10-20T23:53:16.322Z と 2026-10-20T23:53:17.685Z で確認ID・日時が更新。公式本文の固定承認指紋、4機能の限定ready、未対応年度停止、CORS/no-storeを確認しました。Pages全26ソースとbuild-infoが承認版に一致。公開ブラウザー検証 2026-10-20T23:55:08.304Z。画面の公式確認日時は2026-10-20T23:53:45.910Z、web.10と対象年度・適用範囲を確認しました。利用時は毎回確認し直します。

税額計算本体・出典承認指紋・対象年度・機能別承認範囲・レビュー期限は不変。期間未確定、欠落月、区分未定、全解除、重複未確認、取得失敗、変更疑い、期限切れは保留します。CSV原本・給与・社名・認証情報は公開せず、既存の公開範囲と同じURLを維持しました。新APIキー・OAuth・秘密設定は作成していません。原本CSVのバイト互換性は未検証、経営判断用の条件付き概算で申告確定額ではありません。

証拠：verification/auto-payroll-release-tests.txt、auto-payroll-release-prepared.json、auto-payroll-api-artifact.json、auto-payroll-deployment.json、auto-payroll-live-api.json、auto-payroll-live-pages.json、auto-payroll-live-browser.json、auto-payroll-live-ui.png。ローカルのブラウザーは閉じ、検証サーバーを停止しました。公開ブラウザーも検証を終了し、CSVなしの利用開始画面を残しました。公開作業の承認待ち・未解決阻害はありません。

---

# web.9 配備記録（2026-10-20）

公開ツール：https://takatrp.github.io/wage-tax-simulator/
制度確認API：https://wage-tax-rule-check.takatrp0222.chatgpt.site

名称から給与科目を候補選択し、チェックで追加・解除する修正版を公開しました。科目名・コード・部門・資料・当期/前年金額を表示します。曖昧な名称は未選択、追加時に通常給与/賞与の指定が必要です。役員・福利費・外注等は初期選択しません。

全223テスト成功、独立レビュー10件成功。公開Chromeで「スタッフ給与」「社員給与」の未知コード初期選択、36行の架空CSVから当期18,000円・前年34,200円、社員給与を外すと6,000円・11,400円、旧結果/印刷失効を確認。公式照合後の年間見込36,000円・条件付き基本控除の目安540円（税額上限前）を確認しました。原本CSVのバイト互換性は未検証です。

実装commit：79e5710fa99d01a1002a898344e5e82343ec8a47
実装版：jp-corp-wage-2026.10.20-web.9
コード指紋：75e79febe86b72f41619739bdc80e3dfd9d555c15fa9fb9fb792f5a32118eedc
画面指紋：8a64445421f08d9b05d8b4aeb8aa5b3c91b76a1359aea165bc1ed926df170573
API source：1088a921f642bdb699a0681c1ca9c3c794053724
Sites保存版10：appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_3b03301202e081919b27e3045aad7b7d
配備：appgdep_6ad77306bf448191b101a1ea6d9dc507（succeeded、2026-10-20T13:56:28.474241+00:00）

13:58:23.986Zと13:58:24.236Zの空POSTで別ID・日時を確認。quickEstimate/smeR6/smeR8/forecastMethodの4機能が限定ready。Pages全26ソース・版・両指紋が承認版と一致。実画面もweb.9と公式取得試行日時14:01:29.705Zを確認。確認済みはその時点の結果で、利用時は毎回取得し直します。

税額算式・出典の承認指紋・適用範囲・レビュー更新期限は不変です。変更疑い・取得失敗・期限切れ・未対応年度の停止を維持します。CSV原本・給与・社名・認証情報は公開物と確認APIに含めていません。検証CSVと画面の金額は全て架空です。

以前の自動承認レビュー停止は、今回のチャットでの明示解除後に解消。公式パッケージャーは既存Git BashのPATHとTAR_OPTIONS=--force-localを当該プロセスだけ補い、ソース・コミット・ビルド・アーカイブのバイト一致を確認しました。公開作業の承認待ちはありません。

証拠：verification/account-name-deployment.json、account-name-api-artifact.json、account-name-live-api.json、account-name-live-pages.json、account-name-live-browser.json、account-name-live-ui.png。

---

# web.8 配備記録（2026-10-20 11:52 UTC）

公開ツール：https://takatrp.github.io/wage-tax-simulator/
照合API：https://wage-tax-rule-check.takatrp0222.chatgpt.site

空伝票番号・番号列欠落の警告付き保持と、大量FX CSVのブラウザWorker取込を公開しました。1件100,000行・20MiB、全体200,000行・40MiB・最大8件。全208テスト成功、独立レビューに未解決所見なし。実Chromeで50,001/100,000行の集計一致、100,001行停止、取消・同じファイル再選択、CP932を確認。原本のバイト互換性は未検証です。

実装commit：90ff0f414b2b5ff1ad54496bb5b8838f0fb15d54
実装版：jp-corp-wage-2026.10.20-web.8
コード指紋：2a26b6c01647c80a6c20955b5ade50ae7292f27a0adbfc9d1d70aca81a03b5f5
画面指紋：cb1d51eadb8e59ce0bba9aa2792d64acbb87052026c0551913a7b5f31a2fe6bc
API source：99b3409220725349cb6020653928a5b32d91d2e0
保存版9：appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_6457cc88f44c81918d67ec18da580130
配備：appgdep_6ad755b7ead08191844bf8ab82900ada（succeeded）

11:51:48Zの実応答で2回の空POSTのID・確認時刻更新、web.8の指紋、4つの限定承認機能を確認。Pages全25ソースが承認指紋と一致。実Chromeでもweb.8と公式確認時刻、限定照合の表示を確認しました。

税額算式、制度の限定承認範囲、公式資料の承認指紋、レビュー更新期限を拡張していません。機能別の変更疑い・取得失敗・期限切れ・未対応年度の停止を維持します。元CSV・社名・給与・認証情報は公開物に含めず、確認APIへ送信しません。

公開pushは一度自動審査で拒否されましたが、既存GitHub/API公開と同じ公開先への修正承認の原文を追加確認し、再試行が許可され成功しました。未実行・承認待ちの配備はありません。

証拠：verification/large-import-tests.txt、large-import-independent-review.json、large-import-performance.json、large-import-artifact.json、large-import-deployment.json、large-import-live-api.json、large-import-live-pages.json。

---

# 過去の配備記録

本番公開と検証は完了。承認待ち・実行中の配備はありません。対象は計画用に限定承認した中小基本計算と年間見込です。申告用の確定計算・監査保証ではありません。

- 公開ツール：https://takatrp.github.io/wage-tax-simulator/
- ソース：https://github.com/takatrp/wage-tax-simulator
- 照合API：https://wage-tax-rule-check.takatrp0222.chatgpt.site
- 確認した実装commit：95206679d2456927c25b8a94c78575b32ef38891
- 実装版：jp-corp-wage-2026.10.20-web.4
- 実装指紋：483908722340fe0b14a782d4c87a52b0e8064da5332e13ce330b669bd5e47f5c
- 画面指紋：1619281bcf44e147467d0620c590562e958c3fe2b08e13e41e6e8cffb12f331e

## 現在の配備

Sites project：appgprj_6ad6e84462b88191af122b3b9a9869b0、public、version4。
Saved version：appgprj_6ad6e84462b88191af122b3b9a9869b0~appgver_4d7a7d43b4e48191a5b7a2a3fec0c3d8。
Deployment：appgdep_6ad6f4c99ac48191944a4ddb31b67aed、succeeded、2026-10-20T04:57:51Z。
Source commit：7428d2d4ca5f79567a8fd318f21da7ecec0af0ca。

承認証拠の再提示で自動審査の停止を解消し、同じ公開先・同じ公開範囲で公式手順を完了しました。初回配備の空stream互換性、Workersのredirect:error未実装、no-storeとTTLの設定競合を修正済みです。転送先を追わず、取得失敗や不正本文を成功扱いする変更は行っていません。

## 実環境の証拠

2026-10-20T04:58:09Zの空POSTを2回実行し、確認ID・確認日時が毎回更新。7/11公式資料を取得し、承認済みの国税庁3資料の指紋が一致。smeR6・smeR8・forecastMethodのみ有効。経産省等4資料はHTTP403で、関連未承認機能を解除していません。

health 200、Pages OriginのOPTIONS 204、CORS資格情報なし、no-store、不正Origin403、非空本文400、任意URL query404を実確認。給与・社名・CSV・対象年度は確認APIへ送りません。

2026-10-20T04:58:23ZにPagesの入口・14ソース・JavaScript MIME・画面指紋・実装指紋を実配信で確認しました。全ESMとCSSは同じ実装指紋のreleaseディレクトリに固定。旧版の混在や新旧API不一致は停止します。

Chrome実画面で以下を確認しました。

- 自作の架空UTF-8集計CSVを実ファイル選択で読込。1行・25列をマッピングし、当期給与103,000,000円・前期100,000,000円・法人税2,000,000円を反映。法人資格はunknownに初期化し、ファイル選択値とマッピングを消去。
- 通年実績：控除率30%、理論900,000円、当期400,000円、当期未控除500,000円。
- 年間見込：通常給与累計50,000,000円÷6月×12月＋既払い賞与3,000,000円＋予定賞与2,000,000円−補正1,000,000円＝104,000,000円。理論1,200,000円、当期400,000円、当期未控除800,000円。
- 印刷サマリーDOMに金額・式・仮定・根拠・公式出典・確認日時・機能レビューを生成。実際の紙出力やプリンタ設定の検証ではありません。
- 入力変更で旧印刷を消去。保存入力の復元は旧結果を戻さず公式情報を再取得。通常の内国法人条件unknownでは金額表示・印刷を停止。検証用の端末保存は削除済み。

## テスト・適用範囲

全110テスト成功。独立レビューでは税務計算・CSV・入力条件・workflowが限定版3と同じことを確認。公開・鮮度境界は旧cache混在、空stream、異常本文、転送非追従、no-store方式を独立検証しP1/P2残なし。最後のno-store変更は関連28件成功と3空POST・33固定GETの独立fixtureで確認。

smeR6は2025-04-01〜2026-03-31開始、smeR8は2026-04-01〜2027-03-31開始、forecastMethodは2025-04-01〜2027-03-31開始。通常の内国法人・非受託・非通算・特殊法人なし、認定加算なし、既存繰越0円、旧年度の教育加算なしに限定します。2024年度・中堅・全企業・加算・繰越利用は未承認です。

レビュー更新期限2026-11-20は法的な制度有効期限ではありません。指紋一致は別ページの改正告知や法令全体の網羅性を保証しません。申告別表の法定端数・例外・他制度配分は別途確認が必要です。新規APIキー・OAuth・課金契約・既存ポータル変更はありません。Sitesの将来の利用枠・運用担当・レビュー更新担当は継続管理が必要です。

verification/のJSONとtest-report.txtは今回の過去の検証記録です。利用時の最新確認証明には使いません。アプリは毎回公開APIから取得し直します。


## FX仕訳取込・CSV優先入口（web.5）

CSVを初期入口に変更。FX仕訳の複数資料、全科目分類、行列の根拠、借貸相殺、期間/重複/月不足検査、調整と年間見込連携を追加しました。原本バイト互換性は未検証の試行対応です。公開fixtureは全て合成。

135件の最終回帰が成功。CSV独立レビュー40件＋重複12ケース、税務81件＋独立100ケースで未修正P1/P2なし。既存のsmeR6/smeR8/forecastMethodの限定範囲・出典指紋・期限を維持し、最終コード 5bc214a3d2697c0d43ad25476e7ed255d767e9e2de349c8e2e3f84efb0b2e23f、画面 31623e22e9deeb916964b34658e12e96f53c87b5a5f2391d010274b835b32feb へ再結合しました。

実ブラウザは初期CSV入口を確認後、ファイル選択中に接続断。復帰後も操作ツールが状態取得でタイムアウトし、最終ファイル選択・モバイル表示・リセットの実画面検証は未完了です。実ハンドラーの合成DOM・状態回帰と配信検証を区別します。


## web.5 公開確認（2026-10-20 08:19 UTC）

GitHub実装commit `03bbcae`、バックエンドsource `13e188d`、Sites保存版6の配備が成功しました。APIの空POSTを08:19:29Zと08:19:31Zに確認し、別々の確認ID・日時、web.5と承認指紋、中小R6/R8・予測の限定readyを確認。Pagesの17画面ソースも全て画面指紋と一致しました。

旧distを含む保存版5の再配備は自動承認レビューで拒否され、実行していません。ビルドとソースのバイト一致ガードを追加した新commitから再ビルドし、保存版6を配備しました。ガードは旧ビルド拒否・正しいビルド受理の2ケースを確認。

実ブラウザの最終ファイル選択・モバイル・リセットは、同じChromeの状態取得/タブ取得がタイムアウトするため未検証。承認待ちではありません。合成DOMの実ハンドラー検証と配信バイト検証を実画面検証と混同しません。原本バイトも未検証です。詳細はverification/fx-deployment.json、fx-live-api.json、fx-live-pages.jsonを参照。
