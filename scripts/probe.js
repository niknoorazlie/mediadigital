const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
(async()=>{for(const u of process.argv.slice(2)){for(const [n,h] of [['noref',{'User-Agent':UA}],['ref-semasa',{'User-Agent':UA,Referer:'https://semasa.my/'}]]){
try{const r=await fetch(u,{headers:h,redirect:'manual'});console.log('RES',n,r.status,r.headers.get('content-type'),r.headers.get('content-length'),r.headers.get('location')||'',u.slice(8,50));}catch(e){console.log('RES',n,'ERR',e.message)}}}})();
