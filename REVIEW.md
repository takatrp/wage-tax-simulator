# 賃上げ促進税制シミュレーター — 独立レビューへの引渡し

manifestの承認対象はsmeR6・smeR8・forecastMethodの3機能のみです。他機能は未承認です。AIによる独立コード・公表資料照合に基づく計画用概算で、申告用監査保証ではありません。税務仕様の最終承認と出典照合の承認は、コードの独立レビューと分離します。架空のapproved fixtureはテスト専用です。

## 確認箇所

| 対象 | ファイル | 要確認 |
|---|---|---|
| 年度・依存出典 | public/rules.mjs | R6/R8境界、2024中小定義、機能別開始日範囲 |
| 計算 | public/calc.mjs | 補塡/助成金、全給与と継続の分離、資格、認定、当期優先20%上限、旧中小繰越と中堅/全企業の併用 |
| 年間見込 | public/forecast.mjs・case.mjs | 完了月、賞与別処理、補正、既知不充足維持、入力した年末額と仮定、短期決算非対応 |
| CSV・状態 | public/csv.mjs・fields.mjs | 両年度属性、mode/期間、unknown停止、式/文字コード、旧条件リセット、保存復元 |
| 確認ゲート | lib/freshness.mjs・public/verification.mjs・workflow.mjs | 取得成功≠承認、機能別依存、差分・期限・時刻逆行・年度停止、計算呼出し0回 |
| UI・API | public/app.mjs・server.mjs | 印刷無効化、非送信、Host/Origin、公開範囲、エスケープ |
| 期待値 | test/*.test.mjs | テスト期待値自体を一次資料と独立照合 |

## 承認手順

1. 税務担当者が機能ごとに対象開始日と根拠資料を読み、法定端数・経過措置・例外・繰越併用等の仕様を承認します。
2. 最終コードでnode scripts/prepare-review.mjsとnode scripts/capture-sources.mjsを実行し、失敗資料・本文指紋・コード指紋を確認します。
3. review-manifest.jsonのruleVersionとcodeHash、およびfeatures[id]のstatus、reviewer、reviewedAt、validUntil、coverage.from/through、fingerprintsをレビュー者の判断で設定します。日時はUTC ISO、開始日期間はその機能の実装範囲内です。取得・コードが一致しても自動承認しません。
4. 再起動し、承認された機能だけが計算可能になること、差分や失敗で対象機能と旧印刷が止まることを確認します。

取得不能資料を必要とする機能はpendingのままです。独立した基本機能を承認する場合は、その根拠と範囲を明示します。公式URL変更時は固定リスト・ルール版・コードを更新して再レビューします。

## 残る範囲制限

法定端数の各段階は未確定。繰越は申告明細で確認済み有効残高方式です。90%総額配分、組織再編、複雑な通算、短期・変則年度、特例法人、未対応年度の繰越のみの計算は対象外です。予測は月初開始の12か月年度・集計CSVのみで、全期間要件を確定しません。

独立コードレビューで修正した指摘と証拠はCHANGELOG-REVIEW.md、最新テスト数とコード指紋はoutput/verification.jsonに記録しています。公開Chrome実画面で架空CSVの実ファイル選択・25列マッピング・反映・資格初期化と、実績・年間見込・保存復元・印刷サマリー生成・未確認時停止を確認済みです。詳細はDEPLOYMENT.mdとverification/を参照。

