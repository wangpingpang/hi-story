/** Shared presentation IO. A cancelled consumer never cancels another waiter. */
export interface AssetRequest<T> {
 controller:AbortController;
 promise:Promise<T>;
 users:number;
 settled:boolean;
}
export function sharedAssetRequest<T>(pending:Map<string,AssetRequest<T>>,key:string,signal:AbortSignal|undefined,load:(signal:AbortSignal)=>Promise<T>,timeoutMs=15000):Promise<T>{
 if(signal?.aborted)return Promise.reject(signal.reason);
 let request=pending.get(key);
 if(!request){
  const controller=new AbortController();
  const entry:AssetRequest<T>={controller,promise:undefined as unknown as Promise<T>,users:0,settled:false};
  pending.set(key,entry);
  const clear=()=>{if(pending.get(key)===entry)pending.delete(key);};
  controller.signal.addEventListener('abort',clear,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('素材读取超时，请重试')),timeoutMs);
  entry.promise=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return load(controller.signal);}).finally(()=>{
   entry.settled=true;clearTimeout(timer);controller.signal.removeEventListener('abort',clear);clear();
  });
  request=entry;
 }
 const entry=request;
 entry.users++;
 return new Promise<T>((resolve,reject)=>{
  let done=false;
  const finish=(ok:boolean,value:unknown)=>{
   if(done)return;done=true;
   signal?.removeEventListener('abort',cancel);entry.controller.signal.removeEventListener('abort',cancelShared);
   entry.users--;
   if(!entry.users&&!entry.settled)entry.controller.abort();
   if(ok)resolve(value as T);else reject(value);
  };
  const cancel=()=>finish(false,signal!.reason);
  const cancelShared=()=>finish(false,entry.controller.signal.reason);
  signal?.addEventListener('abort',cancel,{once:true});entry.controller.signal.addEventListener('abort',cancelShared,{once:true});
  entry.promise.then(value=>finish(true,value),error=>finish(false,error));
 });
}

/** Reservations are released exactly once, including requests cancelled in the queue. */
export class AssetLoadQueue {
 private active=0;
 private queue:{start:()=>void;cancel:()=>void}[]=[];
 constructor(private readonly limit:number){}
 acquire(signal:AbortSignal):Promise<()=>void>{
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
   const entry={start:()=>{
    signal.removeEventListener('abort',entry.cancel);this.active++;
    let released=false;
    resolve(()=>{if(released)return;released=true;this.active--;this.drain();});
   },cancel:()=>{
    const index=this.queue.indexOf(entry);if(index>=0)this.queue.splice(index,1);
    reject(signal.reason);
   }};
   if(this.active<this.limit)entry.start();else{this.queue.push(entry);signal.addEventListener('abort',entry.cancel,{once:true});}
  });
 }
 private drain(){while(this.active<this.limit&&this.queue.length)this.queue.shift()!.start();}
}

export function decodeAssetImage(url:string,signal:AbortSignal):Promise<HTMLImageElement>{
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const image=new Image();image.decoding='async';let done=false;
  const cleanup=()=>{image.onload=image.onerror=null;signal.removeEventListener('abort',cancel);};
  const fail=(error:unknown)=>{if(done)return;done=true;cleanup();image.src='';reject(error);};
  const cancel=()=>fail(signal.reason);
  signal.addEventListener('abort',cancel,{once:true});
  image.onerror=()=>fail(new Error('素材图像加载失败，请重试'));
  image.onload=()=>{
   const decoded=typeof image.decode==='function'?image.decode():Promise.resolve();
   void decoded.then(()=>{if(done)return;done=true;cleanup();resolve(image);},fail);
  };
  image.src=url;
 });
}
