-- =====================================================================
-- 05b_pruebas_al_cancelar.sql  ·  Pruebas v1.3 (liberación de cupo AL_CANCELAR)
-- Copia de 05_pruebas.sql con los casos que cambian de resultado (D1/D4) y pruebas nuevas
-- (RUC, bitácora al evaluar, bitácora inmutable). NO modifica 05.
-- Orden: 01, 02, 03, 08, 04 y luego este archivo. Re-ejecuta 04 al terminar.
-- Cambios respecto a 05 (marcados con "v1.3"):
--   * Se fijan los parámetros al inicio (AL_CANCELAR, CAPITAL_CONSTANTE, COMPUESTA).
--   * 'Ejemplo del profesor' (cliente 70000002): ahora NO puede pedir 5,000 (T-22, HU-11 CA3/CA7).
--   * T-11 se prueba con CAPITAL_CONSTANTE (943.85) y con CUOTA_FIJA (898.98).
--   * Al final el parámetro liberacion_cupo queda en AL_CANCELAR (05 lo dejaba en CAPITAL_AMORTIZADO).
--   * Pruebas nuevas: HU-11 CA4 con cancelación, RUC, bitácora al evaluar, bitácora inmutable, demo 70000007.
-- =====================================================================
do $$
declare
  w_tru uuid := (select id from trabajadores where email = 'trabajador.trujillo@prestamos.demo');
  w_pau uuid := (select id from trabajadores where email = 'trabajador.piura@prestamos.demo');
  c_nuevo uuid; c uuid; r jsonb; n int; v numeric;
  msg text;
