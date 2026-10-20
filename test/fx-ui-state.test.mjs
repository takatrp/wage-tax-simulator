import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {decodeCsv} from '../public/csv.mjs';
import * as fx from '../public/fxcloud.mjs';
import {initialInput} from '../public/fields.mjs';
import {journal,fxOptions} from './fx-fixtures.mjs';

// Execute the real event handlers with only the DOM operations this module uses.
// This checks state transitions, not browser rendering or file chooser behavior.
const source=readFileSync(new URL('../public/fx-ui.mjs',import.meta.url),'utf8')
 .replace(/^import[^\n]+\n/gm,'')
 .replace('export function mountFxImport','function mountFxImport');

function harness(){
 const handlers=new Map(),elements=new Map();
 let roles=[],accounts=[],decodeCalls=0;
 function element(selector){
  if(['#csvFile','#csvKind','#template','#applyCsv','#mapping'].includes(selector))throw new Error('Removed standard CSV control: '+selector);
  if(elements.has(selector))return elements.get(selector);
  let html='';
  const node={value:'',checked:false,disabled:false,hidden:false,textContent:'',className:'',dataset:{},
   insertAdjacentHTML(){},
   addEventListener(event,handler){handlers.set(selector+':'+event,handler);}};
  Object.defineProperty(node,'innerHTML',{get:()=>html,set(value){
   html=value;
   if(selector==='#fxFileList')roles=[...value.matchAll(/data-fx-role="(\d+)"/g)].map(match=>{
    const control=element('[data-fx-role="'+match[1]+'"]');
    control.dataset.fxRole=match[1];control.value='auto';return control;
   });
   if(selector==='#fxAccountMap')accounts=[...value.matchAll(/<select data-fx-account="(\d+)">([\s\S]*?)<\/select>/g)].map(match=>{
    const control=element('[data-fx-account="'+match[1]+'"]');
    control.dataset.fxAccount=match[1];
    control.value=match[2].match(/<option value="([^"]+)" selected>/)?.[1]??'unknown';
    return control;
   });
  }});
  elements.set(selector,node);return node;
 }
 const periods=['start','end','prevStart','prevEnd','cutoff'].map(key=>element('#fx-'+key));
 const context={...fx,decodeCsv(bytes,encoding){decodeCalls++;return decodeCsv(bytes,encoding);},
  document:{querySelector:element,querySelectorAll:selector=>
   selector==='[data-fx-role]'?roles:selector==='[data-fx-account]'?accounts:
   selector==='[data-fx-period]'?periods:[]},
  callbacks:{getInput:initialInput,onApply(){},onDirty(){}}};
 vm.createContext(context);
 vm.runInContext(source+'\nmountFxImport(callbacks);',context);
 element('#fxEncoding').value='utf-8';element('#fx-cutoff').value=fxOptions.cutoff;
 return{element,decodeCalls:()=>decodeCalls,
  load:files=>handlers.get('#fxFiles:change')({target:{files}}),
  click:selector=>handlers.get(selector+':click')(),
  change:selector=>handlers.get(selector+':change')()};
}

function file(text){const bytes=new TextEncoder().encode(text).buffer;return{size:bytes.byteLength,arrayBuffer:async()=>bytes};}
function annualPair(){return[file(journal()),file(journal({start:'2025-04',months:12,value:'90000',prefix:'P'}))];}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

test('FX CSVは1件5MB超ならバイト読込を開始しない',async()=>{
 const ui=harness();let reads=0;
 await ui.load([{size:5*1024*1024+1,arrayBuffer:async()=>{reads++;return new ArrayBuffer(5*1024*1024+1);}}]);
 assert.equal(reads,0);
 assert.match(ui.element('#fxStatus').textContent,/5MB/);
});

test('古い読込の失敗は新しい正常ファイルと解析状態を上書きしない',async()=>{
 const ui=harness(),old=deferred();
 const pending=ui.load([{size:1,arrayBuffer:()=>old.promise}]);
 await ui.load(annualPair());ui.click('#fxAnalyze');
 assert.equal(ui.element('#fxReview').hidden,false);
 const currentStatus=ui.element('#fxStatus').textContent;
 old.reject(new Error('SYNTHETIC OBSOLETE READ FAILURE'));await pending;
 assert.equal(ui.element('#fxStatus').textContent,currentStatus);
 ui.click('#fxAnalyze');
 assert.equal(ui.element('#fxReview').hidden,false);
 assert.match(ui.element('#fxFileList').innerHTML,/資料2/);
});

test('文字コード変更で取消した読込のバイトは復号せず破棄する',async()=>{
 const ui=harness(),old=deferred();
 const pending=ui.load([{size:2,arrayBuffer:()=>old.promise}]);
 ui.element('#fxEncoding').value='shift_jis';ui.change('#fxEncoding');
 const resetStatus=ui.element('#fxStatus').textContent;
 old.resolve(Uint8Array.from([0xff,0xff]).buffer);await pending;
 assert.equal(ui.decodeCalls(),0);
 assert.equal(ui.element('#fxStatus').textContent,resetStatus);
 assert.equal(ui.element('#fxFileList').innerHTML,'');
 assert.equal(ui.element('#fxReview').hidden,true);
});
