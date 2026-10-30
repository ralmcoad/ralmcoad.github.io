(() => {
  'use strict';
  const root=document.documentElement;
  const toolbar=document.querySelector('.reader-ui');
  const stage=document.querySelector('.reader-stage');
  const pages=[...document.querySelectorAll('.sheet')];
  const zoom=document.querySelector('#zoom-select');
  const pageSelect=document.querySelector('#page-select');
  const topicSelect=document.querySelector('#topic-select');
  const steps=[0.5,0.75,1,1.25,1.5,2];
  let scale=1;
  root.classList.add('reader-loading');
  const offset=()=>toolbar.getBoundingClientRect().height;
  function applyZoom(){
    const padding=window.innerWidth<=600?20:36;
    scale=zoom.value==='fit'?Math.max(0.3,Math.min(1.65,(stage.clientWidth-padding-8)/(210*96/25.4))):Number(zoom.value);
    root.style.setProperty('--sheet-scale',String(scale));
    root.style.setProperty('--reader-offset',offset()+'px');
    document.querySelector('#zoom-out').disabled=scale<=0.5;
    document.querySelector('#zoom-in').disabled=scale>=2;
  }
  function goTo(id){
    const target=document.getElementById(id);
    if(!target)return;
    const rect=target.getBoundingClientRect();
    window.scrollTo({top:window.scrollY+rect.top-offset()-18,behavior:'auto'});
    if(id.startsWith('topic-')){
      const stageRect=stage.getBoundingClientRect();
      if(rect.left<stageRect.left||rect.right>stageRect.right)stage.scrollLeft+=rect.left-stageRect.left-16;
    }
  }
  zoom.addEventListener('change',applyZoom);
  document.querySelector('#zoom-out').addEventListener('click',()=>{zoom.value=String([...steps].reverse().find(s=>s<scale-0.02)||0.5);applyZoom();});
  document.querySelector('#zoom-in').addEventListener('click',()=>{zoom.value=String(steps.find(s=>s>scale+0.02)||2);applyZoom();});
  pageSelect.addEventListener('change',()=>goTo(pageSelect.value));
  topicSelect.addEventListener('change',()=>{if(topicSelect.value){history.replaceState(null,'','#'+topicSelect.value);goTo(topicSelect.value);}});
  document.querySelector('#print-document').addEventListener('click',()=>window.print());
  window.addEventListener('resize',applyZoom);
  let ticking=false;
  window.addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{let nearest=pages[0];for(const page of pages){if(page.getBoundingClientRect().top<=offset()+70)nearest=page;}pageSelect.value=nearest.id;ticking=false;});},{passive:true});
  Promise.all([document.fonts.ready,...[...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});}))]).then(()=>{
    applyZoom();root.classList.remove('reader-loading');root.classList.add('reader-ready');
    if(location.hash){const id=decodeURIComponent(location.hash.slice(1));topicSelect.value=id;requestAnimationFrame(()=>goTo(id));}
  });
})();
