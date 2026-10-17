-- =====================================================================
-- 04b_demo_cupo_liberado.sql  ·  Escenario demo para liberacion_cupo = AL_CANCELAR (v1.3)
-- Ejecutar DESPUÉS de 08 y 04 (usa sp_demo_cliente y sp_demo_prestamo que crea 04). Re-ejecutable.
-- Reemplaza la demostración del cliente 70000002, que con AL_CANCELAR ya no libera cupo a mitad de pago.
-- DNI ficticio. Cliente 70000007 (Chimbote):
--   * Préstamo A: 6,000 a 6 meses, TODAS las cuotas pagadas  -> CANCELADO -> su cupo se libera
--   * Préstamo B: 4,000 a 12 meses, 2 cuotas pagadas         -> sigue VIGENTE -> NO libera nada
--   Capital vigente 4,000 · disponible 6,000 · Al día.
-- =====================================================================

do $$
declare c uuid;
begin
  select id into c from clientes where dni = '70000007';
  if c is not null then
    delete from cuotas where prestamo_id in (select id from prestamos where cliente_id = c);
    delete from prestamos where cliente_id = c;
    delete from clientes where id = c;
  end if;

  c := sp_demo_cliente('70000007','PEDRO','LOPEZ CAMPOS','Chimbote');
  perform sp_demo_prestamo(c,'Chimbote', 6000, 6, 200, 6);    -- A: 6 de 6 cuotas pagadas
  perform sp_demo_prestamo(c,'Chimbote', 4000, 12, 70, 2);    -- B: 2 de 12 pagadas, la siguiente vence en 20 días
end $$;

select fn_actualizar_estados(null);

select c.dni, c.nombres || ' ' || c.apellidos as cliente, c.estado,
       fn_capital_vigente(c.id) as capital_vigente,
       (select string_agg(p.monto || ':' || p.estado, ' · ' order by p.fecha_desembolso) from prestamos p where p.cliente_id = c.id) as prestamos
  from clientes c where c.dni = '70000007';
