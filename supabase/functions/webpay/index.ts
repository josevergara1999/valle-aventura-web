/* Webpay Plus (REST) para Cabañas Valle Aventura — Supabase Edge Function.
 *
 * POR QUÉ ESTO EXISTE Y NO PUEDE VIVIR EN LA PÁGINA
 * -------------------------------------------------
 * 1. `Tbk-Api-Key-Secret` es el secreto de comercio. En el navegador queda a la
 *    vista de cualquiera que abra el código — misma regla que la service_role
 *    del panel.
 * 2. Transbank devuelve al cliente con un POST a `return_url`. GitHub Pages
 *    solo sirve GET, así que la vuelta del pago no puede aterrizar en el sitio
 *    estático: aterriza aquí y desde aquí se redirige a la página de resultado.
 *
 * DESPLIEGUE
 *   supabase functions deploy webpay --no-verify-jwt
 *   supabase secrets set TBK_COMMERCE_CODE=... TBK_API_KEY=... TBK_ENV=produccion
 *
 * Sin secretos configurados arranca en el ambiente de INTEGRACIÓN de Transbank
 * con las credenciales públicas de prueba, que no mueven dinero real.
 */

const INTEGRACION = {
  host: 'https://webpay3gint.transbank.cl',
  code: '597055555532',
  key: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
};

const env = Deno.env.get('TBK_ENV') ?? 'integracion';
const esProd = env === 'produccion';

const TBK = {
  host: esProd ? 'https://webpay3g.transbank.cl' : INTEGRACION.host,
  code: Deno.env.get('TBK_COMMERCE_CODE') ?? INTEGRACION.code,
  key: Deno.env.get('TBK_API_KEY') ?? INTEGRACION.key,
};

const SITIO = Deno.env.get('SITIO_URL') ?? 'https://valleaventura-chile.com';
const API = '/rswebpaytransaction/api/webpay/v1.2/transactions';

/* Supabase inyecta estas dos solas en toda Edge Function. La de servicio se
   salta RLS, y por eso vive aquí —en el servidor— y nunca en la página. */
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* Toda la lógica de reservas vive en Postgres y no aquí: las mismas funciones
   las usan la web, el panel, Mercado Pago y mañana el bot. Si cada uno llevara
   su copia, acabarían discrepando en qué está libre y a qué precio. */
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) {
    let m = t;
    try { m = JSON.parse(t).message ?? t; } catch { /* deja el texto */ }
    throw new Error(m);
  }
  return t ? JSON.parse(t) : null;
}

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const cab = () => ({
  'Tbk-Api-Key-Id': TBK.code,
  'Tbk-Api-Key-Secret': TBK.key,
  'Content-Type': 'application/json',
});

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* La orden de compra viaja a Transbank y vuelve; es el hilo que une el pago con
   la reserva. Máximo 26 caracteres según la API. */
