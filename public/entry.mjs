import {initialInput,validateSaved} from './fields.mjs';
import {validateQuickSaved} from './quick-ui.mjs';
export const DEFAULT_INPUT_METHOD='csv';
export function validInputMethod(method){if(!['csv','manual'].includes(method))throw new Error('入力方法の保存値が不正です。');return method;}
export function newCase(){return{input:initialInput(),inputMethod:DEFAULT_INPUT_METHOD,view:'csv'};}
export function saveCase(input,inputMethod,savedAt=new Date().toISOString(),quick=null){const saved={schema:1,savedAt,inputMethod:validInputMethod(inputMethod),input:{...input}};return quick?{...saved,schema:2,quick:validateQuickSaved(quick)}:saved;}
export function restoreCase(data,currentMethod=DEFAULT_INPUT_METHOD){let quick=null,base=data;if(data?.schema===2){if(Object.keys(data).some(k=>!['schema','savedAt','inputMethod','input','quick'].includes(k)))throw Error('保存データに不明な項目があります。');quick=validateQuickSaved(data.quick);const{quick:unused,...rest}=data;base={...rest,schema:1};}const next=validateSaved(base),method=validInputMethod(Object.hasOwn(data,'inputMethod')?data.inputMethod:currentMethod);return{input:next,inputMethod:method,view:quick&&method==='csv'?'csv':'input',quick};}
