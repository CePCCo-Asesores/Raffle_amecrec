import { createClient } from '@supabase/supabase-js';

// Credenciales desde variables de entorno (.env)
// Nunca hardcodear keys en el código fuente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Copia .env.example como .env y completa los valores.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };