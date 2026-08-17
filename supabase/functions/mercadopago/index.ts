/* Mercado Pago Checkout Pro para Cabañas Valle Aventura — Supabase Edge Function.
 *
 * POR QUÉ ESTO NO PUEDE VIVIR EN LA PÁGINA
 * ----------------------------------------
 * 1. El `access_token` mueve dinero. En el navegador queda a la vista de
 *    cualquiera que abra el código — misma regla que la service_role.
 *    La `public_key` sí es pública; esa puede ir en la página.
 * 2. El webhook es un POST que manda Mercado Pago. GitHub Pages solo sirve
 *    GET, así que el aviso de pago no puede aterrizar en el sitio estático.
 *
 * POR QUÉ EL WEBHOOK MANDA Y NO LA VUELTA DEL CLIENTE
 * --------------------------------------------------
 * `back_urls` depende de que el cliente vuelva. Cierra la pestaña, se queda
 * sin batería o pierde la señal en la montaña, y la reserva nunca se confirma
 * aunque haya pagado. El webhook llega igual, y reintenta. La vuelta del
 * cliente sirve solo para ENSEÑARLE algo; la verdad la escribe el webhook.
 *
 * DESPLIEGUE
 *   supabase functions deploy mercadopago --no-verify-jwt
 *   supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... MP_ENV=produccion
 *
 * Sin MP_ACCESS_TOKEN la función responde 503 y no finge nada.
 */

const TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') ?? '';
const ES_PROD = (Deno.env.get('MP_ENV') ?? 'prueba') === 'produccion';
const SITIO = Deno.env.get('SITIO_URL') ?? 'https://josevergara1999.github.io/valle-aventura-web';

const MP = 'https://api.mercadopago.com';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* La referencia externa es el hilo que une el pago con la reserva. Viaja a
   Mercado Pago y vuelve en el webhook. */
const nuevaRef = () => 'VA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

/* Validación de firma del webhook. SIN ESTO cualquiera puede mandar un POST
   diciendo "pagado" y quedarse con una reserva gratis. Mercado Pago firma con
   HMAC-SHA256 sobre un manifiesto con el id, el request-id y el timestamp. */
