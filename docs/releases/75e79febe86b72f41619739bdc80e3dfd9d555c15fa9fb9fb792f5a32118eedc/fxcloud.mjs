import {inspectJournalOverlap,overlapWarnings} from './journal-overlap.mjs';
import {createCsvParser} from './csv-parser.mjs';
import {FX_LIMITS} from './fx-limits.mjs';
import {amount,annualPair} from './calc.mjs';
import {validDate} from './rules.mjs';
import {signedAmount} from './forecast.mjs';
import {classifyPayrollName,payrollAccountKey,payrollAccounts,accountNameWarnings} from './payroll-accounts.mjs';

const SIDES=['借方','貸方'];
export const FX_REQUIRED=['月日','伝票番号',...SIDES.flatMap(s=>['科目コード','科目名','取引金額','税抜き金額'].map(x=>s+x))];
const FX_ESSENTIAL=FX_REQUIRED.filter(h=>h!=='伝票番号');
export function detectCsvKind(headers){if(FX_ESSENTIAL.every(h=>headers.includes(h)))return 'fxcloud';if(headers.includes('社員ID')||headers.includes('employeeId'))return 'employee';return 'aggregate';}
export function fxMoney(raw){const s=String(raw??'').trim();if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(s))throw new Error('仕訳金額は円単位の整数が必要です。空欄・小数端数・数式は受け付けません。');const value=BigInt(s.replaceAll(',','').replace(/\.0+$/,''));amount(String(value<0n?-value:value),'仕訳金額');return value;}
export function createFxCollector(headers){
 if(!FX_ESSENTIAL.every(h=>headers.includes(h))||headers.some(h=>/累計|累積|残高|前年比/.test(h)))throw Error('対応するFXクラウドの借方・貸方仕訳一覧ではありません。残高表・月次累計表を仕訳として加算しません。');
 const columns=new Map(headers.map((h,i)=>[h,i])),at=h=>columns.get(h),entries=[],transactions=[],companies=new Set(),months=new Set(),accounts=new Map();
 const companyCols=headers.filter(h=>['会社名','法人名','会社コード','法人コード'].includes(h));
 const canonical=headers.filter(h=>h!=='index').sort().map(h=>({h,i:at(h),money:/^(借方|貸方)(取引金額|税抜き金額|消費税等)$/.test(h)}));
 let missingVoucher=0,rows=0,from=null,through=null;const missingVoucherLines=[];
 return{
  transactions,
  row(row,sourceLine){
   const raw=row[at('月日')].trim(),date=raw.replaceAll('/','-');
   if(!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw)||!validDate(date))throw Error(sourceLine+'行目：仕訳の日付は西暦4桁の日付が必要です。月日だけから年度を推定しません。合計行等は自動除外していません。');
   const before=entries.length;
   for(const side of SIDES){const code=row[at(side+'科目コード')].trim(),name=row[at(side+'科目名')].trim(),gross=row[at(side+'取引金額')].trim(),net=row[at(side+'税抜き金額')].trim();
    if(!code&&!name&&!gross&&!net)continue;
    if(!code||!name)throw Error(sourceLine+'行目：'+side+'の科目コード・科目名が不足しています。');
    let value,netValue;try{value=fxMoney(gross);netValue=fxMoney(net);}catch(e){throw Error(sourceLine+'行目：'+side+' '+e.message);}
    const departmentCode=columns.has(side+'部門コード')?row[at(side+'部門コード')].trim():'',departmentName=columns.has(side+'部門名')?row[at(side+'部門名')].trim():'';
    const key=payrollAccountKey(code,name,departmentCode,departmentName);if(!accounts.has(key)){const c=classifyPayrollName(name);accounts.set(key,{key,code,name,departmentCode,departmentName,suggestion:c.kind,classificationReason:c.reason});}
    entries.push({...accounts.get(key),date,line:sourceLine,side,column:at(side+'取引金額')+1,netColumn:at(side+'税抜き金額')+1,value:String(value*(side==='借方'?1n:-1n)),netValue:String(netValue*(side==='借方'?1n:-1n))});
   }
   if(entries.length===before)throw Error(sourceLine+'行目：借方・貸方の有効な科目と金額がありません。合計行等は自動除外していません。');
   if(!columns.has('伝票番号')||!row[at('伝票番号')].trim()){missingVoucher++;if(missingVoucherLines.length<20)missingVoucherLines.push(sourceLine);}
   months.add(date.slice(0,7));for(const h of companyCols){const v=row[at(h)].trim();if(v)companies.add(h+':'+v);}
   let identity;try{identity=JSON.stringify(canonical.map(({h,i,money})=>[h,h==='月日'?date:money&&row[i].trim()!==''?String(fxMoney(row[i])):row[i]]));}catch(e){throw Error(sourceLine+'行目：'+e.message);}
   transactions.push({identity,date,line:sourceLine});rows++;if(from===null||date<from)from=date;if(through===null||date>through)through=date;
  },
  finish(){const warnings=missingVoucher?[(!columns.has('伝票番号')?'伝票番号列がありません。':'伝票番号が空欄の仕訳があります。')+missingVoucher.toLocaleString('ja-JP')+'行を削除せず保持しました（元CSV物理行 '+missingVoucherLines.join(' / ')+(missingVoucher>missingVoucherLines.length?' ほか':'')+'）。番号から同一性を確定せず、ファイル指紋・全列内容・期間の重なりを別に確認します。']:[];return{format:'fxcloud-journal',headers,rows,entries,transactions,companies:[...companies],hasCompanyColumn:companyCols.length>0,months:[...months].sort(),from,through,warnings,missingVoucher,missingVoucherLines};}
 };
}
export function createFxParser({maxRows=FX_LIMITS.fileRows}={}){
 let collector;const parser=createCsvParser({allowSignedAmounts:true,maxRows,retainRows:false,onHeader:headers=>{collector=createFxCollector(headers);},onRow:(row,line)=>collector.row(row,line)});
 return{write:text=>parser.write(text),finish(){parser.finish();return collector.finish();},get count(){return parser.count;},get transactions(){return collector?.transactions??[];}};
}
export function readFxCloud(text){const parser=createFxParser();parser.write(text.replace(/^\uFEFF/,''));return parser.finish();}
export function fxAccounts(files,options={}){return payrollAccounts(files.map((f,i)=>({...f,sourceFile:i+1})).filter(f=>!['support','ignore'].includes(f.role)&&!options.duplicateIds?.has(f.sourceFile)),options);}
function monthList(start,end){const out=[],d=new Date(start+'T00:00:00Z');while(d.toISOString().slice(0,7)<=end.slice(0,7)&&out.length<13){out.push(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
function lastDay(month){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
export function fxOverlap(files,period,mapping={}){return inspectJournalOverlap(files.flatMap((f,i)=>['support','ignore'].includes(f.role)?[]:[{...f.data,sourceFile:i+1}]),{period,mapping});}
export function inspectFxFiles(files,options){
 const {start,end,prevStart,prevEnd,cutoff}=options;
 if(![start,end,prevStart,prevEnd].every(validDate)||!annualPair(start,end)||!annualPair(prevStart,prevEnd)||!start.endsWith('-01')||new Date(prevEnd+'T00:00:00Z').getTime()+86400000!==new Date(start+'T00:00:00Z').getTime())throw new Error('両年度は連続する12か月年度・月初開始で指定してください。');
 if(!/^\d{4}-\d{2}$/.test(cutoff??'')||!validDate(cutoff+'-01'))throw new Error('当期の最終完了月を指定してください。');
 const through=lastDay(cutoff);if(through<start||through>end)throw new Error('完了月は対象年度内にしてください。');
 if(!files.length||files.length>8)throw new Error('仕訳CSVは1〜8件で指定してください。');
 const required={current:monthList(start,through),previous:monthList(prevStart,prevEnd)},identities=new Set(),companyColumns=new Map(),evidence=[],coverage={current:new Set(),previous:new Set()},issues=[],fileSummaries=[];
 const {uniqueFiles:unusedFiles,...duplicateDiagnostics}=fxOverlap(files,required);const duplicateIds=new Set(duplicateDiagnostics.duplicateFiles.map(f=>f.file));const warnings=[...overlapWarnings(duplicateDiagnostics),...files.flatMap((f,i)=>(f.data.warnings??[]).map(w=>`資料${i+1}：${w}`))];
 for(let i=0;i<files.length;i++){
  const f=files[i],role=f.role??'auto';if(!['auto','current','previous','support','ignore'].includes(role))throw new Error('ファイルの用途を選択してください。');
  if(role==='ignore'||duplicateIds.has(i+1)){fileSummaries.push({file:i+1,role,rows:f.data.rows});continue;}
  for(const identity of f.data.companies){const p=identity.indexOf(':'),h=identity.slice(0,p),v=identity.slice(p+1);if(!companyColumns.has(h))companyColumns.set(h,new Set());companyColumns.get(h).add(v);}
  if(role==='support'){fileSummaries.push({file:i+1,role,rows:f.data.rows,from:f.data.from,through:f.data.through});continue;}
  const periods=new Map();
  for(const t of f.data.transactions){
   const period=t.date>=start&&t.date<=through?'current':t.date>=prevStart&&t.date<=prevEnd?'previous':null;
   if(!period||role!=='auto'&&role!==period){issues.push(`資料${i+1} ${t.line}行：指定年度・完了月・ファイル用途と日付が一致しません。`);continue;}
   periods.set(t.line,period);coverage[period].add(t.date.slice(0,7));identities.add(period);
  }
  for(const e of f.data.entries){const period=periods.get(e.line);if(period)evidence.push({...e,file:i+1,period});}
  fileSummaries.push({file:i+1,role,rows:f.data.rows,from:f.data.from,through:f.data.through,periods:[...new Set(periods.values())]});
 }
 for(const values of companyColumns.values())if(values.size>1)issues.push('異なる法人識別値が混在しています。同一法人として反映できません。');
 for(const period of ['current','previous']){const missing=required[period].filter(m=>!coverage[period].has(m));if(missing.length)issues.push((period==='current'?'当期':'前期通年')+'の仕訳月が不足しています：'+missing.join(' / '));}
 const modes=through===end?'actual':'forecast',accounts=fxAccounts(files,{period:required,duplicateIds});warnings.push(...accountNameWarnings(accounts));
 return {duplicateDiagnostics,warnings,options:{start,end,prevStart,prevEnd,cutoff},through,mode:modes,months:required.current.length,observedMonths:required.current.join('|'),coverage:Object.fromEntries(Object.entries(coverage).map(([k,v])=>[k,[...v].sort()])),evidence,fileSummaries,issues:[...new Set(issues)],canApply:issues.length===0,hasCompanyIdentity:companyColumns.size>0,accounts};
}
export function applyFxReview(inspection,review){
 if(!inspection.canApply)throw new Error('期間・月の不足等を解消してから反映してください。');
 if(inspection.duplicateDiagnostics?.requiresConfirmation&&review.overlapConfirmed!==true)throw new Error('期間が重なるCSVを別仕訳として全行含めるか確認してください。不要な資料は用途から除外できます。');
 if(!review.company?.trim()||review.sameCompany!==true||review.complete!==true||review.payrollScope!==true||!review.basis?.trim())throw new Error('同一法人・完了月の網羅性・給与対象範囲と調整根拠を確認してください。');
 const totals={current:{regular:0n,bonus:0n},previous:{regular:0n,bonus:0n}};
 for(const a of inspection.accounts)if(!['regular','bonus','exclude','support'].includes(review.mapping?.[a.key]))throw new Error('すべての給与・賞与・補助金候補の科目区分を確認してください。');
 const payrollMonths={current:new Set(),previous:new Set()};
 for(const e of inspection.evidence){const mapped=review.mapping[e.key];if(mapped==='regular'||mapped==='bonus'){
  if(e.value!==e.netValue)throw new Error(`資料${e.file} ${e.line}行：給与候補の税込・税抜額が一致しません。課税仕訳や立替精算を確認してください。`);
  totals[e.period][mapped]+=BigInt(e.value);
  payrollMonths[e.period].add(e.date.slice(0,7));
 }}
 const missing=Object.entries(inspection.coverage).flatMap(([p,months])=>months.filter(m=>!payrollMonths[p].has(m)).map(m=>(p==='current'?'当期':'前期')+m));
 if(missing.length&&review.zeroMonthsConfirmed!==true)throw new Error('給与候補仕訳のない月があります：'+missing.join(' / ')+'。給与なし又は給与調整に含めたことの確認が必要です。');
 const adjusted={};for(const p of ['current','previous']){adjusted[p]={};for(const k of ['regular','bonus']){const delta=signedAmount(review.adjustments?.[p]?.[k],(p==='current'?'当期':'前期')+(k==='regular'?'通常給与':'賞与')+'の調整');const value=totals[p][k]+delta;if(value<0n)throw new Error('対象給与の調整後金額が負数です。');amount(String(value),'対象給与');adjusted[p][k]=value;}}
 if(!inspection.evidence.some(e=>['regular','bonus'].includes(review.mapping[e.key])))throw new Error('給与に分類した仕訳がありません。0円を自動推定しません。');
 const o=inspection.options,out={mode:inspection.mode,start:o.start,end:o.end,prevStart:o.prevStart,prevEnd:o.prevEnd,company:review.company.trim(),grossCurrent:String(adjusted.current.regular+adjusted.current.bonus),grossPrevious:String(adjusted.previous.regular+adjusted.previous.bonus),payrollReviewed:'unknown',continuousReviewed:'unknown'};
 if(out.mode==='forecast')Object.assign(out,{grossCurrent:String(adjusted.current.regular),bonusSeparated:'yes',paidBonus:String(adjusted.current.bonus),completedMonths:String(inspection.months),observationStart:o.start,observationEnd:inspection.through,observedMonths:inspection.observedMonths,forecastCoverageComplete:'yes',forecastPreviousAnnual:'yes'});
 const lines=[...(inspection.warnings?.length?['内容一致の単一CSV行を保持。'+(inspection.duplicateDiagnostics.requiresConfirmation?'期間重複資料の全行取込を確認。':'')]:[]),'FX仕訳取込：'+inspection.fileSummaries.length+'資料（原本・摘要等は保存なし）',`当期 ${o.start}〜${inspection.through} / 前期 ${o.prevStart}〜${o.prevEnd}`,`当期帳簿候補 通常${totals.current.regular}円・賞与${totals.current.bonus}円、調整後${adjusted.current.regular+adjusted.current.bonus}円`,`前期帳簿候補 通常${totals.previous.regular}円・賞与${totals.previous.bonus}円、調整後${adjusted.previous.regular+adjusted.previous.bonus}円`,'調整根拠：'+review.basis.trim()];
 out.csvImportBasis=lines.join('\n').slice(0,500);
 return {input:out,totals:Object.fromEntries(Object.entries(totals).map(([p,v])=>[p,Object.fromEntries(Object.entries(v).map(([k,n])=>[k,String(n)]))])),adjusted:Object.fromEntries(Object.entries(adjusted).map(([p,v])=>[p,Object.fromEntries(Object.entries(v).map(([k,n])=>[k,String(n)]))])),basis:lines.join('\n')};
}
