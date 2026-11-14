import test from 'node:test';import assert from 'node:assert/strict';
import {newState,readState,persist,exportPayload,parseBackup,STATE_KEY} from '../src/storage.js';
function mockStore(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),raw:m}}
test('khởi tạo an toàn, không ghi đè dữ liệu lỗi',()=>{const m=mockStore();m.setItem(STATE_KEY,'{"bad"');const result=readState(m);assert(result.issue);assert.equal(m.getItem(STATE_KEY),'{"bad"')});
test('commit có revision chống ghi đè từ tab cũ',()=>{const m=mockStore();const p=persist(newState(),0,m);assert.equal(p.revision,1);assert.throws(()=>persist(newState(),0,m));assert.equal(readState(m).state.revision,1)});
test('quota đầy giữ dữ liệu trước đó',()=>{const m=mockStore();let p=persist(newState(),0,m);const original=m.getItem(STATE_KEY);m.setItem=()=>{throw new Error('QuotaExceededError')};assert.throws(()=>persist({...p,stats:{...p.stats,totalReviews:1}},1,m));assert.equal(m.getItem(STATE_KEY),original)});
test('backup không có key, đọc lại cấu trúc hợp lệ',()=>{const data={...newState(),apiKey:'do-not-export'};const serialized=JSON.stringify(exportPayload(data));assert(!serialized.includes('do-not-export'));assert.equal(parseBackup(serialized).version,2)});
test('chặn format sai và prototype key',()=>{assert.throws(()=>parseBackup('{"format":"other"}'));const s=newState();s.progress=JSON.parse('{"__proto__":{"reps":0}}');assert.throws(()=>parseBackup(JSON.stringify({format:'MO-MANG-BACKUP',data:s})))});
