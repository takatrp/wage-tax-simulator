import {createTestImporter} from './import-ui-harness.mjs';
import {fxProgressText} from '../public/fx-import-client.mjs';
import {FX_LIMITS,FX_LIMIT_TEXT} from '../public/fx-limits.mjs';
import * as overlap from '../public/journal-overlap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {decodeCsv} from '../public/csv.mjs';
import {readFxCloud} from '../public/fxcloud.mjs';
import * as quick from '../public/quick.mjs';
import {saveCase,restoreCase} from '../public/entry.mjs';
import {initialInput} from '../public/fields.mjs';
import {journal,journalRow} from './fx-fixtures.mjs';
import * as rules from '../public/rules.mjs';
import * as fields from '../public/fields.mjs';
import * as entry from '../public/entry.mjs';
import * as verification from '../public/verification.mjs';
import {certification} from '../public/calc.mjs';
import {calculateCase} from '../public/case.mjs';
import {createCalculationHandler} from '../public/workflow.mjs';
import {EXPECTED_CODE_HASH,EXPECTED_CLIENT_HASH} from '../public/build-info.mjs';
import {sample} from './fixtures.mjs';

// Execute the shipped handlers. This is state verification, not a browser layout test.
// All CSV content below comes from synthetic fixtures; no original files are read.
const source=readFileSync(new URL('../public/quick-ui.mjs',import.meta.url),'utf8')
 .replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
const keys=['start','through','regular','paidBonus','previousAnnual','futureBonus','adjustment','corporateTax'];
const base={start:'2026-04',through:'2026-09',regular:'600000',paidBonus:'0',previousAnnual:'1000000',futureBonus:'',adjustment:'',corporateTax:''};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function file(text,name='SYNTHETIC.csv'){const bytes=new TextEncoder().encode(text).buffer;return{name,size:bytes.byteLength,arrayBuffer:async()=>bytes};}

