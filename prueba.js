import { supabase } from './supabase.js';

async function probarConexion() {
  // Intentamos hacer un select sencillo a una de tus tablas (ej. 'sedes' o la que tengas)
  const { data, error } = await supabase.from('sedes').select('*').limit(1);

  if (error) {
    console.error('❌ Error al conectar con Supabase:', error.message);
  } else {
    console.log('✅ ¡Conexión exitosa con Supabase! Datos obtenidos:', data);
  }
}

probarConexion();