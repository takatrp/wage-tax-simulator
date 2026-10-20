import {amount, MAX_AMOUNT, rateFor} from './calc.mjs';
import {validDate, selectRules} from './rules.mjs';

export const QUICK_ASSUMPTIONS = [
  '当期・直前期とも通常の12か月事業年度で、設立・解散・清算・組織再編等の適用除外年度に該当しないと仮定しています。',
  '青色申告の通常の国内法人で、対象年度の中小企業者等の要件を満たすと仮定しています。適用資格は判定していません。',
  '対象給与は国内雇用者分と仮定しています。役員・特殊関係者・海外勤務者等の除外は、科目名だけでは確認できません。',
  '補塡金・雇用安定助成金・他制度との重複控除調整はないと仮定しています。加算・繰越控除は含めません。',
  '他制度併用時の総額制限等は計算していません。申告に使える確定額ではありません。'
];
const monthIndex = s => Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
const monthAt = i => `${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;
export function quickPeriods(start, through) {
  if(!/^\d{4}-\d{2}$/.test(start)||!validDate(start+'-01')||!/^\d{4}-\d{2}$/.test(through)||!validDate(through+'-01'))throw Error('年度開始月と入力済みの最終月を選んでください。');
  const first=monthIndex(start), last=monthIndex(through), months=last-first+1;
  if(months<1||months>12)throw Error('入力済みの最終月は年度開始から12か月以内にしてください。');
  const endMonth=monthAt(first+11), end=new Date(Date.UTC(Number(endMonth.slice(0,4)),Number(endMonth.slice(5)),0)).toISOString().slice(0,10);
  return{start:start+'-01',end,through,months,current:Array.from({length:months},(_,i)=>monthAt(first+i)),previous:Array.from({length:12},(_,i)=>monthAt(first-12+i))};
}
export function analyzeQuick(files, {start,through,mapping={}}) {
  const period=quickPeriods(start,through), errors=[], warnings=[], accounts=new Map(), seen=new Set(), companies=new Set();
  const rows=[];
  for(const file of files){
    for(const company of file.companies||[])companies.add(company);
    for(const t of file.transactions||[]){if(seen.has(t.identity))errors.push('同一内容の仕訳が重複しています。重複ファイルまたは行を取り除いてください。');seen.add(t.identity);if(![...period.current,...period.previous].includes(t.date.slice(0,7)))errors.push('対象期間外の仕訳があります。年度・入力済み月またはファイルを確認してください。');}
    for(const e of file.entries){if(!accounts.has(e.key))accounts.set(e.key,{key:e.key,code:e.code,name:e.name,kind:mapping[e.key]??e.suggestion??'exclude'});rows.push(e);}
  }
  // Company labels can differ by field; conflicting values within the same identification field stop aggregation.
  const companyFields=new Map();for(const c of companies){const p=c.indexOf(':');const k=c.slice(0,p),v=c.slice(p+1);if(!companyFields.has(k))companyFields.set(k,new Set());companyFields.get(k).add(v);}
  const codeNames=new Map();for(const a of accounts.values()){if(codeNames.has(a.code)&&codeNames.get(a.code)!==a.name)errors.push('同じ科目コードに異なる科目名があります。科目体系を確認してください。');codeNames.set(a.code,a.name);}
  if([...companyFields.values()].some(v=>v.size>1))errors.push('会社識別欄が一致しません。同じ法人のCSVだけを選んでください。');
  if(!companies.size)warnings.push('会社識別欄がないため、選択したCSVは同じ法人のものと仮定しています。');
  const total={current:{regular:0n,bonus:0n},previous:{regular:0n,bonus:0n}}, regularMonths={current:new Set(),previous:new Set()};
  for(const a of accounts.values()){
    if(a.kind==='unknown')warnings.push(`未分類の科目「${a.name}」を除外しています。必要なら科目の扱いを変更してください。`);
    if(a.kind==='support')warnings.push(`補助金等の科目「${a.name}」を検出しました。給与充当補塡・雇用安定助成金の調整なしと仮定した概算です。該当する場合は詳しい条件確認へ進んでください。`);
    if(!['regular','bonus'].includes(a.kind))continue;
    const entries=rows.filter(e=>e.key===a.key);
    if(entries.some(e=>e.value!==e.netValue)){errors.push(`科目「${a.name}」の税込・税抜金額が一致しません。給与として集計する前に確認してください。`);continue;}
    for(const e of entries){const m=e.date.slice(0,7), side=period.current.includes(m)?'current':period.previous.includes(m)?'previous':null;if(!side)continue;total[side][a.kind]+=BigInt(e.value);if(a.kind==='regular')regularMonths[side].add(m);}
  }
  for(const s of ['current','previous'])for(const k of ['regular','bonus'])if(total[s][k]<0n)errors.push('給与科目の差引額がマイナスです。科目・期間・取消仕訳を確認してください。');
  const currentComplete=period.current.every(m=>regularMonths.current.has(m)),previousComplete=period.previous.every(m=>regularMonths.previous.has(m));
  if(!currentComplete)warnings.push('当期の通常給与を全入力月で確認できません。通常給与累計を補ってください。空欄は0円として扱いません。');
  if(!previousComplete)warnings.push('前年通年の通常給与を確認できません。前年通年給与を1つ入力してください。前年同期間額を通年額には使いません。');
  warnings.push('仕訳が各月にあることは全件収録の証明ではありません。選択月までの給与が入力済みであると仮定します。');
  return{period,accounts:[...accounts.values()],errors:[...new Set(errors)],warnings:[...new Set(warnings)],currentRegular:currentComplete?String(total.current.regular):null,paidBonus:String(total.current.bonus),previousAnnual:previousComplete?String(total.previous.regular+total.previous.bonus):null};
}
function signed(value,label){const s=String(value??'');if(!/^-?(0|[1-9]\d*)$/.test(s)||s==='-0')throw Error(`${label}は整数の円額で入力してください。`);const n=BigInt(s);if(n>MAX_AMOUNT||n< -MAX_AMOUNT)throw Error(`${label}が大きすぎます。`);return n;}
export function estimateQuick(input){
  const period=quickPeriods(input.start,input.through);
  const regular=amount(input.regular,'通常給与累計'),paidBonus=amount(input.paidBonus??'0','既払賞与'),futureBonus=amount(input.futureBonus===''||input.futureBonus==null?'0':input.futureBonus,'今後の賞与'),adjustment=signed(input.adjustment===''||input.adjustment==null?'0':input.adjustment,'見込補正');
  const previous=amount(input.previousAnnual,'前年通年給与');
  if(period.months===12&&futureBonus>0n)throw Error('12か月入力済みの場合は今後の賞与を0円にしてください。');
  const annual=regular*12n/BigInt(period.months)+paidBonus+futureBonus+adjustment;
  if(annual<0n||annual>MAX_AMOUNT)throw Error('年間給与見込が範囲外です。給与・賞与・補正を確認してください。');
  const tax=input.corporateTax===''||input.corporateTax==null?null:amount(input.corporateTax,'調整前法人税額');
  const rules=selectRules(period.start),supported=Boolean(rules&&period.start>='2024-04-01'&&period.start<='2027-03-31');
  const delta=annual-previous,rate=previous>0n?rateFor(annual,previous,[[150,15],[250,30]]):null;
  const theoretical=supported&&rate!==null?(delta>0n?delta:0n)*BigInt(rate)/100n:null;
  const cap=tax===null?null:tax*20n/100n,usable=theoretical===null||cap===null?null:(theoretical<cap?theoretical:cap);
  return{kind:'conditional-estimate',eligibility:'not-determined',period,annual:String(annual),previousAnnual:String(previous),delta:String(delta),growth:previous>0n?Number(delta*10000n/previous)/100:null,rate,supported,theoretical:theoretical===null?null:String(theoretical),cap:cap===null?null:String(cap),usable:usable===null?null:String(usable),taxKnown:tax!==null,assumptions:[...QUICK_ASSUMPTIONS,`通常給与累計×12÷${period.months}か月＋既払賞与＋今後の賞与＋見込補正（円未満切捨て）。`,input.futureBonus===''||input.futureBonus==null?'今後の賞与は含めていません。必要なら見込額を入力してください。':'今後の賞与は入力した見込額を加算しています。']};
}
