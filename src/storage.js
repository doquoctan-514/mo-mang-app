export const STATE_KEY='mo_mang_data_v1';
export const DRAFT_PREFIX='mo_mang_draft_v1_';
export const KEY_STORAGE='mo_mang_key_v1';
export const CONFIG_STORAGE='mo_mang_config_v1';
import {validDate} from './scheduler.js';

export const STATE_VERSION=2;
export function newState(){
  return {
    version:STATE_VERSION, revision:0, customTopics:[], progress:{},
    stats:{totalReviews:0,completedDates:[]}, drafts:{}, legacyDraftsMigrated:false,
    learningPreferences:{mode:'mixed',activeTrackId:'world-foundations-28d'},
    learningPlan:{startedOn:null,dailySelections:{},synthesis:{}},
  };
}
function isObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
export const safeId = id => typeof id==='string' && /^[a-z][a-z0-9_-]{0,115}$/i.test(id) && !['constructor','prototype'].includes(id);
const validScore = score => Number.isInteger(score) && score >= 1 && score <= 5;
export function validateState(input){
  if(!isObject(input)||![1,STATE_VERSION].includes(input.version)||!isObject(input.progress)||!isObject(input.stats)||!Array.isArray(input.customTopics))throw new Error('File dữ liệu không đúng cấu trúc MỞ MANG.');
  if(input.customTopics.length>1000||Object.keys(input.progress).length>2000)throw new Error('Số lượng chủ đề vượt giới hạn hỗ trợ.');
  const seen=new Set();
  const customTopics=input.customTopics.map(t=>{
    if(!isObject(t)||typeof t.id!=='string'||!/^ai_[a-zA-Z0-9_-]{6,90}$/.test(t.id)||seen.has(t.id)||typeof t.title!=='string'||t.title.length>160||!t.title.trim()||typeof t.question!=='string'||!t.question.trim()||t.question.length>1500||typeof t.reference!=='string'||t.reference.length>4000||!Array.isArray(t.checkpoints)||t.checkpoints.length>6||t.checkpoints.some(point=>typeof point!=='string'))throw new Error('Có chủ đề tự tạo không hợp lệ.');
    seen.add(t.id);
    return {id:t.id,title:t.title,question:t.question,reference:t.reference,checkpoints:t.checkpoints,
      category:['geo','history','civics','culture','society','science','economy','profession'].includes(t.category)?t.category:'society',
      level:t.level===1?1:2,status:t.status==='draft'?'draft':'legacy'};
  });
  const progress=Object.create(null);
  for(const [id,p] of Object.entries(input.progress)){
    if(!safeId(id)||!isObject(p)||!Number.isInteger(p.reps)||p.reps<0||!Number.isFinite(p.easeFactor)||p.easeFactor<1.3||!Number.isInteger(p.intervalDays)||p.intervalDays<0||!validDate(p.nextReview)||!Array.isArray(p.history)||p.history.length>200)throw new Error('Có lịch sử ôn tập không hợp lệ.');
    const history=p.history.map(h=>{
      if(!isObject(h)||!validDate(h.date)||!validScore(h.score))throw new Error('Có lượt ôn không hợp lệ.');
      return {date:h.date,score:h.score,feedback:typeof h.feedback==='string'?h.feedback:'',
        ...(['ai','self','offline'].includes(h.source)?{source:h.source}:{}),...(typeof h.due==='boolean'?{due:h.due}:{})};
    });
    progress[id]={reps:p.reps,easeFactor:p.easeFactor,intervalDays:p.intervalDays,nextReview:p.nextReview,history,
      ...(validScore(p.lastScore)?{lastScore:p.lastScore}:{}),...(validDate(p.lastReviewed)?{lastReviewed:p.lastReviewed}:{}),
      ...(typeof p.mastered==='boolean'?{mastered:p.mastered}:{})};
  }
  if(!Number.isInteger(input.stats.totalReviews)||input.stats.totalReviews<0||!Array.isArray(input.stats.completedDates)||input.stats.completedDates.length>20000||input.stats.completedDates.some(d=>!validDate(d)))throw new Error('Thống kê học tập không hợp lệ.');
  const next={...newState(),revision:Number.isInteger(input.revision)&&input.revision>=0?input.revision:0,customTopics,progress,
    stats:{totalReviews:input.stats.totalReviews,completedDates:input.stats.completedDates}};
  if(input.version===1)return next;
  const {learningPlan,learningPreferences,drafts}=input;
  if(!isObject(drafts)||!isObject(learningPlan)||!isObject(learningPreferences)||
     !isObject(learningPlan.dailySelections)||!isObject(learningPlan.synthesis))throw new Error('Dữ liệu lộ trình không hợp lệ.');
  if(Object.keys(drafts).length>2000)throw new Error('Quá nhiều bản nháp.');
  for(const [id,answer] of Object.entries(drafts)){
    if(!safeId(id)||typeof answer!=='string')throw new Error('Bản nháp không hợp lệ.');
    next.drafts[id]=answer;
  }
  const plan=next.learningPlan;
  if(validDate(learningPlan.startedOn))plan.startedOn=learningPlan.startedOn;
  for(const [date,item] of Object.entries(learningPlan.dailySelections).filter(([date])=>validDate(date)).sort().slice(-60)){
    if(!isObject(item))continue;
    plan.dailySelections[date]={
      ...(typeof item.discoveryId==='string'&&safeId(item.discoveryId)?{discoveryId:item.discoveryId}:{}),
      deferred:item.deferred===true,deep:item.deep===true,
    };
  }
  for(const [id,item] of Object.entries(learningPlan.synthesis)){
    if(!/^synthesis-(week-[1-4]|final)$/.test(id)||!isObject(item)||!validDate(item.date)||!validScore(item.score)||
       typeof item.answer!=='string'||!item.answer.trim())throw new Error('Bài tổng hợp không hợp lệ.');
    plan.synthesis[id]={date:item.date,score:item.score,answer:item.answer};
  }
  next.learningPreferences.mode=['mixed','breadth','depth'].includes(learningPreferences.mode)?learningPreferences.mode:'mixed';
  next.legacyDraftsMigrated=input.legacyDraftsMigrated===true;
  return next;
}
function withLegacyDrafts(state,store){
  if(state.legacyDraftsMigrated)return state;
  for(let i=0;i<store.length;i++){
    const key=store.key(i);
    if(!key?.startsWith(DRAFT_PREFIX))continue;
    const id=key.slice(DRAFT_PREFIX.length);
    const draft=store.getItem(key);
    if(safeId(id)&&draft&&!Object.hasOwn(state.drafts,id))state.drafts[id]=draft;
  }
  return state;
}
export function readState(store){
  try{store??=globalThis.localStorage;const raw=store.getItem(STATE_KEY); const state=raw===null?newState():validateState(JSON.parse(raw));return {state:withLegacyDrafts(state,store),issue:null}}
  catch(e){let raw=null;try{raw=store.getItem(STATE_KEY)}catch{}return {state:newState(),issue:{message:'Dữ liệu cũ không đọc được hoặc trình duyệt chặn quyền truy cập. App tạm dừng ghi để tránh ghi đè.',raw}}}
}
export function persist(next,expectedRevision,store=localStorage){
  const existing=store.getItem(STATE_KEY);let actual=0;
  if(existing!==null){const parsed=validateState(JSON.parse(existing));actual=parsed.revision;}
  if(actual!==expectedRevision)throw new Error('Dữ liệu đã thay đổi ở tab khác. Hãy tải lại trang trước khi ghi để tránh mất dữ liệu.');
  const nextState=validateState({...next,revision:actual+1,legacyDraftsMigrated:true});
  store.setItem(STATE_KEY,JSON.stringify(nextState));
  return nextState;
}
export function exportPayload(state){const copy=validateState(state);return {format:'MO-MANG-BACKUP',exportedAt:new Date().toISOString(),data:copy}}
export function parseBackup(raw){const doc=JSON.parse(raw);if(!isObject(doc)||doc.format!=='MO-MANG-BACKUP')throw new Error('Không phải file backup của MỞ MANG.');return validateState(doc.data)}