function harness(){
 const nodes=new Map();let mapping=[],included=[],ready=true,refresher=async()=>true,fingerprinter=overlap.fingerprintBytes,onPrint=()=>{},prints=0,decoded=0;
 const periods=[];
 function element(id){
  if(nodes.has(id))return nodes.get(id);
  let html='';const events=new Map();
  const node={value:'',files:[],checked:false,hidden:false,disabled:false,textContent:'',className:'',dataset:{},
   querySelectorAll(selector){assert.equal(selector,'details');return [...html.matchAll(/<details\b/g)].map(()=>{
    const detail={setAttribute(name){assert.equal(name,'open');detail.open=true;}};
    Object.defineProperty(detail,'open',{set(open){if(open)html=html.replace(/<details(?![^>]*\bopen\b)([^>]*)>/,'<details$1 open>');}});return detail;
   });},
   addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},
   async dispatch(type){for(const handler of events.get(type)??[])await handler();}};
  Object.defineProperty(node,'innerHTML',{get:()=>html,set(value){
   html=value;
   if(id==='#q-mapping')mapping=[...value.matchAll(/<select data-q-map="(\d+)">([\s\S]*?)<\/select>/g)].map(match=>{
    const key='map-'+match[1];nodes.delete(key);const control=element(key);
    control.dataset.qMap=match[1];control.value=match[2].match(/<option value="([^"]+)" selected>/)?.[1]??'regular';return control;
   });
   if(id==='#q-fileList')included=[...value.matchAll(/<input\b[^>]*data-q-include="(\d+)"[^>]*>/g)].map(match=>{
    const key='include-'+match[1];nodes.delete(key);const control=element(key);control.dataset.qInclude=match[1];control.checked=/\bchecked\b/.test(match[0]);return control;
   });
  }});
  nodes.set(id,node);return node;
 }
 const root={insertAdjacentHTML(){},querySelector:element,querySelectorAll:selector=>selector==='[data-q-map]'?mapping:selector==='[data-q-include]'?included:[]};
 const context={startFxImport:createTestImporter({fingerprint:bytes=>fingerprinter(bytes),decode(bytes,encoding,options){decoded++;return decodeCsv(bytes,encoding,options);}}),fxProgressText,FX_LIMITS,FX_LIMIT_TEXT,...quick,...overlap,readFxCloud,fingerprintBytes:bytes=>fingerprinter(bytes),decodeCsv(bytes,encoding){decoded++;return decodeCsv(bytes,encoding);},root,
  document:{querySelector:element},window:{print(){prints++;onPrint(context.api);}},
  callbacks:{root,refresh:()=>refresher(),isReady:()=>ready,onPeriod:start=>periods.push(start),
   getEvidence:()=>({checkedAt:'2026-10-20T00:00:00Z',expiresAt:'2026-10-20T00:15:00Z',ruleVersion:'SYNTHETIC',scope:'合成レビュー範囲',sources:[{title:'合成の公式出典',url:'https://www.nta.go.jp/'}]})}};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.api=mountQuick(callbacks);',context);
 element('#q-encoding').value='auto';element('#q-paidBonus').value='0';
 element('#q-inputs').hidden=true;element('#q-print').hidden=true;
 return{element,api:context.api,periods,decoded:()=>decoded,prints:()=>prints,mapping:()=>mapping,included:()=>included,fingerprint:fn=>{fingerprinter=fn;},
  ready:value=>{ready=value;},refresh:fn=>{refresher=fn;},onPrint:fn=>{onPrint=fn;},
  async load(files){element('#q-files').files=files;await element('#q-files').dispatch('change');},
  event:(id,type='click')=>element(id).dispatch(type),
  values:()=>Object.fromEntries(keys.map(key=>[key,element('#q-'+key).value]))};
}
async function prepare(ui,extra=[]){await ui.load([file(journal({extra}))]);ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');ui.element('#q-previousAnnual').value='1000000';}

test('quick初期文字コードでCSVを読み込み、前期不足を0円で埋めない',async()=>{
 const ui=harness();await ui.load([file(journal())]);
 assert.equal(ui.decoded(),1);assert.match(ui.element('#q-status').textContent,/読み込みました/);
 assert.equal(ui.element('#q-start').value,'');assert.equal(ui.element('#q-through').value,'2026-09');
 ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');
 assert.equal(ui.element('#q-regular').value,'600000');assert.equal(ui.element('#q-previousAnnual').value,'');
 await ui.event('#q-calculate');assert.equal(ui.element('#q-result').innerHTML,'');assert.match(ui.element('#q-status').textContent,/前年通年給与/);
});

test('初期の自動判定で合成CP932の全列CSVも読める',async()=>{
 const raw=readFileSync(new URL('../examples/fx-synthetic-current-cp932.csv',import.meta.url));
 const bytes=Uint8Array.from(raw).buffer,ui=harness();await ui.load([{size:bytes.byteLength,arrayBuffer:async()=>bytes}]);
 assert.equal(ui.decoded(),2);assert.match(ui.element('#q-status').textContent,/読み込みました/);
});

test('別CSV選択で前案件の期間・賞与見込・補正・税額をリセットする',async()=>{
 const ui=harness();await prepare(ui);ui.element('#q-futureBonus').value='12345';ui.element('#q-adjustment').value='67890';ui.element('#q-corporateTax').value='98765';
 await ui.load([file(journal({value:'200000',prefix:'NEW'}))]);
 for(const key of ['start','regular','previousAnnual','futureBonus','adjustment','corporateTax'])assert.equal(ui.element('#q-'+key).value,'',key);
 assert.equal(ui.element('#q-paidBonus').value,'0');assert.equal(ui.element('#q-inputs').hidden,true);
 ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');assert.equal(ui.element('#q-regular').value,'1200000');
});

test('20MB上限と40MB合計上限ではバイト読込を開始しない',async()=>{
 const ui=harness();let reads=0;const large={size:20*1024*1024+1,arrayBuffer:async()=>{reads++;throw Error('should not read');}};
 await ui.load([large]);assert.equal(reads,0);assert.match(ui.element('#q-status').textContent,/20MB/);
 const one={size:10*1024*1024,arrayBuffer:large.arrayBuffer};await ui.load(Array(5).fill(one));assert.equal(reads,0);assert.match(ui.element('#q-status').textContent,/40MB/);
});

test('旧ファイル読込の失敗で、新しいCSVと集計状態を上書きしない',async()=>{
 const ui=harness(),old=deferred();const pending=ui.load([{size:1,arrayBuffer:()=>old.promise}]);
 await ui.load([file(journal({value:'300000',prefix:'NEW'}))]);const status=ui.element('#q-status').textContent;
 old.reject(Error('SYNTHETIC OBSOLETE FAILURE'));await pending;assert.equal(ui.element('#q-status').textContent,status);
 ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');assert.equal(ui.element('#q-regular').value,'1800000');
});

test('ハッシュ計算待ちの旧CSVは、新しい読込後に戻っても復号・表示しない',async()=>{
 const ui=harness(),oldHash=deferred();let hashes=0;
 ui.fingerprint(bytes=>++hashes===1?oldHash.promise:overlap.fingerprintBytes(bytes));
 const pending=ui.load([file(journal({prefix:'OLD'}),'OLD.csv')]);await new Promise(resolve=>setImmediate(resolve));assert.equal(hashes,1);
 await ui.load([file(journal({value:'200000',prefix:'NEW'}),'NEW.csv')]);const status=ui.element('#q-status').textContent;
 oldHash.resolve('f'.repeat(64));await pending;
 assert.equal(ui.decoded(),1);assert.equal(ui.element('#q-status').textContent,status);assert.match(ui.element('#q-fileList').innerHTML,/NEW\.csv/);assert.ok(!ui.element('#q-fileList').innerHTML.includes('OLD.csv'));
 ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');assert.equal(ui.element('#q-regular').value,'1200000');
});

test('単一CSV内の完全一致3行は全行を保持し、候補行数と給与額を表示して進む',async()=>{
 const ui=harness(),copy=journalRow({伝票番号:'C001'});await ui.load([file(journal({extra:[copy,copy]}))]);
 ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');
 assert.equal(ui.element('#q-inputs').hidden,false);assert.equal(ui.element('#q-overlap').hidden,true);assert.equal(ui.element('#q-regular').value,'800000');
 assert.match(ui.element('#q-warnings').innerHTML,/一致する行が3行/);assert.match(ui.element('#q-warnings').innerHTML,/全行を保持/);assert.match(ui.element('#q-warnings').innerHTML,/当期300,000円/);
 ui.element('#q-previousAnnual').value='1000000';await ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/条件付き概算/);assert.equal(ui.api.snapshot().regular,'800000');
 const saved=JSON.stringify(ui.api.snapshot());assert.ok(!saved.includes('byteHash')&&!saved.includes('transactions')&&!saved.includes('架空の支給'));
});

