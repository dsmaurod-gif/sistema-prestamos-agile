-- =====================================================================
-- 10_fix_reporte_sede.sql  ·  Corrige fn_reporte_sedes (re-ejecutable; NO ejecutado aún)
-- Problema: "clientes nuevos" comparaba clientes.creado_en::date, que usa la zona horaria de la
-- sesión (UTC en Supabase), no America/Lima (RNF-09). Un cliente creado el 18/10 a las 22:50 (Lima)
-- se contaba el 19/10, así que un filtro "hasta 18/10" lo dejaba fuera.
-- Único cambio respecto a 02_funciones.sql: (creado_en at time zone 'America/Lima')::date.
-- Misma firma, mismas columnas y mismos totales. Ejecutar después de 08 y 09.
-- =====================================================================
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
        and (p_desde is null or (c.creado_en at time zone 'America/Lima')::date >= p_desde)
        and (p_hasta is null or (c.creado_en at time zone 'America/Lima')::date <= p_hasta)),
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

notify pgrst, 'reload schema';
