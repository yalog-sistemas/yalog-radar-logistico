'use strict';
const accessStyle=document.createElement('style');accessStyle.textContent='.app [hidden],#radarLoginForm[hidden]{display:none!important}';document.head.appendChild(accessStyle);
window.radarCanManage=()=>['MASTER','GESTOR'].includes(radarProfile);
window.radarCanWrite=()=>['MASTER','GESTOR','EXECUTOR'].includes(radarProfile);
window.radarEditUser=function(login){const u=(window.radarUsers||[]).find(u=>u.login===login);if(!u?.gerenciavel)return;document.getElementById('radarUserLogin').value=u.login;document.getElementById('radarUserNameInput').value=u.nome||u.login;document.getElementById('radarUserProfile').value=['GESTOR','EXECUTOR','VISUALIZADOR'].includes(u.perfil)?u.perfil:'EXECUTOR';document.getElementById('radarUserPassword').value='';document.getElementById('radarUserLogin').focus()};
window.radarReactivateUser=async function(login){try{await radarRpc('radar_gerenciar_usuario',{p_module_session_token:radarModuleSessionToken,p_action:'ATIVAR',p_login:login,p_nome:null,p_perfil:'EXECUTOR',p_senha_hash:null});await radarRenderUsers()}catch(e){toast(e.message)}};
window.installRadarAccess=function(){
 const viewer=radarProfile==='VISUALIZADOR',manager=radarCanManage();
 const deny=()=>{toast('Seu perfil permite apenas consulta.');return false};
 const mutations=['save','scheduleRadarSave','radarPersistNow','saveManagementParams','saveVehicleParams','saveNF','confirmXML','freeForm','pedidoFormModal','confirmPreviewLoad','generate','saveLoad','saveStatus','cancelLoad','approveAutoPlan','saveTrans','deleteTrans','saveCarrierSla','importCarrierSlaCsv','seedCarrierSlaDemo','saveSla','saveSeqCarga','importData','resetAll','seed','saveCargoObservation','receiveQuote','saveReceivedQuote','cancelLoadModal','confirmCancelLoad','approveQuote','confirmRefuseQuote','addBillingFiscalDoc','removeBillingFiscalDoc','importBillingXmls','saveBilling','updateExecutionStatuses','saveExecution','setDemoCarrier','sendQuotes','advanceLoad','blockLoad','clearAudit','clearGestaoPedidos','finalizeRouteAndQuote','reopenQuote','routeMoveStop','nfModal','loadModal','transModal','slaModal','statusModal','executionModal','openBillingModal','openCarrierSlaEditor','autoModal','buildAutoPlan','previewRouteModal','previewLoadModalFromRoute','previewLoadModal'];
 if(!window.radarAccessInstalled){window.radarAccessInstalled=true;
  for(const name of mutations){const fn=window[name];if(typeof fn==='function')window[name]=function(...args){return radarCanWrite()?fn.apply(this,args):deny()}}
  for(const name of ['radarManageUser','radarDeactivateUser','radarRenderUsers','radarManageCarrierUser','radarDeactivateCarrierUser','radarRenderCarrierUsers']){const fn=window[name];if(typeof fn==='function')window[name]=function(...args){return radarCanManage()?fn.apply(this,args):deny()}}
  const baseShow=window.show;window.show=function(p){if(p==='config'&&!radarCanManage())return deny();return baseShow(p)};
  const mutationPattern=new RegExp('\\b(?:'+mutations.join('|')+')\\s*\\(');
  function lock(){
   document.querySelectorAll('.ni[data-p="config"]').forEach(b=>b.hidden=!radarCanManage());
   for(const id of ['radarUserAdmin','radarCarrierUserAdmin']){const e=document.getElementById(id);if(e)e.hidden=!radarCanManage()}
   document.querySelectorAll('#radarUserProfile option[value="GESTOR"]').forEach(o=>{o.hidden=radarProfile!=='MASTER';o.disabled=radarProfile!=='MASTER'});
   if(radarCanWrite())return;
   document.querySelectorAll('[onclick],[onchange],[oninput]').forEach(e=>{const action=['onclick','onchange','oninput'].map(k=>e.getAttribute(k)||'').join(';');if(mutationPattern.test(action)){e.hidden=true;e.disabled=true}});
   document.querySelectorAll('.modal input,.modal select,.modal textarea,#modal input,#modal select,#modal textarea,input[type="file"],[contenteditable="true"]').forEach(e=>{e.disabled=true;if(e.hasAttribute('contenteditable'))e.setAttribute('contenteditable','false')});
  }
  lock();let pending=false;new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(()=>{pending=false;lock()})}}).observe(document.body,{childList:true,subtree:true});
 }
 document.querySelectorAll('#radarUserAdmin,#radarCarrierUserAdmin').forEach(e=>e.hidden=!manager);
};
