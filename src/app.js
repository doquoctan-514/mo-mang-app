import {TOPICS} from './topics.js';
import {localDate,scheduleAttempt,dueTopics,currentStreak} from './scheduler.js';
import {KEY_STORAGE,CONFIG_STORAGE,newState,readState} from './storage.js';
import {commitLearning,exportV3,importV3,legacyAttempts,normalizeAttempt,openLearningStore} from './database.js';
import {MODE_LABELS,chooseMode,exercises,modesFor,questionFor} from './exercises.js';
import {askAI,comparisonPrompt,generationPrompt,previousAnswers} from './ai.js';
import {createCurriculum,nextDeepTopic,planForDate,alternateDiscovery,setDailySelection} from './curriculum.js';

let track;

const CATEGORIES=[
  {id:'geo',name:'Địa lý',symbol:'◎',color:'#4a8e95',bg:'#e5f3f3'},
  {id:'history',name:'Lịch sử',symbol:'⌛',color:'#af8157',bg:'#f6ece0'},
  {id:'civics',name:'Nhà nước & Chính trị',symbol:'♙',color:'#7b75aa',bg:'#efedf8'},
  {id:'culture',name:'Văn hóa',symbol:'❀',color:'#c98173',bg:'#faece8'},
  {id:'society',name:'Xã hội',symbol:'◫',color:'#53927b',bg:'#e9f5ed'},
  {id:'science',name:'Khoa học',symbol:'✺',color:'#6684b6',bg:'#eaf0f9'},
  {id:'economy',name:'Kinh tế & Thế giới',symbol:'◇',color:'#a48c45',bg:'#f7f3df'},
  {id:'profession',name:'Trong nghề',symbol:'▣',color:'#9b7a98',bg:'#f5edf4'}
];
const $=id=>document.getElementById(id);
const catOf=id=>CATEGORIES.find(c=>c.id===id)||CATEGORIES[4];
const topicById=id=>id?(allTopics().find(t=>t.id===id) ?? track?.chapters.find(c=>c.assignment.id===id)?.assignment ?? (track?.final.id===id?track.final:null)):null;
const allTopics=()=>[...TOPICS,...state.customTopics.filter(t=>t.status!=='draft')];
let state={...newState(),attempts:[],studyMode:'auto'},readOnlyIssue=null,db;
let writes=Promise.resolve();
let config={provider:'gemini',model:'gemini-3.5-flash-lite'},apiKey='',rememberKey=false;
let currentPage='home',currentTopicId=null,filter='all',search='',assessment=null,chosenScore=null,activeAbort=null,busy=false,noticeTimeout=null,viewBeforeStudy='home';
let homeDate, lessonMode='essay', quizChoice=null, finishing=false, studySession=0;
const pendingDrafts=new Map();
const PAGES=['home','explore','track','progress','settings'];

