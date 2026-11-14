/** SM-2 với điểm tự đánh giá 1..5. Phần này không phụ thuộc trình duyệt. */
export const FIRST_EASE = 2.5;
export function localDate(input = new Date()) {
  return `${input.getFullYear()}-${String(input.getMonth()+1).padStart(2,'0')}-${String(input.getDate()).padStart(2,'0')}`;
}
export function validDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === str;
}
export function addDays(date, days) {
  if (!validDate(date) || !Number.isSafeInteger(days) || Math.abs(days)>365000) throw new Error('Ngày không hợp lệ');
  const [y,m,d] = date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
export function daysBetween(a,b) {
  if (!validDate(a)||!validDate(b)) throw new Error('Ngày không hợp lệ');
  const toEpoch=s=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};
  return Math.round((toEpoch(b)-toEpoch(a))/86400000);
}
export function reviewProgress(previous, score, today = localDate(), feedback = '') {
  if (!Number.isInteger(score)||score<1||score>5) throw new Error('Điểm phải là số nguyên 1–5');
  if (!validDate(today)) throw new Error('Ngày học không hợp lệ');
  const prev = previous && typeof previous === 'object' ? previous : {};
  const oldEase = Number.isFinite(prev.easeFactor) ? Math.min(3.8,Math.max(1.3,prev.easeFactor)) : FIRST_EASE;
  const oldReps = Number.isInteger(prev.reps) && prev.reps>=0 ? prev.reps : 0;
  const oldInterval = Number.isInteger(prev.intervalDays)&&prev.intervalDays>=0 ? prev.intervalDays : 0;
  // SuperMemo SM-2: EF(n) = EF(n-1) + [0.1 - (5-q)(0.08+(5-q)*0.02)]
  const delta=5-score;
  const easeFactor=Math.min(3.8,Math.max(1.3,Math.round((oldEase+0.1-delta*(0.08+delta*0.02))*100)/100));
  let reps, intervalDays;
  if(score<3){reps=0;intervalDays=1;}
  else {
    reps=oldReps+1;
    intervalDays=reps===1?1:reps===2?6:Math.max(1,Math.round(oldInterval*oldEase));
  }
  // Không tự ý rút lịch để nhồi học thêm khi điểm cao.
  intervalDays=Math.min(intervalDays,36500);
  const history=Array.isArray(prev.history)?prev.history.slice(-199):[];
  history.push({date:today,score,feedback:typeof feedback==='string'?feedback.slice(0,2200):''});
  return {reps,easeFactor,intervalDays,nextReview:addDays(today,intervalDays),lastScore:score,lastReviewed:today,mastered:reps>=4 && intervalDays>=21 && score>=4,history};
}
export function dueTopics(topics,progress,today=localDate()) {
  return topics.filter(t=>progress[t.id] && validDate(progress[t.id].nextReview) && progress[t.id].nextReview<=today)
    .sort((a,b)=>progress[a.id].nextReview.localeCompare(progress[b.id].nextReview));
}
export function currentStreak(completedDates,today=localDate()) {
  const days=new Set((Array.isArray(completedDates)?completedDates:[]).filter(validDate));
  let current=today;
  if(!days.has(current)) current=addDays(current,-1);
  let streak=0;
  while(days.has(current) && streak<36500){streak++;current=addDays(current,-1)}
  return streak;
}
