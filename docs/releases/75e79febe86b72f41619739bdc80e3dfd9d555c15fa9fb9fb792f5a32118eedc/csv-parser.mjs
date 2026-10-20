// Shared by small synchronous imports and chunked browser Worker imports.
export function createCsvParser({allowSignedAmounts=false,maxRows=10000,maxCellChars=262144,retainRows=true,onHeader=()=>{},onRow=()=>{}}={}) {
  const rows=[],lineNumbers=[];let headers=null,row=[],cell='',state='plain',line=1,rowStart=1,previousCR=false,count=0,finished=false;
  function pushCell(){row.push(cell);if(row.length>256)throw Error('CSVは256列以内にしてください。');cell='';state='plain';}
  function pushRow(){
    pushCell();const next=row;row=[];if(!next.some(x=>x!==''))return;
    if(!headers){headers=next.map(x=>x.trim());if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error('空の見出し、または重複した見出しがあります。');onHeader(headers);return;}
    if(++count>maxRows)throw Error(`CSVは${maxRows.toLocaleString('en-US')}データ行以内にしてください。`);
    if(next.length!==headers.length)throw Error(`${rowStart}行目の列数が見出しと一致しません。`);
    if(next.some(v=>/^[\s\uFEFF]*[=+@-]/.test(v)&&!(allowSignedAmounts&&/^-(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(v.trim()))))throw Error(`${rowStart}行目に数式形式または負数があります。式は実行せず取込を止めました。`);
    onRow(next,rowStart,count);if(retainRows){rows.push(next);lineNumbers.push(rowStart);}
  }
  return {
    write(text){
      if(finished)throw Error('CSV読取は終了しています。');
      if(text.includes('\uFFFD')||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('文字化けまたは制御文字を検出しました。');
      for(const c of text){
        const followsCR=previousCR;previousCR=c==='\r';
        if(state==='quoted'){
          if(c==='"')state='afterQuote';else cell+=c;
          if(c==='\r'||c==='\n'&&!followsCR)line++;
        }else if(state==='afterQuote'&&c==='"'){cell+='"';state='quoted';}
        else if(c===',')pushCell();
        else if(c==='\r'||c==='\n'){
          if(c==='\n'&&followsCR)continue;
          pushRow();line++;rowStart=line;
        }else if(state==='afterQuote')throw Error('引用符の後に区切り文字以外があります。');
        else if(c==='"'){if(cell)throw Error('引用符がセル途中にあります。');state='quoted';}
        else cell+=c;
        if(cell.length>maxCellChars)throw Error(`${rowStart}行目：1セルは${maxCellChars.toLocaleString('en-US')}文字以内にしてください。`);
      }
    },
    finish(){if(finished)throw Error('CSV読取は終了しています。');finished=true;if(state==='quoted')throw Error('CSVの引用符が閉じていません。');if(cell!==''||row.length||state==='afterQuote')pushRow();if(!headers||!count)throw Error('見出し行と1行以上のデータが必要です。');return{headers,rows,lineNumbers,count};},
    get count(){return count;}
  };
}
