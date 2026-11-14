import {daysBetween} from './scheduler.js';

export function createCurriculum(data, topics) {
  const byId = new Map(topics.map(topic => [topic.id, topic]));
  if (data.id !== 'world-foundations-28d' || data.weeks.length !== 4) throw new Error('Lộ trình cần có bốn chương.');
  const discovery = [];
  const deep = [];
  const chapters = data.weeks.map((week, index) => {
    if (week.week !== index + 1 || week.discoveryTopicIds.length !== 6 || week.deepTopicIds.length !== 3 ||
        !week.synthesis.title || !week.synthesis.question || week.synthesis.criteria.length !== 3) {
      throw new Error('Cấu trúc chương chưa hợp lệ.');
    }
    discovery.push(...week.discoveryTopicIds);
    deep.push(...week.deepTopicIds);
    return {...week, assignment: {
      id: `synthesis-week-${week.week}`, category:'society', title:week.synthesis.title,
      question:week.synthesis.question, checkpoints:week.synthesis.criteria,
      reference:'Dùng các tiêu chí bên dưới để đối chiếu lập luận của bạn.', synthesis:true,
    }};
  });
  const planned = [...discovery, ...deep];
  if (new Set(planned).size !== 36 || planned.some(id => !byId.has(id)) ||
      planned.filter(id => byId.get(id).category === 'profession').length !== 5) {
    throw new Error('Danh sách chủ đề của lộ trình chưa hợp lệ.');
  }
  const final = {
    id:'synthesis-final', category:'society', title:'Tổng kết 28 ngày: Một nơi, nhiều góc nhìn',
    question:'Chọn một nước hoặc thành phố. Giải thích môi trường địa lý, dấu ấn lịch sử, cách tổ chức thể chế và một vấn đề xã hội liên hệ với nhau ra sao.',
    checkpoints:['Kết nối bốn góc nhìn bằng một ví dụ cụ thể.', 'Phân biệt sự kiện, diễn giải và điều còn chưa chắc chắn.', 'Nêu một giới hạn hoặc cách giải thích khác.'],
    reference:'Kiểm tra xem ví dụ của bạn có làm rõ từng mối liên hệ và giới hạn của lập luận hay không.',
    synthesis:true,
  };
  return {...data, chapters, discovery, deep, byId, final};
}

export function nextDeepTopic(track, progress) {
  return track.deep.find(id => !Object.hasOwn(progress, id)) ?? null;
}

export function planForDate(track, state, date) {
  const day = Math.max(1, daysBetween(state.learningPlan.startedOn ?? date, date) + 1);
  const weekday = (day - 1) % 7 + 1;
  const chapter = track.chapters[Math.floor((day - 1) / 7)];
  const {discoveryDays, deepDays, synthesisDay} = track.weeklySlots;
  const selection = state.learningPlan.dailySelections[date];
  const previous = Object.keys(state.learningPlan.dailySelections).filter(d => d < date).sort().at(-1);
  const priorDeferred = state.learningPlan.dailySelections[previous]?.deferred
    ? state.learningPlan.dailySelections[previous] : null;
  const allowsDiscovery = Boolean((!chapter || discoveryDays.includes(weekday)) && state.learningPreferences.mode !== 'depth');
  const scheduled = chapter?.discoveryTopicIds[discoveryDays.indexOf(weekday)];
  const pinned = track.byId.has(selection?.discoveryId) && !track.deep.includes(selection.discoveryId)
    ? selection.discoveryId : null;
  let discoveryId = pinned ?? (
    priorDeferred?.discoveryId && !state.progress[priorDeferred.discoveryId] ? priorDeferred.discoveryId : scheduled
  );
  if (allowsDiscovery && !pinned && (!discoveryId || state.progress[discoveryId])) {
    discoveryId = alternateDiscovery(track, state, date) ?? scheduled ?? null;
  }
  return {
    day, chapter, selection, discoveryId:allowsDiscovery ? discoveryId : null,
    deepId:state.learningPreferences.mode !== 'breadth' &&
      ((chapter && deepDays.includes(weekday)) || priorDeferred?.deep) ? nextDeepTopic(track,state.progress) : null,
    synthesisId: state.learningPreferences.mode !== 'breadth' && chapter && weekday === synthesisDay ? chapter.assignment.id : null,
  };
}

export function alternateDiscovery(track, state, date, excludeId = null) {
  const history = Object.entries(state.learningPlan.dailySelections)
    .filter(([day, item]) => day < date && track.byId.has(item.discoveryId))
    .sort(([a],[b]) => a.localeCompare(b)).slice(-14);
  const avoid = track.byId.get(history.at(-1)?.[1].discoveryId)?.category;
  const learned = new Map();
  for (const [id, topic] of track.byId) {
    if (state.progress[id]) learned.set(topic.category, (learned.get(topic.category) ?? 0) + 1);
  }
  const planned = new Set(track.discovery);
  const deep = new Set(track.deep);
  const professional = history.filter(([,item]) => track.byId.get(item.discoveryId)?.category === 'profession').length;
  const pool = [...track.byId.values()].filter(topic =>
    topic.id !== excludeId && !deep.has(topic.id) && !state.progress[topic.id] &&
    (topic.category !== 'profession' || (professional + 1) / (history.length + 1) <= 0.16));
  pool.sort((a,b) => Number(a.category === avoid) - Number(b.category === avoid) ||
    (learned.get(a.category) ?? 0) - (learned.get(b.category) ?? 0) ||
    Number(planned.has(a.id)) - Number(planned.has(b.id)) || a.id.localeCompare(b.id));
  return pool[0]?.id ?? null;
}

export function setDailySelection(plan, date, change) {
  const dailySelections = {...plan.dailySelections, [date]:{...plan.dailySelections[date], ...change}};
  for (const old of Object.keys(dailySelections).sort().slice(0,-60)) delete dailySelections[old];
  return {...plan, dailySelections};
}
