-- =====================================================================
-- 08_ajustes_v1_3.sql  ·  Ajustes de la versión 1.3 (re-ejecutable)
-- Requiere 01..03. Orden recomendado en una base nueva: 01, 02, 03, 08, 04.
-- Si vuelves a ejecutar 02_funciones.sql, ejecuta DESPUÉS este archivo
-- (02 recrea la firma antigua de fn_registrar_cliente y la versión sin bitácora de evaluar).
--  a) Parámetros: liberacion_cupo = AL_CANCELAR (D1), método y mora (D4)
--  b) clientes.ruc y clientes.razon_social (opcionales)
--  c) fn_registrar_cliente con p_ruc y p_razon_social (NUEVA FIRMA: se elimina la anterior)
--  d) fn_evaluar_prestamo registra EVALUAR_PRESTAMO en la bitácora (HU-16)
--  e) La bitácora no se puede editar ni borrar (sin activar RLS)
-- =====================================================================

-- ---------- a) Parámetros ----------
update parametros set valor = 'AL_CANCELAR',
       nota = 'AL_CANCELAR (vigente: el préstamo se paga completo antes de liberar cupo) o CAPITAL_AMORTIZADO'
 where clave = 'liberacion_cupo';
update parametros set valor = 'COMPUESTA'         where clave = 'mora_modalidad';
update parametros set valor = 'CAPITAL_CONSTANTE' where clave = 'metodo_cuota';
update parametros set valor = ''                  where clave = 'fecha_referencia';

-- ---------- b) Columnas opcionales de RUC ----------
alter table clientes add column if not exists ruc text
  constraint clientes_ruc_check check (ruc ~ '^[0-9]{11}$');
alter table clientes add column if not exists razon_social text;
create index if not exists ix_clientes_ruc on clientes (ruc) where ruc is not null;

-- ---------- c) fn_registrar_cliente con RUC opcional ----------
-- Con dos parámetros más (con default), la firma de 9 argumentos quedaría ambigua: se elimina.
drop function if exists fn_registrar_cliente(text,text,text,text,text,text,boolean,uuid,date);

create or replace function fn_registrar_cliente(
  p_tipo_documento text, p_dni text, p_nombres text, p_apellidos text,
  p_telefono text, p_direccion text, p_verificado boolean, p_trabajador uuid,
  p_dni_caducidad date,
  p_ruc text default null, p_razon_social text default null)
returns uuid language plpgsql as $$
declare v_t trabajadores%rowtype; v_id uuid; v_existe uuid;
        v_ruc text := nullif(trim(p_ruc), '');
        v_rs  text := nullif(upper(regexp_replace(trim(coalesce(p_razon_social,'')), '\s+', ' ', 'g')), '');
begin
  select * into v_t from trabajadores where id = p_trabajador and activo;
  if not found then raise exception 'Trabajador no válido o inactivo.'; end if;

  if upper(coalesce(p_tipo_documento,'')) <> 'DNI' then
    raise exception 'No se otorgan préstamos a clientes identificados solo con carnet de extranjería o pasaporte.';
  end if;
  if p_dni is null or p_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe tener exactamente 8 dígitos numéricos.';
  end if;
  if p_dni_caducidad is null then
    raise exception 'Debe indicar la fecha de caducidad del DNI.';
  end if;
  if p_dni_caducidad < fn_fecha_hoy() then
    raise exception 'El DNI no está vigente (caducó el %).', to_char(p_dni_caducidad, 'DD/MM/YYYY');
  end if;

  -- RUC opcional: el cliente se sigue identificando por DNI (el RUC no sustituye al DNI)
  if v_ruc is not null then
    if v_ruc !~ '^[0-9]{11}$' then
      raise exception 'El RUC debe tener exactamente 11 dígitos numéricos.';
    end if;
    if v_ruc !~ '^(10|20)' then
      raise exception 'El RUC debe empezar con 10 (persona natural) o 20 (persona jurídica).';
    end if;
    if v_rs is null then
      raise exception 'Con RUC debe indicar la razón social.';
    end if;
  elsif v_rs is not null then
    raise exception 'La razón social solo se registra junto con el RUC.';
  end if;

  select id into v_existe from clientes where dni = p_dni;
  if found then raise exception 'Ya existe un cliente registrado con el DNI % (id %).', p_dni, v_existe; end if;

  insert into clientes (dni, dni_caducidad, nombres, apellidos, telefono, direccion, nombre_verificado,
                        ruc, razon_social, sede_registro_id, creado_por)
  values (p_dni, p_dni_caducidad,
          upper(regexp_replace(trim(p_nombres),   '\s+', ' ', 'g')),
          upper(regexp_replace(trim(p_apellidos), '\s+', ' ', 'g')),
          trim(p_telefono), nullif(trim(p_direccion), ''), coalesce(p_verificado, false),
          v_ruc, v_rs, v_t.sede_id, v_t.id)
  returning id into v_id;

  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id, 'CREAR_CLIENTE', 'cliente', v_id,
          jsonb_build_object('dni', p_dni, 'verificado', coalesce(p_verificado,false), 'ruc', v_ruc));
  return v_id;
