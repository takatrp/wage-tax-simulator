import { validDate } from './rules.mjs';
import { amount } from './calc.mjs';
export const GROUPS = [
 {title:'事業年度と基本要件',hint:'開始日で制度を選択します。初版は両年度12か月・組織再編なしが対象です。',fields:[
 ['mode','計算モード','mode','actual'],['company','案件名 / 法人名（任意）','text'],['start','対象年度 開始日','date','2026-04-01'],['end','対象年度 終了日','date','2027-03-31'],['prevStart','前事業年度 開始日','date','2025-04-01'],['prevEnd','前事業年度 終了日','date','2026-03-31'],
 ['standardDomesticCorp','通常の内国法人であり、受託法人・通算制度・特殊法人に該当しない','tri'],['blue','青色申告書を提出','tri'],['normalPeriod','設立・解散・清算・組織再編等の対象外年度ではない','tri'],['payrollReviewed','対象給与・補塡・比較額の根拠を確認済み','tri'],['specialLimitsReviewed','特定税額控除の不適用措置に該当せず、通算等・90%総額制限・他制度併用の調整も不要','tri']
 ]},
 {title:'法人の適用資格',hint:'各枠を独立して比較します。複数枠を同時に適用する計算はしません。',fields:[
 ['noCapital','資本または出資を有しない法人','tri'],['capital','期末の資本金・出資金（円）','money'],['headcount','期末の常用従業員数（人）','money'],['groupHeadcount','自己＋支配法人の常用従業員合計（人）','money'],
 ['smeOwnership','大規模法人による所有割合等の除外に該当しない','tri'],['smeIncome','過去3年平均所得15億円超等の適用除外に該当しない','tri'],['multiStakeholder','必要な場合のマルチステークホルダー方針の公表・届出受理・添付を確認済み','tri']
 ]},
 {title:'給与・補塡・法人税',hint:'円単位の整数。0円は「0」を入力してください。空欄を0にはしません。通常補塡額に雇用安定助成金を含めないでください。',fields:[
 ['grossCurrent','当期 全国内雇用者給与総額（円）','money'],['grossPrevious','前期 全国内雇用者給与総額（円）','money'],['reimburseCurrent','当期 通常の給与補塡額（円）','money'],['reimbursePrevious','前期 通常の給与補塡額（円）','money'],['subsidyCurrent','当期 雇用安定助成金（円）','money'],['subsidyPrevious','前期 雇用安定助成金（円）','money'],['corporateTax','調整前法人税額（円）','money'],['overlap','地方拠点強化税制等の控除基礎調整（円・通常0）','money'],
 ['continuousCurrent','当期 継続雇用者給与（通常補塡控除後・円）','money'],['continuousPrevious','前期 継続雇用者給与（通常補塡控除後・円）','money'],['continuousReviewed','両年度全月支給・一般被保険者・高齢継続雇用制度対象外等を確認済み','tri']
 ]},
 {title:'上乗せ要件',hint:'2026年4月1日以後開始年度は教育訓練費の上乗せがありません。認定は種類・時期・税制固有の要件を確認します。',fields:[
 ['trainingClaim','教育訓練費上乗せを検討する（旧年度のみ）','tri'],['trainingCurrent','当期 教育訓練費（補助金控除後・円）','money'],['trainingPrevious','比較教育訓練費（補助金控除後・円）','money'],['trainingReviewed','教育費の範囲・比較額・補助金・保存書類を確認済み','tri'],
 ['certType','認定の種類','cert'],['certDate','認定取得日','date'],['certValidAtEnd','期末時点で認定が有効','tri'],['certReviewed','段階・取得時期・経過措置等の税制要件を確認済み','tri']
 ]},
 {title:'中小企業向け制度の繰越利用',hint:'有効期限・残高・毎期の明細添付を申告書で確認した残高のみ入力します。当期の中小企業該当性と利用資格は別に判定します。初版は期限を自動推定しません。',fields:[
 ['carryBalance','有効な既存繰越残高（円・ない場合0）','money'],['carryReviewed','有効残高・期限・連続申告・当期利用資格を申告書で確認済み','tri']
 ]}
];
GROUPS.splice(1,0,{title:'着地予測の換算期間・賞与・年末見込',forecast:true,hint:'12か月事業年度の期中データを使う年間見込です。短期事業年度の法定換算ではありません。給与欄の当期額は累計、前期額は通年実績を入力してください。',fields:[
 ['observationStart','CSV・累計の集計開始日（対象年度の開始日）','date'],['observationEnd','CSV・累計の集計終了日（完了月末）','date'],['completedMonths','完了月数（1〜12。日付から確定できる場合は空欄可）','money'],['observedMonths','含まれる月一覧（任意：2026-04|2026-05|…）','text'],['forecastCoverageComplete','年度開始から欠落なく完了月がそろっている','tri'],['forecastPreviousAnnual','前期給与・前期補塡等は前期通年実績である','tri'],
 ['bonusSeparated','当期給与累計から賞与を分離できる（はいなら通常給与だけを給与欄へ）','tri'],['paidBonus','既払い賞与（分離できる場合・円）','money'],['plannedBonus','残期間の予定賞与（分離できる場合・円）','money'],['remainingRegular','残月の通常給与合計見込（任意。空欄は累計÷月数×残月）','money'],['annualAdjustment','年間給与の追加補正（円。減額はマイナス、補正なしは0）','signed'],['forecastSimpleAssumption','賞与を分離できない場合、単純換算の仮定と補正を確認した','tri'],['forecastAdjustmentBasis','補正・残月給与・通常補塡の年末見込の根拠','text'],
 ['forecastContinuousAssumed','継続雇用者の両年度全月要件等を満たす年末見込を仮定する','tri'],['forecastContinuousBasis','継続雇用者給与の通年見込・資格仮定の根拠','text'],['forecastSubsidyBasis','当期助成金の年末見込の根拠（なしの場合も明記）','text'],['forecastTrainingBasis','教育費の年末見込の根拠（旧年度で上乗せ検討時）','text'],['forecastTaxBasis','調整前法人税額の年末見込の根拠','text']
]});
export const FIELDS=GROUPS.flatMap(g=>g.fields);
export const CERTS=[['unknown','未確認'],['none','該当認定なし'],['kurumin','くるみん（税制対象の区分）'],['eruboshi2','えるぼし2段階'],['eruboshi3','えるぼし3段階'],['platinumKurumin','プラチナくるみん'],['platinumEruboshi','プラチナえるぼし']];
export function initialInput(){return Object.fromEntries(FIELDS.map(([key,,type,def])=>[key,def??(type==='tri'||type==='cert'?'unknown':'')]));}
export function validateSaved(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==1||!data.input||typeof data.input!=='object'||Array.isArray(data.input))throw new Error('対応する保存形式ではありません。schema=1の入力ファイルを指定してください。');
 if(Object.keys(data).some(k=>!['schema','savedAt','input','inputMethod'].includes(k)))throw new Error('保存データに未知の項目があります。確認状態や結果の復元はできません。');
 if(Object.hasOwn(data,'inputMethod')&&!['csv','manual'].includes(data.inputMethod))throw new Error('入力方法の保存値が不正です。');
 const allowed=new Set(FIELDS.map(f=>f[0]));if(Object.keys(data.input).some(k=>!allowed.has(k)))throw new Error('入力に未知の項目があります。');
 const out=initialInput();for(const [key,,type]of FIELDS){const v=Object.hasOwn(data.input,key)?data.input[key]:out[key];if(typeof v!=='string'||v.length>500)throw new Error(`保存項目 ${key} が不正です。`);if(type==='mode'&&!['actual','forecast'].includes(v))throw new Error('計算モードが不正です。');if(type==='tri'&&!['yes','no','unknown'].includes(v))throw new Error(`${key} の選択値が不正です。`);if(type==='cert'&&!CERTS.some(c=>c[0]===v))throw new Error('認定種別が不正です。');if(type==='date'&&v!==''&&!validDate(v))throw new Error(`${key} の日付が不正です。`);if(type==='money'&&v!=='')amount(v,key);if(type==='signed'&&v!==''&&!/^-?(0|[1-9]\d*)$/.test(v.trim()))throw new Error(`${key} の補正額が不正です。`);out[key]=v;}return out;
}
export function mergeCsvInput(previous,imported,kind){if(imported.mode&&imported.mode!==previous.mode)throw new Error('CSVの通年/期中区分と画面の計算モードが一致しません。計算モードを選び直してください。');const next=initialInput();next.mode=previous.mode;if(kind==='employee')for(const key of ['start','end','prevStart','prevEnd'])next[key]=previous[key];return {...next,...imported,payrollReviewed:'unknown',continuousReviewed:'unknown'};}
