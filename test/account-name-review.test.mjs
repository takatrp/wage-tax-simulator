// Independent account-name review. Synthetic records only; no uploaded source data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as accounts from '../public/payroll-accounts.mjs';
import * as fx from '../public/fxcloud.mjs';
import * as overlap from '../public/journal-overlap.mjs';
import {analyzeQuick} from '../public/quick.mjs';
import {decodeCsv} from '../public/csv.mjs';
import {initialInput} from '../public/fields.mjs';
import {fxProgressText} from '../public/fx-import-client.mjs';
import {FX_LIMIT_TEXT} from '../public/fx-limits.mjs';
import {createTestImporter} from './import-ui-harness.mjs';
import {journal,journalRow,fxOptions} from './fx-fixtures.mjs';

for(const [code,name,monthly]of [['未知コード-STAFF-X7','スタッフ給与','1000'],['未知コード-EMP-Y9','社員給与','2000']])test(`${name}: 未知コードでも名称から通常給与を初期選択する`,()=>{
  const rows=Array.from({length:6},(_,i)=>journalRow({月日:'2026/'+String(i+4).padStart(2,'0')+'/25',伝票番号:code+i,借方科目コード:code,借方科目名:name,借方取引金額:monthly,借方税抜き金額:monthly,貸方取引金額:monthly,貸方税抜き金額:monthly}));
  const result=analyzeQuick([fx.readFxCloud(journal({months:0,extra:rows}))],{start:'2026-04',through:'2026-09'}),account=result.accounts.find(a=>a.code===code&&a.name===name);
  assert.equal(account.suggestion,'regular');assert.equal(account.kind,'regular');assert.equal(account.current,String(BigInt(monthly)*6n));
  assert.equal(result.currentRegular,String(BigInt(monthly)*6n));assert.equal(result.previousAnnual,null);assert.deepEqual(result.errors,[]);
  assert.ok(!result.warnings.some(w=>w.includes('未分類')&&w.includes(name)));assert.ok(result.warnings.some(w=>w.includes('会社識別欄がない')));assert.ok(result.warnings.some(w=>w.includes('前年通年')));
});

test('independent: ambiguous tax, advance, reserve and retirement labels remain unchecked',()=>{
  for(const name of ['給与所得税','給与源泉所得税','給与源泉徴収税','賞与積立金','前払給与','退職給与','給与調整','未払給与','給与賞与','給与口座']){
    const classified=accounts.classifyPayrollName(name);
    assert.ok(!['regular','bonus'].includes(classified.kind),`${name} must remain unchecked, got ${classified.kind}`);
  }
  for(const name of ['給料','製造原価賃金','パート給与','雑給','基本給'])assert.equal(accounts.classifyPayrollName(name).kind,'regular');
  for(const name of ['役 員 給 与','法定福利費（給与）','外注賃金'])assert.equal(accounts.classifyPayrollName(name).kind,'exclude');
});

test('independent: same-code aliases and departments select independently without mutating shared input',()=>{
  const data=fx.readFxCloud(journal({months:1,extra:[
    journalRow({伝票番号:'ALIAS',借方科目名:'製造原価賃金',借方取引金額:'30',借方税抜き金額:'30'}),
    journalRow({伝票番号:'DEPT-A',借方部門コード:'A',借方部門名:'架空部門A',借方取引金額:'20',借方税抜き金額:'20'}),
    journalRow({伝票番号:'DEPT-B',借方部門コード:'B',借方部門名:'架空部門B',借方取引金額:'10',借方税抜き金額:'10'})
  ]}));
  const original=JSON.stringify(data.entries);data.entries.forEach(Object.freeze);Object.freeze(data.entries);
  const initial=analyzeQuick([data],{start:'2026-04',through:'2026-04'});
  const payroll=initial.accounts.filter(a=>a.suggestion==='regular');
  assert.equal(payroll.length,4);assert.equal(new Set(payroll.map(a=>a.key)).size,4);
  assert.equal(initial.errors.length,0);assert.match(initial.warnings.join(' '),/科目コード/);
  const exclude=payroll.find(a=>a.departmentCode==='A');
  const reviewed=analyzeQuick([data],{start:'2026-04',through:'2026-04',mapping:{[exclude.key]:'exclude'}});
  assert.equal(initial.currentRegular,'100060');assert.equal(reviewed.currentRegular,'100040');
  assert.equal(JSON.stringify(data.entries),original);
});

