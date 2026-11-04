-- Individual invoice execution; no historical load status is copied into invoice delivery.
create or replace function radar_private.fiscal_delivery_docs(p jsonb,c jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(d),'[]') from (
 select d from jsonb_array_elements(case when jsonb_typeof(c->'documentos_fiscais')='array' then c->'documentos_fiscais' else '[]'::jsonb end) d where btrim(coalesce(d->>'numero',''))<>''
 union all
 select jsonb_build_object('numero',n->>'numero','serie','','emitente',coalesce(n->>'remetente',''),'destinatario',n->>'cliente')
 from jsonb_array_elements(coalesce(p->'nfs','[]')) n
 where jsonb_typeof(c->'documentos_fiscais') is distinct from 'array' and (c->'nf_ids') ? (n->>'id') and n->>'faturada'='true' and coalesce(n->>'numero','')<>'' and coalesce(n->>'xml_conteudo','')<>''
 ) x
$$;
create or replace function radar_private.delivery_doc_key(d jsonb) returns text
language sql immutable set search_path='' as $$
 select case when coalesce(d->>'chave','')<>'' then 'chave:'||(d->>'chave') else 'nf:'||coalesce(d->>'emitente','')||'|'||coalesce(d->>'serie','')||'|'||coalesce(d->>'numero','') end
