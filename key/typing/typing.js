import {normalize,comparable,insertedAttempt,measure,shuffled} from './core.mjs?v=2';

const $=id=>document.getElementById(id);
const input=$('typing-input'),target=$('target');
const fields=['subject','topic','order','limit'];
let corpus,pool=[],queue=[],offset=0,index=0,finished=0,skipped=0,done=false,composition=false,lastComposition=0;
let previous='',attempts=0,errors=0,priorStrokes=0,priorTime=0,elapsed=0,runningSince=null,started=false;
let initialQueue=[];
const storageKey='key-message-typing-v1';
const day=()=>new Date().toLocaleDateString('en-CA');
const saved=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{return {};}};
const today=()=>{const record=saved();return record.day===day()&&Number.isFinite(record.count)?record.count:0;};
function updateToday(add=0){const count=today()+add;if(add)try{localStorage.setItem(storageKey,JSON.stringify({day:day(),count}));}catch{}$('today-count').textContent=count;}
function saveSettings(){try{localStorage.setItem(storageKey+'-settings',JSON.stringify(Object.fromEntries(fields.map(id=>[id,$(id).value]))));}catch{}}
function getSettings(){try{return JSON.parse(localStorage.getItem(storageKey+'-settings')||'{}')||{};}catch{return {};}}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function current(){return queue[index];}
function seconds(){return elapsed+(runningSince===null?0:(performance.now()-runningSince)/1000);}
function pause(){if(runningSince!==null){elapsed=seconds();runningSince=null;}renderStats();}
function resume(){if(started&&!done&&!document.hidden&&document.activeElement===input&&runningSince===null)runningSince=performance.now();}
function clock(value){const s=Math.floor(value);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function accuracy(){return attempts?Math.round(100*(attempts-errors)/attempts):null;}
function renderStats(){
  const time=priorTime+seconds();
  const count=priorStrokes+(current()?measure(input.value,current().text).correctStrokes:0);
  const speed=count?Math.round(count/Math.max(1,time)*60):0;
  $('speed').innerHTML=`${speed}<small>타/분</small>`;
  $('accuracy').innerHTML=`${accuracy()??'—'}<small>%</small>`;
  $('completed').innerHTML=`${finished}<small>/ ${queue.length||10}</small>`;
  $('elapsed').textContent=clock(time);
}
function feedback(text,state=''){$('feedback').textContent=text;$('feedback').className=state;}
function highlight(){
  const item=current();if(!item)return;
  const expected=Array.from(item.text),actual=Array.from(comparable(input.value));
  const pending=Array.from(comparable(previous)).length;
  const expectedLength=Array.from(comparable(item.text)).length;
  const fragment=document.createDocumentFragment();
  let position=0;
  expected.forEach(char=>{
    const span=document.createElement('span');span.textContent=char;
    if(/\s/u.test(char)){fragment.append(span);return;}
    const i=position++;
    if(composition&&i>=Math.max(0,pending-1)&&i<actual.length)span.className='composing';
    else if(i<actual.length)span.className=actual[i]===char?'correct':'wrong';
    else if(i===actual.length)span.className='cursor';
    fragment.append(span);
  });
  if(actual.length>expectedLength){const extra=document.createElement('span');extra.className='extra';extra.textContent=actual.slice(expectedLength).join('');fragment.append(extra);}
  target.replaceChildren(fragment);
  $('characters').textContent=`공백 제외 ${actual.length} / ${expectedLength}자`;
}
function evaluateInput(){
  if(!current()||done)return;
  const value=normalize(input.value);
  const delta=insertedAttempt(previous,value,current().text);attempts+=delta.attempts;errors+=delta.errors;previous=value;
  const result=measure(value,current().text);
  highlight();
  if(result.complete){
    pause();done=true;finished++;updateToday(1);input.readOnly=true;$('next').disabled=false;$('skip').disabled=true;
    feedback('정확하게 완성했어요. Enter를 눌러 이어가세요.','success');
  }else if(result.wrong){feedback(`현재 ${result.wrong}글자가 달라요. 붉게 표시된 부분을 고쳐 주세요.`,'error');}
  else if(value){feedback('좋아요. 이어서 입력해 주세요.');}
  else{feedback('첫 글자를 입력하면 시작됩니다.');}
  renderStats();
}
function renderSentence(){
  done=false;composition=false;previous='';elapsed=0;runningSince=null;started=false;lastComposition=0;
  input.value='';input.readOnly=false;input.disabled=false;$('next').disabled=true;$('skip').disabled=false;
  $('practice').hidden=false;$('summary').hidden=true;
  const item=current();
  $('subject-label').textContent=item.subjectName;$('topic-title').textContent=item.topicTitle;
  $('source-link').href=`../read/${item.subject}.html#topic-${item.topic}`;
  $('practice').style.setProperty('--typing-font',`"Typing-${item.subject}", "함초롬바탕", Batang, serif`);
  $('sentence-number').textContent=`${String(index+1).padStart(2,'0')} / ${queue.length}`;
  $('progress').setAttribute('aria-valuemax',queue.length);$('progress').setAttribute('aria-valuenow',index);
  $('progress-fill').style.width=`${index/queue.length*100}%`;
  feedback('첫 글자를 입력하면 시작됩니다.');highlight();renderStats();
}
function summary(){
  $('practice').hidden=true;$('summary').hidden=false;
  $('summary-title').textContent=finished?'한 번 더, 머릿속에 남겼어요.':'다음 문장으로 다시 시작해 볼까요?';
  $('summary-text').textContent=`${queue.length}문장 중 ${finished}문장 완성${skipped?` · ${skipped}문장 건너뜀`:''}`;
  const speed=priorStrokes?Math.round(priorStrokes/Math.max(1,priorTime)*60):0;
  $('summary-stats').innerHTML=`<div><strong>${speed}</strong><span>평균 타/분</span></div><div><strong>${accuracy()??'—'}%</strong><span>정확도</span></div><div><strong>${clock(priorTime)}</strong><span>집중한 시간</span></div>`;
  $('again').focus();renderStats();
}
function advance(skip=false){
  if(!current()||(!skip&&!done)||composition)return;
  pause();priorTime+=seconds();priorStrokes+=measure(input.value,current().text).correctStrokes;
  if(skip)skipped++;
  elapsed=0;runningSince=null;input.value='';index++;
  if(index===queue.length){summary();return;}
  renderSentence();input.focus({preventScroll:true});
}
function begin(repeat=false){
  pause();index=0;finished=0;skipped=0;attempts=0;errors=0;priorStrokes=0;priorTime=0;
  if(repeat)queue=[...initialQueue];
  else{
    const count=$('limit').value==='all'?pool.length:Math.min(Number($('limit').value),pool.length);
    queue=$('order').value==='random'?shuffled(pool).slice(0,count):Array.from({length:count},(_,i)=>pool[(offset+i)%pool.length]);
    initialQueue=[...queue];
  }
  $('pool-count').textContent=`${pool.length.toLocaleString()}개 문장 중 ${queue.length}문장 연습`;
  if(queue.length)renderSentence();
}
function selectPool(){
  pool=corpus.subjects.filter(s=>$('subject').value==='all'||s.slug===$('subject').value).flatMap(s=>s.topics.filter(t=>$('topic').value==='all'||`${s.slug}/${t.id}`===$('topic').value).flatMap(t=>t.sentences.map(v=>({...v,subject:s.slug,subjectName:s.name,topic:t.id,topicTitle:t.title}))));
  offset=0;saveSettings();begin();
}
function populateTopics(preferred='all'){
  $('topic').replaceChildren(option('all','전체 주제'));
  for(const subject of corpus.subjects.filter(s=>$('subject').value==='all'||s.slug===$('subject').value)){
    const group=document.createElement('optgroup');group.label=subject.name;
    subject.topics.forEach(t=>group.append(option(`${subject.slug}/${t.id}`,`${t.title} (${t.sentences.length})`)));
    $('topic').append(group);
  }
  if([...$('topic').options].some(o=>o.value===preferred))$('topic').value=preferred;
}
input.addEventListener('compositionstart',()=>{composition=true;});
input.addEventListener('compositionend',()=>{composition=false;lastComposition=performance.now();evaluateInput();});
input.addEventListener('input',event=>{
  if(done)return;
  if(!started&&comparable(input.value)){started=true;resume();}
  if(composition||event.isComposing){highlight();return;}
  evaluateInput();
});
input.addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  if(event.isComposing||composition||event.keyCode===229||performance.now()-lastComposition<120)return;
  event.preventDefault();if(done)advance();else feedback('문장을 끝까지 맞게 입력하면 다음으로 넘어갑니다.');
});
input.addEventListener('paste',event=>{event.preventDefault();feedback('직접 타이핑하며 연습해 주세요.');});
input.addEventListener('drop',event=>{event.preventDefault();feedback('직접 타이핑하며 연습해 주세요.');});
input.addEventListener('focus',resume);input.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
$('next').addEventListener('click',()=>advance());$('skip').addEventListener('click',()=>advance(true));
$('restart').addEventListener('click',()=>{offset=0;begin();input.focus({preventScroll:true});});
$('repeat').addEventListener('click',()=>{begin(true);input.focus({preventScroll:true});});
$('again').addEventListener('click',()=>{offset=(offset+queue.length)%pool.length;begin();input.focus({preventScroll:true});});
$('subject').addEventListener('change',()=>{populateTopics();selectPool();});
$('topic').addEventListener('change',selectPool);
['order','limit'].forEach(id=>$(id).addEventListener('change',()=>{offset=0;saveSettings();begin();}));
$('reload').addEventListener('click',()=>location.reload());
window.addEventListener('storage',event=>{if(event.key===storageKey)updateToday();});
setInterval(()=>{if(runningSince!==null)renderStats();},300);

