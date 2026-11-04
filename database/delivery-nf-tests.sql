begin;
insert into public.empresas(company_id,nome_fantasia) values('RADAR-DELIVERY-QA','QA');
insert into public.licencas(company_id,status) values('RADAR-DELIVERY-QA','ATIVA');
insert into public.modulos(company_id,modulo,status) values('RADAR-DELIVERY-QA','radarlogistico','LIBERADO');
insert into public.usuarios(company_id,login,nome,role,ativo) values
 ('RADAR-DELIVERY-QA','qa-master','Master','MASTER',true),
 ('RADAR-DELIVERY-QA','qa-a','Carrier A','USUARIO',true),
 ('RADAR-DELIVERY-QA','qa-b','Carrier B','USUARIO',true),
 ('RADAR-DELIVERY-QA','qa-view','Viewer','USUARIO',true),
 ('RADAR-DELIVERY-QA','qa-unbound','Unbound','USUARIO',true);
insert into public.module_users(company_id,modulo,login,perfil,ativo) values
 ('RADAR-DELIVERY-QA','radarlogistico','qa-master','MASTER',true),
 ('RADAR-DELIVERY-QA','radarlogistico','qa-a','TRANSPORTADORA',true),
 ('RADAR-DELIVERY-QA','radarlogistico','qa-b','TRANSPORTADORA',true),
 ('RADAR-DELIVERY-QA','radarlogistico','qa-view','VISUALIZADOR',true),
 ('RADAR-DELIVERY-QA','radarlogistico','qa-unbound','TRANSPORTADORA',true);
insert into public.module_sessions(token,company_id,login,modulo) values
 (repeat('m',64),'RADAR-DELIVERY-QA','qa-master','radarlogistico'),
 (repeat('a',64),'RADAR-DELIVERY-QA','qa-a','radarlogistico'),
 (repeat('b',64),'RADAR-DELIVERY-QA','qa-b','radarlogistico'),
 (repeat('v',64),'RADAR-DELIVERY-QA','qa-view','radarlogistico'),
 (repeat('u',64),'RADAR-DELIVERY-QA','qa-unbound','radarlogistico');
insert into public.radar_transportadora_vinculos(company_id,login,transportadora_id,created_by) values
 ('RADAR-DELIVERY-QA','qa-a','t-a','qa-master'),('RADAR-DELIVERY-QA','qa-b','t-b','qa-master');
insert into public.radar_logistico_store(company_id,module_id,version,updated_by,payload) values
 ('RADAR-DELIVERY-QA','radarlogistico',0,'qa-master','{
 "config":{"cotacaoHoras":2,"private_configuration":"SECRET-CONFIG"},
 "transportadoras":[{"id":"t-a","nome":"Carrier A","ativo":true},{"id":"t-b","nome":"SECRET-CARRIER-B","ativo":true}],
 "nfs":[
 {"id":"n1","origem":"Uberaba","uf_origem":"MG","cidade":"Campinas","uf_destino":"SP","cliente":"Client A"},
 {"id":"n2","origem":"Uberaba","uf_origem":"MG","cidade":"Ribeirão Preto","uf_destino":"SP","cliente":"Client A2"},
 {"id":"n3","origem":"Uberaba","uf_origem":"MG","cidade":"Goiânia","uf_destino":"GO","cliente":"SECRET-CLIENT-B"},
 {"id":"n4","origem":"Uberaba","uf_origem":"MG","cidade":"Campinas","uf_destino":"SP"},
 {"id":"n5","origem":"Uberaba","uf_origem":"MG","cidade":"Campinas","uf_destino":"SP"},
 {"id":"n6","origem":"Uberaba","uf_origem":"MG","cidade":"Campinas","uf_destino":"SP"}],
 "cargas":[
 {"id":"c1","numero":1,"origem":"Uberaba","uf_origem":"MG","status":"EM COTAÇÃO","transportadora_id":"","nf_ids":["n2","n1"],"valor_frete":77777,"documentos_fiscais":[]},
 {"id":"c2","numero":2,"origem":"Uberaba","uf_origem":"MG","status":"LIBERADA PARA COLETA","transportadora_id":"t-b","nf_ids":["n3"],"secret":"SECRET-CARGO-B"},
 {"id":"c3","numero":3,"origem":"Uberaba","uf_origem":"MG","status":"CARGA EM ROTA","transportadora_id":"t-a","nf_ids":["n4"]},
 {"id":"c4","numero":4,"origem":"Uberaba","uf_origem":"MG","status":"LIBERADA PARA COLETA","transportadora_id":"t-b","nf_ids":["n3"]},
 {"id":"c5","numero":5,"origem":"Uberaba","uf_origem":"MG","status":"CANCELADA","transportadora_id":"t-a","nf_ids":["n5"]},
 {"id":"c6","numero":6,"origem":"Uberaba","uf_origem":"MG","status":"ENTREGA REALIZADA","transportadora_id":"t-a","nf_ids":["n6"]}],
 "cotacoes":[
 {"id":"q-a","carga_id":"c1","transportadora_id":"t-a","status":"RECEBIDO","valor_frete":1000},
 {"id":"q-b","carga_id":"c1","transportadora_id":"t-b","status":"RECEBIDO","valor_frete":98432.77},
 {"id":"q-other","carga_id":"c4","transportadora_id":"t-b","status":"APROVADA","valor_frete":2222},
 {"id":"q-old","carga_id":"c4","transportadora_id":"t-a","status":"RECUSADA","valor_frete":1111}],
 "sla":[], "audit":[{"detail":"SECRET-AUDIT"}],"ocorrencias":[{"carga_id":"c2","observacao":"SECRET-OCCURRENCE"}],
 "private_root":"SECRET-ROOT"
 }');

