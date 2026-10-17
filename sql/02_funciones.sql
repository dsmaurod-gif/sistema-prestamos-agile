-- =====================================================================
-- 02_funciones.sql  ·  Reglas de negocio dentro de la base de datos
-- Ejecutar después de 01_schema.sql
-- =====================================================================

-- Firmas que cambiaron en la v2 (permite volver a ejecutar este archivo sin errores)
drop function if exists fn_registrar_cliente(text,text,text,text,text,text,boolean,uuid);
drop function if exists fn_aprobar_prestamo(uuid,numeric,int,uuid);
drop function if exists fn_reporte_sedes(date,date);

-- ---------- Utilitarios ----------
create or replace function fn_param_txt(p_clave text) returns text
language sql stable as $$ select valor from parametros where clave = p_clave $$;

create or replace function fn_param_num(p_clave text) returns numeric
language sql stable as $$ select valor::numeric from parametros where clave = p_clave $$;

-- Fecha "de hoy" del sistema (America/Lima). En modo demo puede simularse
-- con el parámetro 'fecha_referencia' (formato AAAA-MM-DD). Vacío = fecha real.
create or replace function fn_fecha_hoy() returns date
language sql stable as $$
  select coalesce(nullif(fn_param_txt('fecha_referencia'), '')::date,
                  (now() at time zone 'America/Lima')::date)
$$;

-- ---------- Cronograma (HU-08) ----------
-- Métodos: CUOTA_FIJA (francés) o CAPITAL_CONSTANTE. TEM = (1+TEA)^(dias/360)-1
-- La última cuota absorbe el redondeo: el saldo final es exactamente 0.00
create or replace function fn_generar_cronograma(
  p_monto numeric, p_plazo int, p_fecha_desembolso date,
  p_tea numeric default null, p_metodo text default null, p_dias int default null)
returns table (numero int, fecha_vencimiento date, cuota numeric,
               capital numeric, interes numeric, saldo numeric)
language plpgsql stable as $$
declare
  v_tea    numeric := coalesce(p_tea,    fn_param_num('tea'));
  v_metodo text    := coalesce(p_metodo, fn_param_txt('metodo_cuota'));
  v_dias   int     := coalesce(p_dias,   fn_param_num('dias_entre_cuotas')::int);
  v_tem    numeric := power(1 + v_tea, v_dias / 360.0) - 1;
  v_cuota_fija numeric;
  v_saldo  numeric := p_monto;
  k int; v_int numeric; v_cap numeric; v_cuo numeric;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;
  if p_plazo is null or p_plazo < fn_param_num('plazo_min_meses') or p_plazo > fn_param_num('plazo_max_meses') then
    raise exception 'El plazo debe ser de % a % meses.', fn_param_num('plazo_min_meses'), fn_param_num('plazo_max_meses');
  end if;
  if v_metodo not in ('CUOTA_FIJA','CAPITAL_CONSTANTE') then
    raise exception 'Método de cuota no válido: %', v_metodo;
  end if;

  if v_metodo = 'CUOTA_FIJA' then
    v_cuota_fija := round(p_monto * v_tem / (1 - power(1 + v_tem, -p_plazo)), 2);
  end if;

  for k in 1 .. p_plazo loop
    v_int := round(v_saldo * v_tem, 2);
    if k = p_plazo then
      v_cap := v_saldo;  v_cuo := v_cap + v_int;
    elsif v_metodo = 'CUOTA_FIJA' then
      v_cuo := v_cuota_fija;  v_cap := v_cuo - v_int;
    else
      -- capital acumulado exacto: round(M*k/n) - round(M*(k-1)/n) (suma M y no se pasa nunca)
      v_cap := round(p_monto * k / p_plazo, 2) - round(p_monto * (k - 1) / p_plazo, 2);
      v_cuo := v_cap + v_int;
    end if;
    v_saldo := v_saldo - v_cap;

    numero := k;
    fecha_vencimiento := p_fecha_desembolso + (v_dias * k);
    cuota := v_cuo;  capital := v_cap;  interes := v_int;  saldo := v_saldo;
    return next;
  end loop;
end $$;

-- ---------- Capital vigente (RN-05/06/07) ----------
-- Capital vigente = suma del capital de las cuotas NO pagadas de préstamos vigentes.
create or replace function fn_capital_vigente(p_cliente uuid) returns numeric
language sql stable as $$
  select case
    -- Modo AL_CANCELAR: el cupo solo se libera al pagar el préstamo completo (pendiente de confirmar)
    when fn_param_txt('liberacion_cupo') = 'AL_CANCELAR'
      then coalesce((select sum(p.monto) from prestamos p
                      where p.cliente_id = p_cliente and p.estado = 'VIGENTE'), 0)
    -- Modo CAPITAL_AMORTIZADO: se libera el capital de las cuotas ya pagadas
    else coalesce((select sum(c.capital) from cuotas c join prestamos p on p.id = c.prestamo_id
                    where p.cliente_id = p_cliente and p.estado = 'VIGENTE' and c.estado <> 'PAGADA'), 0)
  end
