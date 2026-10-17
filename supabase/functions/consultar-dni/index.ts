// Consulta de DNI (RENIEC) vía decolecta. El token vive solo como secret PERU_API_TOKEN.
// Entrada: POST { "dni": "12345678" } · Salida: { existe, nombres, apellidos } | { existe: false } | { error }
const URL_PROVEEDOR = "https://api.decolecta.com/v1/reniec/dni";
const TIMEOUT_MS = 8000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const noDisponible = () => responder({ error: "Servicio de consulta de DNI no disponible" }, 502);

/** MAYÚSCULAS y sin espacios dobles. */
function normalizar(...partes: unknown[]): string {
  return partes
    .map((p) => (typeof p === "string" ? p : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405);

  let dni: unknown;
  try {
    ({ dni } = await req.json());
  } catch {
    return responder({ error: "El cuerpo debe ser JSON con el campo dni." }, 400);
  }
  if (typeof dni !== "string" || !/^\d{8}$/.test(dni)) {
    return responder({ error: "El DNI debe tener exactamente 8 dígitos numéricos." }, 400);
  }

  const token = Deno.env.get("PERU_API_TOKEN");
  if (!token) {
    console.error("consultar-dni: falta el secret PERU_API_TOKEN");
    return noDisponible();
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${URL_PROVEEDOR}?numero=${dni}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: control.signal,
    });

    // Documento inexistente (el formato ya se validó arriba)
    if ([400, 404, 422].includes(respuesta.status)) return responder({ existe: false });
    if (!respuesta.ok) {
      console.error(`consultar-dni: el proveedor respondió ${respuesta.status}`);
      return noDisponible();
    }

    const datos = await respuesta.json();
    const nombres = normalizar(datos?.first_name);
    const apellidos = normalizar(datos?.first_last_name, datos?.second_last_name);
    if (!nombres || !apellidos) return responder({ existe: false });
    return responder({ existe: true, nombres, apellidos });
  } catch (e) {
    console.error(`consultar-dni: ${e instanceof DOMException ? e.name : "error de red"}`);
    return noDisponible();
  } finally {
    clearTimeout(temporizador);
  }
});
