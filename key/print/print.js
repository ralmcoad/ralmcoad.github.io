(() => {
  'use strict';
  if(!window.KeyMessageEntry?.unlocked)return;
  const library=window.LIBRARY,container=document.querySelector('#print-pages');
  const status=document.querySelector('#print-status'),printButton=document.querySelector('#print-all');
  const modeButton=document.querySelector('#print-masks'),retry=document.querySelector('#retry');
  const params=new URLSearchParams(location.search),modeKey='key-reader-mask-mode:v1';
  const frames=[],snapshots=new Map();let ready=false,enabled=true;
  function fitPreview(){document.documentElement.style.setProperty('--print-scale',String(Math.min(1,Math.max(.25,(window.innerWidth-24)/(210*96/25.4)))));}
  fitPreview();window.addEventListener('resize',fitPreview);
  try{enabled=localStorage.getItem(modeKey)!=='off';}catch{}
  if(params.has('masks'))enabled=params.get('masks')!=='off';
  const frameCSS=`
    html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important;background:white!important;}
    body>.reader-stage{display:block!important;min-height:0!important;padding:0!important;opacity:1!important;overflow:hidden!important;}
    #pages{display:block!important;width:210mm!important;margin:0!important;padding:0!important;gap:0!important;}
    .sheet{width:210mm!important;height:297mm!important;margin:0!important;box-shadow:none!important;}
    .sheet>.page{transform:none!important;position:relative!important;top:0!important;left:0!important;break-after:auto!important;}
    .section:target{outline:none!important;}
    .page .text-mask{pointer-events:none!important;background:#9b9b9b!important;outline:none!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important;}
  `;
  function updateMode(){
    modeButton.textContent=enabled?'가리기 켜짐':'가리기 꺼짐';
    modeButton.setAttribute('aria-pressed',String(enabled));
    for(const {frame} of frames)frame.contentDocument?.documentElement.classList.toggle('mask-mode-on',enabled);
  }
  // Resolve the same quote/prefix/suffix text anchors used by the document reader.
  function locate(part,text){
    if(!part.quote)return null;
    const matches=[];
    for(let at=text.indexOf(part.quote);at!==-1;at=text.indexOf(part.quote,at+1)){
      let score=0;
      if(part.prefix&&text.slice(Math.max(0,at-part.prefix.length),at)===part.prefix)score+=2;
      if(part.suffix&&text.slice(at+part.quote.length,at+part.quote.length+part.suffix.length)===part.suffix)score+=2;
      matches.push({start:at,end:at+part.quote.length,score});
    }
    matches.sort((a,b)=>b.score-a.score||Math.abs(a.start-part.start)-Math.abs(b.start-part.start));
    const best=matches[0];
    if(!best||(matches.length>1&&best.score===0&&best.start!==part.start))return null;
    return best;
  }
  function drawMasks({frame,slug}){
    const doc=frame.contentDocument,page=doc.querySelector('.page');
    page.querySelector('.mask-layer')?.remove();
    const layer=doc.createElement('div');layer.className='mask-layer';layer.setAttribute('aria-hidden','true');page.append(layer);
    const sections=[...page.querySelectorAll('.section')],cache=new Map();
    for(const item of snapshots.get(slug)||[])for(const part of item.parts){
      const section=sections.find(s=>s.dataset.note===part.note&&s.querySelector('.section-title')?.textContent===part.title)
        ||sections.find(s=>s.querySelector('.section-title')?.textContent===part.title);
      if(!section)continue;
      if(!cache.has(section)){
        const nodes=[];let text='';
        const walk=doc.createTreeWalker(section,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('script,style,.mask-layer')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
        for(let node=walk.nextNode();node;node=walk.nextNode()){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;}
        cache.set(section,{nodes,text});
      }
      const mapped=cache.get(section),found=locate(part,mapped.text);if(!found)continue;
      const pr=page.getBoundingClientRect(),scale=pr.width/page.offsetWidth,rects=[];
      for(const entry of mapped.nodes){
        const start=Math.max(found.start,entry.start)-entry.start,end=Math.min(found.end,entry.end)-entry.start;
        if(end<=start)continue;
        const range=doc.createRange();range.setStart(entry.node,start);range.setEnd(entry.node,end);
        for(const r of range.getClientRects())if(r.width>.1&&r.height>.1){
          const rect={left:(r.left-pr.left)/scale,top:(r.top-pr.top)/scale,width:r.width/scale,height:r.height/scale};
          const last=rects.at(-1);
          if(last&&Math.abs(last.top-rect.top)<1&&Math.abs(last.height-rect.height)<1&&rect.left>=last.left-.5&&rect.left<=last.left+last.width+1)last.width=Math.max(last.width,rect.left+rect.width-last.left);
          else rects.push(rect);
        }
      }
      for(const rect of rects){
        const mask=doc.createElement('span');mask.className='text-mask';mask.dataset.maskId=item.id;
        mask.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;layer.append(mask);
      }
    }
  }
  async function loadMasks(){
    await Promise.all(library.filter(d=>!snapshots.has(d.slug)).map(async d=>{
      const response=await fetch('https://ralmcoad-key-annotations.denma.chatgpt.site/api/masks?document='+encodeURIComponent(d.slug),{cache:'no-store'});
      if(!response.ok)throw new Error('공유 가리개를 불러오지 못했습니다.');
      const data=await response.json();if(!Array.isArray(data.items))throw new Error('공유 가리개 응답을 확인하지 못했습니다.');
      snapshots.set(d.slug,data.items);
    }));
  }
  async function mount(source,sheet,index){
    const doc=source.doc.cloneNode(true);
    for(const el of doc.querySelectorAll('script,base,#key-entry-gate'))el.remove();
    const base=doc.createElement('base');base.href=source.url;doc.head.prepend(base);
    const style=doc.createElement('style');style.textContent=frameCSS;doc.head.append(style);
    doc.body.replaceChildren();
    const stage=doc.createElement('div');stage.className='reader-stage';
    const pages=doc.createElement('main');pages.id='pages';pages.append(sheet.cloneNode(true));stage.append(pages);doc.body.append(stage);
    doc.documentElement.classList.toggle('mask-mode-on',enabled);
    const holder=document.createElement('section');holder.className='print-sheet';holder.dataset.subject=source.meta.slug;
    const frame=document.createElement('iframe');frame.title=source.meta.name+' '+(index+1)+'쪽';
    frame.setAttribute('sandbox','allow-same-origin');holder.append(frame);container.append(holder);
    const loaded=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('문서를 불러오는 시간이 오래 걸립니다.')),45000);
      frame.onload=()=>{clearTimeout(timeout);resolve();};
    });
    frame.srcdoc='<!doctype html>\n'+doc.documentElement.outerHTML;
    const record={frame,slug:source.meta.slug};frames.push(record);await loaded;
    const child=frame.contentDocument;
    await child.fonts.ready;
    await Promise.all([...child.images].map(img=>img.complete?(img.naturalWidth?Promise.resolve():Promise.reject(new Error('사진을 불러오지 못했습니다.'))):new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('사진을 불러오지 못했습니다.'));})));
    drawMasks(record);
  }
  function finished(){status.textContent=`${library.length}과목 · ${frames.length}쪽 · ${enabled?'가린 상태':'본문이 보이는 상태'}로 인쇄합니다.`;}
  function fail(error){ready=false;printButton.disabled=true;modeButton.disabled=true;status.textContent=error.message+' 다시 준비를 눌러주세요.';retry.hidden=false;}
  updateMode();
  printButton.addEventListener('click',()=>{if(ready)window.print();});
  retry.addEventListener('click',()=>location.reload());
  modeButton.addEventListener('click',async()=>{
    ready=false;printButton.disabled=true;modeButton.disabled=true;enabled=!enabled;
    try{
      if(enabled){status.textContent='공유 가리개를 불러오고 있습니다…';await loadMasks();frames.forEach(drawMasks);}
      updateMode();try{localStorage.setItem(modeKey,enabled?'on':'off');}catch{}
      ready=true;printButton.disabled=false;modeButton.disabled=false;finished();
    }catch(error){fail(error);}
  });
  window.addEventListener('beforeprint',()=>{if(ready){frames.forEach(drawMasks);updateMode();}});
  (async()=>{
    const [sources]=await Promise.all([
      Promise.all(library.map(async meta=>{
        const url=new URL('../'+meta.document,location.href).href,response=await fetch(url,{cache:'no-cache'});
        if(!response.ok)throw new Error(meta.name+' 문서를 불러오지 못했습니다.');
        return {meta,url,doc:new DOMParser().parseFromString(await response.text(),'text/html')};
      })),
      enabled?loadMasks():Promise.resolve()
    ]);
    const pending=[];
    for(const source of sources){
      const sheets=[...source.doc.querySelectorAll('.sheet')];if(sheets.length!==source.meta.pages)throw new Error(source.meta.name+' 쪽수를 확인하지 못했습니다.');
      sheets.forEach((sheet,index)=>pending.push(mount(source,sheet,index)));
    }
    await Promise.all(pending);updateMode();ready=true;printButton.disabled=false;modeButton.disabled=false;finished();
    if(params.get('auto')==='1')requestAnimationFrame(()=>requestAnimationFrame(()=>{if(ready)window.print();}));
  })().catch(fail);
})();
