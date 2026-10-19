-- =====================================================================
-- 11_solicitudes_capital.sql  ·  Solicitudes de capital diario + vaciado y restauración de datos
-- Requiere 01..10. Re-ejecutable (idempotente). Se ejecuta UNA vez en Supabase.
--
--  A) Solicitudes de capital: cada trabajador pide al inicio de la jornada hasta S/ 50,000 por día
--     (en una o varias solicitudes). El administrador las aprueba o las rechaza.
--       tabla  solicitudes_capital              (solo lectura desde la app; se escribe por funciones)
--       fn_solicitar_capital(p_monto, p_comentario)         -> id        (trabajador)
--       fn_resolver_solicitud(p_solicitud, p_aprobar, p_comentario)     (administrador)
--       fn_resumen_capital_dia()                            -> 1 fila    (trabajador)
--     La identidad se toma de la sesión (auth.uid()), no de un parámetro enviado por el navegador.
--
--  B) Vaciar y restaurar datos (administrador, modo demostración):
--       sp_demo_vaciar()      borra clientes, préstamos, cuotas y solicitudes. CONSERVA trabajadores,
--                             sedes, parámetros y la bitácora. Antes guarda un respaldo.
--       sp_demo_restaurar()   devuelve el último respaldo (y guarda el estado actual: se puede deshacer).
--       fn_respaldo_demo_info() informa del último respaldo.
--       sp_demo_reiniciar()   (de 09) ahora también limpia solicitudes y guarda respaldo.
-- =====================================================================

-- ---------- Parámetro ----------
insert into parametros (clave, valor, nota) values
  ('limite_solicitud_diaria', '50000', 'Capital máximo que un trabajador puede solicitar por día (S/)')
on conflict (clave) do nothing;

-- ---------- Tabla de solicitudes ----------
create table if not exists solicitudes_capital (
  id                uuid primary key default gen_random_uuid(),
  trabajador_id     uuid not null references trabajadores(id),
  sede_id           int  not null references sedes(id),
  fecha             date not null,                                -- día de la jornada (fn_fecha_hoy)
  monto             numeric(12,2) not null check (monto > 0),
  estado            text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADA','RECHAZADA')),
  comentario        text,                                         -- del trabajador (opcional)
  creado_en         timestamptz not null default now(),
  resuelto_por      uuid references trabajadores(id),
  resuelto_en       timestamptz,
  comentario_admin  text,                                         -- del administrador (opcional)
  check ((estado = 'PENDIENTE') = (resuelto_por is null))
);
create index if not exists ix_solicitudes_trabajador_dia on solicitudes_capital (trabajador_id, fecha);
create index if not exists ix_solicitudes_estado on solicitudes_capital (estado, creado_en desc);

-- Una solicitud resuelta no se modifica, y nunca cambian sus datos de origen
create or replace function tg_solicitud_inmutable() returns trigger language plpgsql as $$
begin
  if old.estado <> 'PENDIENTE' then
    raise exception 'La solicitud ya fue % y no puede modificarse.', lower(old.estado);
  end if;
  if new.monto is distinct from old.monto or new.trabajador_id is distinct from old.trabajador_id
     or new.sede_id is distinct from old.sede_id or new.fecha is distinct from old.fecha
     or new.creado_en is distinct from old.creado_en then
    raise exception 'Los datos de una solicitud no pueden modificarse.';
  end if;
  return new;
end $$;
drop trigger if exists trg_solicitud_inmutable on solicitudes_capital;
create trigger trg_solicitud_inmutable before update on solicitudes_capital
  for each row execute function tg_solicitud_inmutable();

-- Seguridad de la tabla (solo ella; no se activa RLS en el resto): la app solo LEE.
--   * El administrador ve todas; el trabajador, solo las suyas.
--   * Nadie con la llave pública puede insertar, editar ni borrar: se hace con las funciones.
alter table solicitudes_capital enable row level security;
drop policy if exists solicitudes_lectura on solicitudes_capital;
create policy solicitudes_lectura on solicitudes_capital for select to authenticated
  using (exists (select 1 from trabajadores t
                  where t.auth_user_id = auth.uid() and t.activo
                    and (t.rol = 'ADMIN' or t.id = solicitudes_capital.trabajador_id)));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on solicitudes_capital from anon;
    revoke insert, update, delete, truncate on solicitudes_capital from authenticated;
  end if;
