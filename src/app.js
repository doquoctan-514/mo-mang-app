import {TOPICS} from './topics.js';
import {localDate,reviewProgress,dueTopics,currentStreak} from './scheduler.js';
import {STATE_KEY,DRAFT_PREFIX,KEY_STORAGE,CONFIG_STORAGE,newState,readState,persist,exportPayload,parseBackup} from './storage.js';
import {askAI,gradingPrompt,generationPrompt} from './ai.js';
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
const stored=readState();
let state=stored.state,readOnlyIssue=stored.issue;
let config={provider:'gemini',model:'gemini-3.5-flash-lite'},apiKey='',rememberKey=false;
let currentPage='home',currentTopicId=null,filter='all',search='',assessment=null,chosenScore=null,activeAbort=null,busy=false,noticeTimeout=null,viewBeforeStudy='home';
let homeDate, draftTimer;
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
function safeCommit(next){
  if(readOnlyIssue){notify(readOnlyIssue.message,true);return false;}
  try{state=persist(next,state.revision);return true}catch{
    notify('Không lưu được tiến trình. Hãy xuất backup rồi kiểm tra dung lượng hoặc tải lại nếu có tab khác đang mở.',true);return false;
  }
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
  $('study-title').textContent=topic.title;
  $('study-question').textContent=topic.question;
  const c=catOf(topic.category);
  cssCategory($('study-category'),c);$('study-category').textContent=topic.synthesis?'Bài tổng hợp':c.name;
  const p=state.progress[topic.id];$('study-status').textContent=topic.synthesis?(state.learningPlan.synthesis[topic.id]?'Đã hoàn thành':'Bài liên kết'):p?`Đã học ${p.history?.length||0} lần`:'Chủ đề mới';
  const previousIndex=track?.deep.indexOf(topic.id) ?? -1;
  $('study-connection').hidden=lane!=='deep';
  $('study-connection').textContent=previousIndex>0?`Nối ý với bài trước “${topicById(track.deep[previousIndex-1]).title}”. Hai bài giúp giải thích cùng một vấn đề ra sao?`:'Vận dụng: Hãy chọn một ví dụ và nêu giới hạn của lời giải thích.';
  $('answer-input').value=pendingDrafts.get(topic.id) ?? state.drafts[topic.id] ?? state.learningPlan.synthesis[topic.id]?.answer ?? '';updateWordCount();$('draft-indicator').textContent='Nháp được lưu trên thiết bị';
  $('answer-input').readOnly=false;
  $('answer-pane').classList.remove('hidden');$('assessment-pane').classList.add('hidden');$('completion-pane').classList.add('hidden');
  $('ai-grade').disabled=false;$('self-grade').disabled=false;$('ai-grade').textContent='✦ Nhờ AI phản biện';
  setPage('study');
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
  if(topic && state.learningPlan.startedOn && !planned.selection?.discoveryId && !readOnlyIssue){
    savePlanSelection(date,{discoveryId:topic.id});
  }
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
      action('Chỉ ôn hôm nay',()=>{
        savePlanSelection(date,{discoveryId:topic?.id,deferred:true,deep:!!planned.deepId});
        renderHome();
      }));
  }
  if(deferred)reviews.append(make('p','lane-note','Hôm nay chỉ ôn. Bài khám phá và bài sâu sẽ được gợi lại.'),action('Hiện lại gợi ý hôm nay',()=>{
    savePlanSelection(date,{deferred:false,deep:false});renderHome();
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
  const plan=setDailySelection(state.learningPlan,date,change);
  return safeCommit({...state,learningPlan:{...plan,startedOn:plan.startedOn??date}});
}
function shuffleDiscovery(topic,date){
  if(date!==localDate()){renderHome();return;}
  const replacement=alternateDiscovery(track,state,date,topic.id);
  if(!replacement){notify('Bạn đã thử hết các lựa chọn phù hợp hôm nay.');return;}
  if(savePlanSelection(date,{discoveryId:replacement}))renderHome();
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
    preview.append(make('summary','',t.title),make('p','',t.question),make('p','',t.reference));
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
  const counts=Object.values(state.progress).flatMap(p=>p.history);
  const dueReviews=counts.filter(review=>review.due);
  const lanes=$('progress-lanes');
  lanes.replaceChildren(
    make('p','',`Khám phá theo lộ trình: ${track?.discovery.filter(id=>state.progress[id]).length??0}/24 bài`),
    make('p','',`Chuyên đề: ${track?.deep.filter(id=>state.progress[id]).length??0}/12 bài · ${Object.keys(state.learningPlan.synthesis).length}/5 bài tổng hợp`),
    make('p','',`Ôn đến hạn từ V2: ${dueReviews.length} lượt · ${dueReviews.filter(review=>review.score>=3).length} lượt nhớ ý chính`)
  );
  const list=$('due-list');list.replaceChildren();const queued=due();$('due-label').textContent=queued.length?`${queued.length} câu đến hạn`:'Đã hoàn thành hôm nay';
  const future=allTopics().filter(t=>state.progress[t.id]?.nextReview>localDate())
    .sort((a,b)=>state.progress[a.id].nextReview.localeCompare(state.progress[b.id].nextReview)).slice(0,12);
  const upcoming=[...queued,...future];
  if(!upcoming.length)list.append(make('div','empty-state','Bạn chưa có lịch ôn. Bắt đầu bằng một câu hỏi bất kỳ ở trang Khám phá nhé.'));
  for(const t of upcoming){const p=state.progress[t.id];const r=make('div','due-row');const main=make('div','due-row-main');put(main,make('strong','',t.title),make('small','',p.nextReview<=localDate()?'Đến hạn ngay hôm nay':`Ngày ôn: ${p.nextReview} · sau ${p.intervalDays} ngày`));const go=make('button','','Ôn lại');go.addEventListener('click',()=>startStudy(t,'progress'));put(r,cssCategory(make('i','category-dot'),catOf(t.category)),main,go);list.append(r)}
  const coverage=$('coverage-list');coverage.replaceChildren();for(const c of CATEGORIES){const total=allTopics().filter(t=>t.category===c.id).length;const learned=allTopics().filter(t=>t.category===c.id&&state.progress[t.id]).length;const row=cssCategory(make('div','coverage-row'),c);row.style.setProperty('--pct',`${total?learned/total*100:0}%`);const label=make('div','coverage-label');put(label,make('span','',c.name),make('small','',`${learned}/${total}`));const track=make('div','coverage-track');track.append(make('div','coverage-fill'));put(row,label,track);coverage.append(row)}
}
function renderSettings(){
  $('learning-mode').value=state.learningPreferences.mode;
  $('provider-select').value=config.provider;$('model-input').value=config.model;
  $('api-key-input').value=apiKey;$('remember-key').checked=rememberKey;
  $('storage-warning').classList.toggle('hidden',!readOnlyIssue);
  if(readOnlyIssue)$('storage-warning').textContent=readOnlyIssue.message+' Hãy tải dữ liệu gốc bằng nút bên dưới rồi khôi phục từ backup hợp lệ hoặc xóa tiến trình.';
  $('export-corrupted').classList.toggle('hidden',!readOnlyIssue?.raw);
}
function updateWordCount(){const a=$('answer-input').value.trim();$('word-count').textContent=`${a?a.split(/\s+/).length:0} từ`}
function saveTextDraft(){
  if(!currentTopicId)return;
  pendingDrafts.set(currentTopicId,$('answer-input').value);
  $('draft-indicator').textContent='Đang lưu nháp…';
  clearTimeout(draftTimer);draftTimer=setTimeout(flushDrafts,300);
}
function draftSnapshot(){
  const drafts={...state.drafts};
  for(const [id,text] of pendingDrafts){
    if(text)drafts[id]=text;else delete drafts[id];
  }
  return drafts;
}
function flushDrafts(){
  clearTimeout(draftTimer);
  if(!pendingDrafts.size)return true;
  if(safeCommit({...state,drafts:draftSnapshot()})){
    pendingDrafts.clear();
    $('draft-indicator').textContent='Đã lưu nháp trên thiết bị';
    return true;
  }
  $('draft-indicator').textContent='Nháp chỉ còn trong tab này · hãy xuất backup';
  return false;
}
function showAssessment(obj){
  if(!topicById(currentTopicId))return;
  assessment=obj;chosenScore=Number.isInteger(obj.score)?obj.score:null;
  const t=topicById(currentTopicId);
  $('answer-pane').classList.add('hidden');$('assessment-pane').classList.remove('hidden');
  $('assessment-title').textContent=obj.source==='ai'?'Góc nhìn từ AI':obj.source==='reference'?'Đọc để hiểu':'Tự đánh giá';
  $('assessment-feedback').textContent=obj.feedback;
  $('reference-text').textContent=t.reference;
  $('source-note').textContent=t.synthesis?'Tiêu chí đánh giá lập luận.':'Chưa kiểm chứng nguồn cho từng bài.';
  const ul=$('checkpoint-list');ul.replaceChildren();t.checkpoints.forEach(s=>ul.append(make('li','',s)));
  for(const id of ['rating-heading','score-options','save-assessment'])$(id).hidden=obj.source==='reference';
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
  try{const result=await askAI({...config,key:apiKey,prompt:gradingPrompt(t,answer),signal:ctrl.signal,kind:'grade'});if(currentTopicId===id&&currentPage==='study')showAssessment({...result,source:'ai'})}
  catch(e){if(!ctrl.signal.aborted)notify(e.message||'Có lỗi xảy ra khi gọi AI. Câu trả lời vẫn được giữ.',true)}
  finally{if(activeAbort===ctrl){busy=false;activeAbort=null;$('answer-input').readOnly=false;$('ai-grade').disabled=false;$('self-grade').disabled=false;$('ai-grade').textContent='✦ Nhờ AI phản biện'}}
}
function requestSelfAssessment(){
  if(busy)return;const answer=$('answer-input').value.trim();if(!answer){notify('Hãy viết một lời giải thích trước khi tự đánh giá.',true);return}
  flushDrafts();showAssessment({source:'self',feedback:'Đối chiếu lời giải thích với ba ý bên dưới rồi chọn điểm phù hợp.',score:null})
}
function completeAssessment(){
  if(!assessment||assessment.source==='reference'||!Number.isInteger(chosenScore))return;
  const topic=topicById(currentTopicId), answer=$('answer-input').value.trim();
  if(!topic||!answer)return;
  const date=localDate();
  const next={...state,drafts:draftSnapshot(),progress:{...state.progress},stats:{...state.stats,completedDates:[...state.stats.completedDates]}};
  if(topic.synthesis){
    next.learningPlan={...state.learningPlan,synthesis:{...state.learningPlan.synthesis,[topic.id]:{date,score:chosenScore,answer}}};
  }else{
    const previous=state.progress[topic.id];
    const result=reviewProgress(previous,chosenScore,date,assessment.source==='ai'?assessment.feedback:'Tự đánh giá');
    Object.assign(result.history.at(-1),{source:assessment.source,due:!!previous&&previous.nextReview<=date});
    next.progress[topic.id]=result;
    next.stats.totalReviews+=1;
  }
  if(!next.stats.completedDates.includes(date))next.stats.completedDates.push(date);
  delete next.drafts[topic.id];
  if(!safeCommit(next))return;
  pendingDrafts.clear();assessment=null;
  $('completion-detail').textContent=topic.synthesis?`Đã lưu bài tổng hợp · ${chosenScore}/5.`:`Đã lưu điểm ${chosenScore}/5. Ôn lại vào ${next.progress[topic.id].nextReview}.`;
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
    if(!safeCommit({...state,customTopics:[...state.customTopics,topic]}))return;
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
function downloadFile(filename,data,mime='application/json'){const blob=new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function backupText(){
  const snapshot=exportPayload({...state,drafts:draftSnapshot()});
  const secrets=[apiKey,safeRead(localStorage,KEY_STORAGE),safeRead(sessionStorage,KEY_STORAGE)].filter(Boolean);
  const textFields=new Set(['title','question','reference','answer','feedback']);
  return JSON.stringify(snapshot,function(field,value){
    if(typeof value==='string'&&(textFields.has(field)||this===snapshot.data.drafts||Array.isArray(this))){
      for(const secret of new Set(secrets))value=value.replaceAll(secret,'[API key đã ẩn]');
    }
    return value;
  });
}
function exportData(){downloadFile(`mo-mang-backup-${localDate()}.json`,backupText());notify('Đã chuẩn bị file backup.')}
async function importData(file){if(!file)return;try{
  if(file.size>10_000_000)throw new Error('File quá lớn (>10 MB).');
  let parsed;
  try{parsed=parseBackup(await file.text())}catch{throw new Error('File backup không đọc được hoặc không đúng cấu trúc.')}
  if(!confirm('Nhập bản backup sẽ thay thế tiến trình hiện tại trên trình duyệt này. Bạn có muốn tiếp tục?'))return;
  if(state.revision||Object.keys(draftSnapshot()).length)downloadFile(`mo-mang-truoc-khi-nhap-${localDate()}.json`,backupText());
  const recovered=readOnlyIssue?.raw && localStorage.getItem(STATE_KEY)===readOnlyIssue.raw;
  if(readOnlyIssue&&!recovered)throw new Error('Dữ liệu đã thay đổi hoặc trình duyệt đang chặn lưu. Hãy tải lại trang.');
  if(recovered){
    const saved={...parsed,revision:1,legacyDraftsMigrated:true};
    localStorage.setItem(STATE_KEY,JSON.stringify(saved));state=saved;
  }else state=persist(parsed,state.revision);
  pendingDrafts.clear();readOnlyIssue=null;notify('Đã khôi phục dữ liệu thành công.');renderSettings();
}catch(e){notify(`Không nhập được backup: ${e.message}`,true)}finally{$('import-file').value=''}}
function resetProgress(){
  if(!confirm('Xóa TOÀN BỘ lịch học của MỞ MANG trên trình duyệt này? Bạn đã tải backup chưa?'))return;
  if(!confirm('Xác nhận lần nữa: thao tác này không thể hoàn tác.'))return;
  try{
    if(readOnlyIssue?.raw && localStorage.getItem(STATE_KEY)===readOnlyIssue.raw){
      state={...newState(),revision:1,legacyDraftsMigrated:true};
      localStorage.setItem(STATE_KEY,JSON.stringify(state));
    }else state=persist(newState(),state.revision);
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(DRAFT_PREFIX))localStorage.removeItem(key)}
    pendingDrafts.clear();readOnlyIssue=null;notify('Đã tạo lại tiến trình trắng.');setPage('home');
  }catch{notify('Không thể xóa tiến trình. Hãy tải lại trang và kiểm tra quyền lưu trữ.',true)}
}
function keepAnswerVisible(){
  const input=$('answer-input');
  if(document.activeElement!==input)return;
  const viewport=window.visualViewport, top=viewport?.offsetTop??0, height=viewport?.height??innerHeight;
  const rect=input.getBoundingClientRect();
  if(rect.top<top || rect.bottom>top+height)window.scrollBy({top:rect.top-top-Math.max(8,(height-rect.height)/2),behavior:'instant'});
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
  window.visualViewport?.addEventListener('resize',keepAnswerVisible);
  $('ai-grade').addEventListener('click',requestGrade);
  $('self-grade').addEventListener('click',requestSelfAssessment);
  $('show-reference').addEventListener('click',()=>{
    if(!busy)showAssessment({source:'reference',feedback:'Đọc phần tham khảo rồi quay lại thử giải thích theo cách của bạn.'});
  });
  $('retry-answer').addEventListener('click',()=>{$('assessment-pane').classList.add('hidden');$('answer-pane').classList.remove('hidden');assessment=null;$('answer-input').focus()});
  $('save-assessment').addEventListener('click',completeAssessment);
  $('generate-topic').addEventListener('click',createTopic);
  $('provider-select').addEventListener('change',()=>{
    const provider=$('provider-select').value;
    $('model-input').value=provider===config.provider?config.model:provider==='gemini'?'gemini-3.5-flash-lite':'gpt-4o-mini';
    $('api-key-input').value=provider===config.provider?apiKey:'';
    $('remember-key').checked=provider===config.provider&&rememberKey;
  });
  $('save-key').addEventListener('click',saveConfiguration);
  $('learning-mode').addEventListener('change',event=>{
    if(!safeCommit({...state,learningPreferences:{...state.learningPreferences,mode:event.target.value}}))renderSettings();
  });
  $('export-data').addEventListener('click',exportData);
  $('export-corrupted').addEventListener('click',()=>{
    if(!readOnlyIssue?.raw)return;
    let redacted=readOnlyIssue.raw;
    for(const key of [apiKey,safeRead(localStorage,KEY_STORAGE),safeRead(sessionStorage,KEY_STORAGE)].filter(Boolean)){
      redacted=redacted.replaceAll(key,'[API key đã ẩn]');
    }
    downloadFile(`mo-mang-du-lieu-loi-${localDate()}.txt`,redacted,'text/plain');
  });
  $('import-file').addEventListener('change',e=>importData(e.target.files?.[0]));
  $('reset-progress').addEventListener('click',resetProgress);
  window.addEventListener('storage',e=>{
    if(e.key!==STATE_KEY&&e.key!==null&&!(e.key?.startsWith(DRAFT_PREFIX)&&!state.legacyDraftsMigrated))return;
    readOnlyIssue={message:'Dữ liệu đã đổi ở tab khác. Hãy tải lại trang trước khi ghi tiếp.',raw:null};
    notify(readOnlyIssue.message,true);
  });
  window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(PAGES.includes(page)&&page!==currentPage)setPage(page)});
  window.addEventListener('pagehide',flushDrafts);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)flushDrafts();
    else if(currentPage==='home'&&homeDate!==localDate())renderHome();
  });
}
renderSidebar();bindEvents();setPage(location.hash.slice(1));
if(readOnlyIssue){notify(readOnlyIssue.message,true);}
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
