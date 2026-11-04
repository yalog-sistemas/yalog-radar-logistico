create or replace function radar_private.route_norm(p_text text) returns text language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(normalize(coalesce(p_text,''),NFD),U&'[\0300-\036f]','','g')))
$$;

create or replace function radar_private.carrier_id(p_company text,p_login text) returns text language plpgsql security definer set search_path='' as $$
declare v text;
begin
 select rv.transportadora_id into v from public.radar_transportadora_vinculos rv
 join public.radar_logistico_store st on st.company_id=rv.company_id and st.module_id='radarlogistico'
 where rv.company_id=p_company and lower(rv.login)=lower(p_login)
 and exists(select 1 from jsonb_array_elements(coalesce(st.payload->'transportadoras','[]')) t where t->>'id'=rv.transportadora_id and coalesce((t->>'ativo')::boolean,true));
 if v is null then raise exception 'Transportadora sem vínculo ativo nesta empresa' using errcode='42501';end if;
 return v;
end $$;

create or replace function radar_private.carrier_load_allowed(p_payload jsonb,p_cargo jsonb,p_carrier text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_cargo->>'transportadora_id'=p_carrier,false) or
 (exists(select 1 from jsonb_array_elements(coalesce(p_payload->'cotacoes','[]')) q where q->>'carga_id'=p_cargo->>'id' and q->>'transportadora_id'=p_carrier and upper(coalesce(q->>'status','')) not in ('RECUSADA','NÃO SELECIONADA','NAO SELECIONADA'))
 and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'cotacoes','[]')) q where q->>'carga_id'=p_cargo->>'id' and q->>'status'='APROVADA' and q->>'transportadora_id'<>p_carrier))
$$;

create or replace function radar_private.identity(p_token text) returns table(company_id text,login text,modulo text,nome text,perfil text) language plpgsql security definer set search_path='' as $$
begin
 return query select ms.company_id,u.login,ms.modulo,u.nome,
 case when upper(mu.perfil) in ('MASTER','SUPER_ADMIN') and upper(u.role) in ('MASTER','SUPER_ADMIN') then 'MASTER'
 when upper(mu.perfil) in ('GESTOR','LIDERANCA','ADMIN_EMPRESA') then 'GESTOR'
 when upper(mu.perfil) in ('VISUALIZADOR','CONSULTA','LEITURA','VIEWER') then 'VISUALIZADOR'
 when upper(mu.perfil) in ('EXECUTOR','USUARIO','OPERADOR') then 'EXECUTOR'
 when upper(mu.perfil) in ('TRANSPORTADORA','CARRIER') then 'TRANSPORTADORA'
 else 'SEM_ACESSO' end
 from public.module_sessions ms join public.usuarios u on u.company_id=ms.company_id and lower(u.login)=lower(ms.login)
 join public.module_users mu on mu.company_id=ms.company_id and lower(mu.login)=lower(ms.login) and mu.modulo=ms.modulo
 where ms.token=p_token and ms.modulo='radarlogistico' and ms.expires_at>now() and ms.revoked_at is null and u.ativo and mu.ativo
 and public.usuario_autorizado_modulo(ms.company_id,u.login,ms.modulo)
 and exists(select 1 from public.licencas l where l.company_id=ms.company_id and upper(l.status)='ATIVA' and (l.validade is null or l.validade>=current_date));
 if not found then raise exception 'Sessão do Radar inválida, expirada ou bloqueada' using errcode='28000';end if;
end $$;

