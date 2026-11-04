'use strict';
(function(){
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{timeZone:'UTC'})};
 const time=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})};
 const clean=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
 function delivery(c){switch(c.status){case 'ENTREGA REALIZADA':return {label:'No prazo',tone:'success'};case 'ENTREGUE COM ATRASO':return {label:'Entregue com atraso',tone:'danger'};case 'ATRASADO':return {label:'Em atraso',tone:'danger'};case 'RISCO DE ATRASO':return {label:'Risco de atraso',tone:'warning'};case 'ENTREGA REALIZADA COM INSUCESSO':return {label:'Insucesso',tone:'danger'};case 'SINISTRO':return {label:'Sinistro',tone:'danger'};default:return {label:'Aguardando / em andamento',tone:'info'}}}
 function documents(c){
  const source=typeof billingFiscalDocs==='function'?billingFiscalDocs(c):(c.documentos_fiscais||[]),seen=new Set();
  return source.filter(doc=>{const key=doc.chave||[doc.emitente||'',doc.serie||'',doc.numero||doc.id||source.indexOf(doc)].join('|');if(seen.has(key))return false;seen.add(key);return true}).map(doc=>({number:clean(doc.numero),series:clean(doc.serie),issued:doc.data_emissao||'',recipient:clean(doc.destinatario||''),label:clean(doc.numero||'Número não informado')+(doc.serie?' · série '+clean(doc.serie):'')}));
 }
 window.radarPerformanceAnalyticRows=function(){
  const role=D.config?.perfilDemo,bound=D.config?.demoTransportadoraId,chosen=role==='TRANSPORTADORA'?bound:(window.radarPerformanceCarrier||''),carriers=D.transportadoras.filter(t=>t.ativo!==false&&(role!=='TRANSPORTADORA'||t.id===bound)&&(!chosen||String(t.id)===String(chosen)));
  const rows=(D.cargas||[]).filter(c=>c.status!=='CANCELADA').filter(c=>role!=='TRANSPORTADORA'||c.transportadora_id===bound).filter(c=>carriers.some(t=>c.transportadora_id===t.id||c.transportadora===t.nome));
  return rows.map(c=>{const t=carriers.find(t=>t.id===c.transportadora_id)||carriers.find(t=>t.nome===c.transportadora),last=(D.ocorrencias||[]).filter(o=>o.carga_id===c.id).slice(-1)[0];return {load:clean(c.numero),carrier:clean(t?.nome||c.transportadora),client:clean(c.cliente),origin:clean(c.origem)+(c.uf_origem?'/'+clean(c.uf_origem):''),destination:clean(c.destino)+(c.uf_destino?'/'+clean(c.uf_destino):''),documents:documents(c),status:clean(c.status),delivery:delivery(c),expected:c.eta_max||c.eta_min||'',delivered:c.entrega_at||'',occurrence:clean(last?.observacao||c.status_obs||'')}}).sort((a,b)=>a.load.localeCompare(b.load,'pt-BR',{numeric:true}));
 };
 window.radarPerformanceAnalyticsHTML=function({forPrint=false}={}){
  const rows=window.radarPerformanceAnalyticRows(),count=rows.reduce((n,r)=>n+r.documents.length,0);
  const body=rows.map(r=>'<tr><td>'+safe(r.load)+'</td><td class="analytic-invoices">'+(r.documents.length?r.documents.map(d=>safe(d.label)).join('<br>'):'Sem NF vinculada')+'</td><td>'+safe(r.carrier)+'</td><td>'+safe(r.destination)+'</td><td>'+safe(r.status)+'</td><td><span class="analytic-status '+r.delivery.tone+'">'+safe(r.delivery.label)+'</span></td><td>'+safe(date(r.expected)||'Não informada')+'</td><td>'+safe(time(r.delivered)||'Não registrada')+'</td></tr>').join('');
  return '<div class="performance-analytic-head"><h2>Análise por carga e nota fiscal</h2><span>'+rows.length+' carga(s) · '+count+' NF(s) vinculada(s)</span></div><p class="performance-analytic-note">As notas fiscais são relacionadas à carga. O status e o prazo referem-se à carga; não representam baixa individual por NF.</p><div class="'+(forPrint?'analytic-print-table':'table performance-analytic-table')+'"><table><thead><tr><th>Carga</th><th>Notas fiscais</th><th>Transportadora</th><th>Destino da carga</th><th>Status da carga</th><th>Prazo da carga</th><th>Previsão</th><th>Entrega / tentativa efetiva</th></tr></thead><tbody>'+body+(rows.length?'':'<tr><td colspan="8">Nenhuma carga na seleção.</td></tr>')+'</tbody></table></div>';
 };
 window.radarRenderPerformanceAnalytics=function(){const host=document.getElementById('performanceAnalytics');if(host)host.innerHTML=window.radarPerformanceAnalyticsHTML()};
 function parseNumber(text){const n=Number(String(text||'').replace(/%/g,'').replace(/\./g,'').replace(',','.').trim());return Number.isFinite(n)?n:0}
 window.radarPerformanceExportSnapshot=function(){
  const cards=[...document.querySelectorAll('#perfKpis .perf-kpi')].map(card=>{const value=card.querySelector('.kv')?.textContent||'',percent=value.includes('%');return {label:card.querySelector('.kl')?.textContent||'',value:parseNumber(value)/(percent?100:1),percent,tone:card.dataset.tone}});
  const carriers=[...document.querySelectorAll('#perfb tr')].filter(tr=>tr.children.length===8).map(tr=>[...tr.children].map((td,i)=>i===0?td.textContent:parseNumber(td.textContent)/(i>=6?100:1)));
  return {carrierId:window.radarPerformanceCarrier||'',company:typeof radarCompanyId==='undefined'?'':radarCompanyId,author:typeof radarUserName==='undefined'?'':radarUserName,scope:document.getElementById('performanceScope')?.textContent||'',generated:new Date(),cards,carriers,loads:window.radarPerformanceAnalyticRows()};
 };
 function excelDay(value){value=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const [y,m,d]=value.split('-').map(Number),out=new Date(Date.UTC(y,m-1,d));return out.toISOString().slice(0,10)===value?out:null}
 function excelTime(value){const d=new Date(value);if(!value||Number.isNaN(d.getTime()))return null;const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second))}
 const colors={success:'1B6847',danger:'A22E3E',warning:'7B5512',info:'245D86',teal:'21656B'};
 window.radarBuildPerformanceWorkbook=function(Excel,snapshot){
  const book=new Excel.Workbook();book.creator='YALOG';book.created=snapshot.generated;
  function sheet(name,headers,widths,data,formats={}){
   const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
   ws.columns=headers.map((header,i)=>({header,width:widths[i]||22}));
   for(const values of data)ws.addRow(values);
   ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:headers.length}};
   ws.eachRow((row,n)=>{let lines=1;row.eachCell({includeEmpty:true},(cell,i)=>{cell.font={name:'Calibri',size:11,color:{argb:n===1?'FFFFFFFF':'FF173F50'},bold:n===1};cell.alignment={vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:n===1?'FF173F50':n%2?'FFF2F7F9':'FFFFFFFF'}};cell.border={bottom:{style:'thin',color:{argb:'FFD5E2E8'}}};if(n>1&&formats[i])cell.numFmt=formats[i];if(typeof cell.value==='string')lines=Math.max(lines,Math.ceil(cell.value.length/(widths[i-1]||22)))});row.height=n===1?32:Math.max(36,Math.min(180,lines*15))});
   ws.headerFooter.oddFooter='&CYALog OS® • Sistema Integrado de Gestão Logística Modular • Radar Logístico&R&P / &N';return ws;
  }
  const summary=book.addWorksheet('Resumo',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  summary.columns=[{width:42},...Array.from({length:7},()=>({width:19}))];
  summary.addRow(['Performance das transportadoras']);summary.mergeCells('A1:H1');summary.getCell('A1').font={name:'Calibri',size:20,bold:true,color:{argb:'FF173F50'}};summary.getRow(1).height=34;
  summary.addRow(['Empresa',snapshot.company]);summary.addRow(['Seleção',snapshot.scope]);summary.mergeCells('B3:H3');summary.getRow(3).height=30;summary.addRow(['Emitido em (Brasília)',excelTime(snapshot.generated)]);summary.getCell('B4').numFmt='dd/mm/yyyy hh:mm';summary.addRow(['Emissor',snapshot.author]);summary.mergeCells('B5:H5');summary.getRow(5).height=30;summary.addRow(['Base','Consolidado operacional disponível, sem filtro de período. Exclui cargas canceladas.']);summary.mergeCells('B6:H6');summary.getRow(6).height=30;summary.addRow([]);summary.addRow(['Indicador','Valor']);
  for(const card of snapshot.cards){
   const r=summary.addRow([card.label,card.value]);r.height=24;r.getCell(2).numFmt=card.percent?'0.00%':'0';r.getCell(2).font={bold:true,color:{argb:'FF'+(colors[card.tone]||colors.info)}};
  }
  summary.addRow([]);const summaryHeader=summary.addRow(['Transportadora','Cargas','Entregues','No prazo','Atrasadas','Insucesso','SLA','Eficiência']);
  for(const data of snapshot.carriers){
   const r=summary.addRow(data);r.height=Math.max(30,Math.ceil(String(data[0]).length/42)*15);r.getCell(7).numFmt=r.getCell(8).numFmt='0.00%';
   for(const i of [7,8]){const tone=radarPerformanceTone(Number(r.getCell(i).value)*100);r.getCell(i).font={bold:true,color:{argb:'FF'+(colors[tone]||colors.info)}};}
  }
  const summaryEnd=summary.rowCount;summary.autoFilter={from:{row:summaryHeader.number,column:1},to:{row:summaryEnd,column:8}};
  for(const row of [summary.getRow(8),summaryHeader]){row.height=30;row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173F50'}};cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}}})}
  summary.addRow([]);for(const note of ['Faróis: até 85% vermelho; acima de 85% até 95% azul; acima de 95% verde.','Eficiência geral = no prazo / cargas. Na tabela, eficiência = no prazo / entregas concluídas. SLA = concluídas sem classificação de atraso / concluídas.','Cargas: uma linha por carga. Notas fiscais: uma linha por NF vinculada à carga. Não some linhas de NF como quantidade de cargas.','O status e o prazo das notas referem-se à carga; o módulo não registra baixa individual por NF.']){const r=summary.addRow([note]);summary.mergeCells(r.number,1,r.number,8);r.height=34;r.getCell(1).alignment={wrapText:true,vertical:'middle'}}
  summary.eachRow(row=>row.eachCell(cell=>{cell.alignment={...cell.alignment,vertical:'middle',wrapText:true};if(!cell.font?.name)cell.font={...cell.font,name:'Calibri',size:11}}));
  summary.headerFooter.oddFooter='&CYALog OS® • Sistema Integrado de Gestão Logística Modular • Radar Logístico&R&P / &N';
  const cargoData=snapshot.loads.map(r=>[r.load,r.carrier,r.client,r.origin,r.destination,r.documents.map(d=>d.label).join('; '),r.documents.length,r.status,r.delivery.label,excelDay(r.expected),excelTime(r.delivered),r.occurrence]);
  const cargo=sheet('Cargas',['Carga','Transportadora','Cliente(s)','Origem','Destino da carga','Notas fiscais','Qtd. NFs','Status da carga','Prazo da carga','Previsão de entrega','Entrega / tentativa (Brasília)','Última ocorrência'],[15,30,32,24,30,35,12,37,27,22,28,48],cargoData,{1:'@',7:'0',10:'dd/mm/yyyy',11:'dd/mm/yyyy hh:mm'});
  const nfRows=[];for(const r of snapshot.loads)for(const d of r.documents)nfRows.push([r.load,d.number,d.series,excelDay(d.issued),d.recipient||r.client,r.destination,r.carrier,r.status,r.delivery.label,excelDay(r.expected),excelTime(r.delivered)]);
  const invoices=sheet('Notas fiscais',['Carga','Nota fiscal','Série','Emissão','Destinatário','Destino da carga','Transportadora','Status da carga (referência)','Prazo da carga','Previsão de entrega','Entrega / tentativa (Brasília)'],[15,20,12,18,35,30,30,37,27,22,28],nfRows,{1:'@',2:'@',3:'@',4:'dd/mm/yyyy',10:'dd/mm/yyyy',11:'dd/mm/yyyy hh:mm'});
  for(const [ws,column] of [[cargo,9],[invoices,9]])ws.eachRow((row,n)=>{
   if(n>1){const value=row.getCell(column).value,tone=value==='No prazo'?'success':value==='Risco de atraso'?'warning':/atraso|Insucesso|Sinistro/.test(String(value))?'danger':'info';row.getCell(column).font={name:'Calibri',size:11,bold:true,color:{argb:'FF'+colors[tone]}}}
  });
  return book;
 };
 let excelPromise;
 function excel(){if(window.ExcelJS)return Promise.resolve(window.ExcelJS);if(!excelPromise)excelPromise=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(Error('A exportação demorou para carregar. Confira a conexão e tente novamente.'))},20000);script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';script.integrity='sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz';script.crossOrigin='anonymous';script.onload=()=>{clearTimeout(timer);window.ExcelJS?resolve(window.ExcelJS):reject(Error('Biblioteca Excel indisponível.'))};script.onerror=()=>{clearTimeout(timer);reject(Error('Não foi possível carregar a exportação. Atualize a página e tente novamente.'))};document.head.appendChild(script)}).catch(e=>{excelPromise=null;throw e});return excelPromise}
 window.radarExportPerformanceExcel=async function(){
  const button=document.getElementById('performanceExcel'),status=document.getElementById('performanceExportStatus');if(button?.disabled)return;
  renderPerformance();const snapshot=window.radarPerformanceExportSnapshot();if(button)button.disabled=true;if(status)status.textContent='Preparando planilha Excel…';
  try{const Excel=await excel(),book=window.radarBuildPerformanceWorkbook(Excel,snapshot),buffer=await book.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;const selected=(snapshot.carrierId||'geral').replace(/[^a-zA-Z0-9_-]/g,'_');link.download='Radar_Performance_'+snapshot.company+'_'+selected+'_'+new Date().toISOString().slice(0,10)+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);if(status)status.textContent='Planilha gerada com Resumo, Cargas e Notas fiscais.'}
  catch(e){if(status)status.textContent=e.message||'Não foi possível gerar a planilha.';toast(e.message||'Falha ao exportar Excel.')}
  finally{if(button)button.disabled=false}
 };
})();
