-- =====================================================================
-- 09_demo_reiniciar.sql  ·  Reinicio de los datos de demostración desde la aplicación
-- Requiere 01..03 y 08. Se ejecuta UNA vez en Supabase (re-ejecutable).
-- Hace lo mismo que 04_seed_demo.sql + 04b_demo_cupo_liberado.sql en una sola función,
-- sp_demo_reiniciar(), que el botón del panel de demostración llama por RPC.
--   * SECURITY DEFINER: solo la ejecuta un trabajador ADMIN activo (se comprueba con auth.uid()).
--   * Borra clientes, préstamos y cuotas y vuelve a crear los 7 clientes demo.
--   * Vacía fecha_referencia. No toca ningún otro parámetro.
--   * NO borra ni edita la bitácora (es inmutable); solo agrega la fila REINICIAR_DEMO.
--     Los registros de la bitácora de reinicios anteriores se conservan.
-- =====================================================================

-- Ayudantes (los mismos de 04; se repiten para no depender de haberlo ejecutado)
create or replace function sp_demo_cliente(p_dni text, p_nombres text, p_apellidos text, p_ciudad text)
returns uuid language plpgsql as $$
declare v_t uuid; v_id uuid;
begin
  select t.id into v_t from trabajadores t join sedes s on s.id = t.sede_id
   where s.ciudad = p_ciudad and t.rol = 'TRABAJADOR';
  v_id := fn_registrar_cliente('DNI', p_dni, p_nombres, p_apellidos, '999000111', null, true, v_t, date '2035-12-31');
  return v_id;
end $$;

create or replace function sp_demo_prestamo(p_cliente uuid, p_ciudad text, p_monto numeric, p_plazo int,
                                            p_dias_atras int, p_pagadas int)
returns uuid language plpgsql as $$
declare v_t trabajadores%rowtype; v_id uuid; v_f date := fn_fecha_hoy() - p_dias_atras;
begin
  select t.* into v_t from trabajadores t join sedes s on s.id = t.sede_id
   where s.ciudad = p_ciudad and t.rol = 'TRABAJADOR';
  insert into prestamos (cliente_id, sede_id, trabajador_id, monto, plazo_meses, tea, metodo_cuota, fecha_desembolso)
  values (p_cliente, v_t.sede_id, v_t.id, p_monto, p_plazo, fn_param_num('tea'), fn_param_txt('metodo_cuota'), v_f)
  returning id into v_id;
  insert into cuotas (prestamo_id, numero, fecha_vencimiento, cuota, capital, interes, saldo, estado, fecha_pago)
  select v_id, g.numero, g.fecha_vencimiento, g.cuota, g.capital, g.interes, g.saldo,
         case when g.numero <= p_pagadas then 'PAGADA' else 'PENDIENTE' end,
         case when g.numero <= p_pagadas then g.fecha_vencimiento end
    from fn_generar_cronograma(p_monto, p_plazo, v_f) g;
  return v_id;
end $$;

-- ---------- Reinicio ----------
create or replace function sp_demo_reiniciar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_adm trabajadores%rowtype; c uuid;
begin
  -- Solo un administrador activo con sesión
  select * into v_adm from trabajadores
   where auth_user_id = auth.uid() and rol = 'ADMIN' and activo;
  if auth.uid() is null or not found then
    raise exception 'Solo un administrador activo puede reiniciar los datos de demostración.';
  end if;

  -- Evita dos reinicios simultáneos (doble clic o dos administradores)
  perform pg_advisory_xact_lock(90009);

  -- La fecha vuelve a la real ANTES de crear datos: los casos son relativos a fn_fecha_hoy()
  update parametros set valor = '' where clave = 'fecha_referencia';

  -- Borrado fila a fila (con WHERE, por si el servicio exige uno). La bitácora no se toca.
  delete from cuotas    where id is not null;
  delete from prestamos where id is not null;
  delete from clientes  where id is not null;

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
-- Nadie sin sesión puede ejecutarla (la comprobación de ADMIN dentro de la función es la segunda barrera).
-- Los ayudantes dejan de ser invocables desde la API: crean préstamos sin pasar por las reglas.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function sp_demo_reiniciar() from public, anon;
    grant execute on function sp_demo_reiniciar() to authenticated;
    revoke all on function sp_demo_cliente(text,text,text,text) from public, anon, authenticated;
    revoke all on function sp_demo_prestamo(uuid,text,numeric,int,int,int) from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
