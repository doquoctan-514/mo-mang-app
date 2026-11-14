import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,daysBetween,reviewProgress,dueTopics,currentStreak} from '../src/scheduler.js';
test('SM-2 thành công: 1, 6, 16 ngày với 5/5',()=>{
 let p=reviewProgress(null,5,'2026-11-13');assert.equal(p.intervalDays,1);assert.equal(p.nextReview,'2026-11-14');
 p=reviewProgress(p,5,'2026-11-14');assert.equal(p.intervalDays,6);assert.equal(p.easeFactor,2.7);
 p=reviewProgress(p,5,'2026-11-20');assert.equal(p.intervalDays,16);assert.equal(p.nextReview,'2026-12-06');
});
test('SM-2 thất bại reset reps, giảm ease và ôn hôm sau',()=>{let p=reviewProgress(null,5,'2026-11-13');p=reviewProgress(p,5,'2026-11-14');let q=reviewProgress(p,1,'2026-11-20');assert.equal(q.reps,0);assert.equal(q.intervalDays,1);assert(q.easeFactor>=1.3);assert.equal(q.mastered,false)});
test('chặn score không hợp lệ, không thể dùng AI days để phá lịch',()=>{for(const score of [0,6,3.5,NaN,Infinity,'5'])assert.throws(()=>reviewProgress(null,score));assert.equal(reviewProgress(null,4,'2026-11-13').intervalDays,1)});
test('cộng ngày qua DST và năm nhuận không lệch',()=>{assert.equal(addDays('2024-02-28',1),'2024-02-29');assert.equal(addDays('2026-03-07',3),'2026-03-10');assert.equal(daysBetween('2026-03-07','2026-03-10'),3)});
test('due chỉ lấy bài đến hạn, theo thứ tự',()=>{const T=[{id:'a'},{id:'b'},{id:'c'}],p={a:{nextReview:'2026-11-15'},b:{nextReview:'2026-11-10'},c:{nextReview:'2026-11-13'}};assert.deepEqual(dueTopics(T,p,'2026-11-13').map(x=>x.id),['b','c'])});
test('streak một ngày một lượt dù nộp nhiều bài',()=>{assert.equal(currentStreak(['2026-11-11','2026-11-12','2026-11-12'],'2026-11-13'),2);assert.equal(currentStreak(['2026-11-11','2026-11-13'],'2026-11-13'),1)});
import {scheduleAttempt} from '../src/scheduler.js';

test('V3 lưu luyện trước hạn và cùng ngày mà không nhân khoảng ôn',()=>{
  const day='2028-02-28';
  for(const score of [1,2,3,4,5]){
    const first=scheduleAttempt(null,{score,type:'essay',today:day});
    assert.equal(first.progress.nextReview,'2028-02-29');
    const repeat=scheduleAttempt(first.progress,{score,type:'scenario',today:day});
    assert.equal(repeat.progress,first.progress);
  }
  const first=reviewProgress(null,5,day);
  const due=scheduleAttempt(first,{score:5,type:'scenario',today:'2028-03-02'});
  assert.equal(due.timing,'due');assert.equal(due.progress.intervalDays,6);
  const early=scheduleAttempt(due.progress,{score:4,type:'essay',today:'2028-03-03'});
  assert.equal(early.progress,due.progress);
  assert.equal(scheduleAttempt(due.progress,{score:2,type:'quiz',today:'2028-03-03'}).progress.nextReview,'2028-03-04');
  assert.equal(scheduleAttempt(first,{score:3,type:'quiz',today:'2028-02-29'}).progress,first);
  assert.equal(scheduleAttempt(null,{score:3,type:'quiz',today:day}).progress,null);
});
