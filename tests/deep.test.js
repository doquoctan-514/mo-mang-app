import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT,newDeepSession,abilityFor,summarizeSession,resemblesReference} from '../src/deep-study.js';
import {exportV3,importV3} from '../src/database.js';
import {newState} from '../src/storage.js';

const topic='geo_seasons';
const date='2026-11-14';
const yes=[true,true,true], no=[false,false,false];
const assessment={date,score:5,recallChecks:yes,explanationChecks:yes,transferChecks:yes};
const complete=(id='a',day=date)=>({
  ...newDeepSession(topic,id,day),stage:4,recallOn:day,initial:'Trục nghiêng làm Bắc bán cầu có ngày dài trong khi phía Nam nhận ít ánh sáng.',
  revised:'Ánh sáng tới xiên hơn và thời gian có nắng ngắn ở phía quay xa Mặt Trời.',
  application:'Vào tháng sáu trạm Bắc có ngày dài, sáu tháng sau đổi sang trạm Nam.',
  feedback:{source:'self',strength:'Một ý',gaps:[],question:'Tại sao?'},
});

test('pilot đúng ba chủ đề và điểm cao độc lập với năng lực',()=>{
  assert.deepEqual(Object.keys(PILOT),['geo_seasons','geo_delta','eco_gdp']);
  const draft=newDeepSession(topic,'a',date);
  assert.equal(abilityFor({a:draft},topic),'Đã tiếp xúc');
  const {session}=summarizeSession(complete(),null,{...assessment,explanationChecks:no});
  assert.equal(session.summary.score,5);
  assert.equal(abilityFor({a:session},topic),'Đã tiếp xúc');
});
test('viết lại, sao chép và mở bài nền không được tính là nhớ độc lập',()=>{
  const initial=PILOT[topic].background;
  assert.equal(resemblesReference(initial,initial),true);
  const copied=summarizeSession({...complete(),initial,revised:initial},null,assessment);
  assert.equal(copied.session.summary.explained,false);
  assert.equal(copied.session.summary.independent,false);
  assert.equal(copied.progress.lastScore,2);
  const taught=summarizeSession({...complete(),assisted:true},null,assessment);
  assert.equal(taught.session.summary.independent,false);
  assert.equal(taught.progress.lastScore,2);
});
test('chỉ các phiên đến hạn ở hai ngày cách nhau bảy ngày và có vận dụng mới ghi nhớ bền vững',()=>{
  const first=summarizeSession(complete(),null,assessment);
  assert.equal(abilityFor({a:first.session},topic),'Vận dụng được');
  const repeated=summarizeSession(complete('b'),first.progress,assessment);
  assert.equal(repeated.progress,first.progress);
  const due1=summarizeSession(complete('c','2026-11-15'),first.progress,{...assessment,date:'2026-11-15'});
  const due2=summarizeSession(complete('d','2026-11-22'),due1.progress,{...assessment,date:'2026-11-22'});
  assert.equal(abilityFor({a:first.session,c:due1.session},topic),'Vận dụng được');
  assert.equal(abilityFor({a:first.session,c:due1.session,d:due2.session},topic),'Ghi nhớ bền vững');
  const resumed=summarizeSession(complete('e','2026-11-22'),due1.progress,{...assessment,date:'2026-11-23'});
  assert.equal(resumed.session.summary.independent,false);
});
test('backup round-trip gồm phiên đang làm, phiên đã lưu và dữ liệu V3',()=>{
  const legacy=importV3(JSON.stringify(exportV3({...newState(),attempts:[],studyMode:'auto'})));
  assert.deepEqual(legacy.deepSessions,{});
  const draft={...newDeepSession('eco_gdp','b',date),initial:'Nháp có dấu và xuống dòng\n'};
  const done=summarizeSession(complete(),null,assessment).session;
  const payload=exportV3({...legacy,deepSessions:{a:done,b:draft}});
  assert.equal(payload.schemaVersion,4);
  const restored=importV3(JSON.stringify(payload));
  assert.deepEqual(restored.deepSessions,{a:done,b:draft});
  assert.throws(()=>importV3(JSON.stringify({...payload,deepSessions:[draft,draft]})),/trùng ID/);
});
