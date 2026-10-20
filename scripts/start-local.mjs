import{spawn}from'node:child_process';
import{fileURLToPath}from'node:url';
import path from'node:path';
import{createServer}from'../server.mjs';

function openDefaultBrowser(url){
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',`Start-Process -FilePath '${url}'`],{windowsHide:true,stdio:'ignore'});
 child.on('error',()=>console.log('ブラウザを自動で開けませんでした。上のURLをブラウザへ入力してください。'));
 child.unref();
}
export async function startLocal({port=4173,openBrowser=true,open=openDefaultBrowser,log=console.log}={}){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22以上が必要です。自動インストールは行いません。');
 const server=createServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 const url=`http://127.0.0.1:${server.address().port}/`;
 log('賃上げ促進税制シミュレーター');log('起動しました：'+url);log('この画面を開いたままご利用ください。終了は Ctrl+C またはこの画面を閉じます。');log('最新制度の確認・レビューがそろわない機能は計算と印刷を停止します。');
 if(openBrowser)open(url);
 return{server,url};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const{server}=await startLocal({openBrowser:!process.argv.includes('--no-browser')});
  process.once('SIGINT',()=>{console.log('\n終了しました。');server.close(()=>process.exit(0));server.closeAllConnections();});
 }catch(error){
  console.error(error.code==='EADDRINUSE'?'起動用ポート4173が使用中です。すでにこのツールを起動している場合は http://127.0.0.1:4173/ を開いてください。それ以外の場合は他の作業を終了せず、担当者へ確認してください。':error.message);
  process.exitCode=1;
 }
}