begin
  perform set_config('client_min_messages','notice',true);

  -- v1.3: parámetros vigentes
  update parametros set valor = 'AL_CANCELAR'        where clave = 'liberacion_cupo';
  update parametros set valor = 'CAPITAL_CONSTANTE'  where clave = 'metodo_cuota';
  update parametros set valor = 'COMPUESTA'          where clave = 'mora_modalidad';
  update parametros set valor = ''                   where clave = 'fecha_referencia';

  -- T-01 DNI inválido
  begin perform fn_registrar_cliente('DNI','1234567','A','B','999000111',null,true,w_tru, date '2035-12-31'); raise exception 'FALLO T-01';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-01 DNI de 7 dígitos rechazado';

  -- T-04 Carnet de extranjería / pasaporte
  begin perform fn_registrar_cliente('CE','12345678','A','B','999000111',null,true,w_tru, date '2035-12-31'); raise exception 'FALLO T-04a';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_registrar_cliente('PASAPORTE','12345679','A','B','999000111',null,true,w_tru, date '2035-12-31'); raise exception 'FALLO T-04b';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-04 Carnet de extranjería y pasaporte rechazados';

  -- Registro correcto + normalización de nombre (CA7)
  c_nuevo := fn_registrar_cliente('DNI','71111111','  juan   carlos ','perez  gomez','987654321','Av. Prueba 123',true,w_tru, date '2035-12-31');
  select nombres into msg from clientes where id = c_nuevo;
  if msg <> 'JUAN CARLOS' then raise exception 'FALLO normalización: %', msg; end if;
  raise notice 'OK  Registro de cliente y nombre normalizado';

  -- T-02 Duplicado
  begin perform fn_registrar_cliente('DNI','71111111','X','Y','987654321',null,true,w_tru, date '2035-12-31'); raise exception 'FALLO T-02';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-02 DNI duplicado rechazado';

  -- T-03 Nombre verificado no editable
  begin update clientes set nombres = 'OTRO' where id = c_nuevo; raise exception 'FALLO T-03';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-03 Nombre verificado protegido';

  -- T-05 10,000 con vigente 0 aprobable ; T-06 10,001 rechazado
  r := fn_evaluar_prestamo(c_nuevo, 10000, 12);
  if not (r->>'aprobable')::boolean then raise exception 'FALLO T-05 %', r; end if;
  r := fn_evaluar_prestamo(c_nuevo, 10001, 12);
  if (r->>'aprobable')::boolean then raise exception 'FALLO T-06'; end if;
  raise notice 'OK  T-05/T-06 Tope de 10,000';

  -- T-09 Plazos inválidos
  r := fn_evaluar_prestamo(c_nuevo, 1000, 0);  if (r->>'aprobable')::boolean then raise exception 'FALLO T-09a'; end if;
  r := fn_evaluar_prestamo(c_nuevo, 1000, 61); if (r->>'aprobable')::boolean then raise exception 'FALLO T-09b'; end if;
  r := fn_evaluar_prestamo(c_nuevo, 1000, null); if (r->>'aprobable')::boolean then raise exception 'FALLO T-09c'; end if;
  raise notice 'OK  T-09 Plazo 0, 61 y nulo rechazados';

  -- T-16 Evaluar no crea préstamo
  select count(*) into n from prestamos where cliente_id = c_nuevo;
  if n <> 0 then raise exception 'FALLO T-16'; end if;
  raise notice 'OK  T-16 Evaluar no crea préstamo';

  -- T-10 Plazos 1 y 60: nº de cuotas y saldo final 0
  perform fn_aprobar_prestamo(c_nuevo, 1000, 1, w_tru, true);
  select count(*) into n from cuotas cu join prestamos p on p.id=cu.prestamo_id where p.cliente_id=c_nuevo;
  if n <> 1 then raise exception 'FALLO T-10a %', n; end if;
  perform fn_aprobar_prestamo(c_nuevo, 1000, 60, w_tru, true);
  select count(*), min(case when numero=60 then saldo end) into n, v
    from cuotas cu join prestamos p on p.id=cu.prestamo_id where p.cliente_id=c_nuevo and p.plazo_meses=60;
  if n <> 60 or v <> 0 then raise exception 'FALLO T-10b % %', n, v; end if;
  raise notice 'OK  T-10 Plazo 1 mes (1 cuota) y 60 meses (60 cuotas, saldo final 0.00)';

  -- Suma de capital = monto en cronogramas de prueba, incluso montos pequeños, ambos métodos
  for n in 1..2 loop
    select sum(capital) into v from fn_generar_cronograma(1.00, 60, current_date, 0.30, case when n=1 then 'CUOTA_FIJA' else 'CAPITAL_CONSTANTE' end);
    if v <> 1.00 then raise exception 'FALLO suma capital método % : %', n, v; end if;
    select sum(capital) into v from fn_generar_cronograma(9999.99, 37, current_date, 0.30, case when n=1 then 'CUOTA_FIJA' else 'CAPITAL_CONSTANTE' end);
    if v <> 9999.99 then raise exception 'FALLO suma capital 9999.99 método % : %', n, v; end if;
    if exists (select 1 from fn_generar_cronograma(1.00, 60, current_date, 0.30, case when n=1 then 'CUOTA_FIJA' else 'CAPITAL_CONSTANTE' end) where capital < 0) then
      raise exception 'FALLO capital negativo método %', n; end if;
  end loop;
  raise notice 'OK  Cronograma: suma de capital exacta y sin capital negativo (ambos métodos)';

  -- T-11 Ejemplo 5,000 a 6 meses con cuota fija = valores de la documentación
  select cuota into v from fn_generar_cronograma(5000, 6, current_date, 0.30, 'CUOTA_FIJA', 30) where numero = 1;
  if v <> 898.98 then raise exception 'FALLO T-11 cuota=%', v; end if;
  select cuota into v from fn_generar_cronograma(5000, 6, current_date, 0.30, 'CUOTA_FIJA', 30) where numero = 6;
  if v <> 898.96 then raise exception 'FALLO T-11 última=%', v; end if;
  raise notice 'OK  T-11 (nota) 5,000 a 6 meses con CUOTA_FIJA = 898.98 (última 898.96)';
  -- v1.3: método por defecto CAPITAL_CONSTANTE -> primera cuota 943.85
  select cuota into v from fn_generar_cronograma(5000, 6, current_date, 0.30, 'CAPITAL_CONSTANTE', 30) where numero = 1;
  if v <> 943.85 then raise exception 'FALLO T-11 capital constante cuota=%', v; end if;
  select cuota into v from fn_generar_cronograma(5000, 6, current_date, 0.30, 'CAPITAL_CONSTANTE', 30) where numero = 6;
  if v <> 851.75 then raise exception 'FALLO T-11 capital constante última=%', v; end if;
  r := fn_evaluar_prestamo(c_nuevo, 5000, 6);
  if (r->>'primera_cuota')::numeric <> 943.85 then raise exception 'FALLO T-11 evaluar primera_cuota %', r; end if;
  raise notice 'OK  T-11 5,000 a 6 meses con CAPITAL_CONSTANTE (por defecto) = 943.85 (última 851.75)';

  -- Vencimientos cada 30 días
  select count(*) into n from fn_generar_cronograma(5000, 6, date '2026-10-19', 0.30, 'CUOTA_FIJA', 30)
   where fecha_vencimiento = date '2026-10-19' + 30*numero;
  if n <> 6 then raise exception 'FALLO vencimientos'; end if;
  raise notice 'OK  Vencimientos cada 30 días';

  -- T-07 Vigente 7,000 + 5,000 rechazado, máximo 3,000 (cliente demo 1)
  c := (select id from clientes where dni='70000001');
  r := fn_evaluar_prestamo(c, 5000, 12);
  if (r->>'aprobable')::boolean or (r->>'monto_maximo')::numeric <> 3000 then raise exception 'FALLO T-07 %', r; end if;
  r := fn_evaluar_prestamo(c, 3000, 12);
  if not (r->>'aprobable')::boolean then raise exception 'FALLO T-07 (3000 debía pasar)'; end if;
  raise notice 'OK  T-07 7,000 vigente: 5,000 rechazado (máx. 3,000) y 3,000 aprobable';

  -- v1.3 T-22 / HU-11 CA7: 10,000 a 24 meses con 12 cuotas pagadas (cliente demo 2).
  -- Con AL_CANCELAR el cupo NO se libera hasta pagar el préstamo completo -> no puede pedir 5,000.
  c := (select id from clientes where dni='70000002');
  r := fn_evaluar_prestamo(c, 5000, 12);
  if (r->>'aprobable')::boolean or (r->>'disponible')::numeric <> 0 or (r->>'capital_vigente')::numeric <> 10000 then
    raise exception 'FALLO T-22 AL_CANCELAR %', r; end if;
  update parametros set valor = 'CAPITAL_AMORTIZADO' where clave = 'liberacion_cupo';
  r := fn_evaluar_prestamo(c, 5000, 12);
  if not (r->>'aprobable')::boolean then raise exception 'FALLO T-22 CAPITAL_AMORTIZADO %', r; end if;
  update parametros set valor = 'AL_CANCELAR' where clave = 'liberacion_cupo';
  raise notice 'OK  T-22 (v1.3) 10,000 a 24 meses con 12 pagadas: con AL_CANCELAR disponible 0; con CAPITAL_AMORTIZADO (alternativa) podría pedir 5,000';

  -- T-12 Moroso con saldo libre rechazado en evaluación y aprobación (cliente demo 3)
  c := (select id from clientes where dni='70000003');
  r := fn_evaluar_prestamo(c, 1000, 6);
  if (r->>'aprobable')::boolean or (r->>'disponible')::numeric <> 6000 then raise exception 'FALLO T-12 %', r; end if;
  begin perform fn_aprobar_prestamo(c, 1000, 6, w_pau, true); raise exception 'FALLO T-12 aprobación';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-12 Moroso con S/ 6,000 libres: bloqueado en evaluar y aprobar';

  -- Extrajudicial bloqueado (cliente demo 4) y moroso casi extrajudicial sigue moroso (demo 6)
  r := fn_evaluar_prestamo((select id from clientes where dni='70000004'), 100, 3);
  if (r->>'aprobable')::boolean or r->>'estado_cliente' <> 'EXTRAJUDICIAL' then raise exception 'FALLO extrajudicial'; end if;
  if (select estado from clientes where dni='70000006') <> 'MOROSO' then raise exception 'FALLO moroso 363 días'; end if;
  raise notice 'OK  T-14 Extrajudicial bloqueado; moroso con <365 días sin pagos sigue MOROSO';

  -- T-13 Día 30 sin pago = al día; día 31 = moroso (con fecha simulada)
  c := fn_registrar_cliente('DNI','72222222','PRUEBA','FECHAS','987654321',null,true,w_tru, date '2035-12-31');
  update parametros set valor = '2030-01-01' where clave = 'fecha_referencia';
  perform fn_aprobar_prestamo(c, 1000, 3, w_tru, true);                  -- vence 2030-01-31
  update parametros set valor = '2030-01-31' where clave = 'fecha_referencia';
  perform fn_actualizar_estados(c);
  if (select estado from clientes where id=c) <> 'AL_DIA' then raise exception 'FALLO T-13 día 30'; end if;
  update parametros set valor = '2030-02-01' where clave = 'fecha_referencia';
  perform fn_actualizar_estados(c);
  if (select estado from clientes where id=c) <> 'MOROSO' then raise exception 'FALLO T-13 día 31'; end if;
  raise notice 'OK  T-13 Vence día 30 (al día) / día 31 moroso';

  -- T-14 Frontera del año: 365 días moroso = aún moroso; 366 = extrajudicial
  update parametros set valor = (date '2030-02-01' + 364)::text where clave = 'fecha_referencia';
  perform fn_actualizar_estados(c);
  if (select estado from clientes where id=c) <> 'MOROSO' then raise exception 'FALLO T-14 día 365'; end if;
  update parametros set valor = (date '2030-02-01' + 366)::text where clave = 'fecha_referencia';
  perform fn_actualizar_estados(c);
  if (select estado from clientes where id=c) <> 'EXTRAJUDICIAL' then raise exception 'FALLO T-14 día 366'; end if;
  raise notice 'OK  T-14 Frontera de un año (365 moroso / 366 extrajudicial)';
  update parametros set valor = '' where clave = 'fecha_referencia';

  -- Inmutabilidad
  begin update prestamos set monto = 1 where cliente_id = c_nuevo; raise exception 'FALLO inmutable préstamo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin update cuotas set capital = 1 where prestamo_id in (select id from prestamos where cliente_id=c_nuevo); raise exception 'FALLO inmutable cuota';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  Préstamos y cronogramas aprobados no se pueden modificar';

  -- T-08 Varios préstamos hasta el tope: 5,000 + 1,000 x3 y luego el que excede
  c := fn_registrar_cliente('DNI','73333333','MULTI','PRESTAMO','987654321',null,true,w_tru, date '2035-12-31');
  perform fn_aprobar_prestamo(c, 5000, 12, w_tru, true);
  perform fn_aprobar_prestamo(c, 1000, 6, w_tru, true);
  perform fn_aprobar_prestamo(c, 1000, 6, w_tru, true);
  perform fn_aprobar_prestamo(c, 1000, 6, w_tru, true);
  r := fn_evaluar_prestamo(c, 2001, 6);
  if (r->>'aprobable')::boolean then raise exception 'FALLO T-08 excede'; end if;
  perform fn_aprobar_prestamo(c, 2000, 6, w_tru, true);                       -- llega a 10,000 exacto
  if fn_capital_vigente(c) <> 10000 then raise exception 'FALLO T-08 total'; end if;
  begin perform fn_aprobar_prestamo(c, 1, 1, w_tru, true); raise exception 'FALLO T-08 sobre tope';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  T-08 Varios préstamos hasta exactamente 10,000; el siguiente se rechaza';


  -- ======== Pruebas v2 ========
  -- DNI vencido en el registro
  begin perform fn_registrar_cliente('DNI','74444444','A','B','999000111',null,true,w_tru, date '2020-01-01'); raise exception 'FALLO DNI vencido registro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_registrar_cliente('DNI','74444445','A','B','999000111',null,true,w_tru, null); raise exception 'FALLO DNI sin caducidad';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  DNI vencido o sin fecha de caducidad rechazado al registrar';

  -- DNI que vence después: se rechaza al evaluar
  update clientes set dni_caducidad = date '2020-01-01' where id = c_nuevo;
  r := fn_evaluar_prestamo(c_nuevo, 100, 3);
  if (r->>'aprobable')::boolean then raise exception 'FALLO DNI vencido en evaluación'; end if;
  update clientes set dni_caducidad = date '2035-12-31' where id = c_nuevo;
  raise notice 'OK  DNI vencido rechazado también al evaluar';

  -- Irreversibilidad / conformidad
  begin perform fn_aprobar_prestamo(c_nuevo, 100, 3, w_tru, false); raise exception 'FALLO sin conformidad';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_aprobar_prestamo(c_nuevo, 100, 3, w_tru, null); raise exception 'FALLO conformidad nula';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  No se aprueba sin confirmar que el cliente está conforme y firmó';

  -- Mora 1% diario
  update parametros set valor = 'COMPUESTA' where clave = 'mora_modalidad';
  if fn_mora(1000, date '2030-01-01', date '2030-01-01') <> 0 then raise exception 'FALLO mora día de vencimiento'; end if;
  if fn_mora(1000, date '2030-01-01', date '2030-01-02') <> 10.00 then raise exception 'FALLO mora 1 día'; end if;
  if fn_mora(1000, date '2030-01-01', date '2030-01-11') <> 104.62 then raise exception 'FALLO mora compuesta 10 días: %', fn_mora(1000, date '2030-01-01', date '2030-01-11'); end if;
  update parametros set valor = 'SIMPLE' where clave = 'mora_modalidad';
  if fn_mora(1000, date '2030-01-01', date '2030-01-11') <> 100.00 then raise exception 'FALLO mora simple'; end if;
  update parametros set valor = 'COMPUESTA' where clave = 'mora_modalidad';
  raise notice 'OK  Mora 1%% diario: 0 el día de vencimiento, 10.00 el día 31, 104.62 a 10 días (compuesta) / 100.00 (simple)';

  -- Deuda del moroso demo (70000003): 3 cuotas vencidas con mora
  select total_a_regularizar, dias_atraso into v, n from fn_deuda_cliente((select id from clientes where dni='70000003'));
  if v is null or v <= 0 or n < 1 then raise exception 'FALLO deuda moroso % %', v, n; end if;
  select count(*) into n from fn_reporte_morosos();
  if n < 3 then raise exception 'FALLO reporte morosos %', n; end if;
  raise notice 'OK  Deuda con mora y reporte de morosos/extrajudiciales';

  -- Préstamo con todas las cuotas pagadas -> CANCELADO y cupo liberado
  c := fn_registrar_cliente('DNI','75555551','PAGA','TODO','987654321',null,true,w_tru, date '2035-12-31');
  perform fn_aprobar_prestamo(c, 6000, 3, w_tru, true);
  update cuotas set estado='PAGADA', fecha_pago=current_date where prestamo_id in (select id from prestamos where cliente_id=c);
  perform fn_actualizar_estados(c);
  if (select estado from prestamos where cliente_id=c) <> 'CANCELADO' or fn_capital_vigente(c) <> 0 then
    raise exception 'FALLO cancelación automática'; end if;
  raise notice 'OK  Préstamo totalmente pagado pasa a CANCELADO y libera su cupo';

  -- Modo de liberación de cupo: parcial vs solo al cancelar
  c := fn_registrar_cliente('DNI','75555552','LIBERA','CUPO','987654321',null,true,w_tru, date '2035-12-31');
  perform fn_aprobar_prestamo(c, 10000, 4, w_tru, true);
  update cuotas set estado='PAGADA', fecha_pago=current_date
   where numero <= 2 and prestamo_id in (select id from prestamos where cliente_id=c);
  update parametros set valor = 'CAPITAL_AMORTIZADO' where clave = 'liberacion_cupo';
  if fn_capital_vigente(c) <> 5000 then raise exception 'FALLO liberación parcial %', fn_capital_vigente(c); end if;
  update parametros set valor = 'AL_CANCELAR' where clave = 'liberacion_cupo';
  r := fn_evaluar_prestamo(c, 1000, 3);
  if (r->>'aprobable')::boolean or fn_capital_vigente(c) <> 10000 then raise exception 'FALLO liberación solo al cancelar'; end if;
  update parametros set valor = 'AL_CANCELAR' where clave = 'liberacion_cupo';   -- v1.3: 05 dejaba CAPITAL_AMORTIZADO
  raise notice 'OK  Liberación de cupo configurable (por capital amortizado / solo al cancelar)';

  -- v1.3 HU-11 CA4: dos préstamos de 5,000 (12 y 2 meses); al CANCELAR el de 2 meses vuelve el cupo
  c := fn_registrar_cliente('DNI','76666661','DOS','PRESTAMOS','987654321',null,true,w_tru, date '2035-12-31');
  perform fn_aprobar_prestamo(c, 5000, 12, w_tru, true);
  perform fn_aprobar_prestamo(c, 5000, 2,  w_tru, true);
  r := fn_evaluar_prestamo(c, 1000, 3);
  if (r->>'aprobable')::boolean then raise exception 'FALLO CA4 sin cupo %', r; end if;
  update cuotas set estado='PAGADA', fecha_pago=current_date
   where numero = 1 and prestamo_id in (select id from prestamos where cliente_id=c and plazo_meses=2);
  if fn_capital_vigente(c) <> 10000 then raise exception 'FALLO CA4 pago parcial no libera: %', fn_capital_vigente(c); end if;
  update cuotas set estado='PAGADA', fecha_pago=current_date
   where numero = 2 and prestamo_id in (select id from prestamos where cliente_id=c and plazo_meses=2);
  perform fn_actualizar_estados(c);
  if fn_capital_vigente(c) <> 5000 then raise exception 'FALLO CA4 cancelado libera 5000: %', fn_capital_vigente(c); end if;
  r := fn_evaluar_prestamo(c, 5000, 6);
  if not (r->>'aprobable')::boolean then raise exception 'FALLO CA4 vuelve a pedir 5000 %', r; end if;
  raise notice 'OK  HU-11 CA4 (AL_CANCELAR): pago parcial no libera cupo; al cancelar el de 2 meses vuelve a poder pedir 5,000';

  -- v1.3 RUC opcional (D2)
  c := fn_registrar_cliente('DNI','76666662','CON','RUC','987654321',null,true,w_tru, date '2035-12-31','20601030013','  rextie   s.a.c. ');
  select razon_social into msg from clientes where id = c;
  if msg <> 'REXTIE S.A.C.' or (select ruc from clientes where id = c) <> '20601030013' then raise exception 'FALLO RUC guardado %', msg; end if;
  begin perform fn_registrar_cliente('DNI','76666663','A','B','987654321',null,true,w_tru, date '2035-12-31','30601030013','X SAC'); raise exception 'FALLO RUC prefijo 30';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_registrar_cliente('DNI','76666663','A','B','987654321',null,true,w_tru, date '2035-12-31','2060103001','X SAC'); raise exception 'FALLO RUC 10 dígitos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_registrar_cliente('DNI','76666663','A','B','987654321',null,true,w_tru, date '2035-12-31','20601030013',null); raise exception 'FALLO RUC sin razón social';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform fn_registrar_cliente('CE','76666664','A','B','987654321',null,true,w_tru, date '2035-12-31','20601030013','X SAC'); raise exception 'FALLO RUC no sustituye DNI';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  RUC: se guarda con razón social normalizada; rechaza prefijo distinto de 10/20, longitud, falta de razón social y tipo de documento no DNI';

  -- v1.3 HU-16: evaluar queda en la bitácora; aprobar no duplica; la bitácora no se edita
  select count(*) into n from bitacora where accion = 'EVALUAR_PRESTAMO';
  v := n;
  r := fn_evaluar_prestamo(c, 100, 3);
  select count(*) into n from bitacora where accion = 'EVALUAR_PRESTAMO';
  if n <> v + 1 then raise exception 'FALLO evaluar no registra bitácora (% -> %)', v, n; end if;
  if (select (detalle->>'monto')::numeric from bitacora where accion='EVALUAR_PRESTAMO' order by id desc limit 1) <> 100 then
    raise exception 'FALLO detalle de evaluar'; end if;
  perform fn_aprobar_prestamo(c, 100, 3, w_tru, true);
  select count(*) into n from bitacora where accion = 'EVALUAR_PRESTAMO';
  if n <> v + 1 then raise exception 'FALLO aprobar duplicó EVALUAR_PRESTAMO (% -> %)', v + 1, n; end if;
  select count(*) into n from prestamos where cliente_id = c;
  if n <> 1 then raise exception 'FALLO evaluar no debe crear préstamos (solo el aprobado) %', n; end if;
  begin update bitacora set accion = 'X' where id = (select max(id) from bitacora); raise exception 'FALLO bitácora editable';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin delete from bitacora where id = (select max(id) from bitacora); raise exception 'FALLO bitácora borrable';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK  HU-16: evaluar registra EVALUAR_PRESTAMO (aprobar no lo duplica) y la bitácora no se edita ni se borra';

  -- v1.3 Demo 70000007 (de 04b_demo_cupo_liberado.sql): solo si fue cargado
  if exists (select 1 from clientes where dni = '70000007') then
    c := (select id from clientes where dni = '70000007');
    if fn_capital_vigente(c) <> 4000 then raise exception 'FALLO demo 70000007 vigente %', fn_capital_vigente(c); end if;
    r := fn_evaluar_prestamo(c, 6000, 12);
    if not (r->>'aprobable')::boolean then raise exception 'FALLO demo 70000007 puede pedir 6000 %', r; end if;
    raise notice 'OK  Demo 70000007: préstamo cancelado libera cupo; el parcialmente pagado no (puede pedir 6,000)';
  end if;

  -- Reporte por sede devuelve 5 filas (con ingresos cobrados)
  select count(*) into n from fn_reporte_sedes();
  if n <> 5 then raise exception 'FALLO reporte sedes'; end if;
  raise notice 'OK  T-21 Reporte por sede (5 sedes)';
end $$;
