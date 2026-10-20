// Independent auto-link review; all journal rows and DOM nodes are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as payroll from '../public/payroll-accounts.mjs';
import * as quick from '../public/quick.mjs';
import * as overlap from '../public/journal-overlap.mjs';
import {readFxCloud} from '../public/fxcloud.mjs';
import {decodeCsv} from '../public/csv.mjs';
import {FX_LIMITS,FX_LIMIT_TEXT} from '../public/fx-limits.mjs';
import {fxProgressText} from '../public/fx-import-client.mjs';
import {createTestImporter} from './import-ui-harness.mjs';
import {journal,journalRow} from './fx-fixtures.mjs';

const source=readFileSync(new URL('../public/quick-ui.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function harness(){
  const nodes=new Map();let maps=[],checks=[],included=[],ready=true,refresher=async()=>true,refreshCount=0,prints=0;
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    let html='';const events=new Map();
    const n={value:'',files:[],checked:false,hidden:false,disabled:false,textContent:'',className:'',dataset:{},setAttribute(){},addEventListener(type,fn){events.set(type,fn);},async dispatch(type){return events.get(type)?.();},querySelectorAll(selector){if(selector!=='details')return[];return [...html.matchAll(/<details\b/g)].map(()=>({set open(value){if(value)html=html.replace(/<details(?![^>]*\bopen\b)([^>]*)>/,'<details$1 open>');}}));}};
    Object.defineProperty(n,'innerHTML',{get:()=>html,set(value){
      html=value;
      if(id==='#q-mapping'){
        maps=[];checks=[];
        for(const row of value.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
          const select=row[1].match(/<select data-q-map="(\d+)">([\s\S]*?)<\/select>/),check=row[1].match(/<input\b[^>]*data-q-account="(\d+)"[^>]*>/),name=row[1].match(/<strong>([\s\S]*?)<\/strong>/)?.[1];
          if(select){const key='map-'+select[1];nodes.delete(key);const m=node(key);m.dataset.qMap=select[1];m.name=name;m.value=select[2].match(/<option value="([^"]+)" selected>/)?.[1];maps.push(m);}
          if(check){const key='check-'+check[1];nodes.delete(key);const c=node(key);c.dataset.qAccount=check[1];c.name=name;c.checked=/\bchecked\b/.test(check[0]);checks.push(c);}
        }
      }
      if(id==='#q-fileList')included=[...value.matchAll(/<input\b[^>]*data-q-include="(\d+)"[^>]*>/g)].map(m=>{const key='include-'+m[1];nodes.delete(key);const c=node(key);c.dataset.qInclude=m[1];c.checked=/\bchecked\b/.test(m[0]);return c;});
    }});nodes.set(id,n);return n;
  }
  const root={insertAdjacentHTML(){},querySelector:node,querySelectorAll:s=>s==='[data-q-map]'?maps:s==='[data-q-account]'?checks:s==='[data-q-include]'?included:[]};
  const context={...payroll,...quick,...overlap,readFxCloud,decodeCsv,FX_LIMITS,FX_LIMIT_TEXT,fxProgressText,startFxImport:createTestImporter(),document:{querySelector:node},window:{print(){prints++;}},callbacks:{root,isReady:()=>ready,refresh:()=>{refreshCount++;return refresher();},getEvidence:()=>({checkedAt:'2026-10-20T00:00:00Z',ruleVersion:'SYNTHETIC',scope:'synthetic review',sources:[]})}};
  vm.createContext(context);vm.runInContext(source+'\nglobalThis.api=mountQuick(callbacks);',context);node('#q-encoding').value='auto';node('#q-inputs').hidden=true;node('#q-print').hidden=true;
  return{node,api:context.api,maps:()=>maps,checks:()=>checks,included:()=>included,refreshCount:()=>refreshCount,prints:()=>prints,ready:v=>{ready=v;},refresh:fn=>{refresher=fn;},event:(id,type='click')=>node(id).dispatch(type),
    async input(id,value){node(id).value=value;await node(id).dispatch('input');await settle();},
    async check(name,value){const c=checks.find(x=>x.name===name);assert.ok(c,`missing checkbox ${name}`);c.checked=value;await c.dispatch('change');await settle();},
    async classify(name,value){const m=maps.find(x=>x.name===name);assert.ok(m,`missing classification ${name}`);m.value=value;await m.dispatch('change');await settle();},
    async load(texts){node('#q-files').files=texts.map((text,i)=>{const bytes=new TextEncoder().encode(text).buffer;return{name:`SYNTHETIC-${i}.csv`,size:bytes.byteLength,arrayBuffer:async()=>bytes};});await node('#q-files').dispatch('change');await settle();}};
}
function staffRows({start='2026-04',months=6,value='25000'}={}){
  return Array.from({length:months},(_,i)=>{const d=new Date(start+'-25T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+i);return journalRow({月日:d.toISOString().slice(0,10).replaceAll('-','/'),伝票番号:'STAFF-'+start+'-'+i,借方科目コード:'STAFF-UNKNOWN-X',借方科目名:'スタッフ給与',借方取引金額:value,借方税抜き金額:value,貸方取引金額:value,貸方税抜き金額:value});});
}
const bonus=()=>journalRow({月日:'2026/06/25',伝票番号:'AUTO-BONUS',借方科目コード:'BONUS-UNKNOWN-X',借方科目名:'賞与',借方取引金額:'20000',借方税抜き金額:'20000',貸方取引金額:'20000',貸方税抜き金額:'20000'});
const fixtures=({priorStaff=false,currentValue='100000',extra=[]}={})=>[journal({value:currentValue,extra:[...staffRows(),bonus(),...extra]}),journal({start:'2025-04',months:12,prefix:'PREV',extra:priorStaff?staffRows({start:'2025-04',months:12,value:'20000'}):[]})];
async function prepare(ui,texts=fixtures()){await ui.load(texts);await ui.input('#q-start','2026-04');await ui.input('#q-through','2026-09');await ui.input('#q-corporateTax','1000000');}
const result=ui=>ui.node('#q-result').innerHTML;

test('auto independent: only candidates initially, and the CSV final month does not authorize calculations',async()=>{
  const ui=harness();await ui.load(fixtures());assert.deepEqual(ui.checks().map(c=>c.name),['給料手当','スタッフ給与','賞与']);assert.match(ui.node('#q-mapping').innerHTML,/期間未確定/);
  await ui.input('#q-start','2026-04');assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);
  await ui.input('#q-through','2026-09');assert.equal(ui.node('#q-regular').value,'750000');assert.match(result(ui),/1,520,000/);assert.equal(ui.api.snapshot().previousAnnual,'1200000');
});

test('auto independent: checks and classification update actual totals, annual amount, credit and print without buttons',async()=>{
  const ui=harness();await prepare(ui);assert.match(result(ui),/96,000/);
  await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-regular').value,'600000');assert.match(result(ui),/1,220,000/);assert.match(result(ui),/3,000/);assert.ok(ui.checks().some(c=>c.name==='スタッフ給与'));
  await ui.classify('スタッフ給与','bonus');assert.equal(ui.node('#q-paidBonus').value,'170000');assert.match(result(ui),/1,370,000/);assert.match(result(ui),/51,000/);
  assert.equal(ui.api.snapshot().regular,'600000');assert.equal(ui.api.snapshot().paidBonus,'170000');assert.equal(ui.api.beforePrint(),true);assert.match(ui.node('#printArea').innerHTML,/1,370,000/);
});

test('auto independent: previous annual pay changes with the same account key and bonuses do not annualize',async()=>{
  const ui=harness();await prepare(ui,fixtures({priorStaff:true}));assert.equal(ui.node('#q-previousAnnual').value,'1440000');assert.match(result(ui),/24,000/);
  await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-previousAnnual').value,'1200000');assert.match(result(ui),/3,000/);
  await ui.classify('スタッフ給与','bonus');assert.equal(ui.node('#q-previousAnnual').value,'1440000');assert.match(result(ui),/1,370,000/);assert.match(result(ui),/0<small>円/);
});

test('auto independent: other-account additions stay visible and pending classification blocks every result route',async()=>{
  const extra=journalRow({伝票番号:'UNKNOWN',借方科目コード:'UNKNOWN-X',借方科目名:'給与調整',借方取引金額:'5000',借方税抜き金額:'5000'}),ui=harness();await prepare(ui,fixtures({extra:[extra]}));
  assert.ok(!ui.checks().some(c=>c.name==='給与調整'));await ui.event('#q-addAccounts');await ui.check('給与調整',true);
  assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
  await ui.classify('給与調整','regular');assert.equal(ui.node('#q-regular').value,'755000');assert.match(result(ui),/99,000/);
  await ui.event('#q-addAccounts');assert.ok(ui.checks().some(c=>c.name==='給与調整'));await ui.check('給与調整',false);assert.ok(ui.checks().some(c=>c.name==='給与調整'));assert.equal(ui.node('#q-regular').value,'750000');assert.match(result(ui),/96,000/);
});

test('auto independent: missing months and all unchecked show subtotals but never become confirmed zero',async()=>{
  const ui=harness(),current=journal({months:5,extra:staffRows({start:'2026-09',months:1})});await prepare(ui,[current,fixtures()[1]]);assert.equal(ui.node('#q-regular').value,'525000');assert.notEqual(result(ui),'');
  await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-regular').value,'500000');assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
  await ui.check('給料手当',false);assert.equal(ui.node('#q-regular').value,'0');assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
});

test('auto independent: selected zero-valued records in every month are a known zero',async()=>{
  const ui=harness();await prepare(ui,[journal({value:'0'}),fixtures()[1]]);assert.equal(ui.node('#q-regular').value,'0');assert.match(result(ui),/0<small>円/);assert.equal(ui.api.snapshot().regular,'0');assert.equal(ui.api.beforePrint(),true);
});

test('auto independent: overlap confirmation cannot survive a new account selection or an old confirm action',async()=>{
  const ui=harness(),[current,previous]=fixtures();await prepare(ui,[current,current+'\r\n',previous]);
  assert.equal(ui.node('#q-overlap').hidden,false);assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);
  await ui.event('#q-confirmOverlap');await settle();assert.equal(ui.node('#q-regular').value,'1500000');assert.notEqual(result(ui),'');
  await ui.check('スタッフ給与',false);assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
  await ui.event('#q-confirmOverlap');await settle();assert.equal(ui.node('#q-regular').value,'1200000');
  const second=ui.included()[1];second.checked=false;await second.dispatch('change');await settle();assert.equal(ui.node('#q-overlap').hidden,true);assert.equal(ui.node('#q-regular').value,'600000');assert.match(result(ui),/3,000/);
  await ui.event('#q-confirmOverlap');assert.equal(ui.node('#q-regular').value,'600000');assert.match(result(ui),/3,000/);
});

test('auto independent: a single pending official check renders only the latest account selection',async()=>{
  const ui=harness();await prepare(ui);const pending=deferred();ui.refresh(()=>pending.promise);const confirming=ui.event('#q-calculate');
  await ui.check('スタッフ給与',false);await ui.classify('スタッフ給与','bonus');assert.equal(ui.refreshCount(),1);assert.match(result(ui),/1,370,000/);assert.match(result(ui),/表示を保留/);
  pending.resolve(true);await confirming;await settle();assert.equal(ui.refreshCount(),1);assert.match(result(ui),/51,000/);assert.ok(!result(ui).includes('1,520,000'));assert.equal(ui.api.snapshot().paidBonus,'170000');
});

test('auto independent: rejection of a shared old check cannot resurrect an old result or prevent a later valid refresh',async()=>{
  const ui=harness();await prepare(ui);const pending=deferred();ui.refresh(()=>pending.promise);const confirming=ui.event('#q-calculate');await ui.check('スタッフ給与',false);
  pending.reject(Error('SYNTHETIC CHECK FAILURE'));await confirming;await settle();assert.match(result(ui),/1,220,000/);assert.match(result(ui),/表示を保留/);assert.equal(ui.node('#q-print').hidden,true);
  ui.refresh(async()=>true);await ui.event('#q-calculate');await settle();assert.match(result(ui),/3,000/);assert.equal(ui.node('#q-print').hidden,false);assert.equal(ui.refreshCount(),2);
});

test('auto independent: period errors block old figures and restore valid automatic totals after correction',async()=>{
  const ui=harness();await prepare(ui);await ui.input('#q-through','2027-04');assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
  await ui.input('#q-through','2026-09');assert.equal(ui.node('#q-regular').value,'750000');assert.match(result(ui),/96,000/);
  await ui.input('#q-start','');assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);assert.equal(ui.api.beforePrint(),false);
});

