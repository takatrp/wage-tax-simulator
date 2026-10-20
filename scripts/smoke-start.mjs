import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';import{startLocal}from'./start-local.mjs';
let opened,body;
const{server,url}=await startLocal({port:0,open:u=>opened=u,log:()=>{}});
try{
 assert.equal(opened,url);assert.equal(server.address().address,'127.0.0.1');
 const response=await fetch(url);assert.equal(response.status,200);body=await response.text();assert.match(body,/賃上げ促進税制シミュレーター/);
 await assert.rejects(()=>startLocal({port:server.address().port,open:()=>{throw new Error('使用中ポートでブラウザを開いた');},log:()=>{}}),e=>e.code==='EADDRINUSE');
 const r={checkedAt:new Date().toISOString(),status:'passed',checks:['既存Node利用','127.0.0.1限定','待受完了後のブラウザ起動','日本語画面200','重複ポート時に起動/ブラウザ表示を停止'],browserLaunch:'テストではOSブラウザ起動関数を差替。実起動は起動.cmdで実行する。',settingsChanged:false};
 await writeFile(new URL('../output/startup-smoke.json',import.meta.url),JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}finally{await new Promise(r=>server.close(r));}
