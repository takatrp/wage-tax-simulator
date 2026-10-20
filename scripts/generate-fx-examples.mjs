import{writeFile}from'node:fs/promises';import{journal,journalRow}from'../test/fx-fixtures.mjs';
await writeFile(new URL('../examples/fx-synthetic-current-utf8.csv',import.meta.url),journal({extra:[journalRow({伝票番号:'BONUS',借方科目コード:'6000',借方科目名:'賞与',借方取引金額:'20000',借方税抜き金額:'20000',元帳摘要:'架空,賞与\n二行目 "引用"'})]}));
await writeFile(new URL('../examples/fx-synthetic-previous-utf8.csv',import.meta.url),journal({start:'2025-04',months:12,value:'90000',prefix:'P'}));
