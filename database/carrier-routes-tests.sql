begin;
insert into public.empresas(company_id,nome_fantasia) values('RADAR-ROUTES-QA','QA');
insert into public.licencas(company_id,status) values('RADAR-ROUTES-QA','ATIVA');
insert into public.modulos(company_id,modulo,status) values('RADAR-ROUTES-QA','radarlogistico','LIBERADO');
insert into public.usuarios(company_id,login,nome,role,ativo) values
 ('RADAR-ROUTES-QA','qa-master','Master','MASTER',true),
 ('RADAR-ROUTES-QA','qa-a','Carrier A','USUARIO',true),
 ('RADAR-ROUTES-QA','qa-b','Carrier B','USUARIO',true),
 ('RADAR-ROUTES-QA','qa-view','Viewer','USUARIO',true),
 ('RADAR-ROUTES-QA','qa-unbound','Unbound','USUARIO',true);
insert into public.module_users(company_id,modulo,login,perfil,ativo) values
 ('RADAR-ROUTES-QA','radarlogistico','qa-master','MASTER',true),
 ('RADAR-ROUTES-QA','radarlogistico','qa-a','TRANSPORTADORA',true),
 ('RADAR-ROUTES-QA','radarlogistico','qa-b','TRANSPORTADORA',true),
 ('RADAR-ROUTES-QA','radarlogistico','qa-view','VISUALIZADOR',true),
 ('RADAR-ROUTES-QA','radarlogistico','qa-unbound','TRANSPORTADORA',true);
insert into public.module_sessions(token,company_id,login,modulo) values
 (repeat('m',64),'RADAR-ROUTES-QA','qa-master','radarlogistico'),
 (repeat('a',64),'RADAR-ROUTES-QA','qa-a','radarlogistico'),
 (repeat('b',64),'RADAR-ROUTES-QA','qa-b','radarlogistico'),
 (repeat('v',64),'RADAR-ROUTES-QA','qa-view','radarlogistico'),
 (repeat('u',64),'RADAR-ROUTES-QA','qa-unbound','radarlogistico');
insert into public.radar_transportadora_vinculos(company_id,login,transportadora_id,created_by) values
 ('RADAR-ROUTES-QA','qa-a','t-a','qa-master'),('RADAR-ROUTES-QA','qa-b','t-b','qa-master');
insert into public.radar_logistico_store(company_id,module_id,version,updated_by,payload) values
 ('RADAR-ROUTES-QA','radarlogistico',0,'qa-master','{
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
create temp table route_test_payload(r jsonb);
insert into route_test_payload values('{
 "source_ids":["n1","n2"],"order":["Campinas/SP","Ribeirão Preto/SP"],"origin":"Uberaba/MG",
 "first_delivery":"Campinas/SP","optimized":true,"method":"Test","distance_km":611.4,"legs_km":[389.6,221.8],
 "coordinates":[[-47.9,-19.7],[-47.06,-22.9],[-47.8,-21.1]],
 "geometry":{"type":"LineString","coordinates":[[-47.9,-19.7],[-47.06,-22.9],[-47.8,-21.1]]},
 "calculated_at":"2026-11-04T12:00:00Z"
 }');
grant select on route_test_payload to anon;
set local role anon;
do $$declare r jsonb;p jsonb;begin
 assert public.radar_sessao(repeat('a',64))->>'perfil'='TRANSPORTADORA';
 assert jsonb_array_length(public.radar_listar_usuarios_transportadora(repeat('m',64))->'usuarios')=2;
 begin perform public.radar_listar_usuarios_transportadora(repeat('a',64));raise exception 'Carrier listed user administration';exception when insufficient_privilege then null;end;
 r:=public.radar_carregar_dados(repeat('a',64));
 assert r->>'transportadora_id'='t-a';
 assert jsonb_array_length(r->'payload'->'cargas')=4;
 assert jsonb_array_length(r->'payload'->'cotacoes')=1;
 assert position('SECRET-' in r::text)=0;
 assert position('98432.77' in r::text)=0;
 assert position('77777' in r::text)=0;
 begin perform public.radar_carregar_dados(repeat('u',64));raise exception 'Unbound carrier read';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_dados(repeat('a',64),0,'{}');raise exception 'Carrier changed full store';exception when insufficient_privilege then null;end;
 select rt.r into p from route_test_payload rt;
 begin perform public.radar_salvar_rota(repeat('a',64),'c2',0,p);raise exception 'Carrier modified another carrier load';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c4',0,p);raise exception 'Refused carrier modified awarded load';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c5',0,p);raise exception 'Carrier changed canceled route';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c6',0,p);raise exception 'Carrier changed delivered route';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_rota(repeat('v',64),'c1',0,p);raise exception 'Viewer changed route';exception when insufficient_privilege then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c1',0,jsonb_set(p,'{source_ids}','["n1","n3"]'));raise exception 'Carrier injected other order';exception when invalid_parameter_value then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c1',0,jsonb_set(p,'{order}','["Campinas/SP","Goiânia/GO"]'));raise exception 'Carrier changed destinations';exception when invalid_parameter_value then null;end;
 begin perform public.radar_salvar_rota(repeat('a',64),'c1',0,jsonb_set(p,'{distance_km}','1'));raise exception 'Inconsistent distances accepted';exception when invalid_parameter_value then null;end;
 r:=public.radar_salvar_rota(repeat('a',64),'c1',0,p);
 assert (r->>'ok')::boolean;assert r->>'version'='1';
 assert r->'carga'->'nf_ids'='["n1","n2"]';
 assert r->'carga'->'documentos_fiscais'='[]';
 assert r->'carga'->'road_route'->>'updated_by'='qa-a';
 r:=public.radar_salvar_rota(repeat('a',64),'c1',0,p);assert (r->>'conflict')::boolean;
 r:=public.radar_carregar_dados(repeat('m',64));assert r->'payload'->'cargas'->0->'nf_ids'='["n1","n2"]';
 assert r->'payload'->'cargas'->1->>'secret'='SECRET-CARGO-B';
 assert r->'payload'->'cargas'->0->>'valor_frete'='77777';
 assert jsonb_array_length(r->'payload'->'audit')=2;
end $$;
reset role;
update public.radar_logistico_store set payload=jsonb_set(payload,'{transportadoras,0,ativo}','false') where company_id='RADAR-ROUTES-QA';
set local role anon;
do $$begin
 begin perform public.radar_carregar_dados(repeat('a',64));raise exception 'Inactive carrier read';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