$$;

-- ---------- Estados: Moroso / Extrajudicial (RN-18, RN-20) ----------
-- Se puede llamar para un cliente o para todos (p_cliente = null; tarea diaria).
create or replace function fn_actualizar_estados(p_cliente uuid default null) returns void
language plpgsql as $$
declare v_hoy date := fn_fecha_hoy();
begin
  -- 0) Préstamo con todas sus cuotas pagadas -> CANCELADO (libera todo su cupo)
  update prestamos p set estado = 'CANCELADO'
   where p.estado = 'VIGENTE' and (p_cliente is null or p.cliente_id = p_cliente)
     and not exists (select 1 from cuotas c where c.prestamo_id = p.id and c.estado <> 'PAGADA');

  -- 1) Cuotas pendientes cuyo vencimiento ya pasó (el día de vencimiento aún es "al día")
  update cuotas c set estado = 'VENCIDA'
    from prestamos p
   where c.prestamo_id = p.id and p.estado = 'VIGENTE' and c.estado = 'PENDIENTE'
     and c.fecha_vencimiento < v_hoy
     and (p_cliente is null or p.cliente_id = p_cliente);

  -- 2) Al día -> Moroso (fecha_moroso = día siguiente al vencimiento más antiguo)
  update clientes cl set estado = 'MOROSO',
         fecha_moroso = (select min(c.fecha_vencimiento) + 1
                           from cuotas c join prestamos p on p.id = c.prestamo_id
                          where p.cliente_id = cl.id and p.estado = 'VIGENTE' and c.estado = 'VENCIDA')
   where cl.estado = 'AL_DIA'
     and (p_cliente is null or cl.id = p_cliente)
     and exists (select 1 from cuotas c join prestamos p on p.id = c.prestamo_id
                  where p.cliente_id = cl.id and p.estado = 'VIGENTE' and c.estado = 'VENCIDA');

  -- 3) Moroso -> Extrajudicial: más de N días (365) sin ningún pago, contados desde
  --    el mayor entre la fecha en que pasó a moroso y su último pago (SUP-06)
  update clientes cl set estado = 'EXTRAJUDICIAL', fecha_extrajudicial = v_hoy
   where cl.estado = 'MOROSO'
     and (p_cliente is null or cl.id = p_cliente)
     and v_hoy - greatest(cl.fecha_moroso,
                          coalesce((select max(c.fecha_pago)
                                      from cuotas c join prestamos p on p.id = c.prestamo_id
                                     where p.cliente_id = cl.id), cl.fecha_moroso))
         > fn_param_num('dias_extrajudicial')::int;
end $$;


-- ---------- Mora: 1% por día de atraso (RN-24) ----------
-- Atraso = días transcurridos desde el vencimiento (el día 31 cuenta como 1 día).
-- COMPUESTA: la mora se capitaliza cada día sobre el monto acumulado -> cuota * ((1+m)^días - 1)
-- SIMPLE:    cuota * m * días       (modalidad pendiente de confirmar con el profesor)
create or replace function fn_mora(p_cuota numeric, p_vencimiento date, p_hoy date default null)
returns numeric language plpgsql stable as $$
declare
  v_dias int := greatest(coalesce(p_hoy, fn_fecha_hoy()) - p_vencimiento, 0);
  v_m numeric := fn_param_num('mora_diaria');
begin
  if v_dias = 0 then return 0; end if;
  if fn_param_txt('mora_modalidad') = 'SIMPLE' then
    return round(p_cuota * v_m * v_dias, 2);
  end if;
  return round(p_cuota * (power(1 + v_m, v_dias) - 1), 2);
end $$;

-- Deuda vencida de un cliente (sin actualizar estados; ver fn_deuda_cliente)
create or replace function fn_deuda_calc(p_cliente uuid)
returns table (cuotas_vencidas int, deuda_vencida numeric, mora numeric,
               total_a_regularizar numeric, dias_atraso int, vencimiento_mas_antiguo date)