test('auto independent: account changes preserve forecast adjustments and tax while refreshing the CSV-derived amounts',async()=>{
  const ui=harness();await prepare(ui);await ui.input('#q-futureBonus','50000');await ui.input('#q-adjustment','-10000');assert.match(result(ui),/1,560,000/);assert.match(result(ui),/108,000/);
  await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-futureBonus').value,'50000');assert.equal(ui.node('#q-adjustment').value,'-10000');assert.equal(ui.node('#q-corporateTax').value,'1000000');
  assert.match(result(ui),/1,260,000/);assert.match(result(ui),/18,000/);assert.equal(ui.api.snapshot().regular,'600000');
});

test('auto independent: a pending official response cannot restore the previous CSV generation',async()=>{
  const ui=harness();await prepare(ui);const pending=deferred();ui.refresh(()=>pending.promise);const confirming=ui.event('#q-calculate');
  await ui.load(fixtures({currentValue:'200000'}));assert.equal(result(ui),'');assert.equal(ui.api.snapshot(),null);
  await ui.input('#q-start','2026-04');assert.equal(result(ui),'');await ui.input('#q-through','2026-09');await ui.input('#q-corporateTax','1000000');assert.match(result(ui),/2,720,000/);assert.match(result(ui),/表示を保留/);
  pending.resolve(true);await confirming;await settle();assert.match(result(ui),/2,720,000/);assert.match(result(ui),/200,000/);assert.ok(!result(ui).includes('<div class="result-number">1,520,000<small>'));assert.equal(ui.api.snapshot().regular,'1350000');assert.equal(ui.refreshCount(),1);
});

