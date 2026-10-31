(() => {
  'use strict';

  // Store text anchors, not screen coordinates, so zooming and reflow remain safe.
  function locate(part, text) {
    if (!part.quote) return null;
    const matches=[];
    for(let at=text.indexOf(part.quote);at!==-1;at=text.indexOf(part.quote,at+1)) {
      let score=0;
      if(part.prefix && text.slice(Math.max(0,at-part.prefix.length),at)===part.prefix) score+=2;
      if(part.suffix && text.slice(at+part.quote.length,at+part.quote.length+part.suffix.length)===part.suffix) score+=2;
      matches.push({start:at,end:at+part.quote.length,score});
    }
    if(!matches.length) return null;
    matches.sort((a,b)=>b.score-a.score || Math.abs(a.start-part.start)-Math.abs(b.start-part.start));
    const best=matches[0];
    if(matches.length>1 && best.score===0 && best.start!==part.start) return null;
    return {start:best.start,end:best.end};
  }
  function change(items, action, reverse=false) {
    const adding=(action.type==='add')!==reverse;
    if(!adding) return items.filter(item=>item.id!==action.item.id);
    if(items.some(item=>item.id===action.item.id)) return items.slice();
    const next=items.slice();
    next.splice(Math.min(action.index,next.length),0,action.item);
    return next;
  }
  if(typeof module==='object' && module.exports) module.exports={locate,change};
  if(typeof document==='undefined') return;

  const pages=[...document.querySelectorAll('.page')];
  const toolbar=document.querySelector('.reader-ui');
  if(!pages.length || !toolbar) return;
  const legacyKey='key-reader-masks:v1:'+location.pathname;
  const storageKey='key-reader-mask-history:v2:'+location.pathname;
  const modeKey='key-reader-mask-mode:v1';
  let items=[],undo=[],redo=[],selected=null,enabled=true,saveFailed=false,shared=null,syncStatus='공유 내용 불러오는 중…';
  const validItem=item=>item && typeof item.id==='string' && Array.isArray(item.parts) && item.parts.length>0 && item.parts.every(p=>typeof p.note==='string' && typeof p.title==='string' && typeof p.quote==='string' && Number.isInteger(p.start) && p.start>=0);
  try {
    const legacy=JSON.parse(localStorage.getItem(legacyKey)||'null');
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null')||legacy;
    items=Array.isArray(legacy?.items)?legacy.items.filter(validItem):[];
    if(saved) {
      const history=list=>Array.isArray(list)?list.filter(a=>a && ['add','delete'].includes(a.type) && validItem(a.item) && Number.isInteger(a.index) && a.index>=0).slice(-100):[];
      undo=history(saved.undo);redo=history(saved.redo);
    }
    enabled=localStorage.getItem(modeKey)!=='off';
  } catch { saveFailed=true; }

  const controls=document.createElement('div');
  controls.className='annotation-controls';
  controls.innerHTML='<div class="annotation-actions"><button type="button" id="mask-mode" aria-pressed="true" title="켜면 글자를 드래그할 때 회색으로 가립니다. 끄면 일반 글자 선택을 할 수 있습니다.">가리기 켜짐</button><button type="button" id="mask-delete" disabled title="선택한 가리개 삭제 (Delete)">삭제</button><button type="button" id="mask-undo" disabled title="내 작업 되돌리기 (Ctrl+Z)">↶ 되돌리기</button><button type="button" id="mask-redo" disabled title="내 작업 다시 실행 (Ctrl+Shift+Z)">↷ 다시 실행</button></div><p class="annotation-help">누구나 함께 편집 · 드래그하여 가리기 · 클릭 후 Delete · Ctrl+Z</p><span class="annotation-status" role="status" aria-live="polite"></span>';
  toolbar.append(controls);
  const mode=controls.querySelector('#mask-mode');
  const remove=controls.querySelector('#mask-delete');
  const undoButton=controls.querySelector('#mask-undo');
  const redoButton=controls.querySelector('#mask-redo');
  const status=controls.querySelector('.annotation-status');
  const layers=new Map(pages.map(page=>{
    const layer=document.createElement('div');
    layer.className='mask-layer';
    layer.setAttribute('aria-label','회색 가리개 주석');
    page.append(layer);
    return [page,layer];
  }));

  function updateControls() {
    mode.textContent=enabled?'가리기 켜짐':'가리기 꺼짐';
    mode.setAttribute('aria-pressed',String(enabled));
    remove.disabled=!selected;
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
    document.documentElement.classList.toggle('mask-mode-on',enabled);
    status.textContent=(selected?'선택됨':'가리개 '+items.length+'개')+' · '+syncStatus;
  }
  function persist() {
    try {
      localStorage.setItem(storageKey,JSON.stringify({version:2,undo,redo}));
      saveFailed=false;
    } catch { saveFailed=true; }
    updateControls();
  }
  function select(id) {
    selected=id;
    for(const layer of layers.values()) for(const button of layer.children) {
      const active=button.dataset.maskId===id;
      button.classList.toggle('is-selected',active);
      button.setAttribute('aria-pressed',String(active));
    }
    updateControls();
  }
  function apply(action) {
    items=change(items,action);
    undo.push(action);undo=undo.slice(-100);redo=[];
    selected=null;persist();render();
    shared?.submit(action.type==='add'?'put':'delete',action.item.id,action.item);
  }
  function travel(back) {
    const from=back?undo:redo,to=back?redo:undo;
    const action=from.pop();if(!action)return;
    items=change(items,action,back);to.push(action);
    selected=null;window.getSelection()?.removeAllRanges();persist();render();
    shared?.submit((action.type==='add')!==back?'put':'delete',action.item.id,action.item);
  }
  function deleteSelected() {
    const index=items.findIndex(item=>item.id===selected);
    if(index!==-1) apply({type:'delete',item:items[index],index});
  }
  function textMap(section) {
    const nodes=[];let text='';
    const walk=document.createTreeWalker(section,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('script,style,.mask-layer')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    for(let node=walk.nextNode();node;node=walk.nextNode()) {
      nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;
    }
    return {nodes,text};
  }
  function sectionFor(part) {
    const sections=[...document.querySelectorAll('.section')];
    return sections.find(s=>s.dataset.note===part.note && s.querySelector('.section-title')?.textContent===part.title)
      || sections.find(s=>s.querySelector('.section-title')?.textContent===part.title);
  }
  function render() {
    for(const layer of layers.values())layer.replaceChildren();
    const cache=new Map();
    items.forEach((item,index)=>{
      let first=true;
      for(const part of item.parts) {
        const section=sectionFor(part);if(!section)continue;
        if(!cache.has(section))cache.set(section,textMap(section));
        const mapped=cache.get(section),found=locate(part,mapped.text);if(!found)continue;
        const page=section.closest('.page'),layer=layers.get(page);if(!layer)continue;
        const pageRect=page.getBoundingClientRect(),scale=pageRect.width/page.offsetWidth;
        if(!scale)continue;
        const rects=[];
        for(const entry of mapped.nodes) {
          const start=Math.max(found.start,entry.start)-entry.start,end=Math.min(found.end,entry.end)-entry.start;
          if(end<=start)continue;
          const range=document.createRange();range.setStart(entry.node,start);range.setEnd(entry.node,end);
          for(const rect of range.getClientRects()) if(rect.width>0.1 && rect.height>0.1) rects.push({left:(rect.left-pageRect.left)/scale,top:(rect.top-pageRect.top)/scale,width:rect.width/scale,height:rect.height/scale});
        }
        // Adjacent inline runs share a single opaque cover, without covering column gutters.
        const merged=[];
        for(const rect of rects) {
          const previous=merged[merged.length-1];
          if(previous && Math.abs(previous.top-rect.top)<1 && Math.abs(previous.height-rect.height)<1 && rect.left>=previous.left-0.5 && rect.left<=previous.left+previous.width+1) previous.width=Math.max(previous.width,rect.left+rect.width-previous.left);
          else merged.push({...rect});
        }
        for(const rect of merged) {
          const button=document.createElement('button');
          button.type='button';button.className='text-mask';button.dataset.maskId=item.id;
          button.setAttribute('aria-label','가리개 '+(index+1)+' 선택');button.setAttribute('aria-pressed',String(item.id===selected));
          button.tabIndex=first?0:-1;first=false;
          button.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
          button.classList.toggle('is-selected',item.id===selected);
          button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();window.getSelection()?.removeAllRanges();select(item.id);});
          button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();select(item.id);});
          layer.append(button);
        }
      }
    });
    updateControls();
  }
  function captureSelection() {
    const selection=window.getSelection();
    if(!enabled || !selection || selection.isCollapsed || !selection.rangeCount)return;
    const source=selection.getRangeAt(0),parts=[];
    for(const section of document.querySelectorAll('.section')) {
      if(!source.intersectsNode(section))continue;
      const range=document.createRange();range.selectNodeContents(section);
      if(source.compareBoundaryPoints(Range.START_TO_START,range)>0)range.setStart(source.startContainer,source.startOffset);
      if(source.compareBoundaryPoints(Range.END_TO_END,range)<0)range.setEnd(source.endContainer,source.endOffset);
      if(range.collapsed || !range.toString().trim())continue;
      const prefix=document.createRange();prefix.selectNodeContents(section);prefix.setEnd(range.startContainer,range.startOffset);
      const start=prefix.toString().length,quote=range.toString(),text=section.textContent;
      parts.push({note:section.dataset.note||'',title:section.querySelector('.section-title')?.textContent||'',start,quote,prefix:text.slice(Math.max(0,start-32),start),suffix:text.slice(start+quote.length,start+quote.length+32)});
    }
    if(!parts.length)return;
    const item={id:crypto.randomUUID(),parts};
    selection.removeAllRanges();apply({type:'add',item,index:items.length});select(item.id);
  }
  let dragStarted=false;
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('.mask-layer,.annotation-controls'))return;
    select(null);
    dragStarted=event.button===0 && Boolean(event.target.closest('.page'));
  });
  document.addEventListener('pointerup',()=>{
    if(dragStarted) {dragStarted=false;setTimeout(captureSelection,0);}
  });
  document.addEventListener('pointercancel',()=>{dragStarted=false;});
  document.addEventListener('keydown',event=>{
    if(event.isComposing || event.altKey || event.target.closest('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]'))return;
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='z') {
      event.preventDefault();travel(!event.shiftKey);
    } else if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='y') {
      event.preventDefault();travel(false);
    } else if(event.key==='Delete' && selected) {
      event.preventDefault();deleteSelected();
    } else if(event.key==='Escape')select(null);
  });
  mode.addEventListener('click',()=>{
    enabled=!enabled;window.getSelection()?.removeAllRanges();
    try{localStorage.setItem(modeKey,enabled?'on':'off');}catch{saveFailed=true;}
    updateControls();
  });
  remove.addEventListener('click',deleteSelected);
  undoButton.addEventListener('click',()=>travel(true));
  redoButton.addEventListener('click',()=>travel(false));
  let scheduled=false;
  function scheduleRender() {
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;render();});
  }
  new ResizeObserver(scheduleRender).observe(document.querySelector('#pages'));
  new ResizeObserver(()=>document.documentElement.style.setProperty('--reader-offset',toolbar.getBoundingClientRect().height+'px')).observe(toolbar);
  window.addEventListener('resize',scheduleRender);
  window.addEventListener('beforeprint',render);
  window.addEventListener('afterprint',scheduleRender);
  document.fonts.ready.then(scheduleRender);
  for(const image of document.images)if(!image.complete)image.addEventListener('load',scheduleRender,{once:true});
  shared=new window.KeySharedMasks({
    url:'https://ralmcoad-key-annotations.denma.chatgpt.site/api/masks',
    document:location.pathname.split('/').pop().replace(/\.html$/,''),
    storage:{getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)},key:'key-reader-shared-masks:v2:'+location.pathname,initialItems:items,
    onChange:next=>{items=next.filter(validItem);if(selected && !items.some(item=>item.id===selected))selected=null;render();},
    onStatus:state=>{syncStatus=state;updateControls();},
  });
  shared.display();void shared.refresh();
  setInterval(()=>{if(document.visibilityState==='visible')void shared.refresh();},5000);
  window.addEventListener('online',()=>void shared.refresh());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void shared.refresh();});
  updateControls();scheduleRender();
})();
