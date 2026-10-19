-- =====================================================================
-- 01_schema.sql  ·  Sistema de Préstamos (MVP)  ·  PostgreSQL 13+
-- Tablas, restricciones e índices. Ejecutar primero.
-- Compatible con Supabase (SQL Editor) y con PostgreSQL normal.
-- =====================================================================

create table sedes (
  id      serial primary key,
  nombre  text not null unique,
  ciudad  text not null
);

create table trabajadores (
  id            uuid primary key default gen_random_uuid(),
  sede_id       int  not null references sedes(id),
  nombre        text not null,
  email         text not null unique,
  rol           text not null default 'TRABAJADOR' check (rol in ('TRABAJADOR','ADMIN')),
  activo        boolean not null default true,
  auth_user_id  uuid,                         -- vínculo opcional con Supabase Auth
  creado_en     timestamptz not null default now()
);

-- Parámetros configurables (así, si el profesor aclara algo, no se toca código)
create table parametros (
  clave  text primary key,
  valor  text not null,
  nota   text
);

create table clientes (
  id                   uuid primary key default gen_random_uuid(),
  tipo_documento       text not null default 'DNI' check (tipo_documento = 'DNI'),  -- RN-04: solo DNI
  dni                  char(8) not null unique check (dni ~ '^[0-9]{8}$'),
  dni_caducidad        date not null,                    -- el DNI debe estar vigente
  nombres              text not null check (nombres  ~ '^[^0-9]+$' and length(trim(nombres))  > 0),
  apellidos            text not null check (apellidos ~ '^[^0-9]+$' and length(trim(apellidos)) > 0),
  telefono             text not null check (telefono ~ '^[0-9+ ]{7,15}$'),
  direccion            text,
  nombre_verificado    boolean not null default false,  -- true = validado contra el servicio de identidad
  estado               text not null default 'AL_DIA' check (estado in ('AL_DIA','MOROSO','EXTRAJUDICIAL')),
  fecha_moroso         date,
  fecha_extrajudicial  date,
  sede_registro_id     int  not null references sedes(id),
  creado_por           uuid not null references trabajadores(id),
  creado_en            timestamptz not null default now()
);
create index ix_clientes_nombre on clientes (apellidos, nombres);
create index ix_clientes_estado on clientes (estado);

create table prestamos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id),
  sede_id           int  not null references sedes(id),
  trabajador_id     uuid not null references trabajadores(id),
  monto             numeric(12,2) not null check (monto > 0 and monto <= 10000),   -- RN-05 (doble seguro)
  plazo_meses       int  not null check (plazo_meses between 1 and 60),            -- RN-08
  tea               numeric(6,4) not null,           -- 0.3000 = 30% TEA
  metodo_cuota      text not null check (metodo_cuota in ('CUOTA_FIJA','CAPITAL_CONSTANTE')),
  fecha_desembolso  date not null,
  estado            text not null default 'VIGENTE' check (estado in ('VIGENTE','CANCELADO')),   -- no existe anulación: el préstamo es irreversible
  creado_en         timestamptz not null default now()
);
create index ix_prestamos_cliente on prestamos (cliente_id);
create index ix_prestamos_sede    on prestamos (sede_id);

create table cuotas (
  id                 uuid primary key default gen_random_uuid(),
  prestamo_id        uuid not null references prestamos(id) on delete cascade,
  numero             int  not null check (numero >= 1),
  fecha_vencimiento  date not null,
  cuota              numeric(12,2) not null check (cuota  >= 0),
  capital            numeric(12,2) not null check (capital >= 0),
  interes            numeric(12,2) not null check (interes >= 0),
  saldo              numeric(12,2) not null,
  estado             text not null default 'PENDIENTE' check (estado in ('PENDIENTE','PAGADA','VENCIDA')),
  fecha_pago         date,
  unique (prestamo_id, numero)
);
create index ix_cuotas_venc   on cuotas (fecha_vencimiento) where estado <> 'PAGADA';
create index ix_cuotas_estado on cuotas (estado);

create table bitacora (
  id             bigserial primary key,
  fecha          timestamptz not null default now(),
  trabajador_id  uuid references trabajadores(id),
  sede_id        int  references sedes(id),
  accion         text not null,
  entidad        text not null,
  entidad_id     uuid,
  detalle        jsonb
);
