create or replace function public.radar_listar_usuarios_transportadora(p_module_session_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ident record; users_json jsonb;
begin
 select * into ident from radar_private.identity(p_module_session_token);
 if not found or ident.perfil not in ('MASTER','GESTOR') then raise exception 'PERMISSAO_NEGADA_GESTAO_TRANSPORTADORAS' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('login',u.login,'nome',u.nome,'ativo',u.ativo,'transportadora_id',v.transportadora_id) order by u.nome,u.login),'[]'::jsonb) into users_json
 from public.radar_transportadora_vinculos v join public.usuarios u on u.company_id=v.company_id and lower(u.login)=lower(v.login)
 join public.module_users mu on mu.company_id=v.company_id and lower(mu.login)=lower(v.login) and mu.modulo='radarlogistico' and mu.ativo=true and upper(mu.perfil)='TRANSPORTADORA'
 where v.company_id=ident.company_id;
 return jsonb_build_object('ok',true,'usuarios',users_json);
end $$;
revoke all on function public.radar_listar_usuarios_transportadora(text) from public;
grant execute on function public.radar_listar_usuarios_transportadora(text) to anon,authenticated;