'use strict';
(function(){
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const completed=s=>['ENTREGA REALIZADA','ENTREGUE COM ATRASO'].includes(s);
 const key=d=>d.chave?'chave:'+d.chave:'nf:'+(d.emitente||'')+'|'+(d.serie||'')+'|'+(d.numero||'');
 const allowed=c=>!!c&&c.faturamento_concluido===true&&c.status!=='CANCELADA'&&(D.config?.perfilDemo!=='TRANSPORTADORA'||c.transportadora_id===D.config.demoTransportadoraId);
 const write=c=>allowed(c)&&(typeof radarCanWrite==='function'&&radarCanWrite()||(typeof radarProfile!=='undefined'&&radarProfile==='TRANSPORTADORA'));
 const date=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
 let saving=false,editingVersion=0,editingId='';
 function docs(c){const seen=new Set();return billingFiscalDocs(c).filter(d=>String(d.numero||'').trim()).filter(d=>{const k=key(d);if(seen.has(k))return false;seen.add(k);return true})}
 function stops(c){return [...new Set((c.nf_ids||[]).map(id=>D.nfs.find(n=>n.id===id)).filter(Boolean).map(n=>n.cidade+'/'+n.uf_destino))]}
 function status(c,d){const e=c.entregas_nf?.[key(d)];return e?e.status:'Sem baixa individual · carga: '+c.status}
 function inferredStop(c,d){
  const saved=c.entregas_nf?.[key(d)]?.parada;if(saved)return saved;
  const list=stops(c);if(list.length===1)return list[0];
  try{if(d.xml_conteudo){const xml=new DOMParser().parseFromString(d.xml_conteudo,'application/xml'),dest=xml.getElementsByTagNameNS('*','enderDest')[0],city=dest?.getElementsByTagNameNS('*','xMun')[0]?.textContent,uf=dest?.getElementsByTagNameNS('*','UF')[0]?.textContent;return list.find(x=>norm(x)===norm(city+'/'+uf))||''}}catch{}
  return '';
 }
 window.radarInvoiceDeliveryKey=key;
 window.radarInvoiceDeliveryDocs=docs;
 window.radarInvoiceDeliveryStatus=status;
 window.radarDeliveryStopInfo=function(c,label){
  const matches=docs(c).filter(d=>norm(inferredStop(c,d))===norm(label)),done=matches.filter(d=>completed(c.entregas_nf?.[key(d)]?.status)).length;
  return {total:matches.length,done,tone:matches.length&&done===matches.length?'success':done?'warning':'info',text:matches.length?done+'/'+matches.length+' NF(s) entregue(s)': 'Sem NF associada ao ponto',details:matches.map(d=>'NF '+d.numero+' · '+status(c,d)).join('\n')};
 };
 window.radarDeliveryRouteSummary=function(c){if(!c)return '';const all=docs(c),done=all.filter(d=>completed(c.entregas_nf?.[key(d)]?.status)).length,pos=c.posicao_veiculo;return '<div class="delivery-route-summary"><strong>'+done+'/'+all.length+' NF(s) com entrega confirmada</strong><p>Os pontos são referências por cidade/UF; confirme os endereços das entregas.</p>'+(pos?'<p>🚚 '+safe(pos.local)+' · posição informada em '+safe(date(pos.informado_at))+' · por '+safe(pos.informado_por)+'. Sem rastreamento ao vivo.</p>':'<p>Veículo sem posição informada.</p>')+'</div>'};
 window.radarRenderDeliveries=function(){
  const host=document.getElementById('exb');if(!host)return;
  const q=(document.getElementById('exq')?.value||'').toLowerCase(),filter=document.getElementById('exs')?.value||'',byNF=document.getElementById('exview')?.value==='NF';
  const loads=D.cargas.filter(allowed).sort((a,b)=>{const x=String(a.faturamento_em||a.data_coleta||'').localeCompare(String(b.faturamento_em||b.data_coleta||''))||Number(a.numero)-Number(b.numero);return document.getElementById('exfifo')?.value==='RECENTE'?-x:x});
  const rows=[];
  for(const c of loads){const all=docs(c),done=all.filter(d=>completed(c.entregas_nf?.[key(d)]?.status)).length;
   for(const d of byNF?(all.length?all:[null]):[null]){
    const ev=d?c.entregas_nf?.[key(d)]:null,st=d?status(c,d):c.status;
    if(filter&&(d?(ev?.status||'SEM BAIXA INDIVIDUAL'):c.status)!==filter)continue;
    if(q&&![c.numero,c.transportadora,c.destino,c.cliente,d?.numero,...(!byNF?all.map(d=>d.numero):[])].join(' ').toLowerCase().includes(q))continue;
    const tr=document.createElement('tr');tr.innerHTML='<td>#'+safe(c.numero)+(d?'<br><strong>NF '+safe(d.numero)+'</strong><small> Série '+safe(d.serie||'—')+'</small>':byNF?'<br>Sem NF vinculada':'<br><small>'+done+'/'+all.length+' NF(s) entregue(s)</small>')+'</td><td>'+safe(c.transportadora||'—')+'</td><td>'+safe(d?inferredStop(c,d)||'Destino da NF a confirmar':c.destino+'/'+c.uf_destino)+'</td><td>'+safe(slaLabel(c))+'</td><td>'+safe(fmtDate(c.eta_max))+'</td><td>'+executionStatusFarol(st)+'</td><td>'+safe(ev?.observacao||(!d?c.status_obs:'')||'—')+'</td><td>'+safe(ev?date(ev.efetiva_at):'—')+'</td><td class="execution-actions-cell"><div class="execution-actions"></div></td>';
    const actions=tr.querySelector('.execution-actions');const button=(label,fn,cls='outline')=>{const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=label;b.onclick=fn;actions.appendChild(b)};
    button('Ver / imprimir rota',()=>radarOpenCargoRoute(c.id),'blue');button('NFs / XML / PDF',()=>notesDocumentsModal(c.id));
    if(write(c)&&all.length)button('Atualizar NF',()=>window.radarDeliveryModal(c.id,d?key(d):null),'primary');
    rows.push(tr);
   }
  }
  host.replaceChildren(...rows);if(!rows.length)host.innerHTML='<tr><td colspan="9"><div class="empty">Nenhuma entrega na seleção.</div></td></tr>';
 };
 window.radarDeliveryModal=function(id,selected){
  const c=D.cargas.find(c=>c.id===id);if(!write(c))return toast('Acesso de atualização não permitido.');
  const all=docs(c);if(!all.length)return toast('Vincule as notas fiscais no faturamento antes de registrar entregas.');
  editingVersion=radarDataVersion;editingId=id;
  openModal('<button class="x" onclick="closeModal()">×</button><h2>Entrega por NF · Carga #'+safe(c.numero)+'</h2><p>Registre cada nota individualmente. A conclusão da carga será calculada pelas entregas confirmadas.</p><div class="fg"><label for="deliveryInvoice">Nota fiscal</label><select id="deliveryInvoice">'+all.map((d,i)=>'<option value="'+i+'" '+(key(d)===selected?'selected':'')+'>NF '+safe(d.numero)+' · série '+safe(d.serie||'—')+' · '+safe(d.destinatario||'Destinatário não informado')+'</option>').join('')+'</select></div><div id="deliveryFields"></div><div class="actions"><button id="deliverySave" type="button" class="btn primary">Salvar atualização da NF</button><button type="button" class="btn outline" onclick="closeModal()">Fechar</button></div><p id="deliveryMessage" role="status"></p>');
  document.getElementById('deliveryInvoice').onchange=()=>{fields(c,all)};document.getElementById('deliverySave').onclick=()=>commit(c,all);fields(c,all);
 };
 function fields(c,all){const d=all[Number(document.getElementById('deliveryInvoice').value)],ev=c.entregas_nf?.[key(d)],stop=inferredStop(c,d),local=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('deliveryFields').innerHTML='<p class="notice">'+safe(ev?'Última atualização: '+date(ev.registrado_at)+' · '+ev.registrado_por:'Sem baixa individual. Histórico da carga: '+c.status)+'</p><div class="grid2"><div class="fg"><label>Status da NF</label><select id="deliveryStatus">'+EXECUTION_STATUSES.map(s=>'<option '+(s===(ev?.status||'CARGA EM ROTA')?'selected':'')+'>'+safe(s)+'</option>').join('')+'</select></div><div class="fg"><label>Data/hora efetiva do evento</label><input type="datetime-local" id="deliveryTime" value="'+local+'"></div><div class="fg"><label>Ponto de entrega da NF</label><select id="deliveryStop"><option value="">Selecione o destino</option>'+stops(c).map(s=>'<option '+(s===stop?'selected':'')+'>'+safe(s)+'</option>').join('')+'</select></div><div class="fg"><label>Ocorrência / observação</label><textarea id="deliveryObs" maxlength="3000"></textarea></div></div><fieldset class="delivery-position"><legend>Última posição do veículo (opcional)</legend><p>Informe cidade e UF. O caminhão será posicionado na referência aproximada do município, sem rastreamento ao vivo.</p><div class="fg"><label for="vehicleLocal">Cidade / UF do veículo</label><input id="vehicleLocal" maxlength="120" list="vehicleCities" placeholder="Ex.: Ribeirão Preto/SP"><datalist id="vehicleCities">'+stops(c).map(s=>'<option value="'+safe(s)+'"></option>').join('')+'</datalist></div><button type="button" class="btn blue" id="vehicleUseStop">Usar destino desta NF</button><span id="vehicleMessage" role="status"></span></fieldset><details><summary>Histórico desta NF</summary>'+((c.entregas_nf_historico||[]).filter(e=>e.nf_key===key(d)).slice().reverse().map(e=>'<p>'+safe(date(e.efetiva_at))+' · '+safe(e.status)+' · '+safe(e.observacao)+' · por '+safe(e.registrado_por)+'</p>').join('')||'<p>Nenhum registro individual.</p>')+'</details>';
  const input=document.getElementById('vehicleLocal'),msg=document.getElementById('vehicleMessage');let request=0;
  input.onchange=async()=>{const current=++request,value=input.value.trim();msg.textContent='';if(!value)return;msg.textContent='Localizando município…';try{const position=await cityPosition(value);if(current===request&&input.isConnected&&input.value.trim()===value)msg.textContent='🚚 '+position.local+' · referência aproximada localizada. Salve a atualização para publicar no mapa.'}catch(e){if(current===request&&input.isConnected)msg.textContent=e.message}};
  document.getElementById('vehicleUseStop').onclick=()=>{input.value=document.getElementById('deliveryStop').value;return input.onchange()};
 }
 async function cityPosition(value){
  const match=String(value||'').trim().match(/^(.+?)\s*[/,–-]\s*([a-zA-Z]{2})$/);
  if(!match)throw Error('Informe a cidade e a UF, por exemplo: Ribeirão Preto/SP.');
  const city=match[1].trim(),uf=match[2].toUpperCase();
  if(!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(uf))throw Error('UF inválida. Use a sigla do estado, como SP ou MG.');
  if(!window.RadarRoadEngine?.locateCity)throw Error('O serviço de localização não carregou. Atualize a página e tente novamente.');
  const coords=await window.RadarRoadEngine.locateCity({city,uf,label:city+'/'+uf});
  if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90)throw Error('Não foi possível localizar o município. Confira cidade e UF.');
  return {local:city+'/'+uf+' · referência aproximada por município',latitude:coords[1],longitude:coords[0]};
 }
 window.radarVehicleCityPosition=cityPosition;
 async function commit(c,all){
  if(saving||!write(c))return;let ownsSave=false;const message=document.getElementById('deliveryMessage'),b=document.getElementById('deliverySave');
  try{const d=all[Number(document.getElementById('deliveryInvoice').value)],st=document.getElementById('deliveryStatus').value,obs=document.getElementById('deliveryObs').value.trim(),dt=document.getElementById('deliveryTime').value,stop=document.getElementById('deliveryStop').value;
   if(!stop)throw Error('Selecione o ponto de entrega desta NF.');if(!dt||!Number.isFinite(new Date(dt).getTime()))throw Error('Informe a data e hora do evento.');if(new Date(dt)>Date.now()+300000)throw Error('O evento não pode estar no futuro.');if(['SINISTRO','OUTROS','ENTREGA REALIZADA COM INSUCESSO'].includes(st)&&!obs)throw Error('Informe a ocorrência para este status.');
   const local=document.getElementById('vehicleLocal').value.trim();let posicao=null;
   saving=true;b.disabled=true;document.getElementById('deliveryInvoice').disabled=true;document.querySelectorAll('#deliveryFields input,#deliveryFields select,#deliveryFields textarea,#deliveryFields button').forEach(e=>e.disabled=true);
   if(local){message.textContent='Localizando cidade e UF…';posicao=await cityPosition(local)}
   if(!b.isConnected)throw Error('A janela foi fechada. Reabra a NF antes de salvar.');
   if(radarSaveBusy)throw Error('Aguarde o salvamento em andamento e reabra a atualização.');
   if(radarDirty){await radarFlushSave();if(radarDirty)throw Error('Há alterações pendentes. Confirme o salvamento e reabra a NF.');editingVersion=radarDataVersion}
   radarSaveBusy=true;ownsSave=true;message.textContent='Salvando no servidor…';
   const result=await radarRpc('radar_atualizar_entrega_nf',{p_module_session_token:radarModuleSessionToken,p_carga_id:editingId,p_expected_version:editingVersion,p_evento:{nf_key:key(d),status:st,observacao:obs,efetiva_at:new Date(dt).toISOString(),parada:stop,posicao}});
   if(!result?.ok)throw Error(result?.message||'Não foi possível gravar a atualização.');
   D=Object.assign(base(),result.payload);radarDataVersion=Number(result.version);radarDirty=false;closeModal();renderAll();toast('NF atualizada e salva. Situação da carga recalculada.');
  }catch(e){message.textContent=e.message}finally{saving=false;if(ownsSave)radarSaveBusy=false;if(b.isConnected){b.disabled=false;document.getElementById('deliveryInvoice').disabled=false;document.querySelectorAll('#deliveryFields input,#deliveryFields select,#deliveryFields textarea,#deliveryFields button').forEach(e=>e.disabled=false)}}
 }
 window.installRadarDeliveries=function(){window.renderExec=window.radarRenderDeliveries;window.executionModal=window.radarDeliveryModal;window.saveExecution=()=>toast('Use a atualização individual por NF.');};
})();
