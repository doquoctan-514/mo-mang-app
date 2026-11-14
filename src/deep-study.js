import {daysBetween, scheduleAttempt, validDate} from './scheduler.js';

export const PILOT={
  geo_seasons:{
    title:'Vì sao hai bán cầu có mùa trái ngược?',
    question:'Hãy giải thích bằng lời của bạn vì sao tháng 7 thường là mùa hè ở Bắc bán cầu và mùa đông ở Nam bán cầu.',
    background:'Trục quay Trái Đất nghiêng so với phương vuông góc với mặt phẳng quỹ đạo. Khi một bán cầu nghiêng về phía Mặt Trời, nơi đó thường nhận tia sáng trực tiếp hơn và có ngày dài hơn. Cùng lúc, bán cầu kia nhận ít năng lượng hơn. Hai bán cầu cùng ở gần như một khoảng cách tới Mặt Trời tại cùng một thời điểm.',
    checks:['Nêu trục Trái Đất nghiêng khi đi quanh Mặt Trời.','Nối góc chiếu hoặc độ dài ngày với lượng năng lượng nhận được.','Giải thích vì sao hai bán cầu trái mùa ngay tại cùng một thời điểm.'],
    challenge:'Nếu chỉ vì gần Mặt Trời hơn, vì sao hai nơi ở hai bán cầu không nóng lên cùng lúc?',
    scenario:'Hai trạm nghiên cứu nằm ở khoảng 45° Bắc và 45° Nam. Vào khoảng ngày hạ chí tháng 6, trạm nào có nhiều giờ ban ngày hơn? Giải thích cơ chế và dự đoán điều gì đảo chiều vào khoảng tháng 12.',
    transfer:['Chọn trạm 45° Bắc vào tháng 6.','Giải thích bằng hướng nghiêng của bán cầu và quãng thời gian có ánh sáng.','Dự đoán trạm 45° Nam có thời gian ban ngày dài hơn vào tháng 12.'],
    sources:[['NASA Space Place','https://spaceplace.nasa.gov/seasons/en/']],
  },
  geo_delta:{
    title:'Vì sao nhiều nền văn minh hình thành gần sông?',
    question:'Giải thích cách một con sông có thể giúp cộng đồng phát triển thành đô thị. Nêu một rủi ro hoặc một điều kiện mà dòng sông không tự cung cấp.',
    background:'Ở miền nam Lưỡng Hà, cộng đồng tận dụng sông Tigris và Euphrates để tưới ruộng trong điều kiện mưa ít hoặc thất thường. Nguồn nước và vận chuyển có thể hỗ trợ nông nghiệp, trao đổi và định cư. Lũ có thể phá hủy mùa màng. Việc đào và duy trì kênh cần kỹ thuật, tổ chức và phối hợp; vị trí gần sông tự nó không quyết định sự hình thành đô thị.',
    checks:['Nêu một cơ chế cụ thể như tưới ruộng hoặc vận chuyển.','Giải thích một mắt xích từ sản xuất/trao đổi đến định cư hoặc chuyên môn hóa.','Nêu rủi ro hay điều kiện xã hội và tránh coi sông là nguyên nhân duy nhất.'],
    challenge:'Hai vùng có cùng lượng nước nhưng chỉ một vùng có đô thị lớn. Bạn cần biết thêm điều gì?',
    scenario:'Hai làng giả định ở cùng một lưu vực. Làng A có kênh tưới được bảo trì chung và nơi chứa lương thực. Làng B thường mất mùa vì lũ và chưa có quy ước chia nước. Hãy dự đoán một khác biệt có thể xảy ra và nêu dữ liệu cần tìm để kiểm tra.',
    transfer:['Đưa ra một dự đoán có điều kiện, không khẳng định chắc chắn.','Dùng cách quản lý nước hoặc dự trữ để giải thích sự khác nhau.','Nêu một bằng chứng có thể kiểm tra, chẳng hạn dấu tích kênh, kho hoặc lớp trầm tích lũ.'],
    sources:[['The Metropolitan Museum of Art · Art of the First Cities','https://www.metmuseum.org/exhibitions/listings/2003/art-of-the-first-cities']],
  },
  eco_gdp:{
    title:'GDP nói gì và không nói gì về mức sống?',
    question:'Giải thích GDP đo điều gì. Vì sao GDP bình quân đầu người tăng chưa đủ để kết luận hộ gia đình điển hình sống tốt hơn?',
    background:'GDP đo sản lượng hàng hóa và dịch vụ được tạo ra trong một nền kinh tế trong một kỳ, theo quy tắc tài khoản quốc gia. Chia GDP cho dân số cho một số bình quân về sản lượng. Số bình quân không cho biết lợi ích phân bổ cho ai. Thu nhập hộ, sức khỏe, môi trường và thời gian dành cho việc chăm sóc không lương có thể cho thấy những khía cạnh khác của mức sống.',
    checks:['Định nghĩa GDP theo sản lượng trong một nền kinh tế và một kỳ.','Phân biệt sản lượng bình quân với thu nhập của hộ điển hình hoặc phân phối.','Nêu một chỉ báo bổ sung và điều nó giúp kiểm tra.'],
    challenge:'Nếu mức tăng sản lượng tập trung vào một nhóm nhỏ, chỉ báo nào giúp bạn kiểm tra phần còn lại?',
    scenario:'GDP thực bình quân của một nước tăng 4%, nhưng thu nhập khả dụng trung vị của hộ sau điều chỉnh giá không đổi và thời gian đi làm tăng. Hãy viết hai câu kết luận cho bản tin và chọn thêm một chỉ báo để kiểm tra mức sống.',
    transfer:['Ghi nhận sản lượng thực bình quân tăng.','Nêu vì sao thu nhập trung vị và thời gian đi làm khiến kết luận về mức sống cần thận trọng.','Chọn thêm một chỉ báo và giải thích nó đo khía cạnh nào.'],
    sources:[['OECD · Annual National Accounts','https://www.oecd.org/en/data/insights/data-explainers/2024/03/annual-national-accounts-frequently-asked-questions.html'],['OECD · Measuring well-being','https://www.oecd.org/en/topics/sub-issues/measuring-well-being-and-progress.html']],
  },
};

