/* Convenience entry screen for a public static site, not server authorization.
   GitHub Pages still serves the underlying HTML, PDFs and assets publicly. */
(() => {
  'use strict';
  const script=document.currentScript;
  const base=new URL('./',script.src);
  const entry=new URL('unlock.html',base);
  const key='key-message-entry:v1:'+base.pathname;
  const approved='20261128';
  const expected='36b0207bd8d835af78dc50d39384e7e0c2953dbdb04ca450d856e47da364c074';
  const isEntry=script.dataset.entryPage==='unlock';
  const read=name=>{try{return window[name].getItem(key)===approved;}catch{return false;}};
  const allowed=()=>read('localStorage')||read('sessionStorage');
  const nextURL=()=>{
    try {
      const value=new URL(new URLSearchParams(location.search).get('next')||base.href,base);
      if(value.origin===base.origin&&value.pathname.startsWith(base.pathname)&&value.pathname!==entry.pathname&&!value.username&&!value.password)return value.href;
    }catch{}
    return base.href;
  };
  if(!isEntry){
    const check=()=>{
      if(allowed()){
        document.documentElement.setAttribute('data-key-access','open');
        window.KeyMessageEntry=Object.freeze({unlocked:true});
      }else{
        document.documentElement.removeAttribute('data-key-access');
        window.KeyMessageEntry=Object.freeze({unlocked:false});
        entry.searchParams.set('next',location.pathname+location.search+location.hash);
        location.replace(entry.href);
      }
    };
    check();window.addEventListener('pageshow',event=>{if(event.persisted)check();});
    return;
  }
  const next=nextURL();
  if(allowed()){location.replace(next);return;}
  const form=document.querySelector('#entry-form'),input=document.querySelector('#entry-password');
  const remember=document.querySelector('#entry-remember'),button=document.querySelector('#entry-submit'),error=document.querySelector('#entry-error');
  let busy=false;
  const message=text=>{error.textContent=text;input.setAttribute('aria-invalid','true');};
  input.addEventListener('input',()=>{error.textContent='';input.removeAttribute('aria-invalid');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(!/^\d{4}$/.test(input.value)){message('숫자 4자리를 입력해 주세요.');input.focus();return;}
    busy=true;button.disabled=true;button.textContent='확인 중…';error.textContent='';
    try {
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.value));
      const digest=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
      if(digest!==expected){message('비밀번호가 맞지 않습니다. 다시 입력해 주세요.');input.select();return;}
      const storage=remember.checked?'localStorage':'sessionStorage';
      try {window[storage].setItem(key,approved);if(!read(storage))throw new Error('Storage unavailable');}
      catch {error.textContent='브라우저에서 사이트 데이터 저장을 허용한 뒤 다시 시도해 주세요.';return;}
      input.value='';location.replace(next);
    }catch {error.textContent='비밀번호를 확인하지 못했습니다. 최신 브라우저에서 다시 시도해 주세요.';}
    finally{busy=false;button.disabled=false;button.textContent='열기';}
  });
  window.addEventListener('storage',event=>{if(event.key===key&&allowed())location.replace(next);});
  button.disabled=false;
})();
