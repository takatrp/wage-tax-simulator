// Measured desktop-browser budget, not an unlimited or all-device guarantee.
export const FX_LIMITS=Object.freeze({files:8,fileBytes:20*1024*1024,totalBytes:40*1024*1024,fileRows:100000,totalRows:200000,chunkBytes:64*1024});
export const FX_LIMIT_TEXT='1件20MB・100,000行、最大8件・合計40MB・200,000行。端末の空きメモリによっては上限内でも分割出力してください。';
export function validateFxSelection(files){
  if(!files.length||files.length>FX_LIMITS.files)throw Error('CSVを1〜8個選んでください。');
  if(files.some(f=>!Number.isSafeInteger(f.size)||f.size<0||f.size>FX_LIMITS.fileBytes))throw Error('1ファイル20MB以下にしてください。');
  if(files.reduce((n,f)=>n+f.size,0)>FX_LIMITS.totalBytes)throw Error('CSVは合計40MB以下にしてください。');
}