test('auto independent: view-only search and other-account toggles leave the linked calculation untouched',async()=>{
  const ui=harness();await prepare(ui);const snapshot=JSON.stringify(ui.api.snapshot()),before=result(ui),requests=ui.refreshCount();
  await ui.event('#q-addAccounts');await ui.input('#q-accountSearch','スタッフ給与');assert.equal(ui.checks().length,1);await ui.event('#q-addAccounts');await ui.input('#q-accountSearch','');
  assert.equal(JSON.stringify(ui.api.snapshot()),snapshot);assert.equal(result(ui),before);assert.equal(ui.refreshCount(),requests);
});

test('auto independent: credit returns remain signed in both cumulative and annual linked amounts',async()=>{
  const returned=journalRow({伝票番号:'SIGNED-RETURN',借方科目コード:'1000',借方科目名:'普通預金',借方取引金額:'10000',借方税抜き金額:'10000',貸方科目コード:'5001',貸方科目名:'給料手当',貸方取引金額:'10000',貸方税抜き金額:'10000'}),ui=harness();
  await prepare(ui,fixtures({extra:[returned]}));assert.equal(ui.node('#q-regular').value,'740000');assert.match(result(ui),/1,500,000/);assert.match(result(ui),/90,000/);
  await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-regular').value,'590000');assert.match(result(ui),/1,200,000/);assert.match(result(ui),/0<small>円/);
});

test('auto independent: a missing prior annual amount stays unknown until supplied and does not require retyping on each check',async()=>{
  const ui=harness();await prepare(ui,[fixtures()[0]]);assert.equal(ui.node('#q-previousAnnual').value,'');assert.equal(result(ui),'');
  await ui.input('#q-previousAnnual','1200000');assert.match(result(ui),/96,000/);await ui.check('スタッフ給与',false);assert.equal(ui.node('#q-previousAnnual').value,'1200000');assert.match(result(ui),/3,000/);
});
