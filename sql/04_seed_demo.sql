-- =====================================================================
-- 04_seed_demo.sql  ·  Datos de demostración (re-ejecutable = reinicio)
-- Fechas relativas a fn_fecha_hoy(), así los casos siempre funcionan.
-- Los DNI 7000000x y los nombres son FICTICIOS.
-- =====================================================================

-- Reinicio: borra datos de clientes/préstamos (conserva sedes, parámetros y trabajadores)
truncate bitacora, cuotas, prestamos, clientes restart identity cascade;

create or replace function sp_demo_cliente(p_dni text, p_nombres text, p_apellidos text, p_ciudad text)
returns uuid language plpgsql as $$
declare v_t uuid; v_id uuid;
begin
  select t.id into v_t from trabajadores t join sedes s on s.id = t.sede_id
   where s.ciudad = p_ciudad and t.rol = 'TRABAJADOR';
  v_id := fn_registrar_cliente('DNI', p_dni, p_nombres, p_apellidos, '999000111', null, true, v_t, date '2035-12-31');
  return v_id;
end $$;

-- Crea un préstamo "histórico" directamente (sin pasar por la aprobación) y marca cuotas pagadas a tiempo
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

do $$
declare c uuid;
begin
  -- 1) Vigente 7,000: pedir 5,000 -> rechazado (máximo 3,000)
  c := sp_demo_cliente('70000001','CARLOS','RAMIREZ TORRES','Trujillo');
  perform sp_demo_prestamo(c,'Trujillo', 7000, 12, 10, 0);

  -- 2) 10,000 a 24 meses, 12 cuotas pagadas -> capital liberado, puede pedir ~5,000
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
end $$;

select fn_actualizar_estados(null);

select dni, nombres || ' ' || apellidos as cliente, estado,
       fn_capital_vigente(id) as capital_vigente
  from clientes order by dni;