$$;
create or replace function public.radar_atualizar_entrega_nf(p_module_session_token text,p_carga_id text,p_expected_version bigint,p_evento jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;p jsonb;v bigint;c jsonb;docs jsonb;d jsonb;key text;st text;obs text;at_time timestamptz;ev jsonb;deliveries jsonb;position jsonb;stop text;all_count int;done_count int;late_count int;max_delivery timestamptz;aggregate_status text;loc text;lat numeric;lng numeric;
begin
 select * into s from radar_private.identity(p_module_session_token);
 if s.perfil not in ('MASTER','GESTOR','EXECUTOR','TRANSPORTADORA') then raise exception 'Perfil somente consulta' using errcode='42501';end if;
 select payload,version into p,v from public.radar_logistico_store where company_id=s.company_id and module_id='radarlogistico' for update;
 select x into c from jsonb_array_elements(coalesce(p->'cargas','[]')) x where x->>'id'=p_carga_id;
 if c is null or c->>'faturamento_concluido' is distinct from 'true' or c->>'status'='CANCELADA' then raise exception 'Carga indisponível para execução' using errcode='42501';end if;
 if s.perfil='TRANSPORTADORA' and c->>'transportadora_id' is distinct from radar_private.carrier_id(s.company_id,s.login) then raise exception 'Carga fora da sua transportadora' using errcode='42501';end if;
 if p_expected_version is null or v<>p_expected_version then return jsonb_build_object('ok',false,'conflict',true,'message','A base mudou. Recarregue antes de atualizar a entrega.');end if;
 if jsonb_typeof(p_evento) is distinct from 'object' or octet_length(p_evento::text)>12000 then raise exception 'Evento inválido';end if;
 key:=p_evento->>'nf_key';st:=p_evento->>'status';obs:=btrim(coalesce(p_evento->>'observacao',''));
 docs:=radar_private.fiscal_delivery_docs(p,c);
 select x into d from jsonb_array_elements(docs) x where radar_private.delivery_doc_key(x)=key limit 1;
 if d is null then raise exception 'NF não vinculada à carga' using errcode='22023';end if;
 if st is null or st not in ('LIBERADA PARA COLETA','EM SEPARAÇÃO','EM CONFERÊNCIA','AGUARDANDO CARREGAMENTO','EM PROCESSO DE COLETA','CARGA EM ROTA','RISCO DE ATRASO','ATRASADO','SINISTRO','ENTREGA REALIZADA','ENTREGA REALIZADA COM INSUCESSO','ENTREGUE COM ATRASO','OUTROS') then raise exception 'Status inválido';end if;
 if st in ('SINISTRO','OUTROS','ENTREGA REALIZADA COM INSUCESSO') and obs='' then raise exception 'Informe a ocorrência';end if;
 if length(obs)>3000 then raise exception 'Ocorrência muito extensa';end if;
 at_time:=coalesce(nullif(p_evento->>'efetiva_at','')::timestamptz,now());
 if at_time>now()+interval '5 minutes' then raise exception 'O evento não pode estar no futuro';end if;
 stop:=btrim(coalesce(p_evento->>'parada',''));
 if stop='' then raise exception 'Selecione o ponto de entrega da NF';end if;
 if stop<>'' and not exists(select 1 from jsonb_array_elements(coalesce(p->'nfs','[]')) n where (c->'nf_ids') ? (n->>'id') and radar_private.route_norm((n->>'cidade')||'/'||(n->>'uf_destino'))=radar_private.route_norm(stop)) then raise exception 'Selecione um destino da carga';end if;
 if st in ('ENTREGA REALIZADA','ENTREGUE COM ATRASO') and c->>'eta_max' ~ '^\d{4}-\d{2}-\d{2}$' then
 st:=case when (at_time at time zone 'America/Sao_Paulo')::date>(c->>'eta_max')::date then 'ENTREGUE COM ATRASO' else 'ENTREGA REALIZADA' end;
 end if;
 ev:=jsonb_build_object('nf_key',key,'numero',d->>'numero','serie',coalesce(d->>'serie',''),'status',st,'observacao',obs,'efetiva_at',at_time,'registrado_at',now(),'registrado_por',s.login,'parada',stop);
 deliveries:=coalesce(c->'entregas_nf','{}')||jsonb_build_object(key,ev);
 c:=c||jsonb_build_object('entregas_nf',deliveries,'entregas_nf_historico',coalesce(c->'entregas_nf_historico','[]')||jsonb_build_array(ev));
 if p_evento ? 'posicao' and p_evento->'posicao'<>'null'::jsonb then
 position:=p_evento->'posicao';loc:=btrim(coalesce(position->>'local',''));
 if loc='' or length(loc)>300 then raise exception 'Informe o local do veículo';end if;
 if jsonb_typeof(position->'latitude') is distinct from 'number' or jsonb_typeof(position->'longitude') is distinct from 'number' then raise exception 'Informe as coordenadas do veículo';end if;
 lat:=(position->>'latitude')::numeric;lng:=(position->>'longitude')::numeric;
 if abs(lat)>90 or abs(lng)>180 then raise exception 'Coordenadas inválidas';end if;
 position:=jsonb_build_object('local',loc,'latitude',lat,'longitude',lng,'informado_at',at_time,'registrado_at',now(),'informado_por',s.login,'origem','Informado pela transportadora / executor');
 c:=c||jsonb_build_object('posicao_veiculo',position,'posicoes_veiculo_historico',coalesce(c->'posicoes_veiculo_historico','[]')||jsonb_build_array(position));
 end if;
 select count(distinct radar_private.delivery_doc_key(x)),count(distinct radar_private.delivery_doc_key(x)) filter(where deliveries->radar_private.delivery_doc_key(x)->>'status' in ('ENTREGA REALIZADA','ENTREGUE COM ATRASO')),count(distinct radar_private.delivery_doc_key(x)) filter(where deliveries->radar_private.delivery_doc_key(x)->>'status'='ENTREGUE COM ATRASO'),max((deliveries->radar_private.delivery_doc_key(x)->>'efetiva_at')::timestamptz) filter(where deliveries->radar_private.delivery_doc_key(x)->>'status' in ('ENTREGA REALIZADA','ENTREGUE COM ATRASO')) into all_count,done_count,late_count,max_delivery from jsonb_array_elements(docs) x;
 aggregate_status:=case when done_count=all_count and all_count>0 then case when late_count>0 then 'ENTREGUE COM ATRASO' else 'ENTREGA REALIZADA' end when done_count>0 then 'ENTREGA PARCIAL' else st end;
 -- A failed attempt never concludes an entire multi-invoice load.
 if done_count<all_count and aggregate_status in ('ENTREGA REALIZADA','ENTREGUE COM ATRASO','ENTREGA REALIZADA COM INSUCESSO') then aggregate_status:='EM ENTREGA / PENDÊNCIAS';end if;
 c:=c||jsonb_build_object('status',aggregate_status,'status_at',now(),'status_obs','NF '||coalesce(d->>'numero','')||': '||st||case when obs<>'' then ' · '||obs else '' end,'entrega_at',case when done_count=all_count then to_jsonb(max_delivery) else 'null'::jsonb end,'entregas_resumo',jsonb_build_object('total',all_count,'entregues',done_count));
 c:=c||jsonb_build_object('status_historico',coalesce(c->'status_historico','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'status',aggregate_status,'registrado_at',now(),'observacao',c->>'status_obs','entrega_efetiva_at',c->'entrega_at')));
 p:=jsonb_set(p,'{cargas}',(select jsonb_agg(case when x->>'id'=p_carga_id then c else x end order by ord) from jsonb_array_elements(p->'cargas') with ordinality z(x,ord)));
 p:=jsonb_set(p,'{ocorrencias}',coalesce(p->'ocorrencias','[]')||jsonb_build_array(ev||jsonb_build_object('id',gen_random_uuid(),'carga_id',p_carga_id,'at',now())));
 p:=jsonb_set(p,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'action','ENTREGA_NF','obj','#'||(c->>'numero'),'detail',s.login||': NF '||(d->>'numero')||' · '||st))||coalesce(p->'audit','[]'));
 update public.radar_logistico_store set payload=p,version=v+1,updated_at=now(),updated_by=s.login where company_id=s.company_id and module_id='radarlogistico';
 return public.radar_carregar_dados(p_module_session_token);
end $$;
revoke all on function radar_private.fiscal_delivery_docs(jsonb,jsonb),radar_private.delivery_doc_key(jsonb) from public,anon,authenticated;
revoke all on function public.radar_atualizar_entrega_nf(text,text,bigint,jsonb) from public;
grant execute on function public.radar_atualizar_entrega_nf(text,text,bigint,jsonb) to anon,authenticated;
