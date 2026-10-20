import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCsvParser} from '../public/csv-parser.mjs';
import {importFxFiles} from '../public/fx-import-core.mjs';
import {fxProgressText} from '../public/fx-import-client.mjs';
import {FX_LIMITS,FX_LIMIT_TEXT} from '../public/fx-limits.mjs';
import {inspectJournalOverlap} from '../public/journal-overlap.mjs';
import {initialInput} from '../public/fields.mjs';
import {journal,journalRow,FX_HEADERS,encodeRows} from './fx-fixtures.mjs';

test('independent: every small chunk boundary keeps quoted CRLF, escaped quotes and physical source lines',()=>{
  const text='a,b\r\n"x\r\ny",z\r\n"q""r",w\r\n';
  for(let chunk=1;chunk<=text.length;chunk++){
    const p=createCsvParser();for(let i=0;i<text.length;i+=chunk)p.write(text.slice(i,i+chunk));
    const got=p.finish();assert.deepEqual(got.headers,['a','b']);assert.deepEqual(got.rows,[['x\r\ny','z'],['q"r','w']]);assert.deepEqual(got.lineNumbers,[2,4]);
  }
});

test('independent: canonical all-column identity survives column order, optional index, normalized dates/money',async()=>{
  const row=journalRow({伝票番号:'',元帳摘要:'架空の参照,\r\n"同内容"'});
  const reordered=['index',...FX_HEADERS].reverse();
  const other={...row,月日:'2026-04-25',借方取引金額:'100,000.00',借方税抜き金額:'100000.0',index:'99'};
  const files=[new Blob([encodeRows(FX_HEADERS,[FX_HEADERS.map(h=>row[h]??'')])]),new Blob([encodeRows(reordered,[reordered.map(h=>other[h]??'')])])];
  const data=await importFxFiles(files,{chunkBytes:3});
  assert.equal(data[0].transactions[0].identity,data[1].transactions[0].identity);
  assert.notEqual(data[0].byteHash,data[1].byteHash);
  assert.equal(data[0].rows,1);assert.equal(data[1].rows,1);
  assert.equal(data[0].missingVoucher,1);assert.equal(data[1].missingVoucher,1);
  assert.equal(JSON.stringify(data).includes('架空の参照'),false);
});

test('independent: aggregate progress does not double count the completed file or move backwards',async()=>{
  const blob=new Blob([journal({months:1})]),events=[];
  await importFxFiles([blob,blob],{onProgress:p=>events.push(p)});
  const completeFirst=events.find(p=>p.phase==='complete'&&p.file===1);
  assert.equal(completeFirst.completedBytes+(completeFirst.bytes??0),blob.size);
  assert.match(fxProgressText(completeFirst),/50%/);
  let prior=0;for(const p of events){const done=Math.min(p.totalBytes,p.completedBytes+(p.bytes??0));assert.ok(done>=prior,`progress moved backwards at ${p.file}/${p.phase}`);prior=done;}
  assert.equal(prior,blob.size*2);
});

// Execute the real UI cancellation handlers using the small DOM surface they
// access. Native same-file chooser change suppression still needs browser QA.
function cancelHarness(kind){
  const nodes=new Map(),get=selector=>{
    if(nodes.has(selector))return nodes.get(selector);
    const handlers=new Map(),node={value:'',files:[],innerHTML:'',textContent:'',hidden:false,disabled:false,checked:false,dataset:{},insertAdjacentHTML(){},querySelector:get,querySelectorAll(){return[];},addEventListener(type,fn){handlers.set(type,fn);},dispatch(type,arg){return handlers.get(type)?.(arg);}};
    nodes.set(selector,node);return node;
  };
  const periods=['start','end','prevStart','prevEnd','cutoff'].map(k=>get('#fx-'+k));
  let cancels=0;
  const context={FX_LIMITS,FX_LIMIT_TEXT,QUICK_ASSUMPTIONS:[],initialInput,
    fxProgressText,document:{querySelector:get,querySelectorAll:s=>s==='[data-fx-period]'?periods:[]},
    startFxImport(){let reject;const promise=new Promise((yes,no)=>{reject=no;});return{promise,cancel(){cancels++;reject(Object.assign(Error('cancelled'),{name:'AbortError'}));}};},
    getInput:initialInput,onApply(){},onDirty(){},root:get('root'),refresh:async()=>{},isReady:()=>true};
  vm.createContext(context);
  const path=kind==='quick'?'quick-ui.mjs':'fx-ui.mjs',source=readFileSync(new URL('../public/'+path,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source+(kind==='quick'?'\nmountQuick({root,refresh,isReady});':'\nmountFxImport({getInput,onApply,onDirty});'),context);
  return{get,cancels:()=>cancels};
}

for(const kind of ['quick','fx'])test(`independent: ${kind} period-change cancellation clears file input for reselecting the same original`,async()=>{
  const ui=cancelHarness(kind),input=ui.get(kind==='quick'?'#q-files':'#fxFiles');
  input.value='C:\\fakepath\\synthetic.csv';input.files=[{size:1}];
  if(kind==='quick')ui.get('#q-encoding').value='utf-8';else ui.get('#fxEncoding').value='utf-8';
  const pending=input.dispatch('change',{target:input});
  ui.get(kind==='quick'?'#q-start':'#fx-start').dispatch('input');await pending;
  assert.equal(ui.cancels(),1);assert.equal(input.value,'');
  assert.match(ui.get(kind==='quick'?'#q-status':'#fxStatus').textContent,/期間.*取消|期間.*取り消/);
  assert.equal(ui.get(kind==='quick'?'#q-inputs':'#fxReview').hidden,true);
});

test('independent: byte-copy cache hashes each original but parses once, preserves legitimate repeated rows, and is job-local',async()=>{
  const row=journalRow({伝票番号:''}),blob=new Blob([journal({months:0,extra:[row,row]})]);
  const reads=[0,0],slices=[0,0];
  const files=[0,1].map(i=>({size:blob.size,arrayBuffer(){reads[i]++;return blob.arrayBuffer();},slice(...args){slices[i]++;return blob.slice(...args);}}));
  const data=await importFxFiles(files,{chunkBytes:11});
  assert.deepEqual(reads,[1,1]);assert.ok(slices[0]>0);assert.equal(slices[1],0);
  assert.equal(data[0].rows,2);assert.equal(data[1].rows,2);
  assert.strictEqual(data[0].entries,data[1].entries);assert.strictEqual(data[0].transactions,data[1].transactions);
  const d=inspectJournalOverlap(data,{period:{current:['2026-04'],previous:[]}});
  assert.equal(d.duplicateFiles.length,1);assert.equal(d.within[0].rows,2);assert.equal(d.within[0].payroll.current,'200000');
  await importFxFiles([files[1]],{chunkBytes:11});assert.equal(reads[1],2);assert.ok(slices[1]>0,'a new job must parse afresh');
});
