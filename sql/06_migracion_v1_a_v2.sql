-- =====================================================================
-- 06_migracion_v1_a_v2.sql  ·  SOLO si ya ejecutaste la versión anterior (v1)
-- Orden:  1) este archivo   2) 02_funciones.sql (v2)   3) 04_seed_demo.sql (opcional: reinicia datos)
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- DNI vigente
alter table clientes add column if not exists dni_caducidad date;
update clientes set dni_caducidad = date '2035-12-31' where dni_caducidad is null;
alter table clientes alter column dni_caducidad set not null;

-- No existe anulación de préstamos
update prestamos set estado = 'CANCELADO' where estado = 'ANULADO';
alter table prestamos drop constraint if exists prestamos_estado_check;
alter table prestamos add constraint prestamos_estado_check check (estado in ('VIGENTE','CANCELADO'));

-- Parámetros nuevos
insert into parametros (clave, valor, nota) values
  ('mora_diaria',       '0.01',               'Mora: 1% por día de atraso (confirmado)'),
  ('mora_modalidad',    'COMPUESTA',          'COMPUESTA o SIMPLE - PENDIENTE de confirmar (SUP-12)'),
  ('liberacion_cupo',   'CAPITAL_AMORTIZADO', 'CAPITAL_AMORTIZADO o AL_CANCELAR - PENDIENTE de confirmar (SUP-18)')
on conflict (clave) do nothing;