end $$;

-- ---------- Quién llama ----------
create or replace function fn_trabajador_actual() returns trabajadores
language sql stable security definer set search_path = public as $$
  select t.* from trabajadores t where t.auth_user_id = auth.uid() and t.activo limit 1
$$;

-- ---------- Solicitar capital (trabajador) ----------
create or replace function fn_solicitar_capital(p_monto numeric, p_comentario text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_t   trabajadores%rowtype;
  v_lim numeric := fn_param_num('limite_solicitud_diaria');
  v_hoy date := fn_fecha_hoy();
  v_pedido numeric; v_id uuid;
  v_com text := left(nullif(trim(coalesce(p_comentario, '')), ''), 200);
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null then
    raise exception 'Debes iniciar sesión como trabajador activo para solicitar capital.';
  end if;
  if v_t.rol <> 'TRABAJADOR' then
    raise exception 'Solo los trabajadores solicitan capital; el administrador gestiona las solicitudes.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;
  if p_monto <> round(p_monto, 2) then
    raise exception 'El monto debe tener como máximo 2 decimales.';
  end if;

  -- Evita que dos solicitudes simultáneas del mismo trabajador superen el límite
  perform pg_advisory_xact_lock(hashtext('solicitud_capital:' || v_t.id::text));

  select coalesce(sum(monto), 0) into v_pedido
    from solicitudes_capital
   where trabajador_id = v_t.id and fecha = v_hoy and estado in ('PENDIENTE', 'APROBADA');

  if v_pedido + p_monto > v_lim then
    raise exception 'La solicitud supera el límite diario de S/ %. Hoy ya solicitaste S/ %; puedes pedir hasta S/ % más.',
      to_char(v_lim, 'FM999,999,990.00'), to_char(v_pedido, 'FM999,999,990.00'),
      to_char(greatest(v_lim - v_pedido, 0), 'FM999,999,990.00');
  end if;

  insert into solicitudes_capital (trabajador_id, sede_id, fecha, monto, comentario)
  values (v_t.id, v_t.sede_id, v_hoy, p_monto, v_com)
  returning id into v_id;

  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id, 'SOLICITAR_CAPITAL', 'solicitud_capital', v_id,
          jsonb_build_object('monto', p_monto, 'fecha', v_hoy, 'solicitado_hoy', v_pedido + p_monto));
  return v_id;
end $$;

-- ---------- Aprobar o rechazar (administrador) ----------
create or replace function fn_resolver_solicitud(p_solicitud uuid, p_aprobar boolean, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_t trabajadores%rowtype; v_s solicitudes_capital%rowtype;
  v_com text := left(nullif(trim(coalesce(p_comentario, '')), ''), 200);
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null or v_t.rol <> 'ADMIN' then
    raise exception 'Solo un administrador activo puede aprobar o rechazar solicitudes.';
  end if;
  if p_aprobar is null then
    raise exception 'Indica si la solicitud se aprueba o se rechaza.';
  end if;

  select * into v_s from solicitudes_capital where id = p_solicitud for update;
  if not found then raise exception 'La solicitud no existe.'; end if;
  if v_s.estado <> 'PENDIENTE' then
    raise exception 'La solicitud ya fue % y no puede modificarse.', lower(v_s.estado);
  end if;

  update solicitudes_capital
     set estado = case when p_aprobar then 'APROBADA' else 'RECHAZADA' end,
         resuelto_por = v_t.id, resuelto_en = now(), comentario_admin = v_com
   where id = p_solicitud;

  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id,
          case when p_aprobar then 'APROBAR_SOLICITUD_CAPITAL' else 'RECHAZAR_SOLICITUD_CAPITAL' end,
          'solicitud_capital', p_solicitud,
          jsonb_build_object('monto', v_s.monto, 'solicitante', v_s.trabajador_id, 'fecha', v_s.fecha));
end $$;

