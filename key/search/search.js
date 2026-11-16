(() => {
  'use strict';
  const fold=value=>String(value).normalize('NFKC').toLocaleLowerCase('ko-KR');
  const terms=query=>[...new Set(fold(query).trim().split(/\s+/).filter(Boolean))];
  function ranges(text,words){
    let normalized='';const map=[];let offset=0;
    for(const char of text){const value=fold(char);normalized+=value;for(let i=0;i<value.length;i++)map.push({start:offset,end:offset+char.length});offset+=char.length;}
    const found=[];
    for(const word of words)for(let at=normalized.indexOf(word);at!==-1;at=normalized.indexOf(word,at+word.length))found.push({start:map[at].start,end:map[at+word.length-1].end});
    found.sort((a,b)=>a.start-b.start||a.end-b.end);const merged=[];
    for(const hit of found){const last=merged.at(-1);if(last&&hit.start<=last.end)last.end=Math.max(last.end,hit.end);else merged.push({...hit});}
    return merged;
  }
  function search(index,query,subject=''){
    const words=terms(query);if(!words.length)return [];
    const subjects=new Map(index.subjects.map(s=>[s.slug,s.name]));
    return index.topics.flatMap((topic,order)=>{
      if(subject&&topic.subject!==subject)return [];
      const title=fold(topic.title),name=subjects.get(topic.subject),all=fold(name+' '+topic.title+' '+topic.blocks.map(b=>b.text).join(' '));
      if(!words.every(word=>all.includes(word)))return [];
      let block=topic.blocks[0]||{text:'',anchor:topic.anchor,page:topic.page},best=-1;
      for(const candidate of topic.blocks){const text=fold(candidate.text),score=words.filter(word=>text.includes(word)).length;if(score>best){best=score;block=candidate;}}
      const score=(title===fold(query).trim()?100:0)+words.filter(word=>title.includes(word)).length*10+best;
      return [{topic,name,block,score,order}];
    }).sort((a,b)=>b.score-a.score||a.order-b.order);
  }
  function excerpt(text,words){
    const first=ranges(text,words)[0],start=Math.max(0,(first?.start||0)-55),end=Math.min(text.length,start+200);
    return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
  }
  if(typeof module==='object'&&module.exports)module.exports={fold,terms,ranges,search,excerpt};
  if(typeof document==='undefined')return;
  const base=new URL('../',document.currentScript.src),reader=document.querySelector('.reader-top'),home=document.querySelector('.site-header');
  if(!reader&&!home)return;
  const button=document.createElement('button');button.type='button';button.id='global-search';button.className='km-search-open';button.textContent='전체검색';button.title='전체 과목의 본문 검색 (Ctrl+Shift+F)';button.setAttribute('aria-haspopup','dialog');
  if(reader)reader.insertBefore(button,document.querySelector('#print-document'));
  else home.insertBefore(button,home.querySelector('.text-link'));
  const dialog=document.createElement('dialog');dialog.className='km-search-dialog';dialog.id='km-search-dialog';dialog.setAttribute('aria-labelledby','km-search-title');
  dialog.innerHTML='<div class="km-search-head"><h2 id="km-search-title">전체검색</h2><button type="button" class="km-search-close" aria-label="검색 닫기">닫기 ×</button></div><form class="km-search-form"><label for="km-search-input">전체 과목의 제목 · 본문 · 표 · 각주</label><div class="km-search-fields"><input id="km-search-input" type="search" placeholder="검색어를 입력하세요" autocomplete="off" maxlength="120"><select id="km-search-subject" aria-label="검색할 과목"><option value="">전체 과목</option></select></div></form><p class="km-search-status" role="status" aria-live="polite">검색어를 입력하면 모든 과목에서 찾아드립니다.</p><div class="km-search-results"></div><button type="button" class="km-search-more" hidden>더 보기</button><button type="button" class="km-search-retry" hidden>다시 불러오기</button>';
  document.body.append(dialog);button.setAttribute('aria-controls',dialog.id);
  const input=dialog.querySelector('input'),filter=dialog.querySelector('select'),status=dialog.querySelector('.km-search-status'),results=dialog.querySelector('.km-search-results'),more=dialog.querySelector('.km-search-more'),retry=dialog.querySelector('.km-search-retry');
  let index=null,loading=null,hits=[],limit=60,timer;
  function marked(parent,text,words){let at=0;for(const hit of ranges(text,words)){parent.append(document.createTextNode(text.slice(at,hit.start)));const mark=document.createElement('mark');mark.textContent=text.slice(hit.start,hit.end);parent.append(mark);at=hit.end;}parent.append(document.createTextNode(text.slice(at)));}
  function showResults(){
    const words=terms(input.value);results.replaceChildren();
    for(const hit of hits.slice(0,limit)){
      const link=document.createElement('a');link.className='km-search-result';
      const target=new URL(hit.topic.path,base);target.searchParams.set('find',input.value.trim());target.hash=hit.block.anchor;link.href=target.href;
      link.addEventListener('click',event=>{
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        dialog.close();
        // A same-document hash navigation must also refresh its search highlights.
        if(target.pathname===location.pathname&&target.search===location.search){
          event.preventDefault();if(target.href!==location.href)history.pushState(null,'',target.href);location.reload();
        }
      });
      const meta=document.createElement('span');meta.className='km-search-meta';meta.textContent=hit.name+' · '+hit.block.page+'쪽';
      const title=document.createElement('strong');marked(title,hit.topic.title,words);
      const body=document.createElement('p');marked(body,excerpt(hit.block.text,words),words);link.append(meta,title,body);results.append(link);
    }
    more.hidden=hits.length<=limit;
    status.textContent=hits.length?`${hits.length}개 주제에서 찾았습니다.${hits.length>limit?' '+Math.min(limit,hits.length)+'개 표시 중':''}`:'일치하는 내용이 없습니다. 검색어나 과목을 바꿔보세요.';
  }
  function run(){
    clearTimeout(timer);limit=60;
    if(!index)return;
    if(!terms(input.value).length){results.replaceChildren();more.hidden=true;status.textContent=index.subjects.length+'개 과목의 제목·본문·표·각주를 검색합니다. 여러 단어를 띄어 쓰면 모두 포함된 주제를 찾습니다.';return;}
    hits=search(index,input.value,filter.value);showResults();results.scrollTop=0;
  }
  async function load(){
    if(index)return run();if(loading)return loading;
    status.textContent='전체 과목을 불러오고 있습니다…';retry.hidden=true;
    loading=(async()=>{
      try{
        const response=await fetch(new URL('search/index.json?v=20261117-search',base),{cache:'no-cache'});if(!response.ok)throw new Error('load');
        index=await response.json();if(!Array.isArray(index.topics)||!Array.isArray(index.subjects))throw new Error('index');
        for(const subject of index.subjects){const option=document.createElement('option');option.value=subject.slug;option.textContent=subject.name;filter.append(option);}run();
      }catch{index=null;status.textContent='검색 자료를 불러오지 못했습니다. 다시 불러오기를 눌러주세요.';retry.hidden=false;}
      finally{loading=null;}
    })();return loading;
  }
  function open(){if(!dialog.open)dialog.showModal();input.focus();input.select();void load();}
  button.addEventListener('click',open);dialog.querySelector('.km-search-close').addEventListener('click',()=>dialog.close());
  input.addEventListener('input',event=>{if(!event.isComposing){clearTimeout(timer);timer=setTimeout(run,120);}});
  input.addEventListener('compositionend',run);filter.addEventListener('change',run);
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();run();});
  more.addEventListener('click',()=>{limit+=60;showResults();});retry.addEventListener('click',()=>void load());
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();dialog.close();}});
  document.addEventListener('keydown',event=>{if(!event.isComposing&&!event.altKey&&(event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();open();}});

  // Native highlight ranges leave the document text/DOM and shared-mask anchors intact.
  const query=(new URLSearchParams(location.search).get('find')||'').slice(0,120);input.value=query.slice(0,120);
  if(reader&&query&&window.Highlight&&CSS.highlights){
    const target=document.getElementById(decodeURIComponent(location.hash.slice(1))),note=target?.closest('.section')?.dataset.note;
    if(note){
      const matched=[];
      for(const section of document.querySelectorAll('.section')){
        if(section.dataset.note!==note)continue;
        const nodes=[];let text='';const walk=document.createTreeWalker(section,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.mask-layer,script,style')||n.parentElement.closest('.joined-continuation>.section-title')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
        for(let node=walk.nextNode();node;node=walk.nextNode()){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;}
        for(const hit of ranges(text,terms(query))){
          const a=nodes.find(n=>n.end>hit.start),b=nodes.find(n=>n.end>=hit.end);if(!a||!b)continue;
          const range=document.createRange();range.setStart(a.node,hit.start-a.start);range.setEnd(b.node,hit.end-b.start);matched.push(range);
        }
      }
      const highlight=new Highlight(...matched);CSS.highlights.set('key-search',highlight);
      window.addEventListener('beforeprint',()=>CSS.highlights.delete('key-search'));
      window.addEventListener('afterprint',()=>CSS.highlights.set('key-search',highlight));
      function jump(){requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const rect=matched[0]?.getBoundingClientRect();if(!rect)return;
        const toolbar=document.querySelector('.reader-ui'),stage=document.querySelector('.reader-stage');
        window.scrollTo({top:window.scrollY+rect.top-toolbar.getBoundingClientRect().height-24,behavior:'auto'});
        const box=stage.getBoundingClientRect();if(rect.left<box.left||rect.right>box.right)stage.scrollLeft+=rect.left-box.left-16;
      }));}
      if(document.documentElement.classList.contains('reader-ready'))jump();
      else {const observer=new MutationObserver(()=>{if(document.documentElement.classList.contains('reader-ready')){observer.disconnect();jump();}});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
    }
  }
})();
