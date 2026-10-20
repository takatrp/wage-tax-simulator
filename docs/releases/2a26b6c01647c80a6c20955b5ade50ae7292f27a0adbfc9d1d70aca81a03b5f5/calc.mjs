import { RULE_VERSION, selectRules, validDate, FRAME_NAMES } from './rules.mjs';
export const MAX_AMOUNT = 999999999999999n;
export function amount(v, label = '金額') {
  const s = String(v ?? '').trim();
  if (!/^(0|[1-9]\d*)$/.test(s)) throw new Error(`${label}は0以上の整数（円）で入力してください。空欄・負数・式・指数・小数は使えません。`);
  const n=BigInt(s); if(n>MAX_AMOUNT) throw new Error(`${label}が入力上限を超えています。`); return n;
}
const min=(a,b)=>a<b?a:b, max=(a,b)=>a>b?a:b;
export function reaches(current, previous, basisPoints) { return previous>0n && (current-previous)*10000n >= previous*BigInt(basisPoints); }
export function rateFor(current,previous,levels) { let rate=0; for(const [bp,pct] of levels??[]) if(reaches(current,previous,bp)) rate=pct; return rate; }
export function annualPair(start,end) {
  if(!validDate(start)||!validDate(end)||start>end) return false;
  const d=new Date(start+'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear()+1); d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10)===end;
}
export function carryPreview(balance,capacity,canUse) {const n=amount(balance,'有効繰越残高');const used=canUse?min(n,capacity):0n;return {balance:String(n),used:String(used),remaining:String(n-used),expiry:'申告明細で確認した有効残高。期限の自動推定は行っていません。'};}
export function certification(input,frame){
  const type=input.certType;
  if(type==='none')return 'no';
  if(!type||type==='unknown'||input.certReviewed!=='yes')return 'unknown';
  if(!validDate(input.certDate)||input.certDate>input.end)return 'unknown';
  if(type==='platinumKurumin'||type==='platinumEruboshi')return ['yes','no'].includes(input.certValidAtEnd)?input.certValidAtEnd:'unknown';
  if(!['kurumin','eruboshi2','eruboshi3'].includes(type))return 'unknown';
  if(input.certDate<input.start)return 'no';
  if(frame==='all')return 'no';
  if(frame==='mid'&&type!=='eruboshi3')return 'no';
  if(input.certValidAtEnd!=='yes')return input.certValidAtEnd==='no'?'no':'unknown';
  return 'yes';
}
export function calculate(input) {
  const issues=[], steps=[];
  if(input.standardDomesticCorp!=='yes')return {version:RULE_VERSION,issues:['初版の対象は通常の内国法人で、受託法人・通算制度・特殊法人に該当しない場合です。法人範囲が未確認または対象外のため計算を停止します。'],frames:[],steps,stopped:true};
  const add=(message)=>{if(!issues.includes(message))issues.push(message);};
  if(!validDate(input.start)||!validDate(input.end)||input.start>input.end) return {version:RULE_VERSION,issues:['対象事業年度の日付が不正です。'],frames:[],steps};
  const rule=selectRules(input.start);
  for(const key of ['capital','headcount','groupHeadcount','trainingCurrent','trainingPrevious','carryBalance'])if(input[key]!==''&&input[key]!==undefined){try{amount(input[key],key);}catch(e){add(e.message);}}
  if(input.noCapital==='yes'&&input.capital&&/^\d+$/.test(input.capital.trim())&&BigInt(input.capital.trim())>0n)add('無資本法人の選択と正の資本金が矛盾しています。資本金を空欄または0にしてください。');
  if(!rule) add('新規控除発生は未対応の開始日です。2024-04-01〜2027-03-31のみを実装。延長を仮定しません。');
  if(!annualPair(input.start,input.end)) add('短期・変則事業年度は未対応です。月数換算を税理士が確認してください。');
  if(!annualPair(input.prevStart,input.prevEnd) || (validDate(input.prevEnd)&&new Date(Date.parse(input.prevEnd)+86400000).toISOString().slice(0,10)!==input.start)) add('前期は直前の12か月事業年度を指定してください。短期・変則・組織再編の計算は要確認です。');
  if(issues.length)return {version:RULE_VERSION,rule,issues,frames:[],steps,stopped:true};
  if(input.specialLimitsReviewed!=='yes'||input.normalPeriod!=='yes')return {version:RULE_VERSION,rule,issues:['対象外年度・組織再編・複雑な通算・90%総額制限・他制度調整の要否を確認するまで計算を停止します。'],frames:[],steps,stopped:true};
  const flags=['blue','normalPeriod','payrollReviewed','specialLimitsReviewed'];
  const names={blue:'青色申告',normalPeriod:'設立・解散・清算・組織再編等の対象外年度でないこと',payrollReviewed:'対象給与・補塡額・比較額の集計根拠',specialLimitsReviewed:'特別税額控除の適用制限・他制度との調整'};
  let commonExcluded=false;
  for(const f of flags) { if(input[f]==='unknown'||!input[f])add(`${names[f]}が未確認です。`); else if(input[f]==='no') { if(f==='blue'||f==='normalPeriod')commonExcluded=true; else add(`${names[f]}を確認・補正してください。`); } else if(input[f]!=='yes') add(`${names[f]}の選択値が不正です。`); }
  let n={};
  const numeric=['grossCurrent','grossPrevious','reimburseCurrent','reimbursePrevious','subsidyCurrent','subsidyPrevious','overlap','corporateTax'];
  try { for(const f of numeric)n[f]=amount(input[f],f); } catch(e){add(e.message);return {version:RULE_VERSION,rule,issues,frames:[],steps};}
  if(n.overlap>0n)return {version:RULE_VERSION,rule,issues:['旧雇用促進税制・地方拠点強化税制等との併用調整額があるため、初版は計算停止します。専門確認が必要です。'],frames:[],steps,stopped:true};
  const cur=n.grossCurrent-n.reimburseCurrent, prev=n.grossPrevious-n.reimbursePrevious;
  if(cur<0n||prev<0n||n.subsidyCurrent>cur||n.subsidyPrevious>prev) {add('補塡額・雇用安定助成金が給与額を超えています。');return {version:RULE_VERSION,rule,issues,frames:[],steps};}
  const delta=cur-prev, adjusted=(cur-n.subsidyCurrent)-(prev-n.subsidyPrevious);
  const base=max(0n,min(delta,adjusted)-n.overlap), cap=n.corporateTax*20n/100n;
  steps.push(`全国内雇用者 当期 ${cur}円 = 給与 ${n.grossCurrent}円 − 通常補塡 ${n.reimburseCurrent}円（雇用安定助成金はここで控除しない）`);
  steps.push(`全国内雇用者 比較 ${prev}円 = 給与 ${n.grossPrevious}円 − 通常補塡 ${n.reimbursePrevious}円`);
  steps.push(`給与増加額 ${delta}円 / 助成金控除後の調整増加額 ${adjusted}円`);
  steps.push(`控除基礎 ${base}円 = max(0, min(${delta}, ${adjusted}) − 地方拠点強化税制等の調整 ${n.overlap})`);
  steps.push(`共通上限 ${cap}円 = 調整前法人税額 ${n.corporateTax}円 × 20%（1円未満切捨ての試算）`);
  const frames=[];
  for(const frame of ['sme','mid','all']) {
    const pending=[...issues], reasons=[];
    const q=m=>{if(!pending.includes(m))pending.push(m);};
    let excluded=commonExcluded||!rule||(frame==='all'&&!rule?.all), c=cur,p=prev;
    const requireFlag=(key,label)=>{if(input[key]==='no')excluded=true;else if(input[key]!=='yes')q(`${label}が要確認です。`);};
    let capital=null, headcount=null;
    try {if(input.noCapital==='yes')capital=0n;else if(input.capital!=='')capital=amount(input.capital,'資本金');if(input.headcount!=='')headcount=amount(input.headcount,'常用従業員数');}catch(e){q(e.message);}
    if(frame==='sme'){
      if(input.noCapital==='yes'){if(headcount===null)q('無資本法人の常用従業員数が必要です。');else if(headcount>1000n)excluded=true;}
      else if(input.noCapital==='no'){if(capital===null)q('資本金の額が必要です。');else if(capital>100000000n)excluded=true;}
      else q('資本・出資を有しない法人か要確認です。');
      requireFlag('smeOwnership','大規模法人の所有割合除外等に該当しないこと');
      requireFlag('smeIncome','過去3年平均所得15億円超等の適用除外に該当しないこと');
      reasons.push('判定は全国内雇用者給与。資本金だけでは中小企業者等と確定しません。');
    } else {
      if(frame==='mid'){
        if(headcount===null)q('常用従業員数が必要です。');else if(headcount>2000n)excluded=true;
        try {const group=amount(input.groupHeadcount,'自己と支配法人の従業員合計'); if(group>10000n)excluded=true;if(headcount!==null&&group<headcount)q('支配グループ合計が自社人数未満です。');}catch(e){q(e.message);}
      }
      try {c=amount(input.continuousCurrent,'継続雇用者当期');p=amount(input.continuousPrevious,'継続雇用者比較');if(c>cur||p>prev)q('継続雇用者給与は全国内雇用者給与以下にしてください。');}catch(e){q(e.message);c=0n;p=0n;}
      requireFlag('continuousReviewed','両年度全月支給・雇用保険一般被保険者・高齢者継続雇用制度対象外等');
      if(capital===null||headcount===null)q('マルチステークホルダー方針の要否判定に資本金・人数が必要です。');
      else if((capital>=1000000000n&&headcount>=1000n)||(frame==='all'&&headcount>2000n))requireFlag('multiStakeholder','マルチステークホルダー方針の公表・届出受理・添付');
      reasons.push('増加率は継続雇用者、控除基礎は全国内雇用者の増加額。');
      if(frame==='mid'&&rule?.id==='r6')reasons.push('旧年度は国税庁5927-3「税額控除限度額」注3の期間別注記に基づき、継続給与4%以上で基本10%＋15ポイント＝25%。現行年度の5/6%段階と区別。');
    }
    let pct=rateFor(c,p,rule?.[frame]);
    const basePct=pct;
    if(p===0n)reasons.push('比較給与が0円のため、新規控除の増加率要件を満たしません。');
    const cert=certification(input,frame);
    if(pct>0){
      if(cert==='yes')pct+=5;else if(cert!=='no')q('認定の種類・取得日・期末有効性が要確認です。認定上乗せは未加算です。');
      if(rule?.training){
        if(input.trainingClaim==='yes'){
          try {const tc=amount(input.trainingCurrent,'教育訓練費当期'),tp=amount(input.trainingPrevious,'比較教育訓練費');
            if(input.trainingReviewed!=='yes')q('教育訓練費の範囲・比較額・保存書類を確認してください。');
            else if((tp===0n?tc>0n:reaches(tc,tp,frame==='sme'?500:1000))&&cur>0n&&tc*10000n>=cur*5n)pct+=frame==='sme'?10:5;
            else reasons.push('教育訓練費上乗せの増加率または給与比0.05%を満たしません。');
          }catch(e){q(e.message);}
        }else if(input.trainingClaim!=='no')q('教育訓練費上乗せの適用有無が要確認です。未加算です。');
      }else reasons.push('2026-04-01以後開始：教育訓練費上乗せなし。');
    }
    if(frame==='all'&&!rule?.all)reasons.push('全企業向け枠は2026-04-01以後開始年度で廃止。');
    if(commonExcluded)reasons.push('青色申告または対象年度要件を満たしません。');
    const generated=excluded?0n:base*BigInt(pct)/100n, currentUsed=min(generated,cap);
    let carry=null;
    if(frame==='sme'||!excluded){
      try{
        const balance=amount(input.carryBalance,'有効繰越残高');
        if(balance>0n&&input.carryReviewed!=='yes')q('繰越の有効期限・連続申告・別表・残高・当期利用資格が未確認です。');
        const canUse=input.blue==='yes'&&input.payrollReviewed==='yes'&&input.carryReviewed==='yes'&&prev>0n&&cur>prev;
        carry=carryPreview(String(balance),cap-currentUsed,canUse);
        if(balance>0n)reasons.push('繰越利用は当期の中小企業者該当性と別判定。前期給与0・横ばい・減少は利用不可。有効期限等は申告明細確認済み残高を使用。');
        if(balance>0n&&frame!=='sme')reasons.push('この枠の当期控除と、過年度の中小制度の既存繰越を比較しています。当期の複数枠を併用する計算ではありません。');
      }catch(e){q(e.message);}
    }
    const carryUsed=BigInt(carry?.used??'0');
    frames.push({frame,name:FRAME_NAMES[frame],status:excluded?(carryUsed>0n?'新規対象外・繰越利用候補':'対象外'):pending.length?'要確認':basePct===0?'新規控除要件未達':'試算上の要件充足',pending,reasons,
      increaseBasis:frame==='sme'?'全国内雇用者':'継続雇用者',current:String(c),previous:String(p),baseRate:basePct,rate:pct,base:String(base),generated:String(generated),cap:String(cap),currentUsed:String(currentUsed),carryUsed:String(carryUsed),totalUsed:String(currentUsed+carryUsed),newCarry:frame==='sme'&&!excluded?String(generated-currentUsed):'0',carry});
  }
  return {version:RULE_VERSION,rule,issues,frames,steps,rounded:'1円未満切捨ての計画用概算。申告別表の端数・他税額控除の順序は別途確認。',disclaimer:'機能別に確認範囲を限定した計画用試算です。申告用の確定計算・監査保証ではありません。'};
}
