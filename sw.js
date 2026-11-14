const scope = new URL(self.registration.scope);
const prefix = `mo-mang-shell:${scope.pathname}:`;
const cacheName = prefix + '3.1.0';
const index = new URL('index.html',scope).href;
const assets = new Set([
  'index.html','styles.css','src/app.js','src/ai.js','src/storage.js','src/scheduler.js',
  'src/topics.js','src/curriculum.js','src/database.js','src/exercises.js','content/curriculum-c-28-days.json',
  'src/deep-study.js','src/deep-view.js',
  'manifest.webmanifest','assets/icon-192.png','assets/icon-512.png','assets/noto-sans-latin.woff2','assets/noto-sans-vi.woff2',
].map(path=>new URL(path,scope).href));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(cacheName);
    await cache.addAll([...assets].map(url=>new Request(url,{cache:'reload'})));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==cacheName).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==scope.origin)return;
  const navigation=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL(index).pathname);
  if(!navigation&&!assets.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    return await cache.match(navigation?index:url.href)||fetch(request);
  })());
});