language sql stable as $$
  select count(*)::int, coalesce(sum(x.cuota),0), coalesce(sum(x.mora),0),
         coalesce(sum(x.cuota + x.mora),0), coalesce(max(x.dias),0)::int, min(x.venc)
    from (select c.cuota, c.fecha_vencimiento as venc,
                 greatest(fn_fecha_hoy() - c.fecha_vencimiento, 0) as dias,
                 fn_mora(c.cuota, c.fecha_vencimiento) as mora
            from cuotas c join prestamos p on p.id = c.prestamo_id
           where p.cliente_id = p_cliente and p.estado = 'VIGENTE' and c.estado = 'VENCIDA') x
$$;

create or replace function fn_deuda_cliente(p_cliente uuid)
returns table (cuotas_vencidas int, deuda_vencida numeric, mora numeric,
               total_a_regularizar numeric, dias_atraso int, vencimiento_mas_antiguo date)
language plpgsql as $$
begin
  perform fn_actualizar_estados(p_cliente);
  return query select * from fn_deuda_calc(p_cliente);
end $$;

-- Reporte de morosos y extrajudiciales (HU-15), listo para exportar a CSV
create or replace function fn_reporte_morosos(p_sede int default null)
returns table (dni text, cliente text, telefono text, estado text, fecha_moroso date,
               cuotas_vencidas int, dias_atraso int, deuda_vencida numeric, mora numeric,
               total_a_regularizar numeric, ultimo_pago date, sedes text)
language plpgsql as $$
#variable_conflict use_column
begin
  perform fn_actualizar_estados(null);
  return query
  select cl.dni::text, cl.apellidos || ', ' || cl.nombres, cl.telefono, cl.estado, cl.fecha_moroso,
         d.cuotas_vencidas, d.dias_atraso, d.deuda_vencida, d.mora, d.total_a_regularizar,
         (select max(c.fecha_pago) from cuotas c join prestamos p on p.id = c.prestamo_id where p.cliente_id = cl.id),
         (select string_agg(distinct s.nombre, ', ') from prestamos p join sedes s on s.id = p.sede_id
           where p.cliente_id = cl.id and p.estado = 'VIGENTE')
    from clientes cl cross join lateral fn_deuda_calc(cl.id) d
   where cl.estado in ('MOROSO','EXTRAJUDICIAL')
     and (p_sede is null or exists (select 1 from prestamos p where p.cliente_id = cl.id
                                      and p.estado = 'VIGENTE' and p.sede_id = p_sede))
   order by cl.estado, d.dias_atraso desc;
end $$;

-- ---------- Registrar cliente (HU-03, HU-04) ----------
create or replace function fn_registrar_cliente(
  p_tipo_documento text, p_dni text, p_nombres text, p_apellidos text,
  p_telefono text, p_direccion text, p_verificado boolean, p_trabajador uuid,
  p_dni_caducidad date)
returns uuid language plpgsql as $$
declare v_t trabajadores%rowtype; v_id uuid; v_existe uuid;
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
  select id into v_existe from clientes where dni = p_dni;
  if found then raise exception 'Ya existe un cliente registrado con el DNI % (id %).', p_dni, v_existe; end if;

  insert into clientes (dni, dni_caducidad, nombres, apellidos, telefono, direccion, nombre_verificado,
                        sede_registro_id, creado_por)
  values (p_dni, p_dni_caducidad,
          upper(regexp_replace(trim(p_nombres),   '\s+', ' ', 'g')),
          upper(regexp_replace(trim(p_apellidos), '\s+', ' ', 'g')),
          trim(p_telefono), nullif(trim(p_direccion), ''), coalesce(p_verificado, false),
          v_t.sede_id, v_t.id)
  returning id into v_id;

  insert into bitacora (trabajador_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_t.id, v_t.sede_id, 'CREAR_CLIENTE', 'cliente', v_id,
          jsonb_build_object('dni', p_dni, 'verificado', coalesce(p_verificado,false)));
  return v_id;
end $$;

-- ---------- Evaluar solicitud + informe (HU-06) ----------
-- No crea nada. Devuelve TODOS los motivos de rechazo, no solo el primero.
create or replace function fn_evaluar_prestamo(p_cliente uuid, p_monto numeric, p_plazo int)
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

-- ---------- Aprobar préstamo (HU-07) ----------
-- Atómico. Bloquea la fila del cliente: si dos sedes aprueban a la vez,
-- la segunda espera y se revalida con el capital ya actualizado (RNF-02).
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

  v_eval := fn_evaluar_prestamo(p_cliente, p_monto, p_plazo);
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

-- ---------- Reporte por sede (HU-17) ----------
-- ingresos_cobrados = dinero de cuotas marcadas como pagadas (con el módulo de pagos serán los reales)
create or replace function fn_reporte_sedes(p_desde date default null, p_hasta date default null)
returns table (sede text, clientes_nuevos bigint, prestamos_otorgados bigint,
               capital_colocado numeric, capital_vigente numeric, intereses_proyectados numeric,
               ingresos_cobrados numeric, clientes_morosos bigint, clientes_extrajudiciales bigint)
