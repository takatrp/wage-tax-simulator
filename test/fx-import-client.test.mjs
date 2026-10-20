import test from 'node:test';
import assert from 'node:assert/strict';
import {startFxImport,fxProgressText} from '../public/fx-import-client.mjs';
import {FX_LIMITS} from '../public/fx-limits.mjs';
import {importFxFiles} from '../public/fx-import-core.mjs';
import {readFxCloud} from '../public/fxcloud.mjs';
import {journal,journalRow} from './fx-fixtures.mjs';

// The real client with a controlled Worker boundary. These are protocol/state
// tests, not a claim that a browser's module Worker or file picker was exercised.
class FakeWorker {
  constructor(){this.posts=[];this.terminations=0;}
  postMessage(message){this.posts.push(message);}
  terminate(){this.terminations++;}
  message(data){this.onmessage?.({data});}
  error(event={}){this.onerror?.(event);}
  messageError(){this.onmessageerror?.({});}
  get id(){return this.posts[0].id;}
}
const file=size=>({size});
const syntheticData=()=>readFxCloud(journal({months:1}));
const normalResult=files=>files.map(()=>({...syntheticData(),byteHash:'a'.repeat(64)}));
function start(files=[file(1)],options={}){
  const worker=new FakeWorker(),progress=[];
  const job=startFxImport(files,{workerFactory:()=>worker,onProgress:p=>progress.push(p),...options});
  return{job,worker,progress};
}
async function cancel(job){const rejected=assert.rejects(job.promise,{name:'AbortError'});job.cancel();await rejected;}

test('Workerへの入力は選択全件・固定文字コード・job IDで渡し、進捗だけでは結果を採用しない',async()=>{
  const files=[file(1),file(2)],{job,worker,progress}=start(files,{encoding:'shift_jis'});
  let settled=false;job.promise.then(()=>{settled=true;},()=>{settled=true;});
  assert.equal(worker.posts.length,1);assert.strictEqual(worker.posts[0].files,files);
  assert.equal(worker.posts[0].encoding,'shift_jis');assert.equal(Number.isSafeInteger(worker.id),true);
  const p={phase:'parse',file:1,files:2,rows:500,bytes:1,completedBytes:0,totalBytes:3};
  worker.message({id:worker.id,type:'progress',progress:p});await Promise.resolve();
  assert.deepEqual(progress,[p]);assert.equal(settled,false);assert.equal(worker.terminations,0);
  const result=normalResult(files);worker.message({id:worker.id,type:'result',result});
  assert.strictEqual(await job.promise,result);assert.equal(worker.terminations,1);
});

test('他job・ID欠落のprogress/result/errorは全て無視する',async()=>{
  const {job,worker,progress}=start();let settled=false;job.promise.then(()=>{settled=true;},()=>{settled=true;});
  for(const id of [worker.id+1,worker.id-1,undefined]){
    worker.message({id,type:'progress',progress:{rows:999}});
    worker.message({id,type:'result',result:normalResult([file(1)])});
    worker.message({id,type:'error',message:'OBSOLETE ERROR'});
  }
  await Promise.resolve();assert.deepEqual(progress,[]);assert.equal(settled,false);assert.equal(worker.terminations,0);
  const result=normalResult([file(1)]);worker.message({id:worker.id,type:'result',result});assert.strictEqual(await job.promise,result);
});

test('取消は応答を待たずPromiseを終了しterminateする。取消後の旧eventは不採用',async()=>{
  const {job,worker,progress}=start();const rejection=assert.rejects(job.promise,{name:'AbortError'});
  job.cancel();assert.equal(worker.terminations,1);await rejection;
  worker.message({id:worker.id,type:'progress',progress:{rows:1000}});
  worker.message({id:worker.id,type:'result',result:normalResult([file(1)])});
  worker.message({id:worker.id,type:'error',message:'LATE ERROR'});
  worker.error();worker.messageError();job.cancel();
  assert.deepEqual(progress,[]);assert.equal(worker.terminations,1);
});

test('旧job取消後の新jobは独立し、古いprogress/result/errorで終了しない',async()=>{
  const old=start();await cancel(old.job);const current=start();
  assert.notEqual(current.worker.id,old.worker.id);
  let settled=false;current.job.promise.then(()=>{settled=true;},()=>{settled=true;});
  for(const id of [old.worker.id,current.worker.id]){
    old.worker.message({id,type:'progress',progress:{rows:999}});
    old.worker.message({id,type:'result',result:normalResult([file(1)])});
    old.worker.message({id,type:'error',message:'OLD WORKER'});
  }
  current.worker.message({id:old.worker.id,type:'result',result:normalResult([file(1)])});
  await Promise.resolve();assert.equal(settled,false);assert.deepEqual(current.progress,[]);assert.equal(current.worker.terminations,0);
  const result=normalResult([file(1)]);current.worker.message({id:current.worker.id,type:'result',result});
  assert.strictEqual(await current.job.promise,result);assert.equal(current.worker.terminations,1);
});