test('independent: byte copies deduplicate, credit returns subtract, matching rows remain with an overlap gate',()=>{
  const data=fx.readFxCloud(journal({months:1,extra:[journalRow({伝票番号:'RETURN',借方科目コード:'1000',借方科目名:'普通預金',借方取引金額:'25000',借方税抜き金額:'25000',貸方科目コード:'5001',貸方科目名:'給料手当',貸方取引金額:'25000',貸方税抜き金額:'25000'})]}));
  const a={...data,byteHash:'a'.repeat(64),sourceFile:2},copy={...data,byteHash:'a'.repeat(64),sourceFile:5};
  const result=analyzeQuick([a,copy],{start:'2026-04',through:'2026-04'});
  assert.equal(result.currentRegular,'75000');assert.equal(result.duplicateDiagnostics.duplicateFiles.length,1);
  assert.deepEqual(result.accounts.find(a=>a.suggestion==='regular').sourceFiles,[2]);
  const distinct=analyzeQuick([a,{...copy,byteHash:'b'.repeat(64)}],{start:'2026-04',through:'2026-04'});
  assert.equal(distinct.currentRegular,'150000');assert.equal(distinct.requiresOverlapConfirmation,true);
  assert.equal(distinct.duplicateDiagnostics.overlaps[0].payroll.current,'75000');
  assert.equal(distinct.duplicateDiagnostics.overlaps[0].payroll.currentAbsolute,'125000');
});

test('independent: unchecked unknown account never supplies missing payroll months or a prior annual zero',()=>{
  const data=fx.readFxCloud(journal({months:1,extra:[journalRow({月日:'2026/05/25',伝票番号:'UNKNOWN-MONTH',借方科目名:'給与調整'})]}));
  const result=analyzeQuick([data],{start:'2026-04',through:'2026-05'});
  assert.equal(result.currentRegular,null);assert.equal(result.previousAnnual,null);
  assert.equal(result.accounts.find(a=>a.name==='給与調整').kind,'unknown');
  const key=result.accounts.find(a=>a.name==='給与調整').key;
  const pending=analyzeQuick([data],{start:'2026-04',through:'2026-05',mapping:{[key]:'pending'}});
  assert.equal(pending.currentRegular,null);assert.match(pending.errors.join(' '),/通常給与か賞与/);
});

test('independent: table search and paging retain original row indices and escape account labels',()=>{
  const rows=Array.from({length:121},(_,i)=>({key:String(i),name:i===120?'<架空給与>&"':`架空給与${i}`,code:'X'+i,departmentName:'架空部門',departmentCode:'D',kind:i===120?'bonus':'exclude',sourceFiles:[1,3],current:'-10',previous:'0',reason:'<確認>'}));
  const page=accounts.accountTable(rows,{prefix:'q',page:2});
  assert.equal((page.html.match(/data-q-account=/g)||[]).length,21);
  assert.match(page.html,/data-q-account="120"[^>]*checked/);
  assert.ok(!page.html.includes('<架空給与>'));assert.match(page.html,/&lt;架空給与&gt;&amp;&quot;/);
  const searched=accounts.accountTable(rows,{prefix:'q',query:'X120'});
  assert.equal(searched.count,1);assert.match(searched.html,/data-q-map="120"/);
  assert.match(searched.html,/資料1 \/ 資料3/);assert.match(searched.html,/>-10</);
});