language plpgsql as $$
#variable_conflict use_column
begin
  perform fn_actualizar_estados(null);
  return query
  select s.nombre,
    (select count(*) from clientes c where c.sede_registro_id = s.id
        and (p_desde is null or c.creado_en::date >= p_desde) and (p_hasta is null or c.creado_en::date <= p_hasta)),
    (select count(*) from prestamos p where p.sede_id = s.id
        and (p_desde is null or p.fecha_desembolso >= p_desde) and (p_hasta is null or p.fecha_desembolso <= p_hasta)),
    (select coalesce(sum(p.monto),0) from prestamos p where p.sede_id = s.id
        and (p_desde is null or p.fecha_desembolso >= p_desde) and (p_hasta is null or p.fecha_desembolso <= p_hasta)),
    (select coalesce(sum(c.capital),0) from cuotas c join prestamos p on p.id = c.prestamo_id
        where p.sede_id = s.id and p.estado = 'VIGENTE' and c.estado <> 'PAGADA'),
    (select coalesce(sum(c.interes),0) from cuotas c join prestamos p on p.id = c.prestamo_id
        where p.sede_id = s.id and p.estado = 'VIGENTE' and c.estado <> 'PAGADA'),
    (select coalesce(sum(c.cuota),0) from cuotas c join prestamos p on p.id = c.prestamo_id
        where p.sede_id = s.id and c.estado = 'PAGADA'
          and (p_desde is null or c.fecha_pago >= p_desde) and (p_hasta is null or c.fecha_pago <= p_hasta)),
    (select count(distinct cl.id) from clientes cl join prestamos p on p.cliente_id = cl.id
        where p.sede_id = s.id and p.estado = 'VIGENTE' and cl.estado = 'MOROSO'),
    (select count(distinct cl.id) from clientes cl join prestamos p on p.cliente_id = cl.id
        where p.sede_id = s.id and p.estado = 'VIGENTE' and cl.estado = 'EXTRAJUDICIAL')
  from sedes s order by s.id;
end $$;

-- ---------- Protecciones (inmutabilidad) ----------
create or replace function tg_cliente_inmutable() returns trigger language plpgsql as $$
begin
  if old.nombre_verificado and (new.nombres is distinct from old.nombres
        or new.apellidos is distinct from old.apellidos or new.dni is distinct from old.dni) then
    raise exception 'El nombre y el DNI de un cliente verificado no pueden modificarse.';
  end if;
  return new;
end $$;
drop trigger if exists trg_cliente_inmutable on clientes;
create trigger trg_cliente_inmutable before update on clientes
  for each row execute function tg_cliente_inmutable();

create or replace function tg_prestamo_inmutable() returns trigger language plpgsql as $$
begin
  if new.monto <> old.monto or new.plazo_meses <> old.plazo_meses or new.tea <> old.tea
     or new.metodo_cuota <> old.metodo_cuota or new.fecha_desembolso <> old.fecha_desembolso
     or new.cliente_id <> old.cliente_id then
    raise exception 'Un préstamo aprobado no puede modificarse (monto, plazo, tasa o fechas).';
  end if;
  return new;
end $$;
drop trigger if exists trg_prestamo_inmutable on prestamos;
create trigger trg_prestamo_inmutable before update on prestamos
  for each row execute function tg_prestamo_inmutable();

create or replace function tg_cuota_inmutable() returns trigger language plpgsql as $$
begin
  if new.cuota <> old.cuota or new.capital <> old.capital or new.interes <> old.interes
     or new.saldo <> old.saldo or new.fecha_vencimiento <> old.fecha_vencimiento or new.numero <> old.numero then
    raise exception 'El cronograma de un préstamo aprobado no puede modificarse.';
  end if;
  return new;
end $$;
drop trigger if exists trg_cuota_inmutable on cuotas;
create trigger trg_cuota_inmutable before update on cuotas
  for each row execute function tg_cuota_inmutable();

-- Bitácora automática de cambios de estado del cliente
create or replace function tg_cliente_estado_bitacora() returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    insert into bitacora (accion, entidad, entidad_id, detalle)
    values ('CAMBIO_ESTADO', 'cliente', new.id,
            jsonb_build_object('de', old.estado, 'a', new.estado, 'fecha', fn_fecha_hoy()));
  end if;
  return new;
end $$;
drop trigger if exists trg_cliente_estado_bitacora on clientes;
create trigger trg_cliente_estado_bitacora after update of estado on clientes
  for each row execute function tg_cliente_estado_bitacora();