async function load(){
  updateToday();
  try{
    const response=await fetch('corpus.json?v=2');if(!response.ok)throw new Error('Corpus unavailable');
    corpus=await response.json();
    if(!Array.isArray(corpus.subjects)||!corpus.subjects.length)throw new Error('Empty corpus');
    const settings=getSettings(),params=new URLSearchParams(location.search);
    $('subject').replaceChildren(option('all','전체 과목'),...corpus.subjects.map(s=>option(s.slug,s.name)));
    const selected=params.get('subject')||settings.subject;
    if(corpus.subjects.some(s=>s.slug===selected))$('subject').value=selected;
    populateTopics(params.has('topic')?`${$('subject').value}/${params.get('topic')}`:settings.topic);
    for(const id of ['order','limit'])if([...$(id).options].some(o=>o.value===settings[id]))$(id).value=settings[id];
    ['subject','topic','restart'].forEach(id=>$(id).disabled=false);
    const count=corpus.subjects.reduce((total,s)=>total+s.topics.reduce((n,t)=>n+t.sentences.length,0),0);
    $('corpus-meta').textContent=`${corpus.subjects.length}과목 · ${count.toLocaleString()}개 연습 문장`;
    selectPool();
  }catch(error){
    $('practice').hidden=true;$('load-error').hidden=false;$('pool-count').textContent='문장을 불러오지 못했습니다.';
    fields.forEach(id=>$(id).disabled=true);console.error(error);
  }
}
load();