-- ---------- Resumen del día del trabajador ----------
-- Solicitado = pendientes + aprobadas (las rechazadas liberan cupo). El saldo disponible es lo aprobado
-- menos lo desembolsado hoy en préstamos por ese trabajador (informativo: no bloquea la aprobación de préstamos).
create or replace function fn_resumen_capital_dia()
returns table (limite numeric, solicitado numeric, pendiente numeric, aprobado numeric, rechazado numeric,
               disponible_solicitar numeric, desembolsado numeric, saldo_disponible numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_t trabajadores%rowtype; v_hoy date := fn_fecha_hoy(); v_lim numeric := fn_param_num('limite_solicitud_diaria');
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null then
    raise exception 'Debes iniciar sesión como trabajador activo.';
  end if;
  return query
  select v_lim,
         coalesce(sum(s.monto) filter (where s.estado in ('PENDIENTE', 'APROBADA')), 0),
         coalesce(sum(s.monto) filter (where s.estado = 'PENDIENTE'), 0),
         coalesce(sum(s.monto) filter (where s.estado = 'APROBADA'), 0),
         coalesce(sum(s.monto) filter (where s.estado = 'RECHAZADA'), 0),
         greatest(v_lim - coalesce(sum(s.monto) filter (where s.estado in ('PENDIENTE', 'APROBADA')), 0), 0),
         (select coalesce(sum(p.monto), 0) from prestamos p
           where p.trabajador_id = v_t.id and p.fecha_desembolso = v_hoy),
         greatest(coalesce(sum(s.monto) filter (where s.estado = 'APROBADA'), 0)
                  - (select coalesce(sum(p.monto), 0) from prestamos p
                      where p.trabajador_id = v_t.id and p.fecha_desembolso = v_hoy), 0)
    from solicitudes_capital s
   where s.trabajador_id = v_t.id and s.fecha = v_hoy;
end $$;

-- =====================================================================
-- B) Respaldo, vaciado y restauración de datos
-- =====================================================================
create table if not exists respaldo_demo (
  id         bigserial primary key,
  creado_en  timestamptz not null default now(),
  creado_por uuid references trabajadores(id),
  origen     text not null check (origen in ('VACIAR', 'REINICIAR', 'RESTAURAR')),
  datos      jsonb not null
);
alter table respaldo_demo enable row level security;     -- sin políticas: solo las funciones lo tocan
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on respaldo_demo from anon, authenticated;
  end if;
end $$;

-- Guarda una copia de clientes, préstamos, cuotas y solicitudes. No guarda nada si no hay datos.
-- Conserva los 5 respaldos más recientes. Devuelve el id del respaldo (null si no había datos).
create or replace function fn_respaldo_crear(p_origen text, p_por uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from clientes) and not exists (select 1 from solicitudes_capital) then
    return null;
  end if;
  insert into respaldo_demo (creado_por, origen, datos)
  select p_por, p_origen, jsonb_build_object(
    'clientes',     coalesce((select jsonb_agg(to_jsonb(c)) from clientes c), '[]'::jsonb),
    'prestamos',    coalesce((select jsonb_agg(to_jsonb(p)) from prestamos p), '[]'::jsonb),
    'cuotas',       coalesce((select jsonb_agg(to_jsonb(q)) from cuotas q), '[]'::jsonb),
    'solicitudes',  coalesce((select jsonb_agg(to_jsonb(s)) from solicitudes_capital s), '[]'::jsonb))
  returning id into v_id;
  delete from respaldo_demo where id not in (select id from respaldo_demo order by id desc limit 5);
  return v_id;
end $$;

-- Borra los datos del negocio. NO toca trabajadores, sedes, parámetros ni bitácora.
create or replace function fn_datos_borrar() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from cuotas             where id is not null;
  delete from prestamos          where id is not null;
  delete from solicitudes_capital where id is not null;
  delete from clientes           where id is not null;
end $$;

