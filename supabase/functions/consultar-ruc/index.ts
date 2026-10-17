// Consulta de RUC (SUNAT) vía decolecta. El token vive solo como secret PERU_API_TOKEN.
// Entrada: POST { "ruc": "20601030013" } · Salida: { existe, ruc, razon_social, estado, condicion } | { existe: false } | { error }
const URL_PROVEEDOR = "https://api.decolecta.com/v1/sunat/ruc";
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

const noDisponible = () => responder({ error: "Servicio de consulta de RUC no disponible" }, 502);

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405);

  let ruc: unknown;
  try {
    ({ ruc } = await req.json());
  } catch {
    return responder({ error: "El cuerpo debe ser JSON con el campo ruc." }, 400);
  }
  if (typeof ruc !== "string" || !/^\d{11}$/.test(ruc)) {
    return responder({ error: "El RUC debe tener exactamente 11 dígitos numéricos." }, 400);
  }

  const token = Deno.env.get("PERU_API_TOKEN");
  if (!token) {
    console.error("consultar-ruc: falta el secret PERU_API_TOKEN");
    return noDisponible();
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${URL_PROVEEDOR}?numero=${ruc}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: control.signal,
    });

    // Documentado: 422 "ruc no valido". 400/404 se tratan igual (formato ya validado arriba)
    if ([400, 404, 422].includes(respuesta.status)) return responder({ existe: false });
    if (!respuesta.ok) {
      console.error(`consultar-ruc: el proveedor respondió ${respuesta.status}`);
      return noDisponible();
    }

    const datos = await respuesta.json();
    const razonSocial = texto(datos?.razon_social);
    if (!razonSocial) return responder({ existe: false });
    return responder({
      existe: true,
      ruc,
      razon_social: razonSocial,
      estado: texto(datos?.estado),
      condicion: texto(datos?.condicion),
    });
  } catch (e) {
    console.error(`consultar-ruc: ${e instanceof DOMException ? e.name : "error de red"}`);
    return noDisponible();
  } finally {
    clearTimeout(temporizador);
  }
});