end $$;

-- ---------- d) Evaluar deja rastro en la bitácora ----------
-- La lógica pasa a fn_evaluar_prestamo_calc (sin efectos). fn_evaluar_prestamo (contrato) la llama y
-- registra la consulta; fn_aprobar_prestamo usa la _calc para no duplicar filas al aprobar.
-- La trabajadora se toma de la sesión (JWT); sin sesión (SQL Editor) el registro queda sin trabajadora.
create or replace function fn_evaluar_prestamo_calc(p_cliente uuid, p_monto numeric, p_plazo int)
returns jsonb language plpgsql as $$
declare
  v_cl clientes%rowtype;
  v_tope numeric := fn_param_num('tope_capital');
  v_vig numeric; v_disp numeric;
  v_mot text[] := '{}';
  v_pmin int := fn_param_num('plazo_min_meses')::int;
  v_pmax int := fn_param_num('plazo_max_meses')::int;
  v_venc date; v_primera numeric; v_total numeric; v_int numeric; v_fecha1 date;
begin
  select * into v_cl from clientes where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado.'; end if;

  perform fn_actualizar_estados(p_cliente);
  select * into v_cl from clientes where id = p_cliente;

  v_vig  := fn_capital_vigente(p_cliente);
  v_disp := greatest(v_tope - v_vig, 0);

  if v_cl.estado = 'MOROSO' then
    select min(c.fecha_vencimiento) into v_venc
      from cuotas c join prestamos p on p.id = c.prestamo_id
     where p.cliente_id = p_cliente and c.estado = 'VENCIDA';
    v_mot := v_mot || format('El cliente está MOROSO (cuota vencida el %s, %s días de atraso): no se otorgan nuevos préstamos aunque tenga saldo disponible.', to_char(v_venc, 'DD/MM/YYYY'), fn_fecha_hoy() - v_venc);
  elsif v_cl.estado = 'EXTRAJUDICIAL' then
    v_mot := v_mot || 'El cliente está EXTRAJUDICIAL: su cobranza fue derivada a una empresa externa y no accede a nuevos créditos.'::text;
  end if;

  if v_cl.dni_caducidad < fn_fecha_hoy() then
    v_mot := v_mot || format('El DNI del cliente no está vigente (caducó el %s).', to_char(v_cl.dni_caducidad, 'DD/MM/YYYY'));
  end if;

  if p_monto is null or p_monto <= 0 then
    v_mot := v_mot || 'El monto debe ser mayor a 0.'::text;
  elsif p_monto <> round(p_monto, 2) then
    v_mot := v_mot || 'El monto debe tener como máximo 2 decimales.'::text;
  elsif p_monto > v_disp then
    v_mot := v_mot || format('El monto (S/ %s) supera el disponible del cliente. Capital vigente: S/ %s; tope: S/ %s; monto máximo que podría solicitar: S/ %s.',
                             to_char(p_monto,'FM999,990.00'), to_char(v_vig,'FM999,990.00'),
                             to_char(v_tope,'FM999,990.00'), to_char(v_disp,'FM999,990.00'));
  end if;

  if p_plazo is null or p_plazo < v_pmin or p_plazo > v_pmax then
    v_mot := v_mot || format('El plazo debe ser un número entero de %s a %s meses.', v_pmin, v_pmax);
  end if;

  if cardinality(v_mot) = 0 then
    select min(g.cuota) filter (where g.numero = 1), sum(g.cuota), sum(g.interes), min(g.fecha_vencimiento)
      into v_primera, v_total, v_int, v_fecha1
      from fn_generar_cronograma(p_monto, p_plazo, fn_fecha_hoy()) g;
  end if;

  return jsonb_build_object(
    'aprobable',        cardinality(v_mot) = 0,
    'motivos',          to_jsonb(v_mot),
    'estado_cliente',   v_cl.estado,
    'capital_vigente',  v_vig,
    'disponible',       v_disp,
    'monto_maximo',     case when v_cl.estado = 'AL_DIA' then v_disp else 0 end,
    'primera_cuota',    v_primera,
    'total_a_pagar',    v_total,
    'total_intereses',  v_int,
    'primer_vencimiento', v_fecha1);