create or replace function sp_demo_vaciar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t trabajadores%rowtype; v_n jsonb; v_resp bigint;
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null or v_t.rol <> 'ADMIN' then
    raise exception 'Solo un administrador activo puede vaciar los datos de demostración.';
  end if;
  perform pg_advisory_xact_lock(90009);

  v_n := jsonb_build_object(
    'clientes',    (select count(*) from clientes),
    'prestamos',   (select count(*) from prestamos),
    'cuotas',      (select count(*) from cuotas),
    'solicitudes', (select count(*) from solicitudes_capital));

  v_resp := fn_respaldo_crear('VACIAR', v_t.id);          -- primero el respaldo, luego el borrado
  perform fn_datos_borrar();
  update parametros set valor = '' where clave = 'fecha_referencia';

  insert into bitacora (trabajador_id, sede_id, accion, entidad, detalle)
  values (v_t.id, v_t.sede_id, 'VACIAR_DATOS', 'sistema', v_n || jsonb_build_object('respaldo_id', v_resp));
  return v_n || jsonb_build_object('respaldo_id', v_resp);
end $$;

create or replace function sp_demo_restaurar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t trabajadores%rowtype; v_b respaldo_demo%rowtype; v_nuevo bigint;
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null or v_t.rol <> 'ADMIN' then
    raise exception 'Solo un administrador activo puede restaurar los datos de demostración.';
  end if;
  perform pg_advisory_xact_lock(90009);

  select * into v_b from respaldo_demo order by id desc limit 1;
  if not found then
    raise exception 'No hay ningún respaldo para restaurar.';
  end if;

  -- El estado actual también se respalda: restaurar se puede deshacer volviendo a restaurar
  v_nuevo := fn_respaldo_crear('RESTAURAR', v_t.id);
  perform fn_datos_borrar();

  insert into clientes  select * from jsonb_populate_recordset(null::clientes,  v_b.datos->'clientes');
  insert into prestamos select * from jsonb_populate_recordset(null::prestamos, v_b.datos->'prestamos');
  insert into cuotas    select * from jsonb_populate_recordset(null::cuotas,    v_b.datos->'cuotas');
  insert into solicitudes_capital select * from jsonb_populate_recordset(null::solicitudes_capital, v_b.datos->'solicitudes');

  insert into bitacora (trabajador_id, sede_id, accion, entidad, detalle)
  values (v_t.id, v_t.sede_id, 'RESTAURAR_DATOS', 'sistema',
          jsonb_build_object('respaldo_id', v_b.id, 'respaldo_del', v_b.creado_en, 'respaldo_actual_id', v_nuevo));
  return jsonb_build_object(
    'clientes',    (select count(*) from clientes),
    'prestamos',   (select count(*) from prestamos),
    'cuotas',      (select count(*) from cuotas),
    'solicitudes', (select count(*) from solicitudes_capital),
    'respaldo_id', v_b.id);
end $$;

create or replace function fn_respaldo_demo_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t trabajadores%rowtype; v_b respaldo_demo%rowtype;
begin
  select * into v_t from fn_trabajador_actual();
  if v_t.id is null or v_t.rol <> 'ADMIN' then
    raise exception 'Solo un administrador activo puede consultar los respaldos.';
  end if;
  select * into v_b from respaldo_demo order by id desc limit 1;
  if not found then
    return jsonb_build_object('existe', false);
  end if;
  return jsonb_build_object('existe', true, 'id', v_b.id, 'creado_en', v_b.creado_en, 'origen', v_b.origen,
    'clientes',    jsonb_array_length(v_b.datos->'clientes'),
    'prestamos',   jsonb_array_length(v_b.datos->'prestamos'),
    'solicitudes', jsonb_array_length(v_b.datos->'solicitudes'));
end $$;

