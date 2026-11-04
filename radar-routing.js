'use strict';
(function(){
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const label=n=>String(n.cidade||n.destino||'').trim()+'/'+String(n.uf_destino||'').trim().toUpperCase();
 const drafts=new Map(), geoCache=new Map(), matrices=new Map(), routes=new Map();
 const internalWrite=()=>typeof radarCanWrite==='function'&&radarCanWrite();
 const carrier=()=>typeof radarProfile!=='undefined'&&radarProfile==='TRANSPORTADORA';
 const write=()=>internalWrite()||(carrier()&&typeof radarCarrierId!=='undefined'&&!!radarCarrierId&&active?.kind==='saved'&&!['CANCELADA','ENTREGA REALIZADA','ENTREGUE COM ATRASO','ENTREGA REALIZADA COM INSUCESSO','FINALIZADA'].includes(D.cargas.find(c=>c.id===active.cargoId)?.status));
 let active=null,map=null,layers=null,drawnResult=null,leafletPromise=null,serial=0;
 function fingerprint(ids,origin,uf){return norm(origin)+'|'+norm(uf)+'|'+[...ids].sort().join(',')}
 function pointsFor(ids){
  const rows=ids.map(id=>D.nfs.find(n=>n.id===id)).filter(Boolean),group=new Map();
  if(!rows.length)throw Error('A carga não possui pedidos.');
  if(new Set(ids).size!==ids.length||rows.length!==ids.length)throw Error('Os pedidos da carga mudaram. Reabra a formação antes de calcular a rota.');
  const origin=rows[0].origem,uf=rows[0].uf_origem;
  if(!origin||!uf)throw Error('Informe cidade e UF de origem no pedido.');
  if(rows.some(n=>norm(n.origem)!==norm(origin)||norm(n.uf_origem)!==norm(uf)))throw Error('Os pedidos têm origens diferentes. Separe as cargas por origem.');
  for(const n of rows){if(!n.cidade||!n.uf_destino)throw Error('Complete cidade e UF dos destinos antes de calcular a rota.');const k=norm(label(n));if(!group.has(k))group.set(k,{key:k,city:n.cidade,uf:n.uf_destino,label:label(n),ids:[],clients:[]});const p=group.get(k);p.ids.push(n.id);if(!p.clients.includes(n.cliente))p.clients.push(n.cliente)}
  if(group.size>25)throw Error('Revise a carga em grupos de até 25 localidades.');
  return {origin:{city:origin,uf,label:origin+'/'+uf},stops:[...group.values()]};
 }
 function bestOrder(matrix,first=-1){
  const n=matrix.length-1;
  if(n<1)return [];
  const cost=(a,b)=>Number.isFinite(matrix[a][b])?matrix[a][b]:Infinity;
  if(n<=12){
   const count=1<<n,dp=new Float64Array(count*n).fill(Infinity),parent=new Int16Array(count*n).fill(-1);
   for(let j=0;j<n;j++)if(first<0||j===first)dp[(1<<j)*n+j]=cost(0,j+1);
   for(let mask=1;mask<count;mask++)for(let last=0;last<n;last++){
    const at=mask*n+last,v=dp[at];if(!Number.isFinite(v))continue;
    for(let j=0;j<n;j++)if(!(mask&(1<<j))){const next=(mask|(1<<j))*n+j,c=v+cost(last+1,j+1);if(c<dp[next]){dp[next]=c;parent[next]=last}}
   }
   let mask=count-1,last=-1,v=Infinity;for(let j=0;j<n;j++)if(dp[mask*n+j]<v){last=j;v=dp[mask*n+j]}
   if(last<0)throw Error('Há destinos sem ligação rodoviária disponível.');
   const out=[];while(last>=0){out.push(last);const p=parent[mask*n+last];mask^=1<<last;last=p}return out.reverse();
  }
  const out=[],pending=new Set(Array.from({length:n},(_,i)=>i));let current=0;
  if(first>=0){out.push(first);pending.delete(first);current=first+1}
  while(pending.size){let next=-1,v=Infinity;for(const j of pending)if(cost(current,j+1)<v){v=cost(current,j+1);next=j}if(next<0)throw Error('Há destinos sem ligação rodoviária.');out.push(next);pending.delete(next);current=next+1}
  const total=o=>o.reduce((s,j,i)=>s+cost(i?o[i-1]+1:0,j+1),0);
  for(let pass=0;pass<5;pass++){let changed=false;for(let i=first>=0?1:0;i<n-1;i++)for(let j=i+1;j<n;j++){const candidate=[...out.slice(0,i),...out.slice(i,j+1).reverse(),...out.slice(j+1)];if(total(candidate)+.01<total(out)){out.splice(0,n,...candidate);changed=true}}if(!changed)break}
  return out;
 }
 async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Serviço de mapas indisponível ('+r.status+').');return r.json()}
 async function coordinate(p){
  const key=norm(p.city)+'|'+p.uf.toUpperCase();if(geoCache.has(key))return geoCache.get(key);
  try{const stored=JSON.parse(localStorage.getItem('yalog_route_geo_v1:'+key)||'null');if(stored&&Date.now()-stored.at<2592000000&&stored.coord?.length===2){geoCache.set(key,stored.coord);return stored.coord}}catch{}
  const known=typeof geoPoint==='function'?geoPoint({cidade:p.city,uf_destino:p.uf}):null;
  if(known&&known.every(Number.isFinite)){const c=[known[1],known[0]];geoCache.set(key,c);return c}
  const states={AC:'Acre',AL:'Alagoas',AM:'Amazonas',AP:'Amapá',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MG:'Minas Gerais',MS:'Mato Grosso do Sul',MT:'Mato Grosso',PA:'Pará',PB:'Paraíba',PE:'Pernambuco',PI:'Piauí',PR:'Paraná',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RO:'Rondônia',RR:'Roraima',RS:'Rio Grande do Sul',SC:'Santa Catarina',SE:'Sergipe',SP:'São Paulo',TO:'Tocantins'};
  const result=await json('https://photon.komoot.io/api/?q='+encodeURIComponent(p.city+', '+(states[p.uf]||p.uf)+', Brasil')+'&limit=5');
  const f=result.features?.find(f=>{const x=f.properties||{},city=x.city||x.name||'';return (['city','locality'].includes(x.type)||['city','town','village','municipality'].includes(x.osm_value))&&String(x.countrycode||'').toUpperCase()==='BR'&&norm(city)===norm(p.city)&&(norm(x.state)===norm(states[p.uf])||String(x['ISO3166-2']||'').endsWith('-'+p.uf))});
  if(!f||f.geometry?.coordinates?.length!==2||!f.geometry.coordinates.every(Number.isFinite)||Math.abs(f.geometry.coordinates[0])>180||Math.abs(f.geometry.coordinates[1])>90)throw Error('Não foi possível localizar com segurança '+p.label+'. Confira a cidade e a UF.');
  const c=f.geometry.coordinates;geoCache.set(key,c);try{localStorage.setItem('yalog_route_geo_v1:'+key,JSON.stringify({at:Date.now(),coord:c}))}catch{}return c;
 }
 function coordsKey(coords){return coords.map(c=>c.join(',')).join(';')}
 async function matrixFor(coords){
  const key=coordsKey(coords);if(matrices.has(key))return matrices.get(key);
  const r=await json('https://router.project-osrm.org/table/v1/driving/'+key+'?annotations=distance');
  if(r.code!=='Ok'||r.distances?.length!==coords.length||r.distances.some(row=>row.length!==coords.length))throw Error('Não foi possível calcular as distâncias entre os destinos.');
  const m=r.distances.map(row=>row.map(v=>v===null?Infinity:v));matrices.set(key,m);return m;
 }
 async function roadFor(coords){
  const key=coordsKey(coords);if(routes.has(key))return routes.get(key);
  const r=await json('https://router.project-osrm.org/route/v1/driving/'+key+'?overview=simplified&geometries=geojson&steps=false&alternatives=false');
  const route=r.routes?.[0];if(r.code!=='Ok'||!Number.isFinite(route?.distance)||route.legs?.length!==coords.length-1||!route.geometry?.coordinates?.length)throw Error('Não há trajeto rodoviário confirmado para esta sequência.');
  routes.set(key,route);return route;
 }
 function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function mapsUrl(s){const loc=p=>p.city+', '+p.uf+', Brasil',last=s.order[s.order.length-1];const q=new URLSearchParams({api:'1',origin:loc(s.origin),destination:loc(s.stops[last]),travelmode:'driving'});if(s.order.length>1)q.set('waypoints',s.order.slice(0,-1).map(i=>loc(s.stops[i])).join('|'));return 'https://www.google.com/maps/dir/?'+q}
 function schematic(s){
  const raw=s.result.geometry.coordinates.filter(c=>Array.isArray(c)&&c.length===2&&c.every(Number.isFinite));if(!raw.length)return '';
  const origin=s.coords[0],points=[origin,...s.order.map(i=>s.coords[i+1])],all=[...raw,...points],cos=Math.cos(origin[1]*Math.PI/180);
  const xs=all.map(c=>c[0]*cos),ys=all.map(c=>-c[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(800/Math.max(.001,maxX-minX),300/Math.max(.001,maxY-minY));
  const project=c=>[(c[0]*cos-(minX+maxX)/2)*scale+450,(-c[1]-(minY+maxY)/2)*scale+190];
  const poly=raw.map(c=>project(c).map(v=>v.toFixed(2)).join(',')).join(' ');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380" role="img" aria-label="Esquema do trajeto"><rect width="900" height="380" fill="#edf4f7"/><polyline points="'+poly+'" fill="none" stroke="#21788f" stroke-width="4"/>'+points.map((c,i)=>{const [x,y]=project(c);return '<circle cx="'+x+'" cy="'+y+'" r="13" fill="#ed7b2a" stroke="white" stroke-width="2"/><text x="'+x+'" y="'+(y+4)+'" text-anchor="middle" fill="white" font-size="12" font-family="Arial">'+(i||'O')+'</text>'}).join('')+'</svg><small>Esquema do trajeto calculado. A sequência detalhada está abaixo.</small>';
 }
 function printMap(s){
  if(map&&drawnResult===s.result&&typeof map.getContainer==='function'){
   const original=map.getContainer(),clone=original.cloneNode(true),w=original.clientWidth||700,h=original.clientHeight||440,scale=Math.min(1,700/w);
   clone.querySelectorAll('.leaflet-control-zoom,.leaflet-popup-pane,.leaflet-tooltip-pane').forEach(n=>n.remove());
   clone.removeAttribute('id');clone.classList.add('driver-map');
   clone.style.cssText='position:relative;overflow:hidden;width:'+w+'px;height:'+h+'px;transform:scale('+scale+');transform-origin:top left;background:#edf4f7';
   return '<div style="width:'+Math.min(w,700)+'px;max-width:100%;height:'+(h*scale)+'px;overflow:hidden">'+clone.outerHTML+'</div>';
  }
  return schematic(s);
 }
 function printDocument(s){
  const c=D.cargas.find(c=>c.id===s.cargoId),same=!!c&&validSaved(c)&&c.road_route.stop_keys.join('|')===s.order.map(i=>s.stops[i].key).join('|')&&Math.abs(c.road_route.distance_km-s.result.distance/1000)<.05;
  const company=typeof radarCompanyId==='undefined'?'':radarCompanyId,who=carrier()?D.transportadoras.find(t=>t.id===radarCarrierId)?.nome:c?.transportadora;
  const qty=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  let accumulated=0;
  const stops=s.order.map((i,pos)=>{const p=s.stops[i],leg=s.result.legs[pos].distance/1000;accumulated+=leg;
   const rows=p.ids.map(id=>D.nfs.find(n=>n.id===id)).filter(Boolean);
   return '<section class="driver-stop"><h3>'+(pos+1)+'. '+safe(p.label)+'</h3><p><b>'+qty(leg)+' km</b> desde '+safe(pos?s.stops[s.order[pos-1]].label:s.origin.label)+' · acumulado '+qty(accumulated)+' km</p><table><thead><tr><th>Cliente / pedido</th><th>Produto / quantidade</th><th>Peso</th><th>Volumes</th></tr></thead><tbody>'+rows.map(n=>'<tr><td><b>'+safe(n.cliente||'—')+'</b><br>Pedido '+safe(n.pedido||n.numero||'—')+'</td><td>'+safe(n.produto||'—')+' · '+safe(n.descricao_produto||'')+'<br>'+qty(n.qtd??n.quantidade)+' '+safe(n.um||n.unidade_medida||'')+'</td><td>'+qty(n.peso)+' kg</td><td>'+qty(n.volumes)+'</td></tr>').join('')+'</tbody></table></section>'});
  const links=[];for(let i=0;i<s.order.length;i+=3){const part={...s,origin:i?s.stops[s.order[i-1]]:s.origin,order:s.order.slice(i,i+3)};links.push('<a href="'+safe(mapsUrl(part))+'">Google Maps · entregas '+(i+1)+'–'+Math.min(i+3,s.order.length)+'</a>')}
  const title=(same?'Roteiro da carga':'Prévia de roteiro')+(c?' #'+safe(c.numero):' · formação de carga');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+title+'</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#173f50;font:12px/1.45 Arial,sans-serif}h1{font-size:23px;margin:4px 0}h2{font-size:16px;margin:14px 0 7px}h3{font-size:15px;margin:15px 0 4px;break-after:avoid}p{margin:5px 0 9px}.brand{color:#bd5b22;letter-spacing:.12em;font-size:11px;font-weight:bold}.draft{border:1px solid #d99859;background:#fff5e8;padding:9px;margin:12px 0}.facts{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px;background:#eff5f7;border:1px solid #cadce4}.map{margin:14px 0;break-inside:avoid}.map svg{display:block;width:100%;max-height:360px}.driver-stop table{width:100%;border-collapse:collapse;font-size:11px}th{background:#173f50;color:white;text-align:left}th,td{border:1px solid #c6d7df;padding:7px;vertical-align:top}tr{break-inside:avoid}thead{display:table-header-group}a{color:#195e7e}.links{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0}.note{font-size:10px;color:#536f7d;border-top:1px solid #c7d9e1;padding-top:9px}.tools{margin:12px 0;display:flex;gap:10px}.tools button{padding:9px 14px;border:1px solid #9fb9c5;background:#fff;color:#173f50;cursor:pointer}.road-pin span{display:grid;place-items:center;background:#ed7b2a;color:#fff;border:2px solid white;border-radius:50%;width:28px;height:28px;font:bold 13px Arial}.driver-map .leaflet-control-attribution{font-size:9px}@media print{.tools{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="brand">YALOG · RADAR LOGÍSTICO</div><h1>'+title+'</h1><p>Emitido em '+safe(new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+'</p>'+(!same?'<div class="draft"><b>PRÉVIA PARA CONFERÊNCIA</b> — confirme e salve esta sequência na carga antes de utilizá-la na operação.</div>':'')+'<div class="facts"><div><b>Empresa:</b> '+safe(company)+'</div><div><b>Transportadora:</b> '+safe(who||'A definir')+'</div><div><b>Origem:</b> '+safe(s.origin.label)+'</div><div><b>Total rodoviário estimado:</b> '+qty(s.result.distance/1000)+' km</div><div><b>Entregas:</b> '+s.order.length+' localidades</div><div><b>Motorista / veículo:</b> __________________</div></div><div class="map">'+printMap(s)+'</div><h2>Sequência de entregas</h2>'+stops.join('')+'<div class="links">'+links.join('')+'</div><p class="note">Referência por cidade/UF; pedidos na mesma cidade são agrupados. Sem retorno à origem, trânsito em tempo real ou restrições específicas de caminhões. Confirme endereços, acessos e condições do veículo antes da viagem.</p><div class="tools"><button onclick="window.print()">Imprimir / salvar PDF</button><button onclick="window.close()">Fechar</button></div><script>window.addEventListener("load",function(){var started=false;function ready(){if(started)return;started=true;setTimeout(function(){window.print()},150)}var images=Array.from(document.images);if(!images.length||images.every(function(i){return i.complete}))ready();else{images.forEach(function(i){i.addEventListener("load",function(){if(images.every(function(x){return x.complete}))ready()});i.addEventListener("error",ready)});setTimeout(ready,5000)}})</script></body></html>';
 }
 function printRoute(){
  const s=active;if(!s?.result||s.busy)return;
  const popup=window.open('','_blank');if(!popup)return status('O navegador bloqueou a janela de impressão. Permita abrir essa janela e tente novamente.',true);
  popup.opener=null;popup.document.open();popup.document.write(printDocument(s));popup.document.close();
 }
 function leaflet(){
  if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);const js=document.createElement('script');js.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';js.onload=()=>window.L?resolve(window.L):reject(Error('Mapa indisponível.'));js.onerror=()=>reject(Error('Não foi possível carregar o mapa.'));document.head.appendChild(js)}).catch(e=>{leafletPromise=null;throw e});return leafletPromise;
 }
 async function draw(s){
  const calculated=s.result;
  try{const L=await leaflet();if(active!==s||s.result!==calculated||!document.getElementById('roadMap'))return;
   if(!map){map=L.map('roadMap',{scrollWheelZoom:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map)}
   if(layers)map.removeLayer(layers);layers=L.layerGroup().addTo(map);const points=[s.origin,...s.order.map(i=>s.stops[i])];
   points.forEach((p,i)=>{const c=i?s.coords[s.order[i-1]+1]:s.coords[0];L.marker([c[1],c[0]],{icon:L.divIcon({className:'road-pin',html:'<span>'+ (i||'O')+'</span>',iconSize:[28,28]})}).bindPopup(safe((i?'Entrega '+i+': ':'Origem: ')+p.label)).addTo(layers)});
   const geo=L.geoJSON(s.result.geometry,{style:{color:'#21788f',weight:5,opacity:.9}}).addTo(layers);map.fitBounds(geo.getBounds(),{padding:[24,24]});drawnResult=calculated;setTimeout(()=>map?.invalidateSize(),100);
  }catch(e){if(active===s)document.getElementById('roadMap').textContent='Mapa indisponível. A sequência pode ser aberta no Google Maps.'}
 }
 function status(text,error=false){const el=document.getElementById('roadStatus');if(el){el.textContent=text;el.classList.toggle('error',error)}}
 function render(s){
  const list=document.getElementById('roadStops');if(!list)return;list.replaceChildren();
  s.order.forEach((i,pos)=>{const p=s.stops[i],row=document.createElement('li'),text=document.createElement('div');text.innerHTML='<strong>'+safe(p.label)+'</strong><small>'+safe(p.clients.filter(Boolean).join(' / '))+'</small>';const badge=document.createElement('span');badge.className='road-stop-number';badge.textContent=String(pos+1);row.append(badge,text);
   if(s.result){const km=document.createElement('small');km.className='road-leg';km.textContent=(s.result.legs[pos].distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km';row.appendChild(km)}
   if(write()){for(const delta of [-1,1]){const b=document.createElement('button');b.type='button';b.textContent=delta<0?'↑':'↓';b.setAttribute('aria-label','Mover entrega '+(pos+1)+(delta<0?' para cima':' para baixo'));b.disabled=s.busy||pos+delta<0||pos+delta>=s.order.length;b.onclick=()=>move(pos,delta);row.appendChild(b)}}list.appendChild(row)});
  const km=document.getElementById('roadKm');km.textContent=s.result?(s.result.distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km':'—';
  document.getElementById('roadApply').disabled=!s.result||s.busy||!write();
  const print=document.getElementById('roadPrint');if(print)print.disabled=!s.result||s.busy;
  document.getElementById('roadOptimize').disabled=s.busy;document.getElementById('roadFirst').disabled=s.busy;
  const link=document.getElementById('roadGoogle');link.href=mapsUrl(s);link.hidden=!s.result||s.order.length>4;
  const all=document.getElementById('roadGoogleAll');all.replaceChildren();
  if(s.result&&s.order.length>3){for(let i=0;i<s.order.length;i+=3){const part={...s,origin:i?s.stops[s.order[i-1]]:s.origin,order:s.order.slice(i,i+3)};const a=document.createElement('a');a.className='btn outline';a.target='_blank';a.rel='noopener';a.href=mapsUrl(part);a.textContent='Google Maps · entregas '+(i+1)+'–'+Math.min(i+3,s.order.length);all.appendChild(a)}}
 }
 async function calculate(optimize=true){
  const s=active;if(!s||s.busy)return;s.busy=true;s.result=null;drawnResult=null;if(map&&layers){map.removeLayer(layers);layers=null}render(s);status('Calculando o trajeto rodoviário…');const run=++serial;
  try{
   if(!s.coords){const coordinates=[];for(const p of [s.origin,...s.stops]){if(active!==s||run!==serial)return;status('Localizando '+p.label+'…');coordinates.push(await coordinate(p))}s.coords=coordinates}
   if(optimize){const m=await matrixFor(s.coords),first=Number(document.getElementById('roadFirst').value);s.order=bestOrder(m,first);s.optimized=true;s.first=first;s.method=s.stops.length<=12?'Menor percurso calculado para estas localidades':'Sequência sugerida por aproximação'}
   const result=await roadFor([s.coords[0],...s.order.map(i=>s.coords[i+1])]);if(active!==s||run!==serial)return;
   s.result=result;status((optimize?s.method:'Ordem manual calculada')+' · sem retorno à origem.');draw(s);
  }catch(e){if(active===s){s.result=null;status(e.message||'Não foi possível calcular a rota.',true)}}
  finally{if(active===s){s.busy=false;render(s)}}
 }
 function move(pos,delta){const s=active;if(!s||s.busy||!write())return;[s.order[pos],s.order[pos+delta]]=[s.order[pos+delta],s.order[pos]];s.optimized=false;s.first=s.order[0];document.getElementById('roadFirst').value=String(s.first);calculate(false)}
 function metadata(s){return {version:1,origin:s.origin.label,order:s.order.map(i=>s.stops[i].label),source_ids:[...s.ids].sort(),source_key:fingerprint(s.ids,s.origin.city,s.origin.uf),stop_keys:s.order.map(i=>s.stops[i].key),distance_km:s.result.distance/1000,legs_km:s.result.legs.map(l=>l.distance/1000),geometry:s.result.geometry,coordinates:[s.coords[0],...s.order.map(i=>s.coords[i+1])],first_delivery:s.first<0?null:s.stops[s.first].label,optimized:s.optimized,method:s.method||'Ordem manual',provider:'OSRM / OpenStreetMap',basis:'Cidade/UF',calculated_at:new Date().toISOString()}}
 async function apply(){
  const s=active;if(!s?.result||s.busy||!write())return;const ids=s.order.flatMap(i=>s.stops[i].ids),plan=metadata(s);
  let current;
  try{current=pointsFor(s.ids)}catch(e){return status(e.message,true)}
  if(norm(current.origin.label)!==s.sourceOrigin||current.stops.map(p=>p.key).sort().join('|')!==s.stops.map(p=>p.key).sort().join('|'))return status('Os pedidos foram alterados. Reabra a rota para calcular novamente.',true);
  if(s.kind==='saved'){const c=D.cargas.find(c=>c.id===s.cargoId);if(!c||[...(c.nf_ids||[])].sort().join(',')!==[...s.ids].sort().join(',')||norm(c.origem||current.origin.city)!==norm(s.origin.city)||norm(c.uf_origem||current.origin.uf)!==norm(s.origin.uf))return status('A carga foi alterada. Reabra a rota para calcular novamente.',true)}
  if(carrier()){
   s.busy=true;render(s);status('Salvando a sequência da sua carga…');
   try{
    const r=await radarRpc('radar_salvar_rota',{p_module_session_token:radarModuleSessionToken,p_carga_id:s.cargoId,p_expected_version:s.dataVersion,p_rota:plan});
    if(!r?.ok)throw Error(r?.message||'A base mudou. Feche e reabra a rota antes de salvar.');
    const i=D.cargas.findIndex(c=>c.id===s.cargoId);if(i>=0)D.cargas[i]=r.carga;
    radarDataVersion=Number(r.version);close();renderAll();toast('Sequência salva. A embarcadora poderá consultar a alteração.');
   }catch(e){status(e.message||'Não foi possível confirmar a alteração.',true)}
   finally{if(active===s){s.busy=false;render(s)}}
   return;
  }
  drafts.set(fingerprint(ids,s.origin.city,s.origin.uf),{ids,plan});
  if(s.kind==='auto'){const p=window.autoPlans?.[s.index];if(!p||[...p.ids].sort().join(',')!==[...ids].sort().join(','))return status('A proposta mudou. Reabra a rota.',true);p.ids=ids;p.routeItems=ids.map(id=>D.nfs.find(n=>n.id===id));p.destinos=plan.order;p.road_route=plan;window.radarRefreshAutoPlanRow?.(s.index)}
  if(s.kind==='selection'){selected=new Set(ids);if(window.__previewLoad)window.__previewLoad.ids=ids}
  if(s.kind==='editor'){const input=document.getElementById('ld');if(input)input.value=s.order.map(i=>s.stops[i].city).join(' / ')}
  if(s.kind==='saved'){const c=D.cargas.find(c=>c.id===s.cargoId);if(!c)return;attach(c,ids);audit('ROTA_RODOVIARIA','#'+c.numero,plan.order.join(' → ')+' · '+plan.distance_km.toFixed(1)+' km');save();renderAll()}
  close();toast(s.kind==='saved'?'Rota e sequência salvas na carga.':'Sequência aplicada. Salve ou confirme a carga para gravar a rota.');
 }
 function close(){++serial;if(map){map.remove();map=null;layers=null}drawnResult=null;active=null;document.getElementById('radarRoadDialog')?.close()}
 function open(ids,context={}){
  try{
   const p=pointsFor(ids);let dialog=document.getElementById('radarRoadDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='radarRoadDialog';document.body.appendChild(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation()})}
   if(map){map.remove();map=null;layers=null}drawnResult=null;
   const sourceOrigin=norm(p.origin.label);
   if(context.origin){p.origin={city:context.origin,uf:context.originUf||p.origin.uf,label:context.origin+'/'+(context.originUf||p.origin.uf)}}
   const previous=context.plan||drafts.get(fingerprint(ids,p.origin.city,p.origin.uf))?.plan;
   const valid=previous?.source_key===fingerprint(ids,p.origin.city,p.origin.uf)&&previous.stop_keys?.length===p.stops.length&&previous.stop_keys.every(k=>p.stops.some(s=>s.key===k));
   const s={...p,sourceOrigin,ids:[...ids],kind:context.kind||'selection',index:context.index,cargoId:context.cargoId,dataVersion:typeof radarDataVersion!=='undefined'?radarDataVersion:0,order:valid?previous.stop_keys.map(k=>p.stops.findIndex(s=>s.key===k)):p.stops.map((_,i)=>i),first:valid&&previous.first_delivery?p.stops.findIndex(s=>norm(s.label)===norm(previous.first_delivery)):-1,coords:null,result:null,busy:false,optimized:valid?previous.optimized:false,method:valid?previous.method:''};active=s;
   dialog.innerHTML='<div class="road-heading"><div><small>FORMAÇÃO / ROTEIRIZAÇÃO</small><h2>Trajeto e sequência de entregas</h2></div><button type="button" id="roadClose">Fechar</button></div><div class="road-grid"><div class="road-side"><div class="road-origin"><small>ORIGEM</small><strong>'+safe(p.origin.label)+'</strong></div><label class="road-first">Primeira entrega<select id="roadFirst"><option value="-1">Automática — menor percurso</option>'+p.stops.map((p,i)=>'<option value="'+i+'">'+safe(p.label)+'</option>').join('')+'</select></label><button class="btn primary" type="button" id="roadOptimize">Calcular melhor sequência</button><div class="road-distance"><strong id="roadKm">—</strong><span>total rodoviário estimado</span></div><p id="roadStatus" role="status"></p><ol id="roadStops"></ol></div><div class="road-main"><div id="roadMap">Calculando trajeto…</div><p class="road-note">Referência: cidade/UF; pedidos na mesma cidade são agrupados. Sem retorno à origem. Distâncias OSRM/OpenStreetMap; o Google Maps pode sugerir outro trajeto. Sem trânsito em tempo real ou restrições específicas de caminhões. Confirme acessos e endereços antes da viagem.</p><div class="actions"><button type="button" class="btn primary" id="roadApply">Aplicar sequência</button><a id="roadGoogle" class="btn outline" target="_blank" rel="noopener" hidden>Abrir no Google Maps</a></div><div class="actions" id="roadGoogleAll"></div><small class="road-note">Para várias entregas, os links por trechos preservam a ordem nos limites do Google Maps para celular.</small></div></div>';
   document.getElementById('roadClose').onclick=close;document.getElementById('roadOptimize').onclick=()=>calculate(true);document.getElementById('roadFirst').onchange=()=>calculate(true);document.getElementById('roadApply').onclick=apply;
   const print=document.createElement('button');print.type='button';print.id='roadPrint';print.className='btn outline';print.textContent='Imprimir roteiro do motorista';print.disabled=true;print.onclick=printRoute;document.getElementById('roadApply').parentElement.appendChild(print);
   document.getElementById('roadApply').hidden=!write();document.getElementById('roadFirst').value=String(s.first);dialog.showModal();
   if(valid&&previous.geometry?.coordinates?.length&&previous.coordinates?.length===p.stops.length+1&&previous.legs_km?.length===p.stops.length){
    s.coords=[previous.coordinates[0],...s.stops.map(p=>previous.coordinates[previous.stop_keys.indexOf(p.key)+1])];
    s.result={distance:previous.distance_km*1000,legs:previous.legs_km.map(km=>({distance:km*1000})),geometry:previous.geometry};
    status('Trajeto calculado em '+new Date(previous.calculated_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'. Use Calcular melhor sequência para atualizar.');render(s);draw(s);
   }else calculate(!valid);
  }catch(e){toast(e.message)}
 }
 function validSaved(c,ids=c?.nf_ids||[]){
  if(!c?.road_route)return false;
  try{const p=pointsFor(ids),r=c.road_route;return r.source_key===fingerprint(ids,c.origem||p.origin.city,c.uf_origem||p.origin.uf)&&p.stops.length===r.stop_keys.length&&p.stops.every(s=>r.stop_keys.includes(s.key))&&Number.isFinite(r.distance_km)}catch{return false}
 }
 function attach(c,ids){
  if(!c||!internalWrite())return;const first=D.nfs.find(n=>n.id===ids[0]);if(!first)return;
  const key=fingerprint(ids,c.origem||first.origem,c.uf_origem||first.uf_origem);
  if(c.road_route&&!validSaved(c,ids))delete c.road_route;
  const d=drafts.get(key);if(!d)return;
  let current;try{current=pointsFor(ids)}catch{return}if(current.stops.map(s=>s.key).sort().join('|')!==[...d.plan.stop_keys].sort().join('|'))return;
  c.nf_ids=[...d.ids];c.route_stops=[...d.plan.order];c.destino=d.ids.map(id=>D.nfs.find(n=>n.id===id)?.cidade).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');c.road_route=d.plan;
 }
 window.radarApplyRoutingMetadata=attach;
 window.radarRoadDistance=c=>validSaved(c)?c.road_route.distance_km:null;
 window.radarOpenCargoRoute=id=>{const c=D.cargas.find(c=>c.id===id);if(!c)return toast('Carga não disponível para este acesso.');open(c.nf_ids||[],{kind:'saved',cargoId:c.id,origin:c.origem,originUf:c.uf_origem,plan:c.road_route})};
 window.RadarRoadEngine={bestOrder,fingerprint,pointsFor,printDocument};
 window.radarRenderCarrierCotacao=function(){
  const query=(document.getElementById('cotq')?.value||'').trim().toLowerCase(),rows=D.cargas.filter(c=>!c.faturamento_concluido&&!['CANCELADA','ENTREGA REALIZADA','ENTREGUE COM ATRASO','ENTREGA REALIZADA COM INSUCESSO'].includes(c.status)).filter(c=>!query||[c.numero,c.destino,c.cliente].join(' ').toLowerCase().includes(query));
  const notice=document.getElementById('cotNotice');if(notice)notice.textContent='Cargas disponibilizadas à sua transportadora. Os ajustes de sequência ficam registrados e visíveis para a embarcadora.';
  document.getElementById('cotKpis').innerHTML=[['Cargas disponíveis',rows.length],['Suas cotações',D.cotacoes.length],['Rotas calculadas',rows.filter(c=>validSaved(c)).length]].map(([name,value])=>'<div class="kpi"><div class="kv">'+value+'</div><div class="kl">'+safe(name)+'</div></div>').join('');
  const body=document.getElementById('cotb');body.replaceChildren();
  for(const c of rows){const q=D.cotacoes.find(q=>q.carga_id===c.id),tr=document.createElement('tr');const values=['#'+c.numero,(c.destino||'')+'/'+(c.uf_destino||''),'',num(c.peso)+' kg',money(c.valor),slaLabel(c),'Seu acesso à carga',q?.status||'Disponível',q?.valor_frete?money(q.valor_frete)+' · '+q.prazo_entrega_dias+' dia(s)':'—',c.status,'','','Consulta e revisão de rota'];
   const cells=values.map(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);return td});
   const button=(i,text,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn outline';b.textContent=text;b.onclick=fn;cells[i].appendChild(b)};
   button(2,'Pré-visualizar rota',()=>window.radarOpenCargoRoute(c.id));button(10,'NFs / documentos',()=>notesDocumentsModal(c.id));button(11,'Ver',()=>cargoObservationModal(c.id));body.appendChild(tr)
  }
  if(!rows.length)body.innerHTML='<tr><td colspan="13"><div class="empty">Nenhuma carga em cotação disponibilizada à sua transportadora.</div></td></tr>';
 };
 window.installRadarRouting=function(){
  if(window.radarRoadInstalled)return;window.radarRoadInstalled=true;
  const oldDistance=window.routeDistanceKm;if(typeof oldDistance==='function')window.routeDistanceKm=c=>window.radarRoadDistance(c)??oldDistance(c);
  window.previewRouteModal=()=>{const ids=window.__previewLoad?.ids||[...selected];open(ids,{kind:'selection'})};
  window.showRoutePlan=index=>{const p=window.autoPlans?.[index];if(p)open(p.ids,{kind:'auto',index,plan:p.road_route})};
  const loadBase=window.loadModal;
  window.loadModal=function(c=null,ids=[]){const result=loadBase(c,ids);if(result===false||!write())return result;const actualIds=c?.nf_ids||ids;if(!actualIds.length)return result;addButton(()=>open(actualIds,{kind:'editor',origin:document.getElementById('lo')?.value||c?.origem,originUf:c?.uf_origem,plan:c?.road_route}),'Mapa, sequência e km');return result};
  for(const name of ['openLoad','quoteRequestDetails']){const base=window[name];if(typeof base!=='function')continue;window[name]=function(id,...args){const result=base(id,...args);const c=D.cargas.find(c=>c.id===id)||D.cargas.find(c=>D.cotacoes.some(q=>q.id===id&&q.carga_id===c.id));if(c)addButton(()=>open(c.nf_ids||[],{kind:'saved',cargoId:c.id,origin:c.origem,originUf:c.uf_origem,plan:c.road_route}),'Mapa e sequência de entregas');return result}}
 };
 function addButton(action,text){const box=document.getElementById('box');if(!box||box.querySelector('[data-road-button]'))return;const b=document.createElement('button');b.type='button';b.className='btn blue';b.dataset.roadButton='true';b.textContent=text;b.onclick=action;(box.querySelector('.actions')||box).appendChild(b)}
})();
