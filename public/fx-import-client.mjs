import {FX_LIMITS,validateFxSelection} from './fx-limits.mjs';
let nextId=0;
export const importCancelled=()=>Object.assign(Error('CSV取込を取り消しました。'),{name:'AbortError'});
export function startFxImport(files,{encoding='auto',onProgress=()=>{},workerFactory=()=>new Worker(new URL('./fx-import-worker.mjs',import.meta.url),{type:'module'})}={}){
  validateFxSelection(files);const id=++nextId;let worker,settled=false,resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  function finish(error,result){if(settled)return;settled=true;worker?.terminate();error?reject(error):resolve(result);}
  try{
    worker=workerFactory();
    worker.onmessage=({data})=>{
      if(settled||data?.id!==id)return;
      if(data.type==='progress')onProgress(data.progress);
      else if(data.type==='result'){
        const r=data.result,valid=Array.isArray(r)&&r.length===files.length&&r.every(f=>f?.format==='fxcloud-journal'&&Number.isSafeInteger(f.rows)&&f.rows>0&&f.rows<=FX_LIMITS.fileRows&&Array.isArray(f.entries)&&f.entries.length>0&&f.entries.length<=f.rows*2&&Array.isArray(f.transactions)&&f.transactions.length===f.rows&&/^[a-f0-9]{64}$/.test(f.byteHash??''))&&r.reduce((n,f)=>n+f.rows,0)<=FX_LIMITS.totalRows;
        finish(valid?null:Error('CSVの全件読取結果を確認できません。途中結果は採用していません。'),r);
      }else if(data.type==='error')finish(Error(data.message));
    };
    worker.onerror=event=>{event.preventDefault?.();finish(Error('CSV読取Workerが停止しました。ファイルを分割し、ブラウザを更新して再試行してください。'));};
    worker.onmessageerror=()=>finish(Error('CSV読取結果を受け取れません。ファイルを分割して再試行してください。'));
    worker.postMessage({id,files,encoding});
  }catch{finish(Error('このブラウザではCSV読取Workerを開始できません。対応ブラウザで再試行してください。'));}
  return{promise,cancel:()=>finish(importCancelled())};
}
export function fxProgressText(p){const done=Math.min(p.totalBytes,p.completedBytes+(p.bytes??0)),percent=p.totalBytes?Math.floor(done*100/p.totalBytes):0;return `CSV ${p.file}/${p.files}：${p.phase==='fingerprint'?'ファイル指紋を確認中':p.phase==='retry'?'Shift_JISで再読取中':'読取・検証中'} ${percent}% / ${Number(p.rows??0).toLocaleString('ja-JP')}行。取消できます。`;}