-- ---------- sp_demo_reiniciar (de 09) con solicitudes y respaldo ----------
-- Mismos datos demo que 09. Cambios: guarda un respaldo antes de borrar y también limpia las solicitudes.
create or replace function sp_demo_reiniciar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_adm trabajadores%rowtype; c uuid;
begin
  select * into v_adm from trabajadores
   where auth_user_id = auth.uid() and rol = 'ADMIN' and activo;
  if auth.uid() is null or not found then
    raise exception 'Solo un administrador activo puede reiniciar los datos de demostración.';
  end if;

  perform pg_advisory_xact_lock(90009);

  update parametros set valor = '' where clave = 'fecha_referencia';

  perform fn_respaldo_crear('REINICIAR', v_adm.id);
  perform fn_datos_borrar();

  -- 1) Vigente 7,000: pedir 5,000 -> rechazado (máximo 3,000)
  c := sp_demo_cliente('70000001','CARLOS','RAMIREZ TORRES','Trujillo');
  perform sp_demo_prestamo(c,'Trujillo', 7000, 12, 10, 0);
  -- 2) 10,000 a 24 meses, 12 cuotas pagadas: con AL_CANCELAR el cupo NO se libera hasta cancelar
  c := sp_demo_cliente('70000002','MARIA','FERNANDEZ QUISPE','Chiclayo');
  perform sp_demo_prestamo(c,'Chiclayo', 10000, 24, 360, 12);
  -- 3) MOROSO con saldo libre: 3 cuotas vencidas
  c := sp_demo_cliente('70000003','JOSE','CASTILLO DIAZ','Piura');
  perform sp_demo_prestamo(c,'Piura', 4000, 12, 100, 0);
  -- 4) EXTRAJUDICIAL: más de un año sin pagos
  c := sp_demo_cliente('70000004','ROSA','VASQUEZ LEON','Chimbote');
  perform sp_demo_prestamo(c,'Chimbote', 3000, 12, 500, 0);
  -- 5) AL DÍA: 2 cuotas pagadas a tiempo, la siguiente vence en 20 días
  c := sp_demo_cliente('70000005','LUIS','MENDOZA PAREDES','Tumbes');
  perform sp_demo_prestamo(c,'Tumbes', 3000, 6, 70, 2);
  -- 6) MOROSO a punto de pasar a extrajudicial (aún no cumple el año)
  c := sp_demo_cliente('70000006','ANA','SALAZAR RIOS','Trujillo');
  perform sp_demo_prestamo(c,'Trujillo', 3000, 12, 394, 0);
  -- 7) Cupo liberado: un préstamo cancelado (libera cupo) y otro parcialmente pagado (no libera)
  c := sp_demo_cliente('70000007','PEDRO','LOPEZ CAMPOS','Chimbote');
  perform sp_demo_prestamo(c,'Chimbote', 6000, 6, 200, 6);
  perform sp_demo_prestamo(c,'Chimbote', 4000, 12, 70, 2);

  perform fn_actualizar_estados(null);

  insert into bitacora (trabajador_id, sede_id, accion, entidad, detalle)
  values (v_adm.id, v_adm.sede_id, 'REINICIAR_DEMO', 'sistema',
          jsonb_build_object('clientes', 7, 'fecha_referencia', ''));

  return jsonb_build_object(
    'clientes',  (select count(*) from clientes),
    'prestamos', (select count(*) from prestamos),
    'cuotas',    (select count(*) from cuotas));
end $$;

-- ---------- Permisos ----------
-- Funciones de la app: solo usuarios con sesión; cada una comprueba el rol dentro.
-- Funciones internas: nadie las llama desde la API (las usan las demás como propietario).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function fn_solicitar_capital(numeric, text) from public, anon;
    revoke all on function fn_resolver_solicitud(uuid, boolean, text) from public, anon;
    revoke all on function fn_resumen_capital_dia() from public, anon;
    revoke all on function sp_demo_vaciar() from public, anon;
    revoke all on function sp_demo_restaurar() from public, anon;
    revoke all on function fn_respaldo_demo_info() from public, anon;
    revoke all on function sp_demo_reiniciar() from public, anon;
    grant execute on function fn_solicitar_capital(numeric, text) to authenticated;
    grant execute on function fn_resolver_solicitud(uuid, boolean, text) to authenticated;
    grant execute on function fn_resumen_capital_dia() to authenticated;
    grant execute on function sp_demo_vaciar() to authenticated;
    grant execute on function sp_demo_restaurar() to authenticated;
    grant execute on function fn_respaldo_demo_info() to authenticated;
    grant execute on function sp_demo_reiniciar() to authenticated;
    revoke all on function fn_trabajador_actual() from public, anon, authenticated;
    revoke all on function fn_respaldo_crear(text, uuid) from public, anon, authenticated;
    revoke all on function fn_datos_borrar() from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
