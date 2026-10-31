(() => {
  'use strict';
  const reduce=(items,op)=>op.kind==='delete'?items.filter(item=>item.id!==op.id):[...items.filter(item=>item.id!==op.id),op.item];
  class SharedMasks {
    constructor({url,document,storage,key,initialItems=[],onChange=()=>{},onStatus=()=>{},fetcher=(...args)=>fetch(...args)}) {
      Object.assign(this,{url,document,storage,key,onChange,onStatus,fetcher});
      this.base=[];this.pending=[];this.revision=-1;this.running=null;this.lastDisplay='';this.storageFailed=false;
      try {
        const saved=JSON.parse(storage.getItem(key)||'null');
        if(saved?.version===2 && Array.isArray(saved.base) && Array.isArray(saved.pending)) {
          this.base=saved.base;this.pending=saved.pending;this.revision=Number.isInteger(saved.revision)?saved.revision:-1;
        } else this.pending=initialItems.map(item=>this.operation('put',item.id,item));
      }catch{this.storageFailed=true;this.pending=initialItems.map(item=>this.operation('put',item.id,item));}
      this.save();
    }
    operation(kind,id,item) {return {operationId:crypto.randomUUID(),kind,id,...(kind==='put'?{item}:{}),document:this.document};}
    display() {
      const items=this.pending.reduce(reduce,this.base);
      const signature=JSON.stringify(items);
      if(signature!==this.lastDisplay){this.lastDisplay=signature;this.onChange(items);}
    }
    save() {
      try{this.storage.setItem(this.key,JSON.stringify({version:2,base:this.base,pending:this.pending,revision:this.revision}));this.storageFailed=false;}
      catch{this.storageFailed=true;}
    }
    status(state) {this.onStatus(this.storageFailed?'공유 중 · 이 브라우저에는 임시 저장할 수 없음':state);}
    submit(kind,id,item) {
      this.pending.push(this.operation(kind,id,item));this.save();this.display();this.status('공유 저장 중…');
      void this.refresh();
    }
    async request(url,options={}) {
      const response=await this.fetcher(url,{...options,cache:'no-store',signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'공유 연결을 다시 시도합니다.');
      if(!Number.isInteger(data.revision) || data.items!==null && !Array.isArray(data.items))throw new Error('공유 응답을 확인할 수 없습니다.');
      return data;
    }
    receive(data) {
      if(data.items!==null)this.base=data.items;
      this.revision=data.revision;this.save();this.display();
    }
    refresh() {
      if(this.running)return this.running;
      this.running=(async()=>{
        try {
          this.receive(await this.request(this.url+'?document='+encodeURIComponent(this.document)+'&since='+this.revision));
          while(this.pending.length) {
            const op=this.pending[0];
            const data=await this.request(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)});
            this.pending.shift();this.receive(data);
          }
          this.status('모두에게 공유됨');
          return true;
        } catch(error) {
          this.status(this.pending.length?'연결 대기 · 변경 내용 보관 중':'연결 대기 · 다시 연결하는 중');
          return false;
        } finally {this.running=null;}
      })();
      return this.running;
    }
  }
  if(typeof module==='object' && module.exports)module.exports={SharedMasks,reduce};
  else window.KeySharedMasks=SharedMasks;
})();
