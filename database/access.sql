
create schema if not exists radar_private;
revoke all on schema radar_private from public;grant usage on schema radar_private to anon,authenticated;

create function radar_private.identity(p_token text) returns table(company_id text,login text,modulo text,nome text,perfil text) language plpgsql security definer set search_path='' as $$
begin
 return query select ms.company_id,u.login,ms.modulo,u.nome,
 case when upper(mu.perfil) in ('MASTER','SUPER_ADMIN') and upper(u.role) in ('MASTER','SUPER_ADMIN') then 'MASTER'
 when upper(mu.perfil) in ('GESTOR','LIDERANCA','ADMIN_EMPRESA') then 'GESTOR'
 when upper(mu.perfil) in ('VISUALIZADOR','CONSULTA','LEITURA','VIEWER') then 'VISUALIZADOR'
 when upper(mu.perfil) in ('EXECUTOR','USUARIO','OPERADOR') then 'EXECUTOR'
 else 'SEM_ACESSO' end
 from public.module_sessions ms join public.usuarios u on u.company_id=ms.company_id and lower(u.login)=lower(ms.login)
 join public.module_users mu on mu.company_id=ms.company_id and lower(mu.login)=lower(ms.login) and mu.modulo=ms.modulo
 where ms.token=p_token and ms.modulo='radarlogistico' and ms.expires_at>now() and ms.revoked_at is null and u.ativo and mu.ativo
 and public.usuario_autorizado_modulo(ms.company_id,u.login,ms.modulo)
 and exists(select 1 from public.licencas l where l.company_id=ms.company_id and upper(l.status)='ATIVA' and (l.validade is null or l.validade>=current_date));
 if not found then raise exception 'Sessão do Radar inválida, expirada ou bloqueada' using errcode='28000';end if;
end $$;

create function public.radar_sessao(p_token text) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(s) from radar_private.identity(p_token) s$$;

create function public.radar_validar_handoff(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h record;v_token text;s record;
begin
 select * into h from public.module_access_tokens where token=p_token and modulo='radarlogistico' and used_at is null and expires_at>now() for update;
 if not found then raise exception 'Acesso do Ecossistema inválido, expirado ou já utilizado' using errcode='28000';end if;
 if not exists(select 1 from public.ecosystem_sessions es where es.token=h.ecosystem_session_token and es.company_id=h.company_id and lower(es.login)=lower(h.login) and es.revoked_at is null and es.expires_at>now()) then raise exception 'Entre novamente pelo Ecossistema' using errcode='28000';end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.module_sessions(token,company_id,login,modulo,expires_at) values(v_token,h.company_id,h.login,'radarlogistico',now()+interval '12 hours');
 select * into s from radar_private.identity(v_token);
 if s.perfil='SEM_ACESSO' then raise exception 'Perfil não autorizado' using errcode='42501';end if;
 update public.module_access_tokens set used_at=now() where token=p_token;
 return to_jsonb(s)||jsonb_build_object('module_session_token',v_token,'ok',true);
end $$;

create function radar_private.assert_manager(p_token text,p_login text default null) returns void language plpgsql security definer set search_path='' as $$
declare s record;u record;mp text;
begin
 select * into s from radar_private.identity(p_token);
 if s.perfil not in ('MASTER','GESTOR') then raise exception 'Somente MASTER e Gestor gerenciam usuários' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(s.company_id||':radar-users',0));
 if p_login is null then return;end if;
 select * into u from public.usuarios where company_id=s.company_id and lower(login)=lower(trim(p_login)) for update;
 select upper(perfil) into mp from public.module_users where company_id=s.company_id and lower(login)=lower(trim(p_login)) and modulo='radarlogistico' for update;
 if lower(s.login)=lower(trim(p_login)) or upper(u.role) in ('MASTER','SUPER_ADMIN') or mp in ('MASTER','SUPER_ADMIN') then raise exception 'MASTER e o próprio acesso são protegidos' using errcode='42501';end if;
 if s.perfil='GESTOR' and (upper(u.role)='GESTOR' or mp in ('GESTOR','LIDERANCA','ADMIN_EMPRESA')) then raise exception 'Gestores são gerenciados pelo MASTER' using errcode='42501';end if;
 if mp in ('TRANSPORTADORA','CARRIER') then raise exception 'Use a gestão específica de transportadoras' using errcode='42501';end if;
