import {importFxFiles} from './fx-import-core.mjs';
// Dedicated module Worker. CSV bytes, names and payroll never go to a server.
self.onmessage=async({data})=>{
  const {id,files,encoding}=data;
  try{const result=await importFxFiles(files,{encoding,onProgress:progress=>self.postMessage({id,type:'progress',progress})});self.postMessage({id,type:'result',result});}
  catch(error){self.postMessage({id,type:'error',message:error?.message??'CSVの読取に失敗しました。'});}
};
