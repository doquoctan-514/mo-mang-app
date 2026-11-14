import {DRAFT_PREFIX, STATE_KEY, newState, readState, validateState, safeId} from './storage.js';
import {validDate} from './scheduler.js';

export const DB_NAME='mo-mang-v3';
const STORES=['topics','attempts','progress','drafts','learningPlans','settings'];
const MODES=['essay','quiz','scenario','legacy','synthesis'];
const isScore=x=>Number.isInteger(x)&&x>=1&&x<=5;
const isId=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9_-]{0,115}$/i.test(x)&&!['constructor','prototype'].includes(x);
const str=(x,max)=>typeof x==='string'&&x.length<=max;

export function legacyAttempts(state){
  return Object.entries(state.progress).flatMap(([topicId,progress])=>progress.history.map((h,index)=>({
    id:`legacy-${topicId}-${index}`,topicId,questionVersion:0,mode:'legacy',answer:null,
    finalScore:h.score,aiScore:null,source:h.source??'legacy',feedback:h.feedback.slice(0,5000),
    date:h.date,completedAt:null,timing:h.due===true?'due':'unknown',
  }))).concat(Object.entries(state.learningPlan.synthesis).map(([topicId,entry])=>({
    id:`legacy-${topicId}`,topicId,questionVersion:0,mode:'synthesis',answer:entry.answer,
    finalScore:entry.score,aiScore:null,source:'legacy',feedback:'',
    date:entry.date,completedAt:null,timing:'synthesis',
  })));
}

export function normalizeAttempt(item){
  if(!item||!isId(item.id)||!isId(item.topicId)||!MODES.includes(item.mode)||
    !Number.isInteger(item.questionVersion)||item.questionVersion<0||!validDate(item.date)||
    !isScore(item.finalScore)||!(item.aiScore===null||isScore(item.aiScore))||
    !['ai','self','offline','legacy'].includes(item.source)||!['new','due','early','unknown','synthesis'].includes(item.timing)||
    !str(item.feedback,5000))throw new Error('Lượt học trong backup không hợp lệ.');
  if(item.mode==='legacy'){
    if(item.answer!==null||item.completedAt!==null)throw new Error('Lượt cũ không có nội dung trả lời.');
  }else if(!str(item.answer,200000)||!item.answer.trim()||
    !(item.mode==='synthesis'&&item.source==='legacy'&&item.completedAt===null)&&
    (!str(item.completedAt,30)||!Number.isFinite(Date.parse(item.completedAt)))){
    throw new Error('Thiếu câu trả lời hoặc thời điểm học.');
  }
  return {
    id:item.id,topicId:item.topicId,mode:item.mode,questionVersion:item.questionVersion,
    date:item.date,completedAt:item.completedAt,answer:item.answer,
    question:str(item.question,5000)?item.question:'',
    title:str(item.title,250)?item.title:'',
    finalScore:item.finalScore,aiScore:item.aiScore,source:item.source,timing:item.timing,feedback:item.feedback,
    ...(['improvements','recurringMistakes','missingConcepts'].reduce((result,key)=>{
      if(Array.isArray(item[key])&&item[key].length<=5&&item[key].every(x=>str(x,500)))result[key]=item[key];
      return result;
    },{})),
    ...(str(item.followUpQuestion,600)?{followUpQuestion:item.followUpQuestion}:{}),
  };
}

export function exportV3(state){
  return {
    format:'MO-MANG-BACKUP',schemaVersion:3,exportedAt:new Date().toISOString(),
    data:validateState(state),attempts:state.attempts.map(normalizeAttempt),
    studyMode:state.studyMode,
  };
}
export function importV3(raw){
  const data=JSON.parse(raw);
  if(data?.format!=='MO-MANG-BACKUP'||![undefined,1,2,3].includes(data.schemaVersion))throw new Error('Định dạng backup không được hỗ trợ.');
  const state=validateState(data.data);
  if(data.schemaVersion!==3)return {...state,attempts:legacyAttempts(state),studyMode:'auto'};
  if(!Array.isArray(data.attempts))throw new Error('Backup thiếu danh sách lượt học.');
  const attempts=data.attempts.map(normalizeAttempt);
  if(new Set(attempts.map(a=>a.id)).size!==attempts.length)throw new Error('Backup có lượt học trùng ID.');
  return {...state,attempts,studyMode:studyMode(data.studyMode)};
}

function studyMode(value){return ['auto','essay','quiz','scenario'].includes(value)?value:'auto';}
function request(req){return new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
function transactionDone(tx){return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Giao dịch ghi dữ liệu bị hủy.'));
});}
async function openDatabase(factory){
  if(!factory)throw new Error('IndexedDB không khả dụng.');
  const req=factory.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
    for(const name of STORES)req.result.createObjectStore(name);
  };
  const opened=request(req);
  const db=await Promise.race([opened,new Promise((_,reject)=>{
    req.onblocked=()=>reject(new Error('Hãy đóng các tab MỞ MANG cũ rồi mở lại.'));
  })]);
  db.onversionchange=()=>db.close();
  return db;
}

