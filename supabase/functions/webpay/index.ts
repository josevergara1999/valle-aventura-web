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

const SITIO = Deno.env.get('SITIO_URL') ?? 'https://josevergara1999.github.io/valle-aventura-web';
const API = '/rswebpaytransaction/api/webpay/v1.2/transactions';

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
      const monto = Math.round(Number(b.monto));

      // El monto NUNCA se acepta tal cual del navegador en producción: se
      // recalcula con cotizar() en Postgres. Mientras esa función no esté
      // conectada, al menos se valida que sea un entero positivo razonable.
      if (!Number.isFinite(monto) || monto <= 0 || monto > 5_000_000) {
        return json({ error: 'Monto fuera de rango' }, 400);
      }
      if (!b.desde || !b.hasta || !b.nombre || !b.email) {
        return json({ error: 'Faltan datos de la reserva' }, 400);
      }

      const orden = nuevaOrden();

      // TODO al conectar la base: insertar la reserva en estado 'pendiente'
      // ANTES de redirigir, con esta orden como referencia. Si el cliente
      // abandona el pago, un job la libera. Sin ese paso, un abandono deja la
      // fecha bloqueada para siempre o, peor, se cobra una fecha ya vendida.

      const r = await fetch(TBK.host + API, {
        method: 'POST',
        headers: cab(),
        body: JSON.stringify({
          buy_order: orden,
          session_id: orden,
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

      // TODO al conectar la base: pasar la reserva de 'pendiente' a 'confirmada'
      // usando d.buy_order, y guardar d.authorization_code. Esta confirmación
      // es la única prueba de que el dinero se movió: sin ella la reserva no
      // existe, aunque el cliente haya visto la pantalla de Webpay.

      return volver(ok ? 'ok' : 'rechazado', `&orden=${encodeURIComponent(d.buy_order ?? '')}`);
    } catch {
      return volver('error');
    }
  }

  return json({ error: 'Ruta no encontrada' }, 404);
});
