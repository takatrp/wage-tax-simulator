import {createFxParser} from './fxcloud.mjs';
import {fingerprintBytes} from './journal-overlap.mjs';
import {FX_LIMITS,validateFxSelection} from './fx-limits.mjs';
class EncodingError extends Error{}
const aborted=()=>Object.assign(Error('CSV取込を取り消しました。'),{name:'AbortError'});
function check(signal){if(signal?.aborted)throw aborted();}
async function parseFile(file,encoding,{onProgress,signal,chunkBytes,maxRows}){
  const parser=createFxParser({maxRows}),decoder=new TextDecoder(encoding,{fatal:true});let compacted=0;
  async function compact(){
    const transactions=parser.transactions;
    // Bound both temporary canonical text and outstanding WebCrypto operations.
    while(compacted<transactions.length){check(signal);const group=transactions.slice(compacted,compacted+128);await Promise.all(group.map(async t=>{t.identity='sha256:'+await fingerprintBytes(new TextEncoder().encode(t.identity));}));compacted+=group.length;}
  }
  for(let offset=0;offset<file.size;offset+=chunkBytes){
    check(signal);const bytes=await file.slice(offset,Math.min(file.size,offset+chunkBytes)).arrayBuffer();check(signal);
    let text;try{text=decoder.decode(bytes,{stream:true});}catch{throw new EncodingError('文字コードを読み取れません。UTF-8 / Shift_JISを確認してください。');}
    parser.write(text);await compact();check(signal);onProgress({phase:'parse',encoding,bytes:Math.min(file.size,offset+chunkBytes),rows:parser.count});
  }
  let tail;try{tail=decoder.decode();}catch{throw new EncodingError('文字コード末尾が不完全です。UTF-8 / Shift_JISを確認してください。');}
  parser.write(tail);const data=parser.finish();await compact();check(signal);return data;
}
export async function importFxFiles(files,{encoding='auto',onProgress=()=>{},signal,chunkBytes=FX_LIMITS.chunkBytes}={}){
  validateFxSelection(files);if(!['auto','utf-8','shift_jis'].includes(encoding))throw Error('文字コードを選択してください。');
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>FX_LIMITS.chunkBytes)throw Error('CSV分割サイズが不正です。');
  const result=[],parsedCopies=new Map();let totalRows=0,completedBytes=0;const totalBytes=files.reduce((n,f)=>n+f.size,0);
  for(let i=0;i<files.length;i++){
    check(signal);const file=files[i],progress=p=>onProgress({...p,file:i+1,files:files.length,fileBytes:file.size,totalBytes,completedBytes});
    progress({phase:'fingerprint',bytes:0,rows:0});
    // A bounded full-byte digest identifies copies; it never leaves this browser.
    const byteHash=await fingerprintBytes(await file.arrayBuffer());check(signal);
    const options={onProgress:progress,signal,chunkBytes,maxRows:Math.min(FX_LIMITS.fileRows,FX_LIMITS.totalRows-totalRows)};
    async function attempt(enc){try{return await parseFile(file,enc,options);}catch(e){if(options.maxRows<FX_LIMITS.fileRows&&/データ行以内/.test(e.message))throw Error('CSVは合計200,000データ行以内にしてください。');throw e;}}
    let data;try{data=parsedCopies.get(byteHash)??await attempt(encoding==='auto'?'utf-8':encoding);}
    catch(e){if(encoding!=='auto'||!(e instanceof EncodingError))throw e;check(signal);progress({phase:'retry',encoding:'shift_jis',bytes:0,rows:0});data=await attempt('shift_jis');}
    totalRows+=data.rows;if(totalRows>FX_LIMITS.totalRows)throw Error('CSVは合計200,000データ行以内にしてください。');
    parsedCopies.set(byteHash,data);result.push({...data,byteHash});progress({phase:'complete',bytes:file.size,rows:data.rows});completedBytes+=file.size;
  }
  check(signal);return result;
}