async function firmaValida(req: Request, dataId: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;              // sin secreto no se confía en nadie
  const sig = req.headers.get('x-signature') ?? '';
  const reqId = req.headers.get('x-request-id') ?? '';

  const partes = Object.fromEntries(
    sig.split(',').map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2),
  ) as Record<string, string>;
  const ts = partes['ts'], v1 = partes['v1'];
  if (!ts || !v1) return false;

  const manifiesto = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  /* Comparación en tiempo constante: comparar con === filtra el secreto por el
     tiempo que tarda en fallar. */
  if (esperado.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!TOKEN) return json({ error: 'Mercado Pago no está configurado en el servidor' }, 503);

  const url = new URL(req.url);
  const ruta = url.pathname.split('/').filter(Boolean).pop();

  /* ── 1. Crear la preferencia ──────────────────────────────────────────── */
  if (ruta === 'crear' && req.method === 'POST') {
    try {
      const b = await req.json();
      const monto = Math.round(Number(b.monto));

      /* El monto NO se acepta del navegador en producción: se recalcula con
         cotizar() en Postgres. Cualquiera puede editar lo que manda la página.
         Mientras esa función no esté conectada, al menos se acota. */
      if (!Number.isFinite(monto) || monto <= 0 || monto > 5_000_000) return json({ error: 'Monto fuera de rango' }, 400);
      if (!b.desde || !b.hasta || !b.nombre || !b.email) return json({ error: 'Faltan datos de la reserva' }, 400);

      const ref = nuevaRef();

      // TODO al conectar la base: escribir la reserva en estado 'pendiente'
      // con esta referencia ANTES de mandar a pagar, y liberarla sola si en
      // 30 minutos no llega el webhook. Sin eso, un abandono deja la fecha
      // bloqueada; sin lo otro, se cobra una fecha ya vendida.

      const noches = Math.max(1, Math.round(
        (new Date(b.hasta + 'T00:00:00').getTime() - new Date(b.desde + 'T00:00:00').getTime()) / 86400000,
      ));

      const r = await fetch(`${MP}/checkout/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': ref,   // si el cliente pulsa dos veces, una sola preferencia
        },
        body: JSON.stringify({
          items: [{
            id: ref,
            title: `Cabaña Valle Aventura · ${noches} ${noches === 1 ? 'noche' : 'noches'}`,
            description: `Del ${b.desde} al ${b.hasta} · anticipo 50%`,
            quantity: 1,
            currency_id: 'CLP',
            unit_price: monto,
          }],
          payer: { name: String(b.nombre).slice(0, 80), email: String(b.email).slice(0, 120) },
          external_reference: ref,
          statement_descriptor: 'VALLE AVENTURA',
          notification_url: `${url.origin}${url.pathname.replace(/\/crear$/, '/webhook')}`,
          back_urls: {
            success: `${SITIO}/gracias.html?estado=ok&orden=${encodeURIComponent(ref)}`,
            pending: `${SITIO}/gracias.html?estado=pendiente&orden=${encodeURIComponent(ref)}`,
            failure: `${SITIO}/gracias.html?estado=rechazado&orden=${encodeURIComponent(ref)}`,
          },
          auto_return: 'approved',
          binary_mode: true,   // aprobado o rechazado, sin "en proceso" colgando
        }),
      });

      if (!r.ok) {
        const detalle = await r.text();
        return json({ error: `Mercado Pago rechazó la preferencia (${r.status})`, detalle: detalle.slice(0, 300) }, 502);
      }

      const d = await r.json();
      /* En pruebas hay que usar sandbox_init_point; con las credenciales de
         producción ese campo no sirve. */
      const destino = ES_PROD ? d.init_point : (d.sandbox_init_point ?? d.init_point);
      return json({ url: destino, ref });
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500);
    }
  }

  /* ── 2. Webhook: la única fuente de verdad sobre si se pagó ───────────── */
  if (ruta === 'webhook' && req.method === 'POST') {
    try {
      const cuerpo = await req.json().catch(() => ({}));
      const tipo = cuerpo?.type ?? url.searchParams.get('type');
      const pagoId = String(cuerpo?.data?.id ?? url.searchParams.get('data.id') ?? '');

      // Mercado Pago manda varios tipos; solo interesa el de pagos.
      if (tipo !== 'payment' || !pagoId) return new Response('ok', { status: 200 });

      if (!(await firmaValida(req, pagoId))) {
        /* 401 y no 200: que Mercado Pago sepa que no se acepto. Un POST sin
           firma valida es alguien intentando confirmar una reserva sin pagar. */
        return new Response('firma no valida', { status: 401 });
      }

      /* No se cree lo que dice el webhook: se pregunta a la API. El cuerpo
         solo trae un id, y el estado hay que ir a buscarlo. */
      const r = await fetch(`${MP}/v1/payments/${pagoId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!r.ok) return new Response('reintentar', { status: 500 });  // MP reintenta

      const pago = await r.json();
      const aprobado = pago.status === 'approved';
      const ref = pago.external_reference;

      // TODO al conectar la base: si aprobado, pasar la reserva de 'pendiente'
      // a 'confirmada' usando `ref`, guardando pago.id y pago.transaction_amount.
      // Debe ser IDEMPOTENTE: Mercado Pago reintenta el mismo aviso varias
      // veces y no puede acabar en dos reservas ni en dos cobros contados.
      console.log(JSON.stringify({ evento: 'pago', ref, id: pago.id, estado: pago.status, aprobado }));

      // 200 siempre que se haya procesado: si no, MP sigue reintentando.
      return new Response('ok', { status: 200 });
    } catch {
      return new Response('reintentar', { status: 500 });
    }
  }

  return json({ error: 'Ruta no encontrada' }, 404);
});