create or replace function public.radar_carregar_dados(p_module_session_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;p jsonb;v bigint;t text;loads jsonb;orders jsonb;quotes jsonb;slas jsonb;carriers jsonb;occs jsonb;cfg jsonb;
begin
 select * into s from radar_private.identity(p_module_session_token);
 if s.perfil not in ('MASTER','GESTOR','EXECUTOR','VISUALIZADOR','TRANSPORTADORA') then raise exception 'Perfil sem acesso' using errcode='42501';end if;
 select payload,version into p,v from public.radar_logistico_store where company_id=s.company_id and module_id='radarlogistico';
 p:=coalesce(p,'{}');
 if s.perfil='TRANSPORTADORA' then
  t:=radar_private.carrier_id(s.company_id,s.login);
  select coalesce(jsonb_agg((c-'cotacoes'-'ranking'-'recomendacoes')||jsonb_build_object('valor_frete',case when c->>'transportadora_id'=t then coalesce(c->'valor_frete','0'::jsonb) else '0'::jsonb end)),'[]') into loads from jsonb_array_elements(coalesce(p->'cargas','[]')) c where radar_private.carrier_load_allowed(p,c,t);
  select coalesce(jsonb_agg(n),'[]') into orders from jsonb_array_elements(coalesce(p->'nfs','[]')) n where exists(select 1 from jsonb_array_elements(loads) c where (c->'nf_ids') ? (n->>'id'));
  select coalesce(jsonb_agg(q),'[]') into quotes from jsonb_array_elements(coalesce(p->'cotacoes','[]')) q where q->>'transportadora_id'=t and exists(select 1 from jsonb_array_elements(loads) c where c->>'id'=q->>'carga_id');
  select coalesce(jsonb_agg(x),'[]') into carriers from jsonb_array_elements(coalesce(p->'transportadoras','[]')) x where x->>'id'=t;
  select coalesce(jsonb_agg(x),'[]') into slas from jsonb_array_elements(coalesce(p->'sla','[]')) x where coalesce(x->>'transportadora_id','') in ('',t) and exists(select 1 from jsonb_array_elements(orders) n where radar_private.route_norm(n->>'cidade')=radar_private.route_norm(x->>'destino') and n->>'uf_destino'=x->>'uf_destino');
  select coalesce(jsonb_agg(x),'[]') into occs from jsonb_array_elements(coalesce(p->'ocorrencias','[]')) x where exists(select 1 from jsonb_array_elements(loads) c where c->>'id'=x->>'carga_id');
  cfg:=jsonb_build_object('perfilDemo','TRANSPORTADORA','demoTransportadoraId',t,'cotacaoHoras',coalesce(p->'config'->'cotacaoHoras','2'::jsonb),'tiposVeiculos',coalesce(p->'config'->'tiposVeiculos','[]'::jsonb));
  p:=jsonb_build_object('seq',0,'config',cfg,'nfs',orders,'cargas',loads,'cotacoes',quotes,'transportadoras',carriers,'sla',slas,'ocorrencias',occs,'audit','[]'::jsonb,'motoristas','[]'::jsonb,'veiculos','[]'::jsonb);
 end if;
 return jsonb_build_object('ok',true,'company_id',s.company_id,'login',s.login,'nome',s.nome,'perfil',s.perfil,'transportadora_id',t,'version',coalesce(v,0),'payload',p);
end $$;

create or replace function public.radar_salvar_rota(p_module_session_token text,p_carga_id text,p_expected_version bigint,p_rota jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;p jsonb;v bigint;c jsonb;t text;ids jsonb;labels jsonb;ordered_ids jsonb;stop_keys jsonb;road jsonb;total numeric;legsum numeric;uf text;origin text;key text;cnt integer;i integer;
begin
 select * into s from radar_private.identity(p_module_session_token);
 if s.perfil not in ('MASTER','GESTOR','EXECUTOR','TRANSPORTADORA') then raise exception 'Perfil somente consulta' using errcode='42501';end if;
 select payload,version into p,v from public.radar_logistico_store where company_id=s.company_id and module_id='radarlogistico' for update;
 select x into c from jsonb_array_elements(coalesce(p->'cargas','[]')) x where x->>'id'=p_carga_id;
 if c is null then raise exception 'Carga não disponível' using errcode='42501';end if;
 if s.perfil='TRANSPORTADORA' then
  t:=radar_private.carrier_id(s.company_id,s.login);
  if not radar_private.carrier_load_allowed(p,c,t) then raise exception 'Carga fora da sua transportadora' using errcode='42501';end if;
  if c->>'status' in ('CANCELADA','ENTREGA REALIZADA','ENTREGUE COM ATRASO','ENTREGA REALIZADA COM INSUCESSO','FINALIZADA') then raise exception 'Esta carga está encerrada; a rota pode ser consultada e impressa' using errcode='42501';end if;
 end if;
 if p_expected_version is null or p_expected_version<>v then return jsonb_build_object('ok',false,'conflict',true,'message','A base mudou. Reabra a rota antes de aplicar a sequência.');end if;
 if p_rota is null or jsonb_typeof(p_rota)<>'object' or octet_length(p_rota::text)>500000 or jsonb_typeof(p_rota->'source_ids') is distinct from 'array' or jsonb_typeof(p_rota->'order') is distinct from 'array' or jsonb_typeof(p_rota->'legs_km') is distinct from 'array' then raise exception 'Dados da rota inválidos' using errcode='22023';end if;
 select jsonb_agg(x order by x) into ids from jsonb_array_elements_text(c->'nf_ids') x;
 if ids is distinct from (select jsonb_agg(x order by x) from jsonb_array_elements_text(p_rota->'source_ids') x) then raise exception 'A rota deve preservar todos os pedidos da carga' using errcode='22023';end if;
 select coalesce(jsonb_agg(distinct radar_private.route_norm(btrim(n->>'cidade')||'/'||upper(btrim(n->>'uf_destino')))),'[]') into labels from jsonb_array_elements(p->'nfs') n where (c->'nf_ids') ? (n->>'id');
 cnt:=jsonb_array_length(labels);
 if cnt<1 or cnt>25 or jsonb_array_length(p_rota->'order')<>cnt or jsonb_array_length(p_rota->'legs_km')<>cnt then raise exception 'Quantidade de paradas inválida' using errcode='22023';end if;
 if jsonb_typeof(p_rota->'optimized') is distinct from 'boolean' or (p_rota->'first_delivery' is not null and p_rota->'first_delivery'<>'null'::jsonb and (jsonb_typeof(p_rota->'first_delivery')<>'string' or radar_private.route_norm(p_rota->>'first_delivery')<>radar_private.route_norm(p_rota->'order'->>0))) then raise exception 'Primeira entrega ou método inválidos' using errcode='22023';end if;
 select jsonb_agg(radar_private.route_norm(x) order by ord) into stop_keys from jsonb_array_elements_text(p_rota->'order') with ordinality a(x,ord);
 if (select count(distinct x) from jsonb_array_elements_text(stop_keys) x)<>cnt or not labels @> stop_keys or not stop_keys @> labels then raise exception 'As paradas devem corresponder aos destinos da carga' using errcode='22023';end if;
 if jsonb_typeof(p_rota->'distance_km') is distinct from 'number' or (p_rota->>'distance_km')::numeric<0 or (p_rota->>'distance_km')::numeric>100000 then raise exception 'Distância inválida' using errcode='22023';end if;
 total:=(p_rota->>'distance_km')::numeric;
 if exists(select 1 from jsonb_array_elements(p_rota->'legs_km') x where jsonb_typeof(x)<>'number') then raise exception 'Distância por trecho inválida' using errcode='22023';end if;
 select sum(x::text::numeric) into legsum from jsonb_array_elements(p_rota->'legs_km') x;
 if exists(select 1 from jsonb_array_elements(p_rota->'legs_km') x where x::text::numeric<0) or abs(total-legsum)>.2 then raise exception 'O total deve corresponder à soma dos trechos' using errcode='22023';end if;
 if jsonb_typeof(p_rota->'coordinates') is distinct from 'array' or jsonb_array_length(p_rota->'coordinates')<>cnt+1 or p_rota->'geometry'->>'type' is distinct from 'LineString' or jsonb_typeof(p_rota->'geometry'->'coordinates') is distinct from 'array' then raise exception 'Geometria da rota inválida' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements((p_rota->'coordinates')||(p_rota->'geometry'->'coordinates')) x where jsonb_typeof(x) is distinct from 'array' or jsonb_array_length(x)<>2 or jsonb_typeof(x->0) is distinct from 'number' or jsonb_typeof(x->1) is distinct from 'number') then raise exception 'Coordenadas inválidas' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements((p_rota->'coordinates')||(p_rota->'geometry'->'coordinates')) x where abs((x->>0)::numeric)>180 or abs((x->>1)::numeric)>90) then raise exception 'Coordenadas fora dos limites' using errcode='22023';end if;
 select coalesce(nullif(c->>'uf_origem',''),n->>'uf_origem'),coalesce(nullif(c->>'origem',''),n->>'origem') into uf,origin from jsonb_array_elements(p->'nfs') n where (c->'nf_ids') ? (n->>'id') limit 1;
 if radar_private.route_norm(p_rota->>'origin')<>radar_private.route_norm(origin||'/'||uf) then raise exception 'A origem foi alterada. Recalcule a rota.' using errcode='22023';end if;
 select radar_private.route_norm(origin)||'|'||radar_private.route_norm(uf)||'|'||string_agg(x,',' order by x) into key from jsonb_array_elements_text(c->'nf_ids') x;
 select jsonb_agg(id order by stop_order,id_order) into ordered_ids
 from jsonb_array_elements_text(stop_keys) with ordinality st(stop_key,stop_order)
 join lateral jsonb_array_elements_text(c->'nf_ids') with ordinality ns(id,id_order) on true
 join lateral (select n from jsonb_array_elements(p->'nfs') n where n->>'id'=ns.id) nr on true
 where radar_private.route_norm(btrim(nr.n->>'cidade')||'/'||upper(btrim(nr.n->>'uf_destino')))=st.stop_key;
 road:=jsonb_build_object('version',1,'origin',origin||'/'||uf,'source_ids',ids,'source_key',key,'order',p_rota->'order','stop_keys',stop_keys,'distance_km',total,'legs_km',p_rota->'legs_km','coordinates',p_rota->'coordinates','geometry',p_rota->'geometry','first_delivery',p_rota->'first_delivery','optimized',p_rota->'optimized','method',p_rota->'method','provider','OSRM / OpenStreetMap','basis','Cidade/UF','calculated_at',p_rota->'calculated_at','updated_by',s.login,'updated_at',now());
 c:=c||jsonb_build_object('nf_ids',ordered_ids,'route_stops',p_rota->'order','road_route',road);
 select coalesce(string_agg(city,' / ' order by ord),'') into origin from (select split_part(x,'/',1) city,ord from jsonb_array_elements_text(p_rota->'order') with ordinality a(x,ord)) x;
 c:=c||jsonb_build_object('destino',origin);
 select coalesce(jsonb_agg(case when x->>'id'=p_carga_id then c else x end order by ord),'[]') into labels from jsonb_array_elements(p->'cargas') with ordinality a(x,ord);
 p:=jsonb_set(p,'{cargas}',labels);
 p:=jsonb_set(p,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'action','REORDENAR_ROTA','obj','#'||(c->>'numero'),'detail',s.login||' ('||s.perfil||'): '||(road->'order')::text||' · '||total||' km'))||coalesce(p->'audit','[]'));
 update public.radar_logistico_store set payload=p,version=v+1,updated_at=now(),updated_by=s.login where company_id=s.company_id and module_id='radarlogistico';
 insert into public.logs(tipo,detalhe,company_id) values('RADAR_ROTA',s.login||' ('||s.perfil||') ajustou a rota da carga '||coalesce(c->>'numero',p_carga_id),s.company_id);
 if s.perfil='TRANSPORTADORA' then c:=(c-'cotacoes'-'ranking'-'recomendacoes')||jsonb_build_object('valor_frete',case when c->>'transportadora_id'=t then coalesce(c->'valor_frete','0'::jsonb) else '0'::jsonb end);end if;
 return jsonb_build_object('ok',true,'version',v+1,'carga',c);
end $$;

revoke all on function radar_private.route_norm(text),radar_private.carrier_id(text,text),radar_private.carrier_load_allowed(jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.radar_salvar_rota(text,text,bigint,jsonb) from public;
grant execute on function public.radar_salvar_rota(text,text,bigint,jsonb) to anon,authenticated;
