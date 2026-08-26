// Capa central de acceso al API. Único lugar donde vive la URL del backend:
// cuando la app se empaquete para Android, este módulo se reemplaza por la capa de datos local.
export const API_URL = 'http://localhost:3001/api';

// apiFetch('/blocks?start=...', { method: 'POST', body: {...} })
// - Serializa body a JSON automáticamente.
// - Lanza Error si la respuesta no es ok (status y mensaje del backend).
// - Devuelve el JSON parseado.
export async function apiFetch(path, { method = 'GET', body } = {}) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_URL}${path}`, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch { /* respuesta sin JSON */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
