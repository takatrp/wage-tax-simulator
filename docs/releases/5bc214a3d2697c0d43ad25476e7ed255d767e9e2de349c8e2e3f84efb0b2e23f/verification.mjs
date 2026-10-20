import {FEATURES,RULE_VERSION,baseFeature,selectRules,validDate}from'./rules.mjs';
export const RECEIPT_TTL_MS=15*60*1000;
export function receiptMatchesBuild(check,expectedHash,expectedClientHash){return typeof expectedHash==='string'&&/^[a-f0-9]{64}$/.test(expectedHash)&&/^[a-f0-9]{64}$/.test(expectedClientHash??'')&&check?.ruleVersion===RULE_VERSION&&check?.codeHash===expectedHash&&check?.clientHash===expectedClientHash;}
export function caseScopeIssues(input,frame){const conditions=FEATURES[baseFeature(frame,input.start)]?.inputConditions??{},issues=[];if(input.standardDomesticCorp!=='yes')issues.push('通常の内国法人であり、受託法人・通算制度・特殊法人に該当しないことを確認してください。');for(const[key,expected]of Object.entries(conditions)){const value=String(input[key]??'').trim();if(value!==expected)issues.push(({certType:'この基本試算は認定加算なし（認定の種類＝該当認定なし）に限定します。',carryBalance:'この基本試算は既存繰越残高0円に限定します。繰越利用は未確認です。',trainingClaim:'この旧年度の基本試算は教育訓練費上乗せを検討しない場合に限定します。'})[key]);}return issues;}
export function featureState(check,id,start,clock){
 const feature=FEATURES[id],result=check?.features?.[id];
 const fail=reason=>({ready:false,reason});
 if(!feature||!validDate(start)||start<feature.from||start>feature.through)return fail('対象開始日の機能を未対応');
 if(!check||check.ruleVersion!==RULE_VERSION||!result?.ready)return fail(result?.reasons?.[0]??'公式取得・ルールレビューの確認待ち');
 const {nowWall,nowMono,receivedWall,receivedMono}=clock??{};
 if(![nowWall,nowMono,receivedWall,receivedMono].every(Number.isFinite)||nowWall<receivedWall-1000||nowMono<receivedMono)return fail('端末時刻の変更または確認記録の不正');
 const checked=Date.parse(check.checkedAt),expires=Date.parse(check.expiresAt),reviewExpires=Date.parse(result.validUntil);
 if(![checked,expires,reviewExpires].every(Number.isFinite)||checked>receivedWall+60000||expires<=checked||expires-checked>RECEIPT_TTL_MS)return fail('確認日時または期限が不正');
 const elapsed=Math.max(nowMono-receivedMono,nowWall-receivedWall);
 if(elapsed>=Math.min(RECEIPT_TTL_MS,expires-checked,expires-receivedWall))return fail('公式確認の期限切れ');
 if(elapsed>=reviewExpires-Math.max(receivedWall,checked))return fail('ルールレビューの期限切れ');
 if(!result.coverage||start<result.coverage.from||start>result.coverage.through)return fail('承認したルールの対象年度外');
 return {ready:true,reason:'限定した依存資料・実装版・レビュー期限の照合済み'};
}
export function requiredFeatures(input,frame,certificateUsed=false){
 const base=baseFeature(frame,input.start);if(!base)return[];const ids=[base],suffix={sme:'Sme',mid:'Mid',all:'All'}[frame];
 if(selectRules(input.start)?.training&&input.trainingClaim==='yes')ids.push('training'+suffix);
 if(certificateUsed)ids.push('cert'+suffix);
 if(input.mode==='forecast')ids.push('forecastMethod');
 const carry=String(input.carryBalance??'').trim();if(/^\d+$/.test(carry)&&BigInt(carry)>0n)ids.push('carrySme');
 return ids;
}