update public.radar_logistico_store set payload=jsonb_set(payload,'{cargas,0}',(payload->'cargas'->0)||'{"faturamento_concluido":true,"transportadora_id":"t-a","eta_max":"2026-11-03","documentos_fiscais":[{"numero":"000001","serie":"1"},{"numero":"000002","serie":"1"}]}'::jsonb) where company_id='RADAR-DELIVERY-QA';
set local role anon;
do $$declare r jsonb;e jsonb;c jsonb;begin
 e:='{"nf_key":"nf:|1|000001","status":"ENTREGA REALIZADA","efetiva_at":"2026-11-02T15:00:00Z","parada":"Campinas/SP","posicao":{"local":"Campinas - ponto informado","latitude":-22.9,"longitude":-47.06}}';
 begin perform public.radar_atualizar_entrega_nf(repeat('v',64),'c1',0,e);raise exception 'VIEWER WROTE';exception when insufficient_privilege then null;end;
 begin perform public.radar_atualizar_entrega_nf(repeat('b',64),'c1',0,e);raise exception 'FOREIGN CARRIER WROTE';exception when insufficient_privilege then null;end;
 begin perform public.radar_atualizar_entrega_nf('invalid','c1',0,e);raise exception 'INVALID SESSION WROTE';exception when invalid_authorization_specification then null;end;
 begin perform public.radar_atualizar_entrega_nf(repeat('a',64),'c1',0,jsonb_set(e,'{nf_key}','"foreign"'));raise exception 'FOREIGN NF WROTE';exception when invalid_parameter_value then null;end;
 r:=public.radar_atualizar_entrega_nf(repeat('a',64),'c1',0,e);assert (r->>'ok')::boolean;assert r->>'version'='1';
 select x into c from jsonb_array_elements(r->'payload'->'cargas') x where x->>'id'='c1';
 assert c->>'status'='ENTREGA PARCIAL';assert c->'entrega_at'='null';assert c->'entregas_resumo'->>'entregues'='1';assert c->'posicao_veiculo'->>'informado_por'='qa-a';assert c->'entregas_nf'->'nf:|1|000002' is null;
 r:=public.radar_atualizar_entrega_nf(repeat('a',64),'c1',0,e);assert (r->>'conflict')::boolean;
 e:=e||'{"nf_key":"nf:|1|000002","efetiva_at":"2026-11-04T12:00:00Z","parada":"Ribeirão Preto/SP","posicao":null}'::jsonb;
 r:=public.radar_atualizar_entrega_nf(repeat('a',64),'c1',1,e);
 select x into c from jsonb_array_elements(r->'payload'->'cargas') x where x->>'id'='c1';
 assert c->>'status'='ENTREGUE COM ATRASO';assert c->'entregas_resumo'->>'entregues'='2';assert jsonb_array_length(c->'entregas_nf_historico')=2;assert c->>'entrega_at' is not null;
 e:=e||'{"status":"ENTREGA REALIZADA COM INSUCESSO","observacao":"Destinatário ausente"}'::jsonb;
 r:=public.radar_atualizar_entrega_nf(repeat('m',64),'c1',2,e);
 select x into c from jsonb_array_elements(r->'payload'->'cargas') x where x->>'id'='c1';assert c->>'status'='ENTREGA PARCIAL';assert c->'entrega_at'='null';assert c->'entregas_resumo'->>'entregues'='1';
 r:=public.radar_carregar_dados(repeat('m',64));assert r->'payload'->'cargas'->1->>'secret'='SECRET-CARGO-B';
end $$;
reset role;
rollback;
