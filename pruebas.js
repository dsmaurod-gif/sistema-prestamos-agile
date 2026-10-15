import { supabase } from './supabase.js';

async function registrarClientePrueba() {
  const { data, error } = await supabase
    .from('clientes')
    .insert([
      {
        tipo_documento: 'DNI',
        dni: '12345678',
        nombres: 'Diego Sebastián',
        apellidos: 'Rodríguez',
        telefono: '987654321',
        direccion: 'Trujillo, Perú',
        sede_registro_id: 1,
        creado_por: 'e4b2d2c5-e5e5-4dc1-8ae0-a9a8442b0858'
      }
    ])
    .select();

  if (error) {
    console.error('❌ Error al insertar:', error.message);
  } else {
    console.log('✅ ¡Cliente registrado con éxito en Supabase!', data);
  }
}

registrarClientePrueba();