function writeState(tx,next,previous,replace=false){
  const sync=(name,oldItems,newItems)=>{
    const store=tx.objectStore(name);
    if(replace)store.clear();
    else for(const key of Object.keys(oldItems))if(!Object.hasOwn(newItems,key))store.delete(key);
    for(const [key,val] of Object.entries(newItems))if(replace||!Object.is(oldItems[key],val))store.put(val,key);
  };
  const topics=items=>Object.fromEntries(items.map(item=>[item.id,item]));
  sync('topics',topics(previous.customTopics),topics(next.customTopics));
  sync('progress',previous.progress,next.progress);
  sync('drafts',previous.drafts,next.drafts);
  const attempts=tx.objectStore('attempts');
  if(replace)attempts.clear();
  for(const attempt of next.attempts.slice(replace?0:previous.attempts.length))attempts.add(attempt,attempt.id);
  tx.objectStore('learningPlans').put(next.learningPlan,'active');
  tx.objectStore('settings').put({
    revision:next.revision,stats:next.stats,learningPreferences:next.learningPreferences,
    studyMode:studyMode(next.studyMode),installed:true,
  },'app');
}

async function loadDatabase(db){
  const tx=db.transaction(STORES,'readonly');
  const complete=transactionDone(tx);
  const readMap=async name=>{
    const store=tx.objectStore(name);
    const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);
    return Object.fromEntries(keys.map((key,index)=>[key,values[index]]));
  };
  const [metadata,learningPlan,customTopics,progress,drafts,attempts]=await Promise.all([
    request(tx.objectStore('settings').get('app')),request(tx.objectStore('learningPlans').get('active')),
    request(tx.objectStore('topics').getAll()),readMap('progress'),readMap('drafts'),
    request(tx.objectStore('attempts').getAll()),
  ]);
  await complete;
  if(!metadata?.installed)return null;
  return {
    ...validateState({...newState(),...metadata,learningPlan,customTopics,progress,drafts,legacyDraftsMigrated:true}),
    attempts:attempts.map(normalizeAttempt),studyMode:studyMode(metadata.studyMode),
  };
}

export async function openLearningStore({factory=globalThis.indexedDB,legacyStore,recovery}={}){
  const db=await openDatabase(factory);
  let initial;
  try{initial=await loadDatabase(db);}catch(error){db.close();throw error;}
  if(initial){
    if(recovery){db.close();throw new Error('Một tab khác đã lưu dữ liệu. Tải lại trang trước khi nhập backup.');}
    return {db,state:initial};
  }
  const legacy=readState(legacyStore);
  if(legacy.issue&&!recovery){db.close();throw new Error(legacy.issue.message);}
  const source=legacyStore??globalThis.localStorage;
  let rawState=null;
  let rawDrafts={};
  try{
    rawState=source.getItem(STATE_KEY);
    rawDrafts=Object.fromEntries(Array.from({length:source.length},(_,i)=>source.key(i))
      .filter(key=>key?.startsWith(DRAFT_PREFIX)&&safeId(key.slice(DRAFT_PREFIX.length))).map(key=>[key,source.getItem(key)]));
  }catch(error){if(!recovery){db.close();throw error;}}
  const state=recovery?{...recovery,revision:0}:{...legacy.state,attempts:legacyAttempts(legacy.state),studyMode:'auto'};
  const tx=db.transaction(STORES,'readwrite');
  const complete=transactionDone(tx);
  const settings=tx.objectStore('settings');
  const claim=settings.get('app');
  claim.onsuccess=()=>{
    if(claim.result?.installed){
      if(recovery)tx.abort();
      return;
    }
    // The recovery snapshot and imported records commit together.
    settings.put({rawState,rawDrafts,createdAt:new Date().toISOString()},'legacy-backup');
    writeState(tx,state,{...newState(),attempts:[]},true);
  };
  try{
    await complete;
    return {db,state:await loadDatabase(db)};
  }catch(error){db.close();throw error;}
}

export async function commitLearning(db,previous,next,{replace=false}={}){
  const tx=db.transaction(STORES,'readwrite');
  const complete=transactionDone(tx);
  const revision=tx.objectStore('settings').get('app');
  const committed={...next,revision:previous.revision+1};
  let conflict=false;
  revision.onsuccess=()=>{
    if(revision.result?.revision!==previous.revision){conflict=true;tx.abort();return;}
    writeState(tx,committed,previous,replace);
  };
  try{await complete;}catch(error){
    if(conflict)throw new Error('Dữ liệu đã đổi ở tab khác. Xuất backup cho nháp hiện tại rồi tải lại.');
    throw error;
  }
  return committed;
}