test('同一byteの別名ファイルは1回だけ集計し、採用元を除外すれば残りを採用する',async()=>{
 const ui=harness(),text=journal();await ui.load([file(text,'FIRST.csv'),file(text,'COPY.csv')]);
 assert.equal(ui.included().length,2);assert.ok(ui.included().every(el=>el.checked));ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');
 assert.equal(ui.element('#q-regular').value,'600000');assert.equal(ui.element('#q-overlap').hidden,true);assert.match(ui.element('#q-warnings').innerHTML,/同一ファイル/);assert.match(ui.element('#q-warnings').innerHTML,/1回分だけ/);
 ui.included()[0].checked=false;await ui.included()[0].dispatch('change');assert.equal(ui.api.snapshot(),null);await ui.event('#q-analyze');
 assert.equal(ui.element('#q-regular').value,'600000');assert.equal(ui.element('#q-inputs').hidden,false);assert.ok(!ui.element('#q-warnings').innerHTML.includes('同一ファイルの内容'));
});

test('同名でもbyteが違う重複期間CSVは明示確認まで集計額を保存せず、内容一致行を削除しない',async()=>{
 const ui=harness(),text=journal();await ui.load([file(text,'SAME.csv'),file(text+'\r\n','SAME.csv')]);ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');
 assert.equal(ui.element('#q-inputs').hidden,true);assert.equal(ui.element('#q-overlap').hidden,false);assert.equal(ui.api.snapshot(),null);
 assert.equal(ui.element('#q-regular').value,'');assert.equal(ui.element('#q-previousAnnual').value,'');assert.match(ui.element('#q-overlapText').innerHTML,/内容一致の疑いは6行/);assert.match(ui.element('#q-overlapText').innerHTML,/当期600,000円/);
 await ui.event('#q-calculate');assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.api.snapshot(),null);
 await ui.event('#q-confirmOverlap');assert.equal(ui.element('#q-inputs').hidden,false);assert.equal(ui.element('#q-regular').value,'1200000');assert.equal(ui.api.snapshot().regular,'1200000');assert.match(ui.element('#q-warnings').innerHTML,/別仕訳として全行含めることを確認/);
});

