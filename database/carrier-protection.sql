CREATE OR REPLACE FUNCTION public.radar_gerenciar_usuario_transportadora(p_module_session_token text, p_action text, p_login text, p_nome text, p_senha_hash text, p_transportadora_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sessao record;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_login text := lower(trim(coalesce(p_login,'')));
  v_nome text := trim(coalesce(p_nome,''));
  v_carrier text := trim(coalesce(p_transportadora_id,''));
  v_exists boolean;
begin
  select * into v_sessao
    from radar_private.identity(p_module_session_token)
   limit 1;

  if not found or v_sessao.company_id is null then
    raise exception 'SESSAO_INVALIDA_OU_EXPIRADA' using errcode = '28000';
  end if;

  if upper(coalesce(v_sessao.perfil,'')) not in ('MASTER','GESTOR') then
    raise exception 'PERMISSAO_NEGADA_GESTAO_TRANSPORTADORAS' using errcode = '42501';
  end if;

  if v_login = lower(v_sessao.login) or exists(select 1 from public.usuarios u where u.company_id=v_sessao.company_id and lower(u.login)=v_login and upper(u.role) in ('MASTER','SUPER_ADMIN','GESTOR')) or exists(select 1 from public.module_users mu where mu.company_id=v_sessao.company_id and lower(mu.login)=v_login and mu.modulo='radarlogistico' and upper(mu.perfil) not in ('TRANSPORTADORA','CARRIER')) then raise exception 'Usuário protegido ou colaborador interno' using errcode='42501';end if;
  if v_login = '' then
    raise exception 'LOGIN_OBRIGATORIO' using errcode = '22023';
  end if;

  if v_action not in ('CRIAR','ATUALIZAR','INATIVAR') then
    raise exception 'ACAO_INVALIDA' using errcode = '22023';
  end if;

  select exists(
    select 1 from public.usuarios
     where company_id = v_sessao.company_id
       and lower(login) = v_login
  ) into v_exists;

  if v_action = 'INATIVAR' then
    if not v_exists then
      raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0002';
    end if;



    update public.module_users
       set ativo = false
     where company_id = v_sessao.company_id
       and lower(login) = v_login
       and modulo = 'radarlogistico';

    update public.radar_transportadora_vinculos
       set updated_at = now()
     where company_id = v_sessao.company_id
       and lower(login) = v_login;

    update public.module_sessions set revoked_at=now() where company_id=v_sessao.company_id and lower(login)=v_login and modulo='radarlogistico' and revoked_at is null;
    return jsonb_build_object('ok', true, 'message', 'Usuário inativado.');
  end if;

  if v_nome = '' or v_carrier = '' then
    raise exception 'NOME_E_TRANSPORTADORA_OBRIGATORIOS' using errcode = '22023';
  end if;

  if v_action = 'CRIAR' and (p_senha_hash is null or length(p_senha_hash) <> 64) then
    raise exception 'HASH_SENHA_INVALIDO' using errcode = '22023';
  end if;

  if p_senha_hash is not null and length(p_senha_hash) <> 64 then
    raise exception 'HASH_SENHA_INVALIDO' using errcode = '22023';
  end if;

  if v_action = 'CRIAR' and v_exists then
    raise exception 'LOGIN_JA_EXISTE_NA_EMPRESA' using errcode = '23505';
  end if;

  if v_action = 'ATUALIZAR' and not v_exists then
    raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if v_action = 'CRIAR' then
    insert into public.usuarios(company_id, login, nome, senha_hash, role, ativo)
    values (v_sessao.company_id, v_login, v_nome, p_senha_hash, 'USUARIO', true);
  else
    update public.usuarios
       set nome = v_nome,
           role = 'USUARIO',
           senha_hash = coalesce(p_senha_hash, senha_hash),
           ativo = true
     where company_id = v_sessao.company_id
       and lower(login) = v_login;
  end if;

  if exists (
    select 1 from public.module_users
     where company_id = v_sessao.company_id
       and lower(login) = v_login
       and modulo = 'radarlogistico'
  ) then
    update public.module_users
       set perfil = 'TRANSPORTADORA', ativo = true
     where company_id = v_sessao.company_id
       and lower(login) = v_login
       and modulo = 'radarlogistico';
  else
    insert into public.module_users(company_id, modulo, login, perfil, ativo)
    values (v_sessao.company_id, 'radarlogistico', v_login, 'TRANSPORTADORA', true);
  end if;

  insert into public.radar_transportadora_vinculos(
    company_id, login, transportadora_id, created_by, created_at, updated_at
  ) values (
    v_sessao.company_id, v_login, v_carrier, v_sessao.login, now(), now()
  )
  on conflict (company_id, login) do update
    set transportadora_id = excluded.transportadora_id,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'login', v_login,
    'transportadora_id', v_carrier,
    'message', 'Usuário e vínculo salvos.'
  );
end;
$function$
;