function safeRead(store,key){try{return store.getItem(key)}catch{return null}}
function loadConfig(){
  try{const c=JSON.parse(safeRead(localStorage,CONFIG_STORAGE)||'null');if(c && (c.provider==='gemini'||c.provider==='openai') && typeof c.model==='string' && c.model.length<=100)config=c;}catch{}
  rememberKey=!!safeRead(localStorage,KEY_STORAGE);
  apiKey=safeRead(sessionStorage,KEY_STORAGE)||safeRead(localStorage,KEY_STORAGE)||'';
}
loadConfig();
function notify(message,error=false){const box=$('notice');box.textContent=message;box.hidden=false;box.classList.toggle('error',error);clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>box.hidden=true,5500)}
function safeCommit(change,options){
  const commit=writes.then(async()=>{
    if(!db){notify(readOnlyIssue?.message??'Đang mở bộ nhớ trên thiết bị.',true);return false;}
    try{state=await commitLearning(db,state,change(state),options);return true}catch{
      notify('Không lưu được tiến trình. Hãy xuất backup rồi kiểm tra dung lượng hoặc tải lại nếu có tab khác đang mở.',true);return false;
    }
  });
  writes=commit;
  return commit;
}
function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e}
function put(parent,...children){for(const item of children)if(item)parent.append(item);return parent}
function cssCategory(el,cat){el.style.setProperty('--cat-color',cat.color);el.style.setProperty('--cat-bg',cat.bg);return el}
function updateChrome(){
  $('header-streak').textContent=currentStreak(state.stats.completedDates);
  const active=currentPage==='study'?viewBeforeStudy:currentPage;
  document.querySelectorAll('[data-nav]').forEach(b=>{
    b.classList.toggle('is-active',b.dataset.nav===active);
    if(b.dataset.nav===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
}
function setPage(page){
  if(![...PAGES,'study'].includes(page))page='home';
  flushDrafts();
  if(currentPage==='study'&&page!=='study'&&activeAbort){activeAbort.abort();activeAbort=null;busy=false;}
  currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==`page-${page}`));
  if(page==='home')renderHome();if(page==='explore')renderExplore();if(page==='track')renderTrack();if(page==='progress')renderProgress();if(page==='settings')renderSettings();
  updateChrome();
  if(page!=='study')history.replaceState(null,'',`#${page}`);
  window.scrollTo({top:0,behavior:'instant'});
}
function startStudy(topic,origin=currentPage,lane=null){
  if(!topic)return;
  flushDrafts();
  if(activeAbort){activeAbort.abort();activeAbort=null}busy=false;
  viewBeforeStudy=origin==='study'?viewBeforeStudy:origin;
  currentTopicId=topic.id;assessment=null;chosenScore=null;
  studySession++;
  $('study-title').textContent=topic.title;
  $('study-form').replaceChildren(...modesFor(topic).map(mode=>{
    const option=make('option','',MODE_LABELS[mode]);option.value=mode;return option;
  }));
  $('study-form-wrap').hidden=topic.synthesis===true;
  const c=catOf(topic.category);
  cssCategory($('study-category'),c);$('study-category').textContent=topic.synthesis?'Bài tổng hợp':c.name;
  const p=state.progress[topic.id];$('study-status').textContent=topic.synthesis?(state.learningPlan.synthesis[topic.id]?'Đã hoàn thành':'Bài liên kết'):p?
    (p.nextReview<=localDate()?'Đến hạn ôn':`Luyện trước hạn · ${p.nextReview}`):'Chủ đề mới';
  const previousIndex=track?.deep.indexOf(topic.id) ?? -1;
  $('study-connection').hidden=lane!=='deep';
  $('study-connection').textContent=previousIndex>0?`Nối ý với bài trước “${topicById(track.deep[previousIndex-1]).title}”. Hai bài giúp giải thích cùng một vấn đề ra sao?`:'Vận dụng: Hãy chọn một ví dụ và nêu giới hạn của lời giải thích.';
  setLessonMode(chooseMode(topic,state.studyMode,state.attempts));
  $('answer-input').readOnly=false;
  $('answer-pane').classList.remove('hidden');$('assessment-pane').classList.add('hidden');$('completion-pane').classList.add('hidden');
  $('ai-grade').disabled=false;$('self-grade').disabled=false;$('ai-grade').textContent='✦ Nhờ AI phản biện';
  setPage('study');
}
function draftId(topicId,mode=lessonMode){return mode==='essay'?topicId:`${mode}-${topicId}`;}
function setLessonMode(mode){
  const topic=topicById(currentTopicId);
  lessonMode=mode;assessment=null;chosenScore=null;quizChoice=null;
  $('study-form').value=mode;
  $('study-question').textContent=questionFor(topic,mode);
  $('write-fields').hidden=mode==='quiz';
  $('quiz-fields').hidden=mode!=='quiz';
  const key=draftId(topic.id);
  const saved=pendingDrafts.get(key)??state.drafts[key]??'';
  $('answer-input').value=saved;
  updateWordCount();
  $('draft-indicator').textContent='Nháp lưu trên thiết bị';
  if(mode==='quiz'){
    const [,options]=exercises[topic.id].quiz;
    $('quiz-options').replaceChildren(...options.map((text,index)=>{
      const label=make('label','quiz-option');
      const radio=make('input');radio.type='radio';radio.name='quiz-choice';radio.value=index;
      if(saved===String(index)){radio.checked=true;quizChoice=index;}
      radio.addEventListener('change',()=>{quizChoice=index;queueDraft(String(index));$('quiz-check').disabled=false;});
      label.append(radio,make('span','',text));return label;
    }));
    $('quiz-check').disabled=quizChoice===null;
  }
  $('answer-pane').classList.remove('hidden');$('assessment-pane').classList.add('hidden');$('completion-pane').classList.add('hidden');
}
function due(){return dueTopics(allTopics(),state.progress)}
function renderSidebar(){const side=$('sidebar-categories');side.replaceChildren();for(const c of CATEGORIES){const b=make('button','category-side');b.type='button';b.dataset.category=c.id;put(b,cssCategory(make('i','category-dot'),c),make('span','',c.name));side.append(b)}}
function renderHome(){
  const date=localDate();
  homeDate=date;
  $('date-chip').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const queued=due(), reviews=$('home-reviews'), discovery=$('daily-card'), depth=$('home-track');
  $('home-due').textContent=`${queued.length} đến hạn`;
  reviews.replaceChildren();
  for(const topic of queued.slice(0,3))reviews.append(lessonButton(topic,'home','review'));
  if(!queued.length)reviews.append(make('p','lane-note','Hôm nay bạn chưa có bài đến hạn.'));
  reviews.append(action(queued.length>3?'Xem tất cả bài ôn':'Xem lịch ôn',()=>setPage('progress')));
  discovery.replaceChildren();depth.replaceChildren();
  const planned=track?planForDate(track,state,date):null;
  const topic=topicById(planned?.discoveryId);
  const next=topicById(planned?.synthesisId ?? planned?.deepId);
  $('plan-day').hidden=!planned;
  $('plan-day').textContent=planned?.chapter?`Ngày ${planned.day}/28 · Chương ${planned.chapter.week}`:'Lộ trình 28 ngày';
  const deferred=planned?.selection?.deferred;
  if(topic){
    discovery.append(make('p','lane-meta',`${catOf(topic.category).name} · 4 phút`),make('h3','',topic.title),
      make('p','lane-question',topic.question));
    if(state.progress[topic.id]){
      discovery.append(make('p','lane-meta',`Đã giải thích · Ôn ${state.progress[topic.id].nextReview}`));
    }else if(!deferred){
      discovery.append(action('Tôi muốn giải thích',()=>startPlanned(topic,'discovery'),'primary'),
        action('Đổi câu hỏi',()=>shuffleDiscovery(topic,date)));
    }
  }else{
    discovery.append(make('p','lane-note',planned?.synthesisId?'Hôm nay dành cho tổng hợp và ôn tập.':'Không có bài khám phá được gợi ý hôm nay.'));
    discovery.append(action('Mở thư viện',()=>setPage('explore')));
  }
  const deepCount=track?.deep.filter(id=>state.progress[id]).length ?? 0;
  $('home-track-count').textContent=`${deepCount}/12 bài`;
  if(next){
    depth.append(make('p','lane-meta',next.synthesis?'Tổng hợp tuần · 10 phút':'Bài đào sâu · 5–7 phút'),
      make('h3','',next.title));
    if(state.learningPlan.synthesis[next.id])depth.append(make('p','lane-note','Đã hoàn thành bài tổng hợp.'));
    else if(!deferred)depth.append(action(next.synthesis?'Làm bài tổng hợp':'Học tiếp chuyên đề',()=>startPlanned(next,next.synthesis?'synthesis':'deep'),'primary'));
  }else depth.append(make('p','lane-note',deepCount===12?'Bạn đã hoàn thành 12 bài sâu.':'Hôm nay không có bài sâu theo lịch. Bạn vẫn có thể học trước.'));
  depth.append(action('Xem 4 chương',()=>setPage('track')));
  if(queued.length>=3 && !deferred && (topic && !state.progress[topic.id] || next && !next.synthesis)){
    reviews.append(make('p','lane-note','Nếu hôm nay bận, ôn 1–3 bài và dời gợi ý mới sang lần sau.'),
      action('Chỉ ôn hôm nay',async()=>{
        await savePlanSelection(date,{discoveryId:topic?.id,deferred:true,deep:!!planned.deepId});
        renderHome();
      }));
  }
  if(deferred)reviews.append(make('p','lane-note','Hôm nay chỉ ôn. Bài khám phá và bài sâu sẽ được gợi lại.'),action('Hiện lại gợi ý hôm nay',async()=>{
    await savePlanSelection(date,{deferred:false,deep:false});renderHome();
  }));
  $('hero-start').onclick=()=>{
    if(queued.length)startStudy(queued[0],'home','review');
    else if(!deferred && topic && !state.progress[topic.id])startPlanned(topic,'discovery');
    else if(!deferred && next && !state.learningPlan.synthesis[next.id])startPlanned(next,next.synthesis?'synthesis':'deep');
    else setPage('track');
  };
}
function action(label, callback, style='outline'){
  const button=make('button',`btn btn-${style}`,label);
  button.type='button';button.addEventListener('click',callback);
  return button;
}
function lessonButton(topic,origin,lane,status=''){
  const button=make('button','lesson-button');
  button.type='button';
  button.append(make('strong','',topic.title));
  if(status)button.append(make('span','',status));
  button.addEventListener('click',()=>['review','library'].includes(lane)?startStudy(topic,origin,lane):startPlanned(topic,lane,origin));
  return button;
}
function savePlanSelection(date,change){
  return safeCommit(current=>{
    const plan=setDailySelection(current.learningPlan,date,change);
    return {...current,learningPlan:{...plan,startedOn:plan.startedOn??date}};
  });
}
async function shuffleDiscovery(topic,date){
  if(date!==localDate()){renderHome();return;}
  const replacement=alternateDiscovery(track,state,date,topic.id);
  if(!replacement){notify('Bạn đã thử hết các lựa chọn phù hợp hôm nay.');return;}
  if(await savePlanSelection(date,{discoveryId:replacement})&&currentPage==='home')renderHome();
}
function startPlanned(topic,lane,origin='home'){
  const date=localDate();
  if(!state.learningPlan.startedOn || lane==='discovery' && state.learningPlan.dailySelections[date]?.discoveryId!==topic.id){
    savePlanSelection(date,lane==='discovery'?{discoveryId:topic.id}:{});
  }
  startStudy(topic,origin,lane);
}
function renderTrack(){
  const chapters=$('track-chapters'), final=$('track-final');
  chapters.replaceChildren();final.replaceChildren();
  if(!track){$('track-summary').textContent='Chưa tải được lộ trình. Hãy thử tải lại khi có mạng.';return;}
  const upcoming=nextDeepTopic(track,state.progress);
  const completed=track.deep.filter(id=>state.progress[id]).length;
  $('track-title').textContent=track.title;
  $('track-summary').textContent=`${completed}/12 bài sâu · ${track.chapters.filter(c=>state.learningPlan.synthesis[c.assignment.id]).length}/4 tổng hợp chương`;
  $('track-meter').value=completed;
  for(const chapter of track.chapters){
    const panel=make('section','panel chapter-card');
    panel.append(make('p','eyebrow',`CHƯƠNG ${chapter.week}`),make('h2','',chapter.title),make('p','lane-note',chapter.theme));
    for(const id of chapter.deepTopicIds){
      panel.append(lessonButton(topicById(id),'track','deep',state.progress[id]?'Đã giải thích':id===upcoming?'Bài tiếp theo':'Chưa học'));
    }
    panel.append(lessonButton(chapter.assignment,'track','synthesis',state.learningPlan.synthesis[chapter.assignment.id]?'Đã tổng hợp':'Tổng hợp chương'));
    const calendar=make('details','chapter-calendar');
    calendar.append(make('summary','','Xem 7 ngày trong chương'));
    const days=make('ol','');
    chapter.discoveryTopicIds.forEach((id,index)=>{
      const day=make('li','');
      day.append(lessonButton(topicById(id),'track','library',`Ngày ${(chapter.week-1)*7+index+1} · Khám phá`));
      days.append(day);
    });
    const lastDay=make('li','');
    lastDay.append(lessonButton(chapter.assignment,'track','synthesis',`Ngày ${chapter.week*7} · Tổng hợp`));
    days.append(lastDay);calendar.append(days);panel.append(calendar);
    chapters.append(panel);
  }
  final.append(lessonButton(track.final,'track','synthesis',state.learningPlan.synthesis[track.final.id]?'Đã tổng kết':'Tổng kết cuối lộ trình'));
}
function renderFilters(){const bar=$('filter-chips');bar.replaceChildren();for(const c of [{id:'all',name:'Tất cả'},...CATEGORIES]){const b=make('button',`filter-chip${filter===c.id?' active':''}`,c.name);b.type='button';b.dataset.filter=c.id;bar.append(b)}}
function renderExplore(){renderFilters();$('topic-search').value=search;const list=$('topic-grid');list.replaceChildren();const term=search.toLocaleLowerCase('vi-VN').trim();const topics=allTopics().filter(t=>(filter==='all'||t.category===filter)&&(!term||`${t.title} ${t.question} ${catOf(t.category).name}`.toLocaleLowerCase('vi-VN').includes(term)));
  const drafts=$('ai-drafts');
  drafts.replaceChildren();
  const proposals=state.customTopics.filter(t=>t.status==='draft');
  drafts.classList.toggle('hidden',!proposals.length);
  if(proposals.length)drafts.append(make('h2','','Đề xuất của AI'),make('p','lane-note','Chưa kiểm chứng nguồn. Các bản nháp nằm ngoài thư viện và lịch học.'));
  for(const t of proposals){
    const preview=make('details','ai-preview');
    preview.append(make('summary','',t.title),make('p','',t.question),make('p','',t.reference),
      put(make('ul'),...t.checkpoints.map(point=>make('li','',point))));
    preview.append(action('Bỏ bản nháp',async()=>{
      if(!confirm('Bỏ đề xuất AI này khỏi danh sách bản nháp?'))return;
      if(await safeCommit(current=>({...current,customTopics:current.customTopics.filter(topic=>topic.id!==t.id)}))&&currentPage==='explore')renderExplore();
    }));
    drafts.append(preview);
  }
  $('explore-count').textContent=`${topics.length} chủ đề`;
  topics.sort((a,b)=>{const ad=state.progress[a.id]?.nextReview<=localDate()?0:state.progress[a.id]?2:1;const bd=state.progress[b.id]?.nextReview<=localDate()?0:state.progress[b.id]?2:1;return ad-bd});
  if(!topics.length){list.append(make('div','empty-state','Không tìm thấy câu hỏi phù hợp. Thử tìm từ khóa khác hoặc đổi lĩnh vực nhé.'));return}
  for(const t of topics){const c=catOf(t.category),p=state.progress[t.id];const status=p?(p.nextReview<=localDate()?'Đến hạn ôn':p.mastered?'Đã vững':'Đã học'):'Chưa học';const b=make('button','topic-card');b.type='button';b.addEventListener('click',()=>startStudy(t,'explore'));const top=make('div','topic-card-top');const label=make('span');put(label,cssCategory(make('i','category-dot'),c),document.createTextNode(' '+c.name));put(top,label,make('span','',t.level===1?'Cơ bản':'Đào sâu'));const bottom=make('div','topic-card-bottom');put(bottom,make('span','',status),make('span','',`Học ngay ↗`));put(b,top,make('h3','topic-card-title',t.title),make('p','topic-card-question',t.question),bottom);list.append(b)}
}
function renderProgress(){
  $('stat-streak').replaceChildren(document.createTextNode(String(currentStreak(state.stats.completedDates))+' '),make('small','','ngày'));
  $('stat-learned').textContent=Object.keys(state.progress).length;
  $('stat-reviews').textContent=state.stats.totalReviews;
  const dueReviews=state.attempts.filter(attempt=>attempt.timing==='due');
  const lanes=$('progress-lanes');
  lanes.replaceChildren(
    make('p','',`Khám phá theo lộ trình: ${track?.discovery.filter(id=>state.progress[id]).length??0}/24 bài`),
    make('p','',`Chuyên đề: ${track?.deep.filter(id=>state.progress[id]).length??0}/12 bài · ${Object.keys(state.learningPlan.synthesis).length}/5 bài tổng hợp`),
    make('p','',`Ôn đến hạn: ${dueReviews.length} lượt · ${dueReviews.filter(review=>review.mode!=='quiz'&&review.finalScore>=3).length} lượt nhớ ý chính`)
  );
  renderHistory();
  const list=$('due-list');list.replaceChildren();const queued=due();$('due-label').textContent=queued.length?`${queued.length} câu đến hạn`:'Đã hoàn thành hôm nay';
  const future=allTopics().filter(t=>state.progress[t.id]?.nextReview>localDate())
    .sort((a,b)=>state.progress[a.id].nextReview.localeCompare(state.progress[b.id].nextReview)).slice(0,12);
  const upcoming=[...queued,...future];
  if(!upcoming.length)list.append(make('div','empty-state','Bạn chưa có lịch ôn. Bắt đầu bằng một câu hỏi bất kỳ ở trang Khám phá nhé.'));
  for(const t of upcoming){const p=state.progress[t.id];const r=make('div','due-row');const main=make('div','due-row-main');put(main,make('strong','',t.title),make('small','',p.nextReview<=localDate()?'Đến hạn ngay hôm nay':`Ngày ôn: ${p.nextReview} · sau ${p.intervalDays} ngày`));const go=make('button','','Ôn lại');go.addEventListener('click',()=>startStudy(t,'progress'));put(r,cssCategory(make('i','category-dot'),catOf(t.category)),main,go);list.append(r)}
  const coverage=$('coverage-list');coverage.replaceChildren();for(const c of CATEGORIES){const total=allTopics().filter(t=>t.category===c.id).length;const learned=allTopics().filter(t=>t.category===c.id&&state.progress[t.id]).length;const row=cssCategory(make('div','coverage-row'),c);row.style.setProperty('--pct',`${total?learned/total*100:0}%`);const label=make('div','coverage-label');put(label,make('span','',c.name),make('small','',`${learned}/${total}`));const track=make('div','coverage-track');track.append(make('div','coverage-fill'));put(row,label,track);coverage.append(row)}
}
let historyLimit=20;
function renderHistory(){
  const list=$('history-list');
  const filter=$('history-filter');
  const topics=new Map(state.attempts.map(a=>[a.topicId,topicById(a.topicId)?.title||a.title||a.topicId]));
  const selected=filter.value;
  filter.replaceChildren(make('option','','Tất cả chủ đề'));
  filter.firstChild.value='';
  for(const [id,title] of [...topics].sort((a,b)=>a[1].localeCompare(b[1],'vi'))){
    const option=make('option','',title);option.value=id;filter.append(option);
  }
  filter.value=topics.has(selected)?selected:'';
  const attempts=state.attempts.filter(a=>!filter.value||a.topicId===filter.value)
    .sort((a,b)=>(b.completedAt??b.date).localeCompare(a.completedAt??a.date)||b.id.localeCompare(a.id,undefined,{numeric:true}));
  list.replaceChildren();
  if(!attempts.length)list.append(make('p','lane-note','Bạn chưa có lượt học được lưu.'));
  for(const a of attempts.slice(0,historyLimit)){
    const entry=make('details','history-entry');
    const when=a.completedAt?new Date(a.completedAt).toLocaleString('vi-VN'):a.date;
    entry.append(
      make('summary','',`${a.title||topics.get(a.topicId)} · ${MODE_LABELS[a.mode]} · ${a.finalScore}/5`),
      make('p','lane-meta',`${when} · ${({new:'Bài mới',due:'Ôn đến hạn',early:'Luyện trước hạn',unknown:'Lượt cũ',synthesis:'Tổng hợp'})[a.timing]}`),
    );
    if(a.question)entry.append(make('p','',a.question));
    entry.append(make('p','history-answer',a.answer??'Bản cũ chưa lưu nguyên văn câu trả lời.'));
    if(a.aiScore!==null)entry.append(make('p','lane-meta',`Điểm AI đề xuất: ${a.aiScore}/5`));
    if(a.feedback)entry.append(make('p','',a.feedback));
    for(const [field,label] of [['improvements','Điểm tiến bộ'],['recurringMistakes','Lỗi còn lặp'],['missingConcepts','Ý cần bổ sung']]){
      if(a[field]?.length)entry.append(make('h4','',label),put(make('ul'),...a[field].map(text=>make('li','',text))));
    }
    if(a.followUpQuestion)entry.append(make('h4','','Câu hỏi đào sâu'),make('p','',a.followUpQuestion));
    list.append(entry);
  }
  if(attempts.length>historyLimit)list.append(action('Xem thêm lượt học',()=>{historyLimit+=20;renderHistory();}));
}
function renderSettings(){
  $('learning-mode').value=state.learningPreferences.mode;
  $('preferred-format').value=state.studyMode;
  $('provider-select').value=config.provider;$('model-input').value=config.model;
  $('api-key-input').value=apiKey;$('remember-key').checked=rememberKey;
  $('storage-warning').classList.toggle('hidden',!readOnlyIssue);
  if(readOnlyIssue)$('storage-warning').textContent=readOnlyIssue.message+' Có thể xuất dữ liệu đọc được hoặc nhập backup hợp lệ.';
}
function updateWordCount(){const a=$('answer-input').value.trim();$('word-count').textContent=`${a?a.split(/\s+/).length:0} từ`}
function saveTextDraft(){
  if(!currentTopicId)return;
  queueDraft($('answer-input').value);
}
function queueDraft(text){
  pendingDrafts.set(draftId(currentTopicId),text);
  $('draft-indicator').textContent='Đang lưu nháp…';
  flushDrafts();
}
function draftSnapshot(current=state,changes=pendingDrafts){
  const drafts={...current.drafts};
  for(const [id,text] of changes){
    if(text)drafts[id]=text;else delete drafts[id];
  }
  return drafts;
}
let savingDraft;
async function flushDrafts(){
  if(savingDraft)return savingDraft;
  if(!pendingDrafts.size)return true;
  const changes=new Map(pendingDrafts);
  savingDraft=safeCommit(current=>({...current,drafts:draftSnapshot(current,changes)}));
  const saved=await savingDraft;
  savingDraft=null;
  if(saved)for(const [id,text] of changes)if(pendingDrafts.get(id)===text)pendingDrafts.delete(id);
  $('draft-indicator').textContent=saved?'Đã lưu nháp trên thiết bị':'Nháp chỉ còn trong tab này · hãy xuất backup';
  if(saved&&pendingDrafts.size)flushDrafts();
  return saved;
}
function showAssessment(obj){
  if(!topicById(currentTopicId))return;
  assessment=obj;chosenScore=Number.isInteger(obj.score)?obj.score:null;
  const t=topicById(currentTopicId);
  $('answer-pane').classList.add('hidden');$('assessment-pane').classList.remove('hidden');
  $('assessment-title').textContent=obj.source==='ai'?'Góc nhìn từ AI':obj.source==='reference'?'Đọc để hiểu':obj.source==='offline'?'Kết quả trắc nghiệm':'Tự đánh giá';
  $('assessment-feedback').textContent=obj.feedback;
  $('reference-text').textContent=t.reference;
  const source=exercises[t.id];
  const note=$('source-note');
  note.replaceChildren(document.createTextNode(t.synthesis?'Tiêu chí đánh giá lập luận.':source?`Bài V3 đối chiếu nguồn ngày ${source.reviewedOn} · `:'Chờ kiểm chứng nguồn.'));
  if(source){
    const link=make('a','',source.source[0]);link.href=source.source[1];link.target='_blank';link.rel='noopener noreferrer';note.append(link);
  }
  const analysis=$('analysis-details');analysis.replaceChildren();
  for(const [key,label] of [['improvements','Điểm tiến bộ'],['recurringMistakes','Lỗi còn lặp'],['missingConcepts','Ý cần bổ sung']]){
    if(obj[key]?.length)analysis.append(make('h4','',label),put(make('ul'),...obj[key].map(text=>make('li','',text))));
  }
  if(obj.followUpQuestion)analysis.append(make('h4','','Câu hỏi đào sâu'),make('p','',obj.followUpQuestion));
  if(obj.source==='offline'){
    const [,options,correct,reasons]=source.quiz;
    analysis.append(put(make('ol','quiz-reasons'),...reasons.map((reason,index)=>put(make('li'),make('strong','',`${index===correct?'Đúng':'Sai'} · ${options[index]}`),make('p','',reason)))));
  }
  const ul=$('checkpoint-list');ul.replaceChildren();t.checkpoints.forEach(s=>ul.append(make('li','',s)));
  for(const id of ['rating-heading','score-options'])$(id).hidden=['reference','offline'].includes(obj.source);
  $('save-assessment').hidden=obj.source==='reference';
  renderScores();$('assessment-pane').scrollIntoView({block:'start'});
}
function renderScores(){
  const area=$('score-options');
  area.replaceChildren();
  const names=['Chưa hiểu','Một phần','Cơ bản','Khá rõ','Rất sâu'];
  for(let score=1;score<=5;score++){
    const btn=make('button','score-btn');
    btn.type='button';btn.setAttribute('role','radio');btn.setAttribute('aria-label',`${score}/5: ${names[score-1]}`);
    btn.append(make('span','',score),make('small','',names[score-1]));
    btn.addEventListener('click',()=>selectScore(score));
    btn.addEventListener('keydown',event=>{
      const direction={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
      if(!direction)return;
      event.preventDefault();
      const next=(score+direction+4)%5+1;
      selectScore(next);area.children[next-1].focus();
    });
    area.append(btn);
  }
  selectScore(chosenScore);
}
function selectScore(score){
  chosenScore=score;
  Array.from($('score-options').children).forEach((button,i)=>{
    button.setAttribute('aria-checked',String(score===i+1));
    button.tabIndex=(score??1)===i+1?0:-1;
  });
  $('save-assessment').disabled=score===null;
}
async function requestGrade(){
  if(busy)return;
  const t=topicById(currentTopicId),answer=$('answer-input').value.trim();
  if(!t)return;
  if(answer.length<30){notify('Hãy thử giải thích dài hơn một chút (ít nhất 30 ký tự) để AI có cơ sở phản biện.',true);return}
  flushDrafts();if(!apiKey.trim()){notify('Bạn chưa cấu hình API key. Có thể chọn “Tự đánh giá” ngay, hoặc vào Cài đặt.',true);return}
  busy=true;const id=t.id;const ctrl=new AbortController();activeAbort=ctrl;
  $('answer-input').readOnly=true;
  $('ai-grade').disabled=true;$('self-grade').disabled=true;$('ai-grade').textContent='Đang đọc câu trả lời…';
  try{
    const previous=previousAnswers(state.attempts,id);
    const redact=text=>text.replaceAll(apiKey,'[API key đã ẩn]');
    const result=await askAI({...config,key:apiKey,prompt:comparisonPrompt({...t,question:questionFor(t,lessonMode)},redact(answer),previous.map(a=>({...a,answer:redact(a.answer)}))),signal:ctrl.signal,kind:'compare'});
    if(!previous.length){result.improvements=[];result.recurringMistakes=[];}
    if(currentTopicId===id&&currentPage==='study'&&!ctrl.signal.aborted)showAssessment({...result,source:'ai'});
  }
  catch(e){if(!ctrl.signal.aborted)notify(e.message||'Có lỗi xảy ra khi gọi AI. Câu trả lời vẫn được giữ.',true)}
  finally{if(activeAbort===ctrl){busy=false;activeAbort=null;$('answer-input').readOnly=false;$('ai-grade').disabled=false;$('self-grade').disabled=false;$('ai-grade').textContent='✦ Nhờ AI phản biện'}}
}
function requestSelfAssessment(){
  if(busy)return;const answer=$('answer-input').value.trim();if(!answer){notify('Hãy viết một lời giải thích trước khi tự đánh giá.',true);return}
  flushDrafts();showAssessment({source:'self',feedback:'Đối chiếu lời giải thích với ba ý bên dưới rồi chọn điểm phù hợp.',score:null})
}
async function completeAssessment(){
  if(finishing||!assessment||assessment.source==='reference'||!Number.isInteger(chosenScore))return;
  const topic=topicById(currentTopicId), mode=lessonMode, score=chosenScore, result=assessment, session=studySession;
  if(!topic)return;
  const choice=quizChoice;
  const answer=mode==='quiz'?exercises[topic.id].quiz[1][choice]:$('answer-input').value;
  if(!answer?.trim())return;
  const date=localDate(), key=draftId(topic.id,mode), completedAt=new Date().toISOString();
  finishing=true;
  $('save-assessment').disabled=true;
  await flushDrafts();
  const saved=await safeCommit(current=>{
    const next={...current,drafts:{...current.drafts},progress:{...current.progress},stats:{...current.stats,completedDates:[...current.stats.completedDates]}};
    let timing='synthesis';
    if(topic.synthesis){
      next.learningPlan={...current.learningPlan,synthesis:{...current.learningPlan.synthesis,[topic.id]:{date,score,answer}}};
    }else{
      const previous=current.progress[topic.id];
      const outcome=scheduleAttempt(previous,{score,type:mode,today:date,feedback:result.feedback});
      timing=outcome.timing;
      if(outcome.progress&&outcome.progress!==previous){
        Object.assign(outcome.progress.history.at(-1),{source:result.source,due:timing==='due'});
        next.progress[topic.id]=outcome.progress;
      }
      next.stats.totalReviews+=1;
    }
    if(!next.stats.completedDates.includes(date))next.stats.completedDates.push(date);
    delete next.drafts[key];
    next.attempts=[...current.attempts,normalizeAttempt({
      ...result,id:crypto.randomUUID(),topicId:topic.id,questionVersion:1,mode:topic.synthesis?'synthesis':mode,
      title:topic.title,question:questionFor(topic,mode),answer,date,completedAt,timing,
      aiScore:result.source==='ai'?result.score:null,finalScore:score,
    })];
    return next;
  });
  finishing=false;
  if(!saved){$('save-assessment').disabled=false;return;}
  if(pendingDrafts.get(key)===(mode==='quiz'?String(choice):answer))pendingDrafts.delete(key);
  if(currentPage!=='study'||studySession!==session||lessonMode!==mode)return;
  assessment=null;
  const nextDate=state.progress[topic.id]?.nextReview;
  $('completion-detail').textContent=topic.synthesis?`Đã lưu bài tổng hợp · ${score}/5.`:
    `Đã lưu điểm ${score}/5. ${nextDate?`Lịch ôn: ${nextDate}.`:'Lượt trắc nghiệm đã lưu trong lịch sử.'}`;
  $('assessment-pane').classList.add('hidden');$('completion-pane').classList.remove('hidden');
  $('completion-pane').focus();
  updateChrome();
}
async function createTopic(){
  if(busy)return;
  if(!apiKey.trim()){notify('Để AI sinh chủ đề, hãy nhập API key trong Cài đặt. Thư viện có sẵn vẫn dùng miễn phí.',true);return}
  const btn=$('generate-topic');btn.disabled=true;busy=true;
  const category=filter==='all'?CATEGORIES[Math.floor(Math.random()*7)]:catOf(filter);const ctrl=new AbortController();activeAbort=ctrl;
  try{
    const result=await askAI({...config,key:apiKey,kind:'generate',signal:ctrl.signal,prompt:generationPrompt(category.name,allTopics().map(t=>t.title).join('; '))});
    if(ctrl.signal.aborted)return;
    if([...TOPICS,...state.customTopics].some(t=>t.title.toLocaleLowerCase('vi-VN')===result.title.toLocaleLowerCase('vi-VN')))throw new Error('AI tạo trùng tên chủ đề đã có. Bạn thử sinh lại nhé.');
    const id=`ai_${typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replaceAll('-',''):Date.now()+'_'+Math.random().toString(36).slice(2)}`;
    const topic={id,category:category.id,level:2,status:'draft',...result};
    if(!await safeCommit(current=>({...current,customTopics:[...current.customTopics,topic]})))return;
    notify('Đã lưu đề xuất AI vào bản nháp.');if(currentPage==='explore')renderExplore();
  }catch(e){if(!ctrl.signal.aborted)notify(e.message||'Chưa tạo được chủ đề.',true)}
  finally{btn.disabled=false;if(activeAbort===ctrl){busy=false;activeAbort=null}}
}
function saveConfiguration(){
  const provider=$('provider-select').value,model=$('model-input').value.trim(),key=$('api-key-input').value.trim(),remember=$('remember-key').checked;
  if(!['gemini','openai'].includes(provider)||!/^[-a-zA-Z0-9_.]{3,100}$/.test(model)){notify('Model không hợp lệ. Chỉ nhập tên model, không nhập URL.',true);return}
  try{
    localStorage.setItem(CONFIG_STORAGE,JSON.stringify({provider,model}));
    if(remember){if(key)localStorage.setItem(KEY_STORAGE,key);else localStorage.removeItem(KEY_STORAGE)}else localStorage.removeItem(KEY_STORAGE);
    if(key)sessionStorage.setItem(KEY_STORAGE,key);else sessionStorage.removeItem(KEY_STORAGE);
  }catch(e){notify('Không thể lưu API key vào trình duyệt. Vui lòng kiểm tra quyền truy cập bộ nhớ.',true);return}
  config={provider,model};apiKey=key;rememberKey=remember;
  notify(key?'Đã lưu cấu hình. Chỉ sử dụng key trên thiết bị tin cậy.':'Đã lưu cấu hình, chưa có API key.');
}
function downloadFile(filename,data){const blob=new Blob([data],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function backupText(){
  const snapshot=exportV3({...state,drafts:draftSnapshot()});
  const secrets=[apiKey,safeRead(localStorage,KEY_STORAGE),safeRead(sessionStorage,KEY_STORAGE)].filter(Boolean);
  const textFields=new Set(['title','question','reference','answer','feedback','followUpQuestion']);
  return JSON.stringify(snapshot,function(field,value){
    if(typeof value==='string'&&(textFields.has(field)||this===snapshot.data.drafts||Array.isArray(this))){
      for(const secret of new Set(secrets))value=value.replaceAll(secret,'[API key đã ẩn]');
    }
    return value;
  });
}
function exportData(){downloadFile(`mo-mang-backup-${localDate()}.json`,backupText());notify('Đã chuẩn bị file backup.')}
async function importData(file){if(!file)return;try{
  if(file.size>100*1024*1024)throw new Error('Backup lớn hơn 100 MB.');
  let parsed;
  try{parsed=importV3(await file.text())}catch{throw new Error('File backup không đọc được hoặc không đúng cấu trúc.')}
  if(!confirm('Nhập bản backup sẽ thay thế tiến trình hiện tại trên trình duyệt này. Bạn có muốn tiếp tục?'))return;
  await flushDrafts();
  if(state.revision||state.attempts.length||Object.keys(draftSnapshot()).length)downloadFile(`mo-mang-truoc-khi-nhap-${localDate()}.json`,backupText());
  if(!db){
    const recovered=await openLearningStore({recovery:parsed});
    db=recovered.db;state=recovered.state;
  }else if(!await safeCommit(()=>parsed,{replace:true}))return;
  pendingDrafts.clear();readOnlyIssue=null;notify('Đã khôi phục dữ liệu thành công.');renderSettings();
}catch(e){notify(`Không nhập được backup: ${e.message}`,true)}finally{$('import-file').value=''}}
async function resetProgress(){
  if(!confirm('Xóa TOÀN BỘ lịch học của MỞ MANG trên trình duyệt này? Bạn đã tải backup chưa?'))return;
  if(!confirm('Xác nhận lần nữa: thao tác này không thể hoàn tác.'))return;
  try{
    await flushDrafts();
    if(!await safeCommit(()=>({...newState(),attempts:[],studyMode:'auto'}),{replace:true}))return;
    pendingDrafts.clear();readOnlyIssue=null;notify('Đã tạo lại tiến trình trắng.');setPage('home');
  }catch{notify('Không thể xóa tiến trình. Hãy tải lại trang và kiểm tra quyền lưu trữ.',true)}
}
function keepAnswerVisible(){
  const input=$('answer-input');
  if(document.activeElement!==input)return;
  const viewport=window.visualViewport, top=viewport?.offsetTop??0, height=viewport?.height??innerHeight;
  const rect=input.getBoundingClientRect();
  const submit=$('write-actions').querySelector('#self-grade').getBoundingClientRect();
  const combined=submit.bottom-rect.top;
  const bottom=combined<=height-16?submit.bottom:rect.bottom;
  if(rect.top<top+8 || bottom>top+height-8){
    const offset=rect.top-top-Math.max(8,(height-(bottom-rect.top))/2);
    window.scrollTo({top:window.scrollY+offset,behavior:'instant'});
  }
}
function bindEvents(){
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-nav]');if(nav){event.preventDefault();setPage(nav.dataset.nav);return}
    const category=event.target.closest('[data-category]');if(category){filter=category.dataset.category;search='';setPage('explore');return}
    const f=event.target.closest('[data-filter]');if(f){filter=f.dataset.filter;renderExplore();return}
  });
  $('streak-shortcut').addEventListener('click',()=>setPage('progress'));
  $('topic-search').addEventListener('input',e=>{search=e.target.value;renderExplore()});
  $('study-back').addEventListener('click',()=>setPage(viewBeforeStudy));
  $('answer-input').addEventListener('input',()=>{updateWordCount();saveTextDraft()});
  $('answer-input').addEventListener('focus',()=>requestAnimationFrame(keepAnswerVisible));
  window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(keepAnswerVisible));
  window.addEventListener('resize',()=>requestAnimationFrame(keepAnswerVisible));
  $('ai-grade').addEventListener('click',requestGrade);
  $('self-grade').addEventListener('click',requestSelfAssessment);
  $('study-form').addEventListener('change',event=>{
    if(busy||finishing){event.target.value=lessonMode;return;}
    setLessonMode(event.target.value);
  });
  $('quiz-check').addEventListener('click',()=>{
    if(quizChoice===null)return;
    const correct=quizChoice===exercises[currentTopicId].quiz[2];
    showAssessment({source:'offline',score:correct?3:2,feedback:correct?'Bạn chọn đúng. Lượt nhận diện này được lưu riêng và giữ nguyên lịch ôn.':'Bạn chọn chưa đúng. Xem lý do cho từng phương án trước khi lưu.'});
  });
  $('history-filter').addEventListener('change',()=>{historyLimit=20;renderHistory();});
  $('show-reference').addEventListener('click',()=>{
    if(!busy)showAssessment({source:'reference',feedback:'Đọc phần tham khảo rồi quay lại thử giải thích theo cách của bạn.'});
  });
  $('retry-answer').addEventListener('click',()=>{
    if(finishing)return;
    $('assessment-pane').classList.add('hidden');$('answer-pane').classList.remove('hidden');assessment=null;
    if(lessonMode==='quiz')$('quiz-options').querySelector('input')?.focus();else $('answer-input').focus();
  });
  $('save-assessment').addEventListener('click',completeAssessment);
  $('generate-topic').addEventListener('click',createTopic);
  $('provider-select').addEventListener('change',()=>{
    const provider=$('provider-select').value;
    $('model-input').value=provider===config.provider?config.model:provider==='gemini'?'gemini-3.5-flash-lite':'gpt-4o-mini';
    $('api-key-input').value=provider===config.provider?apiKey:'';
    $('remember-key').checked=provider===config.provider&&rememberKey;
  });
  $('save-key').addEventListener('click',saveConfiguration);
  $('learning-mode').addEventListener('change',async event=>{
    const mode=event.target.value;
    if(!await safeCommit(current=>({...current,learningPreferences:{...current.learningPreferences,mode}})))renderSettings();
  });
  $('preferred-format').addEventListener('change',async event=>{
    const studyMode=event.target.value;
    if(!await safeCommit(current=>({...current,studyMode})))renderSettings();
  });
  $('export-data').addEventListener('click',exportData);
  $('import-file').addEventListener('change',e=>importData(e.target.files?.[0]));
  $('reset-progress').addEventListener('click',resetProgress);
  window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(PAGES.includes(page)&&page!==currentPage)setPage(page)});
  window.addEventListener('pagehide',flushDrafts);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)flushDrafts();
    else if(currentPage==='home'&&homeDate!==localDate())renderHome();
  });
}
try{
  const stored=await openLearningStore();
  db=stored.db;state=stored.state;
}catch{
  const legacy=readState();
  state={...legacy.state,attempts:legacyAttempts(legacy.state),studyMode:'auto'};
  readOnlyIssue={message:'Không mở hoặc chuyển được bộ nhớ IndexedDB. Dữ liệu gốc vẫn còn; app đang ở chế độ chỉ đọc.'};
}
renderSidebar();bindEvents();setPage(location.hash.slice(1));
if(readOnlyIssue)notify(readOnlyIssue.message,true);
fetch(new URL('../content/curriculum-c-28-days.json',import.meta.url))
  .then(response=>{if(!response.ok)throw new Error('Không tải được lộ trình.');return response.json()})
  .then(data=>{
    track=createCurriculum(data,TOPICS);
    if(currentPage==='home')renderHome();
    else if(currentPage==='track')renderTrack();
    else if(currentPage==='progress')renderProgress();
  })
  .catch(()=>{
    $('curriculum-error').hidden=false;
    $('curriculum-error').textContent='Chưa tải được lộ trình 28 ngày. Thư viện và lịch ôn vẫn dùng được.';
  });
if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