end $$;

create or replace function fn_evaluar_prestamo(p_cliente uuid, p_monto numeric, p_plazo int)
returns jsonb language plpgsql as $$
declare
  v_r jsonb := fn_evaluar_prestamo_calc(p_cliente, p_monto, p_plazo);
  v_t trabajadores%rowtype;
  v_sub text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
begin
  if v_sub is not null then
    select * into v_t from trabajadores where auth_user_id = v_sub::uuid;
  end if;
  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id, 'EVALUAR_PRESTAMO', 'cliente', p_cliente,
          jsonb_build_object('monto', p_monto, 'plazo', p_plazo,
                             'aprobable', v_r->'aprobable', 'motivos', v_r->'motivos'));
  return v_r;
end $$;

-- fn_aprobar_prestamo: igual que en 02, pero revalida con la versión sin bitácora
create or replace function fn_aprobar_prestamo(
  p_cliente uuid, p_monto numeric, p_plazo int, p_trabajador uuid, p_cliente_conforme boolean)
returns uuid language plpgsql as $$
declare v_t trabajadores%rowtype; v_eval jsonb; v_id uuid; v_hoy date := fn_fecha_hoy();
begin
  -- RN-26: una vez aprobado no hay vuelta atrás; el trabajador confirma solo con el cliente conforme y firmado
  if p_cliente_conforme is distinct from true then
    raise exception 'Debe confirmar que el cliente está conforme y firmó el contrato: una vez aprobado, el préstamo no puede anularse.';
  end if;

  select * into v_t from trabajadores where id = p_trabajador and activo;
  if not found then raise exception 'Trabajador no válido o inactivo.'; end if;

  perform 1 from clientes where id = p_cliente for update;
  if not found then raise exception 'Cliente no encontrado.'; end if;

  v_eval := fn_evaluar_prestamo_calc(p_cliente, p_monto, p_plazo);
  if not (v_eval->>'aprobable')::boolean then
    raise exception 'Préstamo rechazado: %',
      (select string_agg(m, ' | ') from jsonb_array_elements_text(v_eval->'motivos') m);
  end if;

  insert into prestamos (cliente_id, sede_id, trabajador_id, monto, plazo_meses, tea, metodo_cuota, fecha_desembolso)
  values (p_cliente, v_t.sede_id, v_t.id, p_monto, p_plazo,
          fn_param_num('tea'), fn_param_txt('metodo_cuota'), v_hoy)
  returning id into v_id;

  insert into cuotas (prestamo_id, numero, fecha_vencimiento, cuota, capital, interes, saldo)
  select v_id, g.numero, g.fecha_vencimiento, g.cuota, g.capital, g.interes, g.saldo
    from fn_generar_cronograma(p_monto, p_plazo, v_hoy) g;

  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id, 'APROBAR_PRESTAMO', 'prestamo', v_id,
          jsonb_build_object('cliente_id', p_cliente, 'monto', p_monto, 'plazo', p_plazo, 'cliente_conforme', true));
  return v_id;
end $$;

-- ---------- e) Bitácora de solo lectura (HU-16 CA2) ----------
-- Nadie puede editar ni borrar filas (ni la app ni el SQL Editor). TRUNCATE (reinicio de 04) sigue permitido
-- para el dueño de la tabla; a los roles de la app se les quita el permiso.
-- NOTA: el INSERT directo desde la app NO se puede cerrar sin RLS o SECURITY DEFINER (las funciones
-- del contrato corren con los permisos de quien llama). Queda para el plan de RLS (infra/seguridad-rls).
create or replace function tg_bitacora_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'La bitácora no puede modificarse ni borrarse.';
end $$;
drop trigger if exists trg_bitacora_inmutable on bitacora;
create trigger trg_bitacora_inmutable before update or delete on bitacora
  for each row execute function tg_bitacora_inmutable();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke update, delete, truncate on bitacora from anon, authenticated;
  end if;
end $$;

-- Para que PostgREST vea la nueva firma:
notify pgrst, 'reload schema';