test('正常終了後は重ねたresult/error/progress/取消で結果を変えずterminateは1回',async()=>{
  const {job,worker,progress}=start(),result=normalResult([file(1)]);
  worker.message({id:worker.id,type:'result',result});assert.strictEqual(await job.promise,result);
  worker.message({id:worker.id,type:'result',result:[]});worker.message({id:worker.id,type:'error',message:'TOO LATE'});
  worker.message({id:worker.id,type:'progress',progress:{rows:99}});worker.error();worker.messageError();job.cancel();
  assert.strictEqual(await job.promise,result);assert.deepEqual(progress,[]);assert.equal(worker.terminations,1);
});

test('同一jobのWorker error応答を伝え、ブラウザerror/messageerrorもrejectして終了する',async()=>{
  let state=start(),rejected=assert.rejects(state.job.promise,/SYNTHETIC INVALID CSV/);
  state.worker.message({id:state.worker.id,type:'error',message:'SYNTHETIC INVALID CSV'});await rejected;assert.equal(state.worker.terminations,1);
  state=start();let prevented=0;rejected=assert.rejects(state.job.promise,/Workerが停止/);
  state.worker.error({preventDefault(){prevented++;}});await rejected;assert.equal(prevented,1);assert.equal(state.worker.terminations,1);
  state=start();rejected=assert.rejects(state.job.promise,/結果を受け取れません/);
  state.worker.messageError();await rejected;assert.equal(state.worker.terminations,1);
});

test('Worker生成失敗とpostMessage失敗をrejectし、生成済Workerは終了する',async()=>{
  let calls=0;const job=startFxImport([file(1)],{workerFactory(){calls++;throw Error('SYNTHETIC FACTORY FAILURE');}});
  await assert.rejects(job.promise,/Workerを開始できません/);assert.equal(calls,1);job.cancel();
  const worker=new FakeWorker();worker.postMessage=()=>{throw Error('SYNTHETIC CLONE FAILURE');};
  const clone=startFxImport([file(1)],{workerFactory:()=>worker});await assert.rejects(clone.promise,/Workerを開始できません/);assert.equal(worker.terminations,1);
});

test('20MiB/件・40MiB合計・8件のちょうど境界はWorker開始を許可する',async()=>{
  assert.equal(FX_LIMITS.fileBytes,20*1024*1024);assert.equal(FX_LIMITS.totalBytes,40*1024*1024);assert.equal(FX_LIMITS.files,8);
  for(const files of [[file(FX_LIMITS.fileBytes)],[file(FX_LIMITS.fileBytes),file(FX_LIMITS.fileBytes)],Array.from({length:8},()=>file(1))]){
    let calls=0;const worker=new FakeWorker(),job=startFxImport(files,{workerFactory(){calls++;return worker;}});
    assert.equal(calls,1);assert.strictEqual(worker.posts[0].files,files);await cancel(job);
  }
});

test('容量超過・9件・空選択・不正sizeはWorker生成前に拒否しファイルを読まない',()=>{
  let calls=0;const workerFactory=()=>{calls++;return new FakeWorker();};
  const invalid=[[],Array.from({length:9},()=>file(1)),[file(FX_LIMITS.fileBytes+1)],
    [file(FX_LIMITS.fileBytes),file(FX_LIMITS.fileBytes),file(1)],
    ...[-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',undefined].map(size=>[file(size)])];
  for(const files of invalid)assert.throws(()=>startFxImport(files,{workerFactory}));
  assert.equal(calls,0);
});

test('正常resultは全ファイル分だけ受け入れ、部分結果・多すぎる結果・非配列はrejectする',async()=>{
  for(const result of [[],normalResult([file(1)]),normalResult([file(1),file(1),file(1)]),null,{}]){
    const {job,worker}=start([file(1),file(1)]),rejected=assert.rejects(job.promise);
    worker.message({id:worker.id,type:'result',result});await rejected;assert.equal(worker.terminations,1);
  }
});

test('実coreの空番号・一致行保持を含む全件結果をclientがそのまま受理する',async()=>{
  const blank=journalRow({伝票番号:'',元帳摘要:'架空の同内容を別仕訳として保持'});
  const blob=new Blob([journal({months:0,extra:[blank,blank]})]);
  const data=await importFxFiles([blob],{encoding:'utf-8',chunkBytes:7});
  assert.equal(data.length,1);assert.equal(data[0].rows,2);assert.equal(data[0].entries.length,4);
  assert.equal(data[0].transactions[0].identity,data[0].transactions[1].identity);
  assert.match(data[0].transactions[0].identity,/^sha256:[a-f0-9]{64}$/);assert.match(data[0].byteHash,/^[a-f0-9]{64}$/);
  const {job,worker}=start([blob]);worker.message({id:worker.id,type:'result',result:data});assert.strictEqual(await job.promise,data);
});

test('進捗表示は全ファイルの完了バイトを含め、上限100%で取消可能と表示する',()=>{
  const base={file:2,files:2,totalBytes:100,completedBytes:60,bytes:20,rows:10001};
  assert.match(fxProgressText({...base,phase:'parse'}),/80%.*10,001行.*取消/);
  assert.match(fxProgressText({...base,phase:'fingerprint'}),/ファイル指紋/);
  assert.match(fxProgressText({...base,phase:'retry'}),/Shift_JIS/);
  assert.match(fxProgressText({...base,bytes:60,phase:'parse'}),/100%/);
});
