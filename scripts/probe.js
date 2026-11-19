const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
(async()=>{for(const u of process.argv.slice(2)){const r=await fetch(u,{headers:{'User-Agent':UA}});const h=await r.text();
console.log('=====',u,r.status,h.length);
console.log('ldjson:',(h.match(/application\/ld\+json/g)||[]).length,'articleBody:',(h.match(/articleBody/g)||[]).length,'<article:',(h.match(/<article/g)||[]).length,'<p:',(h.match(/<p[\s>]/g)||[]).length,'NEXT_DATA:',h.includes('__NEXT_DATA__'),'NUXT:',h.includes('__NUXT__'));
const i=h.indexOf('articleBody');if(i>0)console.log('AB ctx:',h.slice(i-100,i+300).replace(/\s+/g,' '));
for(const k of ['"body"','field_body','"content":"','dangerouslySetInnerHTML']){const j=h.indexOf(k);if(j>0)console.log(k,'ctx:',h.slice(j-80,j+250).replace(/\s+/g,' '));}
const ps=(h.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)||[]).slice(0,8).map(p=>p.replace(/<[^>]+>/g,'').trim().slice(0,90));console.log('ps:',ps);
}})();
