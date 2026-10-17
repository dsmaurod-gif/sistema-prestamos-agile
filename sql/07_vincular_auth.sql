-- =====================================================================
-- 07_vincular_auth.sql  ·  Vincula los usuarios de Supabase Auth con 'trabajadores'
-- Se ejecuta en el SQL Editor de Supabase. Ejecuta los bloques UNO A UNO (el editor
-- muestra solo el resultado de la última consulta). Es re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BLOQUE 1 · Diagnóstico: ¿qué usuarios existen en Auth?
-- Debe listar los 6 correos de abajo. Si sale VACÍO, aún no los has creado:
--   Authentication > Users > Add user > Create new user (activar "Auto Confirm User").
-- ---------------------------------------------------------------------
select id, email, email_confirmed_at from auth.users order by email;

-- ---------------------------------------------------------------------
-- BLOQUE 2 · Diagnóstico: correos de 'trabajadores' que NO tienen usuario en Auth
-- Debe salir vacío. Lo que aparezca aquí es lo que falta crear (o está escrito distinto).
--   trabajador.chimbote@prestamos.demo   trabajador.trujillo@prestamos.demo
--   trabajador.chiclayo@prestamos.demo   trabajador.piura@prestamos.demo
--   trabajador.tumbes@prestamos.demo     admin@prestamos.demo
-- ---------------------------------------------------------------------
select t.email as correo_sin_usuario_en_auth
  from trabajadores t
  left join auth.users u on lower(u.email) = lower(t.email)
 where u.id is null;

-- ---------------------------------------------------------------------
-- BLOQUE 3 · Vincular (por correo, sin distinguir mayúsculas)
-- ---------------------------------------------------------------------
update trabajadores t
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(t.email)
   and t.auth_user_id is null;

-- ---------------------------------------------------------------------
-- BLOQUE 4 · Verificación: todos deben decir vinculado = true
-- ---------------------------------------------------------------------
select t.email, t.rol, s.ciudad as sede, (t.auth_user_id is not null) as vinculado
  from trabajadores t join sedes s on s.id = t.sede_id
 order by t.rol, s.ciudad;

-- ---------------------------------------------------------------------
-- OPCIONAL · Si creaste los usuarios con OTROS correos (por ejemplo, uno real tuyo),
-- no hace falta recrearlos: cambia el correo en 'trabajadores' y repite el BLOQUE 3.
--   update trabajadores set email = 'tu.correo@gmail.com'
--    where email = 'trabajador.trujillo@prestamos.demo';
-- ---------------------------------------------------------------------