function detailedUi(){
  const elements=new Map();let maps=[],checks=[],roles=[],dirty=0,applied=[];
  function element(id){
    if(elements.has(id))return elements.get(id);
    let html='';const events=new Map();
    const node={value:'',checked:false,hidden:false,disabled:false,textContent:'',className:'',dataset:{},insertAdjacentHTML(){},addEventListener(type,fn){events.set(type,fn);},async dispatch(type,event){await events.get(type)?.(event);}};
    Object.defineProperty(node,'innerHTML',{get:()=>html,set(value){
      html=value;
      if(id==='#fxFileList')roles=[...value.matchAll(/data-fx-role="(\d+)"/g)].map(m=>{const n=element('[data-fx-role="'+m[1]+'"]');n.dataset.fxRole=m[1];n.value='auto';return n;});
      if(id==='#fxAccountMap'){
        maps=[...value.matchAll(/<select data-fx-map="(\d+)">([\s\S]*?)<\/select>/g)].map(m=>{const key='map-'+m[1];elements.delete(key);const n=element(key);n.dataset.fxMap=m[1];n.value=m[2].match(/<option value="([^"]+)" selected>/)?.[1];return n;});
        checks=[...value.matchAll(/<input\b[^>]*data-fx-account="(\d+)"[^>]*>/g)].map(m=>{const key='check-'+m[1];elements.delete(key);const n=element(key);n.dataset.fxAccount=m[1];n.checked=/\bchecked\b/.test(m[0]);return n;});
      }
    }});elements.set(id,node);return node;
  }
  const periods=['start','end','prevStart','prevEnd','cutoff'].map(k=>element('#fx-'+k));
  const context={...accounts,...fx,...overlap,startFxImport:createTestImporter(),fxProgressText,FX_LIMIT_TEXT,decodeCsv,document:{querySelector:element,querySelectorAll:s=>s==='[data-fx-map]'?maps:s==='[data-fx-account]'?checks:s==='[data-fx-role]'?roles:s==='[data-fx-period]'?periods:[]},callbacks:{getInput:initialInput,onDirty:()=>dirty++,onApply:value=>applied.push(value)}};
  vm.createContext(context);const source=readFileSync(new URL('../public/fx-ui.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export function mountFxImport','function mountFxImport');
  vm.runInContext(source+'\nmountFxImport(callbacks);',context);element('#fxEncoding').value='utf-8';
  for(const[k,v]of Object.entries(fxOptions))element('#fx-'+k).value=v;
  return{element,maps:()=>maps,checks:()=>checks,dirty:()=>dirty,applied:()=>applied,event:(id,type='click')=>element(id).dispatch(type),load:texts=>element('#fxFiles').dispatch('change',{target:{files:texts.map(text=>{const bytes=new TextEncoder().encode(text).buffer;return{size:bytes.byteLength,arrayBuffer:async()=>bytes};})}})};
}

test('independent: detailed UI retains off-page selection and clears review confirmations on later edits',async()=>{
  const ui=detailedUi();
  const extra=Array.from({length:75},(_,i)=>journalRow({伝票番号:'PAGE-'+i,借方科目コード:'OTHER-'+i,借方科目名:'架空科目'+String(i).padStart(2,'0'),借方取引金額:'1',借方税抜き金額:'1'}));
  await ui.load([journal({extra}),journal({start:'2025-04',months:12,prefix:'PREV'})]);await ui.event('#fxAnalyze');
  assert.equal(ui.maps().length,50);await ui.event('#fxAccountNext');const last=ui.maps().at(-1),index=last.dataset.fxMap;last.value='bonus';await last.dispatch('change');
  ui.element('#fxAccountSearch').value='架空科目74';await ui.event('#fxAccountSearch','input');
  assert.equal(ui.maps().length,1);assert.equal(ui.maps()[0].dataset.fxMap,index);assert.equal(ui.maps()[0].value,'bonus');
  ui.element('#fxCompany').value='架空確認法人';ui.element('#fxBasis').value='架空照合';
  for(const id of ['fxSameCompany','fxComplete','fxScope','fxZeroMonths'])ui.element('#'+id).checked=true;
  for(const p of ['current','previous'])for(const k of ['regular','bonus'])ui.element('#fx-adjust-'+p+'-'+k).value='0';
  await ui.event('#fxApply');assert.equal(ui.applied().length,1);assert.equal(ui.applied()[0].paidBonus,'1');
  const check=ui.checks()[0];check.checked=false;await check.dispatch('change');
  assert.equal(ui.element('#fxScope').checked,false);assert.equal(ui.element('#fxZeroMonths').checked,false);assert.equal(ui.element('#fxOverlapConfirmed').checked,false);
  await ui.event('#fxApply');assert.equal(ui.applied().length,1);
});

test('independent: 10000 ambiguous names keep warning output bounded and payroll unknown',()=>{
  const count=10000,date='2026-04-25',entries=Array.from({length:count},(_,i)=>({key:accounts.payrollAccountKey('U'+i,'給与調整'+i),code:'U'+i,name:'給与調整'+i,suggestion:'unknown',date,line:i+2,value:'1',netValue:'1'}));
  const result=analyzeQuick([{entries,transactions:entries.map((e,i)=>({identity:String(i),date,line:e.line})),companies:[],rows:count,from:date,through:date}],{start:'2026-04',through:'2026-04'});
  assert.equal(result.currentRegular,null);assert.equal(result.previousAnnual,null);
  assert.equal(result.accounts.length,count);
  assert.ok(result.warnings.length<=30,`too many warnings for the DOM: ${result.warnings.length}`);
  assert.match(result.warnings.join(' '),/10,000|10000|1万/);
});

test('independent: 100000-row aggregation and account pagination remain linear and bounded in output',t=>{
  const count=100000,date='2026-04-25',entries=Array.from({length:count},(_,i)=>({key:accounts.payrollAccountKey('X'+i,'架空給与'+i),code:'X'+i,name:'架空給与'+i,suggestion:'regular',date,line:i+2,value:'1',netValue:'1'}));
  const data={entries,transactions:entries.map((e,i)=>({identity:String(i),date,line:e.line})),companies:[],rows:count,from:date,through:date};
  const start=performance.now(),result=analyzeQuick([data],{start:'2026-04',through:'2026-04'}),table=accounts.accountTable(result.accounts,{prefix:'q',page:1999}),elapsed=performance.now()-start;
  assert.equal(result.currentRegular,String(count));assert.equal(result.accounts.length,count);assert.equal(table.pages,2000);
  assert.equal((table.html.match(/data-q-account=/g)||[]).length,50);assert.ok(table.html.length<100000);
  t.diagnostic(`100000 synthetic rows + last account page: ${Math.round(elapsed)} ms`);
});
