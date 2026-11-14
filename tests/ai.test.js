import test from 'node:test';import assert from 'node:assert/strict';
import {askAI} from '../src/ai.js';
const opt={provider:'gemini',model:'gemini-3.5-flash-lite',key:'very-secret-api-key',prompt:'Check',kind:'grade'};
test('Gemini key chỉ ở header, phản hồi hợp lệ',async()=>{
 const original=globalThis.fetch;let seen;
 globalThis.fetch=async(url,options)=>{seen={url,options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"score":4,"feedback":"Giải thích tốt nhưng còn thiếu ví dụ."}'}]}}]}),{status:200})};
 try{const obj=await askAI(opt);assert.equal(obj.score,4);assert(!seen.url.includes('very-secret'));assert.equal(seen.options.headers['x-goog-api-key'],'very-secret-api-key')}finally{globalThis.fetch=original}
});
test('401 và 429 tạo lỗi thân thiện, không in key',async()=>{
 const old=globalThis.fetch;
 try{for(const status of [401,429]){globalThis.fetch=async()=>new Response('internal secret',{status});await assert.rejects(askAI(opt),e=>!e.message.includes('very-secret')&&!e.message.includes('internal secret'))}}finally{globalThis.fetch=old}
});
test('JSON sai không crash, không tự gán score 3',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('not json',{status:200});try{await assert.rejects(askAI(opt),/JSON/)}finally{globalThis.fetch=old}
});
test('AI trả score 99 bị từ chối',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"score":99,"feedback":"Good"}'}]}}]}),{status:200});try{await assert.rejects(askAI(opt),/không hợp lệ/)}finally{globalThis.fetch=old}
});
test('OpenAI endpoint, authorization header hợp lệ',async()=>{
 const old=globalThis.fetch;let seen;
 globalThis.fetch=async(url,o)=>{seen={url,o};return new Response(JSON.stringify({choices:[{message:{content:'{"score":5,"feedback":"Rất tốt."}'}}]}),{status:200})};
 try{const x=await askAI({...opt,provider:'openai',model:'gpt-4o-mini'});assert.equal(x.score,5);assert.equal(seen.url,'https://api.openai.com/v1/chat/completions');assert.equal(seen.o.headers.Authorization,'Bearer very-secret-api-key')}finally{globalThis.fetch=old}
});
