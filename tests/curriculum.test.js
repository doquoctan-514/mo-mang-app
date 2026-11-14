import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {TOPICS} from '../src/topics.js';
import {newState,readState,exportPayload,parseBackup,STATE_KEY,DRAFT_PREFIX} from '../src/storage.js';
import {addDays,reviewProgress,dueTopics} from '../src/scheduler.js';
import {createCurriculum,nextDeepTopic,planForDate,alternateDiscovery,setDailySelection} from '../src/curriculum.js';

const data=JSON.parse(readFileSync(new URL('../content/curriculum-c-28-days.json',import.meta.url),'utf8'));
const track=createCurriculum(data,TOPICS);
const start='2026-11-14';

test('66 chủ đề gốc, 36 khái niệm duy nhất, đúng 5 chủ đề nghề',()=>{
  assert.equal(TOPICS.length,66);
  assert.equal(track.discovery.length,24);
  assert.equal(track.deep.length,12);
  assert.equal(new Set([...track.discovery,...track.deep]).size,36);
  assert.equal(track.discovery.filter(id=>track.byId.get(id).category==='profession').length,5);
  const bad=structuredClone(data);
  bad.weeks[0].discoveryTopicIds[0]=track.deep[0];
  assert.throws(()=>createCurriculum(bad,TOPICS));
});

test('nhịp ngày 1–28 và thứ tự bài sâu, tổng hợp riêng',()=>{
  const state=newState();
  state.learningPlan.startedOn=start;
  let deepIndex=0;
  for(let i=0;i<28;i++){
    const date=addDays(start,i), plan=planForDate(track,state,date), weekday=i%7+1;
    assert.equal(plan.day,i+1);
    assert.equal(plan.chapter.week,Math.floor(i/7)+1);
    assert.equal(plan.discoveryId,weekday===7?null:plan.chapter.discoveryTopicIds[weekday-1]);
    if([1,3,5].includes(weekday)){
      assert.equal(plan.deepId,track.deep[deepIndex++]);
      state.progress[plan.deepId]=reviewProgress(null,4,date);
    }else assert.equal(plan.deepId,null);
    assert.equal(plan.synthesisId,weekday===7?plan.chapter.assignment.id:null);
  }
  assert.equal(nextDeepTopic(track,state.progress),null);
  assert.equal(Object.keys(state.learningPlan.synthesis).length,0);
});

test('đổi câu, dời bài và chế độ học không sửa lịch ôn',()=>{
  const state=newState();
  state.learningPlan.startedOn=start;
  state.progress[track.deep[0]]=reviewProgress(null,5,start);
  state.progress[track.deep[3]]=reviewProgress(null,4,start);
  assert.equal(nextDeepTopic(track,state.progress),track.deep[1]);
  const before=structuredClone(state.progress);
  const suggestion=alternateDiscovery(track,state,start,track.discovery[0]);
  assert.ok(suggestion&&!track.deep.includes(suggestion));
  state.learningPlan=setDailySelection(state.learningPlan,start,{discoveryId:suggestion,deferred:true,deep:true});
  assert.equal(planForDate(track,state,start).discoveryId,suggestion);
  const tomorrow=addDays(start,1);
  assert.equal(planForDate(track,state,tomorrow).discoveryId,suggestion);
  assert.equal(planForDate(track,state,tomorrow).deepId,track.deep[1]);
  state.learningPreferences.mode='breadth';
  assert.equal(planForDate(track,state,tomorrow).deepId,null);
  state.learningPreferences.mode='depth';
  assert.equal(planForDate(track,state,tomorrow).discoveryId,null);
  assert.equal(dueTopics(TOPICS,state.progress,tomorrow).length,2);
  assert.deepEqual(state.progress,before);
  for(let i=0;i<70;i++)state.learningPlan=setDailySelection(state.learningPlan,addDays(start,i),{discoveryId:suggestion});
  assert.equal(Object.keys(state.learningPlan.dailySelections).length,60);
});

test('migration V1 giữ nháp riêng, lịch, thống kê và chủ đề tự tạo',()=>{
  const legacy={version:1,revision:8,customTopics:[{id:'ai_legacy01',category:'geo',title:'Câu cũ',question:'Giải thích?',reference:'Đáp án cũ',checkpoints:[]}],
    progress:{geo_delta:reviewProgress(null,5,start)},stats:{totalReviews:1,completedDates:[start]}};
  const raw=new Map([[STATE_KEY,JSON.stringify(legacy)],[DRAFT_PREFIX+'geo_delta','Nháp V1 chưa nộp']]);
  const store={length:raw.size,key:i=>[...raw.keys()][i],getItem:k=>raw.get(k)??null};
  const result=readState(store);
  assert.equal(result.issue,null);
  assert.equal(result.state.revision,8);
  assert.deepEqual(result.state.progress.geo_delta,legacy.progress.geo_delta);
  assert.deepEqual(result.state.stats,legacy.stats);
  assert.equal(result.state.customTopics[0].status,'legacy');
  assert.equal(result.state.drafts.geo_delta,'Nháp V1 chưa nộp');
  assert.equal(JSON.parse(raw.get(STATE_KEY)).version,1);
  result.state.learningPlan.synthesis['synthesis-week-1']={date:start,score:4,answer:'Bài tổng hợp đã làm'};
  const restored=parseBackup(JSON.stringify(exportPayload(result.state)));
  assert.equal(restored.learningPlan.synthesis['synthesis-week-1'].score,4);
  assert.equal(restored.drafts.geo_delta,'Nháp V1 chưa nộp');
  assert.equal(parseBackup(JSON.stringify({format:'MO-MANG-BACKUP',data:legacy})).version,2);
});