const nuevaOrden = () => 'VA' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const ruta = url.pathname.split('/').filter(Boolean).pop();

  /* ── 1. Crear: la página pide un token antes de mandar al cliente a pagar ── */
  if (ruta === 'crear' && req.method === 'POST') {
    try {
      const b = await req.json();
      if (!b.desde || !b.hasta || !b.nombre || !b.email) {
        return json({ error: 'Faltan datos de la reserva' }, 400);
      }

      /* PRIMERO se aparta la cabaña, DESPUÉS se cobra. Al revés, dos personas
         pueden pagar la misma noche y una se queda sin dónde dormir.
         La reserva nace pendiente y caduca sola a los 30 minutos, así que si
         algo falla más abajo no hay que deshacer nada. */
      let reserva;
      try {
        reserva = await rpc('solicitar_reserva', {
          p_desde: b.desde, p_hasta: b.hasta,
          p_adultos: Number(b.adultos ?? b.personas ?? 0),
          p_ninos: Number(b.ninos ?? 0),
          p_nombre: b.nombre, p_telefono: b.fono ?? b.telefono ?? '',
          p_email: b.email, p_medio: 'webpay',
        });
      } catch (e) {
        // El mensaje viene de la base y ya está escrito para el cliente.
        return json({ error: String((e as Error).message) }, 409);
      }

      /* El monto lo pone Postgres, no el navegador: lo que manda la página se
         puede editar antes de enviarlo. */
      const monto = Math.round(Number(reserva?.cotizacion?.anticipo));
      if (!Number.isFinite(monto) || monto <= 0) {
        return json({ error: 'No pudimos calcular el anticipo de esa reserva' }, 500);
      }

      /* La orden de compra de Transbank admite 26 caracteres y el id de la
         reserva es un UUID de 36, así que no cabe. Se manda una orden corta y
         el id real viaja en `session_id`, que sí admite 61. */
      const orden = nuevaOrden();
      const idReserva = String(reserva.id);

      const r = await fetch(TBK.host + API, {
        method: 'POST',
        headers: cab(),
        body: JSON.stringify({
          buy_order: orden,
          session_id: idReserva,   // el UUID vuelve intacto en el commit
          amount: monto,
          return_url: `${url.origin}${url.pathname.replace(/\/crear$/, '/retorno')}`,
        }),
      });

      if (!r.ok) return json({ error: 'Transbank rechazó la creación (' + r.status + ')' }, 502);

      const d = await r.json();
      return json({ url: d.url, token: d.token, orden });
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500);
    }
  }

  /* ── 2. Retorno: aquí aterriza el cliente de vuelta desde Transbank ─────── */
  if (ruta === 'retorno') {
    let token = url.searchParams.get('token_ws') ?? '';
    let abortado = url.searchParams.get('TBK_TOKEN') ?? '';

    if (req.method === 'POST') {
      const f = await req.formData();
      token = (f.get('token_ws') as string) ?? token;
      abortado = (f.get('TBK_TOKEN') as string) ?? abortado;
    }

    const volver = (estado: string, extra = '') =>
      Response.redirect(`${SITIO}/gracias.html?estado=${estado}${extra}`, 303);

    // El cliente apretó "Anular" en Webpay, o se le venció la sesión.
    if (abortado && !token) return volver('anulado');
    if (!token) return volver('error');

    try {
      const r = await fetch(`${TBK.host}${API}/${token}`, { method: 'PUT', headers: cab() });
      if (!r.ok) return volver('error');

      const d = await r.json();
      const ok = d.status === 'AUTHORIZED' && d.response_code === 0;

      if (ok) {
        try {
          /* El id de la reserva viajó en session_id. `confirmar_reserva` es
             idempotente, así que si el cliente recarga la pantalla de vuelta
             no se duplica nada. */
          await rpc('confirmar_reserva', {
            p_id: d.session_id,
            p_pago_ref: String(d.authorization_code ?? d.buy_order),
            p_medio: 'webpay',
          });
        } catch (e) {
          /* Se cobró pero la reserva ya no se puede honrar: caducó y esas
             fechas se vendieron mientras tanto. Se deja constancia con esta
             etiqueta en los logs de la función — hay que devolver el dinero. */
          console.error(JSON.stringify({
            evento: 'DEVOLVER_DINERO', reserva: d.session_id, orden: d.buy_order,
            monto: d.amount, motivo: String((e as Error).message),
          }));
          return volver('error', `&orden=${encodeURIComponent(d.buy_order ?? '')}`);
        }
      }
      /* Si el pago fue rechazado no se toca la reserva: caduca sola en su media
         hora y la fecha vuelve a estar libre sin que nadie intervenga. */

      return volver(ok ? 'ok' : 'rechazado', `&orden=${encodeURIComponent(d.buy_order ?? '')}`);
    } catch {
      return volver('error');
    }
  }

  return json({ error: 'Ruta no encontrada' }, 404);
});
