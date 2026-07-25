const C='x3f-v8';
const A=['index.html','X3F_Arena.html','X3F_Flow.html','X3F_Bloom.html','X3F_Splash.html','X3F_Nova.html','X3F_Ascent.html','X3F_Routine.html','X3F_Progress.html','X3F_Duel.html','X3F_Rhythm.html','X3F_Library.html','X3F_Calibrate.html','x3f-exercises.js','x3f-form.js','x3f-nav.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match('index.html'))))});