test('重複期間のCSV除外は再集計を要求し、再追加したら確認と旧結果を無効化する',async()=>{
 const ui=harness();await ui.load([file(journal(),'A.csv'),file(journal({value:'200000',prefix:'B'}),'B.csv')]);ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');
 assert.equal(ui.element('#q-overlap').hidden,false);assert.match(ui.element('#q-overlapText').innerHTML,/内容一致の疑いは0行/);assert.match(ui.element('#q-overlapText').innerHTML,/当期1,200,000円/);
 ui.included()[1].checked=false;await ui.included()[1].dispatch('change');assert.equal(ui.api.snapshot(),null);await ui.event('#q-confirmOverlap');assert.equal(ui.element('#q-inputs').hidden,true);
 await ui.event('#q-analyze');assert.equal(ui.element('#q-inputs').hidden,false);assert.equal(ui.element('#q-regular').value,'600000');ui.element('#q-previousAnnual').value='1000000';await ui.event('#q-calculate');assert.notEqual(ui.element('#q-result').innerHTML,'');
 ui.included()[1].checked=true;await ui.included()[1].dispatch('change');assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.element('#q-inputs').hidden,true);assert.equal(ui.api.snapshot(),null);
 await ui.event('#q-analyze');assert.equal(ui.element('#q-overlap').hidden,false);assert.equal(ui.api.snapshot(),null);await ui.event('#q-confirmOverlap');assert.equal(ui.element('#q-regular').value,'1800000');
});

test('科目変更で重複期間の確認を無効にし、給与候補金額も新しい分類で再計算する',async()=>{
 const ui=harness();await ui.load([file(journal(),'A.csv'),file(journal({value:'200000',prefix:'B'}),'B.csv')]);ui.element('#q-start').value='2026-04';await ui.event('#q-analyze');await ui.event('#q-confirmOverlap');
 assert.equal(ui.element('#q-regular').value,'1800000');const regular=ui.mapping().find(el=>el.value==='regular');assert.ok(regular);regular.value='exclude';await regular.dispatch('change');
 assert.equal(ui.element('#q-inputs').hidden,true);assert.equal(ui.api.snapshot(),null);await ui.event('#q-confirmOverlap');assert.equal(ui.element('#q-inputs').hidden,true);
 await ui.event('#q-analyze');assert.equal(ui.element('#q-overlap').hidden,false);assert.match(ui.element('#q-overlapText').innerHTML,/給与候補の差引額（年換算前）：当期0円/);assert.equal(ui.api.snapshot(),null);
 await ui.event('#q-confirmOverlap');assert.equal(ui.element('#q-inputs').hidden,false);assert.equal(ui.element('#q-regular').value,'');assert.match(ui.element('#q-warnings').innerHTML,/給与候補の差引額（年換算前）：当期0円/);
});

test('文字コード変更で取り消したファイルは復号も集計もしない',async()=>{
 const ui=harness(),old=deferred();const pending=ui.load([{size:1,arrayBuffer:()=>old.promise}]);
 ui.element('#q-encoding').value='shift_jis';await ui.event('#q-encoding','change');const status=ui.element('#q-status').textContent;
 old.resolve(Uint8Array.of(255).buffer);await pending;assert.equal(ui.decoded(),0);assert.equal(ui.element('#q-status').textContent,status);assert.equal(ui.element('#q-inputs').hidden,true);
});

test('役員・曖昧科目を除外し、再分類のたびに再集計して旧結果を消す',async()=>{
 const ui=harness();await prepare(ui,[journalRow({伝票番号:'OFFICER',借方科目コード:'5200',借方科目名:'役員報酬',借方取引金額:'999999',借方税抜き金額:'999999'}),journalRow({伝票番号:'UNKNOWN',借方科目コード:'5300',借方科目名:'給与調整',借方取引金額:'12345',借方税抜き金額:'12345'})]);
 assert.equal(ui.element('#q-regular').value,'600000');assert.match(ui.element('#q-warnings').innerHTML,/未分類/);
 await ui.event('#q-calculate');assert.notEqual(ui.element('#q-result').innerHTML,'');
 const unknown=ui.mapping().find(node=>node.value==='unknown');assert.ok(unknown);unknown.value='regular';await unknown.dispatch('change');
 assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.element('#q-inputs').hidden,true);
 await ui.event('#q-analyze');assert.equal(ui.element('#q-regular').value,'612345');assert.equal(ui.element('#q-previousAnnual').value,'');
 const changed=ui.mapping().find(node=>node.dataset.qMap===unknown.dataset.qMap);changed.value='exclude';await changed.dispatch('change');await ui.event('#q-analyze');assert.equal(ui.element('#q-regular').value,'600000');
});

