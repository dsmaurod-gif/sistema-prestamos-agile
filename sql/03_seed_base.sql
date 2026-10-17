-- =====================================================================
-- 03_seed_base.sql  ·  Datos base: sedes, parámetros y trabajadores
-- Ejecutar después de 02_funciones.sql
-- =====================================================================

insert into sedes (nombre, ciudad) values
  ('Sede Chimbote', 'Chimbote'),
  ('Sede Trujillo', 'Trujillo'),
  ('Sede Chiclayo', 'Chiclayo'),
  ('Sede Piura',    'Piura'),
  ('Sede Tumbes',   'Tumbes');

insert into parametros (clave, valor, nota) values
  ('tea',               '0.30',              'Tasa efectiva anual (30%) - confirmada por el profesor'),
  ('metodo_cuota',      'CAPITAL_CONSTANTE', 'CAPITAL_CONSTANTE o CUOTA_FIJA - PENDIENTE de confirmar (ver SUP-17)'),
  ('tope_capital',      '10000',             'Tope de capital vigente por cliente (S/)'),
  ('plazo_min_meses',   '1',                 'Plazo mínimo'),
  ('plazo_max_meses',   '60',                'Plazo máximo (5 años)'),
  ('dias_entre_cuotas', '30',                'Vencimiento cada 30 días'),
  ('dias_extrajudicial','365',               'Días sin pagos como moroso para pasar a extrajudicial'),
  ('mora_diaria',       '0.01',              'Mora: 1% por día de atraso (confirmado)'),
  ('mora_modalidad',    'COMPUESTA',         'COMPUESTA o SIMPLE - PENDIENTE de confirmar (SUP-12)'),
  ('liberacion_cupo',   'CAPITAL_AMORTIZADO','CAPITAL_AMORTIZADO o AL_CANCELAR - PENDIENTE de confirmar (SUP-18)'),
  ('fecha_referencia',  '',                  'SOLO DEMO: fecha simulada AAAA-MM-DD. Vacío = fecha real');

-- Un trabajador por sede + un administrador (correos de ejemplo)
insert into trabajadores (sede_id, nombre, email, rol)
select s.id, 'Trabajador ' || s.ciudad, 'trabajador.' || lower(s.ciudad) || '@prestamos.demo', 'TRABAJADOR'
  from sedes s;
insert into trabajadores (sede_id, nombre, email, rol)
select id, 'Administrador', 'admin@prestamos.demo', 'ADMIN' from sedes where ciudad = 'Trujillo';
