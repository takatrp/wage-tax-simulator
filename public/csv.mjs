import { amount,annualPair } from './calc.mjs';
import { validDate } from './rules.mjs';
export const AGG_FIELDS = {
  mode:'データ区分_actual通年_forecast期中',
  start:'対象年度開始日',end:'対象年度終了日',prevStart:'前年度開始日',prevEnd:'前年度終了日',
  grossCurrent:'当期給与総額',grossPrevious:'前期給与総額',reimburseCurrent:'当期通常補塡額',reimbursePrevious:'前期通常補塡額',subsidyCurrent:'当期雇用安定助成金',subsidyPrevious:'前期雇用安定助成金',continuousCurrent:'当期継続雇用者給与',continuousPrevious:'前期継続雇用者給与',corporateTax:'調整前法人税額',overlap:'他制度調整額',trainingCurrent:'当期教育訓練費_補助金控除後',trainingPrevious:'比較教育訓練費_補助金控除後'
};
export const FORECAST_FIELDS={observationStart:'集計開始日',observationEnd:'集計終了日',completedMonths:'完了月数',observedMonths:'含まれる月一覧',paidBonus:'既払い賞与',plannedBonus:'予定賞与',remainingRegular:'残月通常給与見込',annualAdjustment:'年間追加補正'};
Object.assign(AGG_FIELDS,FORECAST_FIELDS);
export const EMP_FIELDS = {
  mode:'データ区分_actual通年のみ',start:'対象年度開始日',end:'対象年度終了日',prevStart:'前年度開始日',prevEnd:'前年度終了日',annualComplete:'両年度の通年実績確認',
  employeeId:'社員ID',currentSalary:'当期給与',previousSalary:'前期給与',currentReimburse:'当期通常補塡',previousReimburse:'前期通常補塡',currentSubsidy:'当期雇用安定助成金',previousSubsidy:'前期雇用安定助成金',
  domesticCurrent:'当期国内賃金台帳',domesticPrevious:'前期国内賃金台帳',officerCurrent:'当期役員',officerPrevious:'前期役員',relatedCurrent:'当期特殊関係者',relatedPrevious:'前期特殊関係者',deductibleCurrent:'当期損金対象',deductiblePrevious:'前期損金対象',allMonthsCurrent:'当期全月支給',allMonthsPrevious:'前期全月支給',insuredCurrent:'当期一般被保険者',insuredPrevious:'前期一般被保険者',seniorCurrent:'当期高齢継続雇用',seniorPrevious:'前期高齢継続雇用'
};
export function decodeCsv(buffer,encoding='utf-8') {
  if(buffer.byteLength>5*1024*1024)throw new Error('CSVは5MB以内にしてください。');
  if(!['utf-8','shift_jis'].includes(encoding))throw new Error('文字コードを選択してください。');
  try{return new TextDecoder(encoding,{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}catch{throw new Error('選択した文字コードで読み取れません。UTF-8 / Shift_JISを確認してください。');}
}
export function parseCsv(text,{allowSignedAmounts=false}={}) {
  if(text.includes('\uFFFD')||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error('文字化けまたは制御文字を検出しました。');
  const rows=[],lineNumbers=[];let row=[],cell='',state='plain',line=1,rowStart=1;
  const pushCell=()=>{row.push(cell);if(row.length>256)throw new Error('CSVは256列以内にしてください。');cell='';state='plain';};
  const pushRow=()=>{pushCell();if(row.some(x=>x!=='')){rows.push(row);lineNumbers.push(rowStart);}row=[];if(rows.length>10001)throw new Error('CSVは10,000データ行以内にしてください。');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(state==='quoted') {if(c==='\n'||c==='\r'&&text[i+1]!=='\n')line++;if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else state='closed';}else cell+=c;continue;}
    if(c===','){pushCell();continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();line++;rowStart=line;continue;}
    if(state==='closed')throw new Error('引用符の後に区切り文字以外があります。');
    if(c==='"'){if(cell)throw new Error('引用符がセル途中にあります。');state='quoted';}else cell+=c;
  }
  if(state==='quoted')throw new Error('CSVの引用符が閉じられていません。');
  if(cell!==''||row.length||state==='closed')pushRow();
  if(rows.length<2)throw new Error('見出し行と1行以上のデータが必要です。');
  const headers=rows.shift().map(x=>x.trim());
  lineNumbers.shift();
  if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw new Error('空の見出し、または重複した見出しがあります。');
  for(let i=0;i<rows.length;i++){
    if(rows[i].length!==headers.length)throw new Error(`${i+2}行目の列数が見出しと一致しません。`);
    if(rows[i].some(v=>/^[\s\uFEFF]*[=+@-]/.test(v)&&!(allowSignedAmounts&&/^-(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(v.trim()))))throw new Error(`${i+2}行目に数式形式または負数があります。式は実行せず取込を停止しました。`);
  }
  return {headers,rows,lineNumbers};
}
export function autoMap(headers,fields) {return Object.fromEntries(Object.entries(fields).map(([k,label])=>[k,headers.includes(label)?label:headers.includes(k)?k:'']));}
function accessor(table,mapping,fields,required) {
  const cols=Object.values(mapping).filter(Boolean);
  if(new Set(cols).size!==cols.length)throw new Error('同じCSV列を複数項目に割り当てられません。');
  for(const k of required)if(!mapping[k]||!table.headers.includes(mapping[k]))throw new Error(`列「${fields[k]}」を割り当ててください。`);
  return (row,key)=>mapping[key]?row[table.headers.indexOf(mapping[key])]?.trim():undefined;
}
export function importAggregate(table,mapping) {
  if(table.rows.length!==1)throw new Error('集計CSVは1法人・1対象年度につき1データ行で指定してください。複数行の自動合算は行いません。');
  const required=['mode','start','end','prevStart','prevEnd','grossCurrent','grossPrevious','reimburseCurrent','reimbursePrevious','subsidyCurrent','subsidyPrevious','corporateTax','overlap'];
  const get=accessor(table,mapping,AGG_FIELDS,required),out={};
  for(const key of Object.keys(AGG_FIELDS))if(mapping[key]){const v=get(table.rows[0],key);if(v===''&&!required.includes(key))continue;if(key==='mode'){if(!['actual','forecast'].includes(v))throw new Error('データ区分はactual（通年）またはforecast（期中）にしてください。');out[key]=v;}else if(['start','end','prevStart','prevEnd','observationStart','observationEnd'].includes(key)){if(!validDate(v))throw new Error(`${AGG_FIELDS[key]}は実在するYYYY-MM-DD形式の日付にしてください。`);out[key]=v;}else if(key==='observedMonths'){if(!/^\d{4}-\d{2}(\|\d{4}-\d{2}){0,11}$/.test(v))throw new Error('月一覧の形式を確認してください。');out[key]=v;}else if(key==='annualAdjustment'){if(!/^-?(0|[1-9]\d*)$/.test(v))throw new Error('年間追加補正は符号付き整数にしてください。');amount(v.startsWith('-')?v.slice(1):v,'年間追加補正');out[key]=v;}else out[key]=String(amount(v,AGG_FIELDS[key]));}
  const expectedMonths=Array.from({length:12},(_,i)=>{const d=new Date(out.start+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);return d.toISOString().slice(0,7);}).join('|');
  if(out.mode==='actual'&&((out.completedMonths!==undefined&&out.completedMonths!=='12')||(out.observationStart&&out.observationStart!==out.start)||(out.observationEnd&&out.observationEnd!==out.end)||(out.observedMonths&&out.observedMonths!==expectedMonths)))throw new Error('期中・欠落・重複の観測期間や月一覧を通年実績として取り込めません。CSVの区分と着地予測モードを確認してください。');
  return out;
}
function bool(s,label) {if(s==='yes'||s==='no'||s==='unknown')return s;throw new Error(`${label}はyes / no / unknownで指定してください。空欄をnoにはしません。`);}
export function importEmployees(table,mapping) {
  const get=accessor(table,mapping,EMP_FIELDS,Object.keys(EMP_FIELDS)),ids=new Set(),issues=[];
  let metadata=null;
  const total={grossCurrent:0n,grossPrevious:0n,reimburseCurrent:0n,reimbursePrevious:0n,subsidyCurrent:0n,subsidyPrevious:0n,continuousCurrent:0n,continuousPrevious:0n};
  let excluded=0;
  for(let idx=0;idx<table.rows.length;idx++){
    const row=table.rows[idx],id=get(row,'employeeId');
    const meta=Object.fromEntries(['mode','start','end','prevStart','prevEnd'].map(k=>[k,get(row,k)]));
    if(meta.mode!=='actual'||get(row,'annualComplete')!=='yes')throw new Error(`${idx+2}行目：従業員別CSVは両年度の通年実績を確認したactual専用です。期中データは集計CSVの着地予測を使ってください。`);
    if(!['start','end','prevStart','prevEnd'].every(k=>validDate(meta[k]))||!annualPair(meta.start,meta.end)||!annualPair(meta.prevStart,meta.prevEnd)||new Date(meta.prevEnd+'T00:00:00Z').getTime()+86400000!==new Date(meta.start+'T00:00:00Z').getTime())throw new Error(`${idx+2}行目：両年度は連続した12か月の通年実績で指定してください。`);
    if(metadata&&Object.keys(meta).some(k=>meta[k]!==metadata[k]))throw new Error(`${idx+2}行目：対象年度が他の従業員行と一致しません。`);metadata=meta;
    if(!id)throw new Error(`${idx+2}行目の社員IDが空欄です。`);
    if(ids.has(id))throw new Error(`${idx+2}行目に社員IDの重複があります。月別CSVは先に年別集計してください。`);ids.add(id);
    const num={};for(const key of ['currentSalary','previousSalary','currentReimburse','previousReimburse','currentSubsidy','previousSubsidy'])num[key]=amount(get(row,key),`${idx+2}行 ${EMP_FIELDS[key]}`);
    const flags={};for(const key of ['domesticCurrent','domesticPrevious','officerCurrent','officerPrevious','relatedCurrent','relatedPrevious','deductibleCurrent','deductiblePrevious','allMonthsCurrent','allMonthsPrevious','insuredCurrent','insuredPrevious','seniorCurrent','seniorPrevious'])flags[key]=bool(get(row,key),`${idx+2}行 ${EMP_FIELDS[key]}`);
    if(Object.values(flags).includes('unknown'))issues.push(`${idx+2}行目：対象者属性が未確認。自動で対象扱いしていません。`);
    let eligible={};
    for(const period of ['Current','Previous']){
      const low=period.toLowerCase(),salary=num[low+'Salary'],reimburse=num[low+'Reimburse'],subsidy=num[low+'Subsidy'];
      if(reimburse+subsidy>salary)throw new Error(`${idx+2}行目の補塡・助成金が給与を超えています。`);
      eligible[period]=flags['domestic'+period]==='yes'&&flags['officer'+period]==='no'&&flags['related'+period]==='no'&&flags['deductible'+period]==='yes';
      if(eligible[period]){total['gross'+period]+=salary;total['reimburse'+period]+=reimburse;total['subsidy'+period]+=subsidy;}
    }
    if(!eligible.Current&&!eligible.Previous)excluded++;
    const continuous=['Current','Previous'].every(p=>eligible[p]&&flags['allMonths'+p]==='yes'&&flags['insured'+p]==='yes'&&flags['senior'+p]==='no');
    if(continuous){total.continuousCurrent+=num.currentSalary-num.currentReimburse;total.continuousPrevious+=num.previousSalary-num.previousReimburse;}
  }
  for(const value of Object.values(total))amount(String(value),'集計後金額');
  return {metadata,totals:Object.fromEntries(Object.entries(total).map(([k,v])=>[k,String(v)])),issues,count:ids.size,excluded,canApply:issues.length===0};
}
export function template(kind) {
  const fields=kind==='employee'?EMP_FIELDS:AGG_FIELDS;
  const emp={mode:'actual',start:'2026-04-01',end:'2027-03-31',prevStart:'2025-04-01',prevEnd:'2026-03-31',annualComplete:'yes',employeeId:'E001',currentSalary:'4100000',previousSalary:'4000000',currentReimburse:'0',previousReimburse:'0',currentSubsidy:'0',previousSubsidy:'0',domesticCurrent:'yes',domesticPrevious:'yes',officerCurrent:'no',officerPrevious:'no',relatedCurrent:'no',relatedPrevious:'no',deductibleCurrent:'yes',deductiblePrevious:'yes',allMonthsCurrent:'yes',allMonthsPrevious:'yes',insuredCurrent:'yes',insuredPrevious:'yes',seniorCurrent:'no',seniorPrevious:'no'};
  const sample=kind==='employee'?Object.keys(fields).map(k=>emp[k]):Object.keys(fields).map(k=>k==='mode'?(kind==='forecast'?'forecast':'actual'):'');
  return '\uFEFF'+Object.values(fields).join(',')+'\r\n'+sample.join(',')+'\r\n';
}