test('期間変更は税額と印刷を無効化し、期間矛盾を再集計で停止する',async()=>{
 const ui=harness();await prepare(ui);await ui.event('#q-calculate');assert.equal(ui.element('#q-print').hidden,false);
 ui.element('#q-through').value='2026-08';await ui.event('#q-through','input');
 assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.element('#q-print').hidden,true);assert.equal(ui.element('#q-inputs').hidden,true);assert.equal(ui.api.snapshot(),null);
 await ui.event('#q-calculate');assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.api.snapshot(),null);
 await ui.event('#q-analyze');assert.equal(ui.element('#q-inputs').hidden,true);assert.match(ui.element('#q-status').textContent,/期間外/);
});

test('入力更新後に戻った古い公式応答は結果・印刷を復活させない',async()=>{
 const ui=harness();await prepare(ui);const pending=deferred();ui.refresh(()=>pending.promise);
 const calculating=ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/控除額の表示を保留/);
 ui.element('#q-regular').value='12';await ui.event('#q-regular','input');pending.resolve(true);await calculating;
 assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.element('#q-print').hidden,true);
});

test('公式確認不可は税額だけ保留し、確認済み結果の失効でも印刷を止める',async()=>{
 const ui=harness();await prepare(ui);ui.ready(false);await ui.event('#q-calculate');
 assert.match(ui.element('#q-result').innerHTML,/年間給与見込/);assert.match(ui.element('#q-result').innerHTML,/控除額の表示を保留/);assert.equal(ui.element('#q-print').hidden,true);
 ui.ready(true);await ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/控除の目安（税額上限前）/);assert.equal(ui.element('#q-print').hidden,false);
 ui.ready(false);ui.api.checkState();assert.ok(!ui.element('#q-result').innerHTML.includes('控除の目安（税額上限前）'));assert.equal(ui.element('#q-print').hidden,true);
 await ui.event('#q-print');assert.equal(ui.prints(),0);
});

test('税額空欄・明示0円と未対応年度の理由を別表示する',async()=>{
 const ui=harness();ui.api.restore(base);await ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/税額上限前/);
 ui.element('#q-corporateTax').value='0';await ui.event('#q-corporateTax','input');await ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/税額上限 0円/);
 ui.api.restore({...base,start:'2028-04',through:'2028-09'});await ui.event('#q-calculate');assert.match(ui.element('#q-result').innerHTML,/未対応/);assert.ok(!ui.element('#q-result').innerHTML.includes('前年通年額が0円'));
});

test('復元は金額・期間だけで結果と公式確認を戻さず、不正値は既存状態を変更しない',async()=>{
 const ui=harness();await prepare(ui);await ui.event('#q-calculate');const saved=JSON.parse(JSON.stringify(ui.api.snapshot()));
 assert.deepEqual(Object.keys(saved).sort(),keys.slice().sort());assert.ok(!JSON.stringify(saved).includes('架空の取引先'));
 ui.api.restore(saved);assert.equal(ui.element('#q-result').innerHTML,'');assert.equal(ui.element('#q-print').hidden,true);assert.equal(ui.element('#q-inputs').hidden,false);
 const before=ui.values();assert.throws(()=>ui.api.restore({...saved,regular:'=1+1'}));assert.deepEqual(ui.values(),before);
 assert.throws(()=>ui.api.restore({...saved,start:'2026-13'}));assert.deepEqual(ui.values(),before);
 const manual=restoreCase(saveCase(initialInput(),'manual',undefined,saved));assert.equal(manual.inputMethod,'manual');assert.equal(manual.view,'input');
});

test('概算印刷のフラグは専用クリックの間だけ有効で、根拠を印刷対象へ渡す',async()=>{
 const ui=harness();ui.api.restore(base);await ui.event('#q-calculate');assert.equal(ui.api.printing(),false);
 let printed='';ui.onPrint(api=>{assert.equal(api.printing(),true);assert.equal(api.beforePrint(),true);printed=ui.element('#printArea').innerHTML;});
 await ui.event('#q-print');assert.equal(ui.prints(),1);assert.equal(ui.api.printing(),false);assert.match(printed,/年間見込・条件付き概算/);assert.match(printed,/2026-10-20T00:00:00Z/);assert.match(printed,/合成の公式出典/);assert.match(printed,/<details open>/);
 assert.equal(ui.element('#printArea').innerHTML,'');
});

