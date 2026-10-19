-- =====================================================================
-- 11b_pruebas_solicitudes.sql  ·  Pruebas de 11_solicitudes_capital.sql (requiere 01..11)
-- SEGURO: todo ocurre dentro de una transacción que termina en ROLLBACK; no deja nada en la base.
-- Simula la sesión de un trabajador y del administrador con set_config('request.jwt.claim.sub', ...).
-- Cada prueba imprime OK o falla con un mensaje.
-- =====================================================================
begin;

do $$
declare
  v_admin   uuid := (select auth_user_id from trabajadores where rol = 'ADMIN' and activo order by email limit 1);
  v_trab    uuid := (select auth_user_id from trabajadores where rol = 'TRABAJADOR' and activo order by email limit 1);
  v_trab_id uuid := (select id from trabajadores where auth_user_id = v_trab);
  v_sol1 uuid; v_sol2 uuid; v_sol3 uuid;
  r record; n int; c uuid; j jsonb;
  antes_trab int := (select count(*) from trabajadores);
  antes_sedes int := (select count(*) from sedes);
  antes_param int := (select count(*) from parametros);
  antes_bit int := (select count(*) from bitacora);
  cli_antes int; pre_antes int; cuo_antes int;
begin
  perform set_config('client_min_messages', 'notice', true);
  if v_admin is null or v_trab is null then
    raise exception 'FALLO: faltan usuarios vinculados a Auth (ejecuta 07_vincular_auth.sql).';
  end if;
  delete from solicitudes_capital;       -- partir de cero dentro de esta transacción

  -- ===== Sin sesión =====
  perform set_config('request.jwt.claim.sub', '', true);
  begin perform fn_solicitar_capital(1000); raise exception 'FALLO sin sesión solicitar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform sp_demo_vaciar(); raise exception 'FALLO sin sesión vaciar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  Sin sesión no se puede solicitar ni vaciar';

  -- ===== Trabajador =====
  perform set_config('request.jwt.claim.sub', v_trab::text, true);
  begin perform fn_solicitar_capital(0); raise exception 'FALLO monto 0';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_solicitar_capital(-5); raise exception 'FALLO monto negativo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_solicitar_capital(10.555); raise exception 'FALLO 3 decimales';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  Monto 0, negativo o con más de 2 decimales rechazado';

  v_sol1 := fn_solicitar_capital(20000, '  Apertura de jornada ');
  v_sol2 := fn_solicitar_capital(30000.00);                       -- llega a 50,000 exacto
  select * into r from fn_resumen_capital_dia();
  if r.limite <> 50000 or r.solicitado <> 50000 or r.pendiente <> 50000 or r.disponible_solicitar <> 0 then
    raise exception 'FALLO resumen tras 50,000: %', to_json(r); end if;
  begin perform fn_solicitar_capital(0.01); raise exception 'FALLO excede el límite';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%límite diario%' then raise exception 'FALLO mensaje del límite: %', sqlerrm; end if; end;
  raise notice 'OK  Varias solicitudes hasta 50,000 exactos; 0.01 más se rechaza con mensaje claro';

  select count(*) into n from solicitudes_capital where trabajador_id = v_trab_id and comentario = 'Apertura de jornada';
  if n <> 1 then raise exception 'FALLO el comentario no se normalizó'; end if;

  begin perform fn_resolver_solicitud(v_sol1, true); raise exception 'FALLO trabajador aprueba';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin update solicitudes_capital set estado = 'APROBADA' where id = v_sol1; raise exception 'FALLO update directo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  El trabajador no puede aprobar solicitudes';

  -- ===== Administrador =====
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  begin perform fn_solicitar_capital(100); raise exception 'FALLO admin solicita';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform fn_resolver_solicitud(v_sol1, true, 'Aprobada');
  perform fn_resolver_solicitud(v_sol2, false, 'No hay caja');
  begin perform fn_resolver_solicitud(v_sol1, false); raise exception 'FALLO resolver dos veces';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_resolver_solicitud(gen_random_uuid(), true); raise exception 'FALLO solicitud inexistente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  El administrador aprueba y rechaza; no se resuelve dos veces';

  -- ===== El rechazo libera cupo =====
  perform set_config('request.jwt.claim.sub', v_trab::text, true);
  select * into r from fn_resumen_capital_dia();
  if r.aprobado <> 20000 or r.rechazado <> 30000 or r.pendiente <> 0 or r.disponible_solicitar <> 30000 or r.saldo_disponible <> 20000 then
    raise exception 'FALLO resumen tras resolver: %', to_json(r); end if;
  v_sol3 := fn_solicitar_capital(30000);
  begin perform fn_solicitar_capital(1); raise exception 'FALLO límite tras re-solicitar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  Lo rechazado libera cupo; el total del día nunca pasa de 50,000';

  -- Cada trabajador ve solo lo suyo; el administrador ve todo (política RLS)
  set local role authenticated;
  select count(*) into n from solicitudes_capital;
  reset role;
  raise notice 'OK  Lectura como "authenticated" ejecutada (filas visibles para el trabajador: %)', n;

  -- ===== Vaciar y restaurar =====
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  c := fn_registrar_cliente('DNI', '79999991', 'PRUEBA', 'RESPALDO', '987654321', null, true,
                            (select id from trabajadores where auth_user_id = v_admin), date '2035-12-31');
  perform fn_aprobar_prestamo(c, 1000, 3, (select id from trabajadores where auth_user_id = v_admin), true);
  select count(*) into cli_antes from clientes;
  select count(*) into pre_antes from prestamos;
  select count(*) into cuo_antes from cuotas;

  perform set_config('request.jwt.claim.sub', v_trab::text, true);
  begin perform sp_demo_vaciar(); raise exception 'FALLO trabajador vacía';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform sp_demo_restaurar(); raise exception 'FALLO trabajador restaura';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  j := sp_demo_vaciar();
  if (j->>'clientes')::int <> cli_antes or (j->>'prestamos')::int <> pre_antes then raise exception 'FALLO conteo vaciar %', j; end if;
  if (select count(*) from clientes) <> 0 or (select count(*) from prestamos) <> 0
     or (select count(*) from cuotas) <> 0 or (select count(*) from solicitudes_capital) <> 0 then
    raise exception 'FALLO no quedó vacío'; end if;
  if (select count(*) from trabajadores) <> antes_trab or (select count(*) from sedes) <> antes_sedes
     or (select count(*) from parametros) <> antes_param then
    raise exception 'FALLO se tocaron trabajadores, sedes o parámetros'; end if;
  if (select count(*) from bitacora) < antes_bit then raise exception 'FALLO la bitácora perdió filas'; end if;
  raise notice 'OK  Vaciar borra clientes, préstamos, cuotas y solicitudes; conserva trabajadores, sedes, parámetros y bitácora';

  j := fn_respaldo_demo_info();
  if not (j->>'existe')::boolean or (j->>'clientes')::int <> cli_antes then raise exception 'FALLO info de respaldo %', j; end if;

  j := sp_demo_restaurar();
  if (j->>'clientes')::int <> cli_antes or (j->>'prestamos')::int <> pre_antes
     or (select count(*) from cuotas) <> cuo_antes then raise exception 'FALLO conteo restaurar %', j; end if;
  if (select count(*) from solicitudes_capital) <> 3 then raise exception 'FALLO solicitudes restauradas'; end if;
  if (select estado from solicitudes_capital where id = v_sol1) <> 'APROBADA' then raise exception 'FALLO estado restaurado'; end if;
  raise notice 'OK  Restaurar devuelve exactamente lo respaldado (clientes %, préstamos %, cuotas %, solicitudes 3)', cli_antes, pre_antes, cuo_antes;

  -- Restaurar guarda el estado actual: vaciar de nuevo y restaurar otra vez sigue funcionando
  perform sp_demo_vaciar();
  perform sp_demo_restaurar();
  if (select count(*) from clientes) <> cli_antes then raise exception 'FALLO segundo ciclo'; end if;
  raise notice 'OK  Segundo ciclo vaciar/restaurar';

  -- Reiniciar demo: respalda, limpia solicitudes y recarga los 7 clientes
  j := sp_demo_reiniciar();
  if (j->>'clientes')::int <> 7 or (select count(*) from solicitudes_capital) <> 0 then raise exception 'FALLO reiniciar %', j; end if;
  j := sp_demo_restaurar();
  if (j->>'clientes')::int <> cli_antes then raise exception 'FALLO restaurar tras reiniciar %', j; end if;
  raise notice 'OK  Reiniciar demo respalda y se puede deshacer con Restaurar';

  select count(*) into n from bitacora where accion in ('SOLICITAR_CAPITAL','APROBAR_SOLICITUD_CAPITAL','RECHAZAR_SOLICITUD_CAPITAL','VACIAR_DATOS','RESTAURAR_DATOS');
  if n < 8 then raise exception 'FALLO bitácora (% filas)', n; end if;
  raise notice 'OK  Bitácora registra solicitudes, resoluciones, vaciado y restauración';
end $$;

rollback;   -- no queda ningún dato de la prueba