export const STEPS=['Tự giải thích','Phản biện','Tự sửa','Vận dụng','Tổng kết'];
export const ABILITIES=['Đã tiếp xúc','Giải thích được','Vận dụng được','Ghi nhớ bền vững'];
export function deepSessionId(){
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const text=value=>typeof value==='string'&&value.length<=12000;
const score=value=>Number.isInteger(value)&&value>=1&&value<=5;
const checked=value=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='boolean');

export function newDeepSession(topicId,id,date){
  if(!Object.hasOwn(PILOT,topicId)||!validDate(date))throw new Error('Phiên học không hợp lệ.');
  return {id,topicId,version:1,startedOn:date,stage:0,assisted:false,aiUsed:false,
    initial:'',revised:'',application:'',feedback:null,summary:null,recallOn:null,
    scenario:PILOT[topicId].scenario,applicationFeedback:[...PILOT[topicId].transfer],reflection:null};
}

export function normalizeDeepSession(s){
  if(!s||typeof s.id!=='string'||!/^[a-f0-9-]{1,80}$/i.test(s.id)||!Object.hasOwn(PILOT,s.topicId)||s.version!==1||
     !validDate(s.startedOn)||!Number.isInteger(s.stage)||s.stage<0||s.stage>4||![s.initial,s.revised,s.application].every(text)||
     typeof s.assisted!=='boolean'||typeof s.aiUsed!=='boolean'||(s.stage>0&&!s.initial.trim())||
     (s.stage>0&&!validDate(s.recallOn))||(s.stage>2&&!s.revised.trim())||(s.stage>3&&!s.application.trim())||
     !text(s.scenario)||!s.scenario.trim()||!Array.isArray(s.applicationFeedback)||s.applicationFeedback.length!==3||
     !s.applicationFeedback.every(text))throw new Error('Phiên học sâu trong backup không hợp lệ.');
  let feedback=null,summary=null;
  if(s.feedback!==null){
    const f=s.feedback;
    if(!f||!['ai','self'].includes(f.source)||!text(f.strength)||!text(f.question)||!Array.isArray(f.gaps)||
       f.gaps.length>3||!f.gaps.every(text))throw new Error('Phản biện không hợp lệ.');
    feedback={source:f.source,strength:f.strength,question:f.question,gaps:f.gaps};
  }
  if(s.stage>=2&&!feedback)throw new Error('Phiên học sâu thiếu phản biện.');
  let reflection=null;
  if(s.reflection!=null){
    const r=s.reflection;
    if(!r||!(r.score===null||score(r.score))||![r.recallChecks,r.explanationChecks,r.transferChecks].every(checked))
      throw new Error('Bản nháp tổng kết không hợp lệ.');
    reflection={score:r.score,recallChecks:r.recallChecks,explanationChecks:r.explanationChecks,transferChecks:r.transferChecks};
  }
  if(s.summary!==null){
    const t=s.summary;
    if(s.stage!==4||!t||!validDate(t.date)||!score(t.score)||!checked(t.explanationChecks)||!checked(t.transferChecks)||
       !checked(t.recallChecks)||!['new','due','early'].includes(t.timing)||!validDate(t.nextReview)||
       ![t.strength,t.gap,t.nextStep].every(text)||typeof t.explained!=='boolean'||typeof t.applied!=='boolean'||
       typeof t.independent!=='boolean')throw new Error('Tổng kết không hợp lệ.');
    summary={date:t.date,score:t.score,explanationChecks:t.explanationChecks,transferChecks:t.transferChecks,
      recallChecks:t.recallChecks,timing:t.timing,nextReview:t.nextReview,strength:t.strength,gap:t.gap,nextStep:t.nextStep,
      explained:t.explained,applied:t.applied,independent:t.independent};
  }
  return {...newDeepSession(s.topicId,s.id,s.startedOn),stage:s.stage,assisted:s.assisted,aiUsed:s.aiUsed,
    initial:s.initial,revised:s.revised,application:s.application,feedback,summary,recallOn:s.recallOn??null,
    scenario:s.scenario,applicationFeedback:s.applicationFeedback,reflection};
}

