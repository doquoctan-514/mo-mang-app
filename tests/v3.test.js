import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {comparisonPrompt,previousAnswers,askAI} from '../src/ai.js';
import {exercises,chooseMode,modesFor} from '../src/exercises.js';
import {newState} from '../src/storage.js';
import {reviewProgress} from '../src/scheduler.js';
import {normalizeAttempt,legacyAttempts,exportV3,importV3} from '../src/database.js';

const sample={id:'geo_seasons',title:'Mùa',question:'Vì sao?',category:'geo',reference:'Giải thích',checkpoints:['Góc chiếu']};
const date='2028-02-29';
function attempt(n,fields={}){
  return {id:`attempt-${n}`,topicId:sample.id,questionVersion:1,mode:'essay',question:sample.question,
    answer:`  Bài số ${n}\n có dấu và khoảng trắng  `,date,completedAt:`${date}T12:00:0${n}.000Z`,
    finalScore:3,aiScore:null,feedback:'Tự đánh giá',source:'self',timing:'new',...fields};
}
test('ba hình thức, trắc nghiệm có bốn lý do và một đáp án',()=>{
  assert.deepEqual(modesFor(sample),['essay','quiz','scenario']);
  assert.equal(chooseMode(sample,'auto',[attempt(1)]),'quiz');
  assert.equal(chooseMode(sample,'auto',[attempt(1),attempt(2,{mode:'quiz'})]),'scenario');
  assert.deepEqual(modesFor({id:'unknown'}),['essay','scenario']);
  for(const item of Object.values(exercises)){
    const [,options,correct,reasons]=item.quiz;
    assert.equal(new Set(options).size,4);assert.equal(reasons.length,4);
    assert.ok(Number.isInteger(correct)&&correct>=0&&correct<4);
    assert.match(item.source[1],/^https:\/\//);
  }
});
test('AI chỉ nhận 3 bài viết mới nhất cùng khái niệm và kiểm tra schema',async()=>{
  const previous=previousAnswers([attempt(1),attempt(2),attempt(3),attempt(4),attempt(5,{topicId:'other'}),attempt(6,{mode:'quiz'})],sample.id);
  assert.deepEqual(previous.map(a=>a.id),['attempt-4','attempt-3','attempt-2']);
  const prompt=comparisonPrompt(sample,'Bài mới',previous);
  assert.doesNotMatch(prompt,/Bài số 1|Bài số 5|Bài số 6/);
  const original=globalThis.fetch;
  const result={score:4,feedback:'Bài đúng trọng tâm',improvements:['Thêm ví dụ'],recurringMistakes:[],missingConcepts:['Góc chiếu'],followUpQuestion:'Vì sao hai bán cầu khác nhau?'};
  try{
    const fixture=randomUUID();
    globalThis.fetch=async(url,options)=>{
      assert.ok(!url.includes(fixture));
      assert.equal(JSON.parse(options.body).generationConfig.responseJsonSchema.required.length,6);
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
    };
    const options={provider:'gemini',model:'gemini-3.5-flash-lite',key:fixture,prompt,kind:'compare'};
    assert.deepEqual(await askAI(options),result);
    result.improvements=[3];
    await assert.rejects(askAI(options),/sai cấu trúc/);
  }finally{globalThis.fetch=original;}
});
test('backup V3 giữ nguyên văn từng lượt và đọc V2 không dựng câu trả lời cũ',()=>{
  const legacy=newState();
  legacy.progress[sample.id]=reviewProgress(null,4,date);
  const prior=legacyAttempts(legacy);
  assert.equal(prior[0].answer,null);
  assert.equal(prior[0].completedAt,null);
  const rawAnswer=attempt(2).answer;
  const state={...legacy,attempts:[...prior,normalizeAttempt(attempt(2)),normalizeAttempt(attempt(3))],studyMode:'scenario'};
  const backup=exportV3(state);
  const restored=importV3(JSON.stringify(backup));
  assert.equal(restored.attempts[1].answer,rawAnswer);
  assert.equal(restored.attempts.length,3);
  assert.equal(restored.studyMode,'scenario');
  assert.throws(()=>importV3(JSON.stringify({...backup,attempts:[...backup.attempts,backup.attempts[0]]})),/trùng ID/);
  assert.equal(importV3(JSON.stringify({format:backup.format,data:legacy})).attempts[0].answer,null);
});