end $$;

create function public.radar_listar_usuarios(p_module_session_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;r jsonb;
begin
 perform radar_private.assert_manager(p_module_session_token);select * into s from radar_private.identity(p_module_session_token);
 select coalesce(jsonb_agg(jsonb_build_object('login',u.login,'nome',u.nome,'perfil',case when upper(u.role) in ('MASTER','SUPER_ADMIN') then 'MASTER' when upper(mu.perfil) in ('GESTOR','LIDERANCA','ADMIN_EMPRESA') then 'GESTOR' when upper(mu.perfil) in ('VISUALIZADOR','CONSULTA','LEITURA','VIEWER') then 'VISUALIZADOR' else coalesce(mu.perfil,'EXECUTOR') end,'ativo',u.ativo and coalesce(mu.ativo,false),'vinculado',mu.id is not null,'gerenciavel',lower(u.login)<>lower(s.login) and upper(u.role) not in ('MASTER','SUPER_ADMIN') and coalesce(upper(mu.perfil),'') not in ('MASTER','SUPER_ADMIN','TRANSPORTADORA','CARRIER') and (s.perfil='MASTER' or (upper(u.role)<>'GESTOR' and coalesce(upper(mu.perfil),'') not in ('GESTOR','LIDERANCA','ADMIN_EMPRESA')))) order by u.nome,u.login),'[]') into r
 from public.usuarios u left join public.module_users mu on mu.company_id=u.company_id and lower(mu.login)=lower(u.login) and mu.modulo='radarlogistico' where u.company_id=s.company_id;
 return jsonb_build_object('ok',true,'usuarios',r);
end $$;

create function public.radar_gerenciar_usuario(p_module_session_token text,p_action text,p_login text,p_nome text,p_perfil text,p_senha_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;u record;v_login text:=lower(trim(p_login));a text:=upper(p_action);
begin
 select * into s from radar_private.identity(p_module_session_token);
 perform radar_private.assert_manager(p_module_session_token,v_login);
 if v_login is null or v_login !~ '^[a-z0-9][a-z0-9._-]{2,63}$' or a is null or a not in ('CRIAR','ATUALIZAR','INATIVAR','ATIVAR') then raise exception 'Login ou ação inválidos' using errcode='22023';end if;
 select * into u from public.usuarios where company_id=s.company_id and lower(login)=v_login;
 if a in ('INATIVAR','ATIVAR') then
  update public.module_users set ativo=(a='ATIVAR'),updated_at=now() where company_id=s.company_id and lower(login)=v_login and modulo='radarlogistico';
  if not found then raise exception 'Usuário não vinculado ao Radar';end if;
 else
  if p_perfil is null or p_perfil not in ('GESTOR','EXECUTOR','VISUALIZADOR') or (s.perfil<>'MASTER' and p_perfil='GESTOR') then raise exception 'Perfil acima da sua hierarquia' using errcode='42501';end if;
  if length(trim(coalesce(p_nome,'')))<2 or length(p_nome)>150 or (p_senha_hash is not null and p_senha_hash !~ '^[a-f0-9]{64}$') then raise exception 'Nome ou senha inválidos' using errcode='22023';end if;
  if a='CRIAR' then
   if u.id is not null then raise exception 'Login já cadastrado. Utilize atualizar/vincular.' using errcode='23505';end if;
   if p_senha_hash is null then raise exception 'Informe a senha inicial';end if;
   insert into public.usuarios(company_id,login,nome,senha_hash,role,ativo) values(s.company_id,v_login,trim(p_nome),p_senha_hash,'USUARIO',true);
  else
   if u.id is null or not u.ativo then raise exception 'Usuário inexistente ou inativo na plataforma';end if;
   update public.usuarios set nome=trim(p_nome),senha_hash=coalesce(p_senha_hash,senha_hash),updated_at=now() where id=u.id;
  end if;
  insert into public.module_users(company_id,modulo,login,perfil,ativo,created_by) values(s.company_id,'radarlogistico',v_login,p_perfil,true,s.login)
  on conflict(company_id,modulo,login) do update set perfil=excluded.perfil,ativo=true,updated_at=now();
 end if;
 update public.module_sessions set revoked_at=now() where company_id=s.company_id and lower(login)=v_login and (p_senha_hash is not null or modulo='radarlogistico') and revoked_at is null;
 update public.module_access_tokens set used_at=coalesce(used_at,now()) where company_id=s.company_id and lower(login)=v_login and (p_senha_hash is not null or modulo='radarlogistico');
 if p_senha_hash is not null then update public.ecosystem_sessions set revoked_at=now() where company_id=s.company_id and lower(login)=v_login and revoked_at is null;end if;
 insert into public.logs(tipo,detalhe,company_id) values('RADAR_USUARIO',s.login||': '||a||' usuário '||v_login||', perfil '||coalesce(p_perfil,''),s.company_id);
 return jsonb_build_object('ok',true);
end $$;
revoke all on all functions in schema radar_private from public;
revoke all on function public.radar_sessao(text),public.radar_validar_handoff(text),public.radar_listar_usuarios(text),public.radar_gerenciar_usuario(text,text,text,text,text,text) from public;
grant execute on function public.radar_sessao(text),public.radar_validar_handoff(text),public.radar_listar_usuarios(text),public.radar_gerenciar_usuario(text,text,text,text,text,text) to anon,authenticated;
CREATE OR REPLACE FUNCTION public.radar_carregar_dados(p_module_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sess record;
    v_payload jsonb;
    v_version bigint;
BEGIN
    SELECT *
      INTO v_sess
      FROM radar_private.identity(p_module_session_token)
      LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessão do Radar inválida, expirada ou sem autorização'
            USING ERRCODE = '28000';
    END IF;

    IF v_sess.perfil NOT IN ('MASTER','GESTOR','EXECUTOR','VISUALIZADOR') THEN RAISE EXCEPTION 'Perfil sem acesso aos dados internos' USING ERRCODE='42501'; END IF;
    SELECT s.payload, s.version
      INTO v_payload, v_version
      FROM public.radar_logistico_store s
     WHERE s.company_id = v_sess.company_id
       AND s.module_id = 'radarlogistico';

    RETURN jsonb_build_object(
        'ok', true,
        'company_id', v_sess.company_id,
        'login', v_sess.login,
        'nome', v_sess.nome,
        'perfil', v_sess.perfil,
        'version', COALESCE(v_version, 0),
        'payload', COALESCE(v_payload, '{}'::jsonb)
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.radar_salvar_dados(p_module_session_token text, p_expected_version bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sess record;
    v_new_version bigint;
BEGIN
    SELECT *
      INTO v_sess
      FROM radar_private.identity(p_module_session_token)
      LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessão do Radar inválida, expirada ou sem autorização'
            USING ERRCODE = '28000';
    END IF;

    IF v_sess.perfil NOT IN ('MASTER','GESTOR','EXECUTOR') THEN RAISE EXCEPTION 'Perfil somente consulta ou sem autorização' USING ERRCODE='42501'; END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Payload do Radar deve ser um objeto JSON'
            USING ERRCODE = '22023';
    END IF;

    IF p_expected_version IS NULL OR p_expected_version < 0 THEN
        RAISE EXCEPTION 'Versão esperada inválida'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.radar_logistico_store s
         WHERE s.company_id = v_sess.company_id
           AND s.module_id = 'radarlogistico'
    ) AND p_expected_version <> 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'conflict', true,
            'expected_version', p_expected_version,
            'message', 'A base ainda não existe no servidor. Recarregue os dados antes de gravar.'
        );
    END IF;

    INSERT INTO public.radar_logistico_store
        (company_id, module_id, payload, version, updated_at, updated_by)
    VALUES
        (v_sess.company_id, 'radarlogistico', p_payload, 1, now(), v_sess.login)
    ON CONFLICT (company_id, module_id)
    DO UPDATE SET
        payload = EXCLUDED.payload,
        version = public.radar_logistico_store.version + 1,
        updated_at = now(),
        updated_by = v_sess.login
    WHERE public.radar_logistico_store.version = p_expected_version
    RETURNING version INTO v_new_version;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'conflict', true,
            'expected_version', p_expected_version,
            'message', 'Os dados foram alterados por outro usuário. Recarregue antes de gravar novamente.'
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'version', v_new_version,
        'updated_at', now(),
        'updated_by', v_sess.login
    );
END;
$function$
;