// Flag substantial verbatim overlap. This is a conservative signal, not a plagiarism detector.
export function resemblesReference(answer,reference){
  const words=value=>value.normalize('NFC').toLocaleLowerCase('vi').match(/\p{L}+/gu)??[];
  const phrases=list=>list.slice(7).map((_,index)=>list.slice(index,index+8).join(' '));
  const sample=new Set(phrases(words(reference)));
  const candidate=phrases(words(answer));
  return candidate.length>=3&&candidate.filter(line=>sample.has(line)).length/candidate.length>=0.45;
}

export function summarizeSession(session,previous,{date,score:finalScore,recallChecks,explanationChecks,transferChecks}){
  if(session.stage!==4||session.summary||!score(finalScore)||![recallChecks,explanationChecks,transferChecks].every(checked))
    throw new Error('Chọn điểm và đối chiếu các tiêu chí trước khi lưu.');
  const lesson=PILOT[session.topicId];
  const reference=[lesson.background,...lesson.checks].join(' ');
  const transferReference=[reference,...session.applicationFeedback].join(' ');
  const explained=explanationChecks.every(Boolean)&&!resemblesReference(session.revised,reference);
  const applied=explained&&transferChecks.every(Boolean)&&!resemblesReference(session.application,transferReference);
  const independent=!session.assisted&&session.recallOn===date&&recallChecks.every(Boolean)&&!resemblesReference(session.initial,reference);
  // A polished rewrite is not the same as remembering before feedback.
  const recallScore=independent?finalScore:Math.min(finalScore,2);
  const outcome=scheduleAttempt(previous,{score:recallScore,type:'essay',today:date});
  const strength=applied?'Bạn đã tự đối chiếu đủ tiêu chí giải thích và vận dụng.':
    explained?'Bạn đã tự đối chiếu đủ tiêu chí giải thích.':'Bạn đã lưu cách giải thích để đối chiếu ở lần sau.';
  const gap=lesson.checks.find((_,i)=>!explanationChecks[i])??lesson.transfer.find((_,i)=>!transferChecks[i])??
    (!explained||!applied?'Viết lại bằng lời của bạn, rồi thử với một ví dụ khác.':'Kiểm tra lại khả năng tự nhớ sau vài ngày.');
  return {progress:outcome.progress,session:normalizeDeepSession({...session,summary:{
    date,score:finalScore,recallChecks,explanationChecks,transferChecks,timing:outcome.timing,
    nextReview:outcome.progress.nextReview,strength,gap,nextStep:'Thử giải thích lại trước khi mở kiến thức nền.',
    explained,applied,independent,
  }})};
}

export function abilityFor(sessions,topicId){
  const related=Object.values(sessions).filter(session=>session.topicId===topicId);
  if(!related.length)return null;
  const summaries=related.map(s=>s.summary).filter(Boolean);
  const applied=summaries.some(s=>s.applied);
  const dates=[...new Set(summaries.filter(s=>s.timing==='due'&&s.independent&&s.explained&&s.score>=3).map(s=>s.date))].sort();
  if(applied&&dates.length>=2&&daysBetween(dates[0],dates.at(-1))>=7)return ABILITIES[3];
  if(applied)return ABILITIES[2];
  return summaries.some(s=>s.explained)?ABILITIES[1]:ABILITIES[0];
}