test('実appと実quickは進行中の公式確認を共有し、詳細と概算の印刷元を混同しない',async()=>{
 const nodes=new Map(),windowEvents=new Map(),intervals=[],requests=[],printed=[],first=deferred();
 function node(id){
  if(nodes.has(id))return nodes.get(id);
  let html='';const events=new Map();
  const el={value:'',hidden:false,disabled:false,textContent:'',className:'',dataset:{},classList:{toggle(){}},setAttribute(){},insertAdjacentHTML(){},
   querySelector:node,querySelectorAll(selector){if(selector!=='details')return[];return [...html.matchAll(/<details\b/g)].map(()=>{const detail={};Object.defineProperty(detail,'open',{set(open){if(open)html=html.replace(/<details(?![^>]*\bopen\b)([^>]*)>/,'<details$1 open>');}});return detail;});},
   addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},
   async dispatch(type){for(const handler of events.get(type)??[])await handler();}};
  Object.defineProperty(el,'innerHTML',{get:()=>html,set(value){html=value;}});nodes.set(id,el);return el;
 }
 const nav=['csv','input','result','sources'].map(name=>{const el=node('nav-'+name);el.dataset.tab=name;return el;});
 const document={hidden:false,querySelector:node,querySelectorAll:selector=>selector==='.nav'?nav:[],addEventListener(){}};
 const window={scrollTo(){},confirm:()=>true,addEventListener(type,handler){windowEvents.set(type,handler);},print(){windowEvents.get('beforeprint')?.();printed.push(node('#printArea').innerHTML);}};
 function response(){const now=Date.now();return{ok:true,json:async()=>({ruleVersion:rules.RULE_VERSION,codeHash:EXPECTED_CODE_HASH,clientHash:EXPECTED_CLIENT_HASH,checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),scope:'合成の公式確認',reasons:[],sources:rules.SOURCES.map(s=>({...s,ok:true,hash:'0'.repeat(64)})),features:Object.fromEntries(Object.entries(rules.FEATURES).map(([id,f])=>[id,{ready:true,coverage:{from:f.from,through:f.through},validUntil:new Date(now+86400000).toISOString(),reviewer:'合成レビュー'}]))})};}
 const context={startFxImport:createTestImporter(),fxProgressText,FX_LIMITS,FX_LIMIT_TEXT,...quick,...overlap,...rules,...fields,...entry,...verification,readFxCloud,decodeCsv,certification,calculateCase,createCalculationHandler,EXPECTED_CODE_HASH,EXPECTED_CLIENT_HASH,sample,document,window,performance,AbortSignal,Blob,URL,console,
  setInterval:handler=>intervals.push(handler),setTimeout(){},checkEndpoint:()=>'/api/check',verifyPublicSources:async()=>{},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async(url,options)=>{requests.push({url,options});return requests.length===1?first.promise:response();},
  mountFxImport:()=>({reset(){}})};
 vm.createContext(context);
 context.mountQuick=vm.runInContext('(function(){'+source+';return mountQuick;})()',context);
 const mount=context.mountQuick;context.mountQuick=options=>{const api=mount(options);context.quickApi=api;return api;};
 const app=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 vm.runInContext(app,context);
 context.quickApi.restore(base);
 const calculating=node('#q-calculate').dispatch('click');
 assert.equal(requests.length,1);assert.match(node('#q-result').innerHTML,/控除額の表示を保留/);
 first.resolve(response());await calculating;
 assert.match(node('#q-result').innerHTML,/控除の目安（税額上限前）/);
 vm.runInContext('input=sample();',context);await node('#calculate').dispatch('click');
 assert.match(node('#results').innerHTML,/当期控除額の概算/);
 await node('#print').dispatch('click');assert.match(printed.at(-1),/試算サマリー/);assert.ok(!printed.at(-1).includes('年間見込・条件付き概算'));
 await node('#q-print').dispatch('click');assert.match(printed.at(-1),/年間見込・条件付き概算/);
 assert.equal(requests.length,2);for(const {url,options}of requests){assert.equal(url,'/api/check');assert.equal(options.method,'POST');assert.equal(options.body,undefined);}
 vm.runInContext('check.features.quickEstimate.ready=false;',context);for(const tick of intervals)tick();
 assert.ok(!node('#q-result').innerHTML.includes('控除の目安（税額上限前）'));assert.equal(node('#q-print').hidden,true);
});
