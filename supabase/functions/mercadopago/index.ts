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

/* Supabase inyecta estas dos solas en toda Edge Function; no hay que
   configurarlas ni ponerlas en ningún archivo. La de servicio se salta RLS,
   y por eso vive aquí —en el servidor— y nunca en la página. */
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* Llama a una función de Postgres. Toda la lógica de reservas vive allí y no
   aquí: la misma función la usan la web, el panel y mañana el bot, y si cada
   uno llevara su copia acabarían discrepando. */
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) {
    let msg = texto;
    try { msg = JSON.parse(texto).message ?? texto; } catch { /* deja el texto */ }
    throw new Error(msg);
  }
  return texto ? JSON.parse(texto) : null;
}

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
      if (!b.desde || !b.hasta || !b.nombre || !b.email) return json({ error: 'Faltan datos de la reserva' }, 400);

      /* PRIMERO se aparta la cabaña, DESPUÉS se cobra. Al revés, dos personas
         pueden pagar la misma noche y una se queda sin dónde dormir.
         `solicitar_reserva` valida fechas, mínimo de noches y disponibilidad,
         elige la cabaña y la deja tomada 30 minutos. Si el cliente abandona el
         pago, se suelta sola: por eso no hace falta deshacer nada si algo
         falla más abajo. */
      let reserva;
      try {
        reserva = await rpc('solicitar_reserva', {
          p_desde: b.desde,
          p_hasta: b.hasta,
          p_adultos: Number(b.adultos ?? b.personas ?? 0),
          p_ninos: Number(b.ninos ?? 0),
          p_nombre: b.nombre,
          p_telefono: b.fono ?? b.telefono ?? '',
          p_email: b.email,
          p_medio: 'mercadopago',
        });
      } catch (e) {
        // El mensaje viene de la base y ya está escrito para el cliente
        // ("La estadía mínima es de 2 noches", "No queda ninguna cabaña...").
        return json({ error: String((e as Error).message) }, 409);
      }

      /* El monto lo pone Postgres, no el navegador. Cualquiera puede editar lo
         que manda la página antes de enviarlo; si nos fiáramos de ese número,
         alguien reservaría un fin de semana largo por mil pesos. */
      const monto = Math.round(Number(reserva?.cotizacion?.anticipo));
      if (!Number.isFinite(monto) || monto <= 0) {
        return json({ error: 'No pudimos calcular el anticipo de esa reserva' }, 500);
      }

      /* La referencia que une el pago con la reserva es el id de la reserva
         misma. Así el webhook sabe exactamente cuál confirmar sin tener que
         buscarla por fechas y nombre. */
      const ref = String(reserva.id);

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

      if (!aprobado) {
        /* Rechazado o cancelado: no se toca la reserva. Caduca sola en su
           media hora y la fecha vuelve a estar libre sin que nadie intervenga. */
        console.log(JSON.stringify({ evento: 'pago_no_aprobado', ref, id: pago.id, estado: pago.status }));
        return new Response('ok', { status: 200 });
      }

      try {
        /* `confirmar_reserva` es idempotente: Mercado Pago manda este mismo
           aviso varias veces y el segundo pasa sin crear nada ni fallar. */
        const res = await rpc('confirmar_reserva', {
          p_id: ref,
          p_pago_ref: String(pago.id),
          p_medio: 'mercadopago',
        });
        console.log(JSON.stringify({ evento: 'reserva_confirmada', ref, id: pago.id, ya_estaba: res?.ya_estaba }));
      } catch (e) {
        /* Llegó el pago pero la reserva ya no se puede honrar: caducó y esas
           fechas se vendieron mientras tanto. Devolver 500 haría que Mercado
           Pago reintentara para siempre sin arreglar nada, así que se acepta
           el aviso y se deja constancia: esto hay que devolverlo a mano.
           Sale en los logs de la función con esta etiqueta. */
        console.error(JSON.stringify({
          evento: 'DEVOLVER_DINERO', ref, id: pago.id,
          monto: pago.transaction_amount, email: pago.payer?.email,
          motivo: String((e as Error).message),
        }));
      }

      // 200 siempre que se haya procesado: si no, MP sigue reintentando.
      return new Response('ok', { status: 200 });
    } catch {
      return new Response('reintentar', { status: 500 });
    }
  }

  return json({ error: 'Ruta no encontrada' }, 404);
});
