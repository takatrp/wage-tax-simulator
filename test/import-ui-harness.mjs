// Fake Worker transport for real UI handlers. Browser/core tests are separate.
import {startFxImport} from '../public/fx-import-client.mjs';
import {decodeCsv} from '../public/csv.mjs';
import {readFxCloud} from '../public/fxcloud.mjs';
import {fingerprintBytes} from '../public/journal-overlap.mjs';
import {FX_LIMITS} from '../public/fx-limits.mjs';
export function createTestImporter({decode=decodeCsv,fingerprint=fingerprintBytes}={}){
 return(files,options)=>startFxImport(files,{...options,workerFactory:()=>{
  let stopped=false;const worker={terminate(){stopped=true;},postMessage({id,files,encoding}){
   void(async()=>{try{const result=[];for(const file of files){const bytes=await file.arrayBuffer();if(stopped)return;const byteHash=await fingerprint(bytes);if(stopped)return;let text;if(encoding==='auto'){try{text=decode(bytes,'utf-8',{maxBytes:FX_LIMITS.fileBytes});}catch{text=decode(bytes,'shift_jis',{maxBytes:FX_LIMITS.fileBytes});}}else text=decode(bytes,encoding,{maxBytes:FX_LIMITS.fileBytes});result.push({...readFxCloud(text),byteHash});}if(!stopped)worker.onmessage({data:{id,type:'result',result}});}catch(error){if(!stopped)worker.onmessage({data:{id,type:'error',message:error.message}});}})();
  }};return worker;
 }});
}
