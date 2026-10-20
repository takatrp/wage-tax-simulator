import {initialInput,validateSaved} from './fields.mjs';
export const DEFAULT_INPUT_METHOD='csv';
export function validInputMethod(method){if(!['csv','manual'].includes(method))throw new Error('入力方法の保存値が不正です。');return method;}
export function newCase(){return{input:initialInput(),inputMethod:DEFAULT_INPUT_METHOD,view:'csv'};}
export function saveCase(input,inputMethod,savedAt=new Date().toISOString()){return{schema:1,savedAt,inputMethod:validInputMethod(inputMethod),input:{...input}};}
export function restoreCase(data,currentMethod=DEFAULT_INPUT_METHOD){const next=validateSaved(data);return{input:next,inputMethod:validInputMethod(Object.hasOwn(data,'inputMethod')?data.inputMethod:currentMethod),view:'input'};}
