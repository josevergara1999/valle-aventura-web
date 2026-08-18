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
 * aunque haya pagado. La vuelta del cliente sirve solo para ENSEÑARLE algo;
 * nunca es la que escribe "pagado".
 *
 * ...PERO EL WEBHOOK TAMPOCO MANDA SOLO
 * -------------------------------------
 * El 17-ago-2026 un pago real se acreditó y el webhook no llegó nunca. Por eso
 * la verdad se establece PREGUNTANDO a Mercado Pago (ruta `conciliar`), y el
 * webhook queda como el atajo rápido cuando sí llama. Ver la ruta 2.
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

/* `SUPABASE_SERVICE_ROLE_KEY` es la que inyecta Supabase sola, pero en este
   proyecto es de la generación vieja y ya no vale: PostgREST la rechaza y cae a
   `anon`, que no tiene permiso sobre `bloqueos`. La buena es la `sb_secret_`,
   guardada a mano como `VA_SERVICE_KEY` —la misma que usa la función de avisos—.
   Se prueba esa primero y la vieja queda de reserva. Este error costó caro dos
   veces: se manifiesta como "no se pudo leer" sin decir que es de permisos. */
const SB_KEY = Deno.env.get('VA_SERVICE_KEY')
            ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

  /* Mercado Pago arma el texto a firmar con las partes que EXISTEN. Si la
     peticion no trae x-request-id --el simulador del panel no lo manda-- el
     firma 'id:123456;ts:...;' y nosotros firmabamos
     'id:123456;request-id:;ts:...;'. Mismo secreto, firmas distintas, 401.
     Se prueban las dos formas: la de con y la de sin. */
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const candidatos = reqId
    ? [`id:${dataId};request-id:${reqId};ts:${ts};`, `id:${dataId};ts:${ts};`]
    : [`id:${dataId};ts:${ts};`, `id:${dataId};request-id:;ts:${ts};`];

  for (const manifiesto of candidatos) {
    const mac = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto));
    const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (esperado.length === v1.length) {
      let d = 0;
      for (let i = 0; i < esperado.length; i++) d |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
      if (d === 0) return true;
    }
  }
  return false;
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

      /* Recargo por pagar con pasarela. También lo pone Postgres, por la misma
         razón que el precio: la web lo ENSEÑA, pero si lo calculara ella,
         bastaría con editarlo en el navegador para pagar sin recargo.

         Va como un ítem aparte de la preferencia, no sumado al primero, para
         que el cliente lo vea desglosado en la pantalla de Mercado Pago igual
         que lo vio en la nuestra. Si al llegar allí el importe cambiara sin
         explicación, la mitad se cae del pago. */
      let recargo = 0;
      try {
        recargo = Math.max(0, Math.round(Number(await rpc('recargo_pasarela', { p_monto: monto }))));
      } catch {
        /* Si la función no responde se cobra sin recargo. Perder la comisión de
           una reserva es mucho más barato que perder la reserva entera. */
        recargo = 0;
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
          /* El charset NO sobra. Sin el, Mercado Pago interpreta el cuerpo como
             latin-1 y el titulo que ve el cliente al pagar sale "CabaA+-a Valle
             Aventura A- 2 noches". JSON es UTF-8 por norma, pero su API no lo
             asume: hay que decirselo. */
          'Content-Type': 'application/json; charset=utf-8',
          'X-Idempotency-Key': ref,   // si el cliente pulsa dos veces, una sola preferencia
        },
        body: JSON.stringify({
          items: [{
            id: ref,
            /* SIN ACENTOS A PROPOSITO. La API de Mercado Pago decodifica el
               cuerpo como latin-1 aunque se declare charset=utf-8, y el titulo
               llegaba al cliente como "CabaA+-a Valle Aventura A- 2 noches"
               justo en la pantalla donde paga. Un texto ASCII se lee bien. */
            title: `Cabana Valle Aventura - ${noches} ${noches === 1 ? 'noche' : 'noches'}`,
            description: `Del ${b.desde} al ${b.hasta} - anticipo 50%`,
            quantity: 1,
            currency_id: 'CLP',
            unit_price: monto,
          }, ...(recargo > 0 ? [{
            id: ref + '-recargo',
            // ASCII, por lo mismo que el titulo de arriba.
            title: 'Comision de la pasarela de pago',
            description: 'Costo de cobrar en linea',
            quantity: 1,
            currency_id: 'CLP',
            unit_price: recargo,
          }] : [])],
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

  /* ── 2. Conciliación: la red de seguridad cuando el webhook no llega ───
     El 17-ago-2026 un pago real quedó acreditado en Mercado Pago y la reserva
     siguió `pendiente`: el webhook nunca llegó a esta función (cero registros,
     con el pago ya aprobado). Depender de que un tercero nos llame es depender
     de algo que no controlamos.

     Aquí la pregunta va al revés: le preguntamos NOSOTROS a Mercado Pago si esa
     reserva está pagada. Por eso esta ruta puede ser pública sin riesgo — no
     confirma nada por lo que diga quien llama, sino por lo que responde la API
     de Mercado Pago. Pedirla para una reserva impaga no hace absolutamente nada.

     La llaman dos: `gracias.html` cuando el cliente vuelve del pago (cubre el
     caso normal, al instante) y un cron cada dos minutos que barre las
     pendientes (cubre al que cerró la pestaña). */
  if (ruta === 'conciliar' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      const cuerpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const unaRef = String(cuerpo?.ref ?? url.searchParams.get('ref') ?? '').trim();

      let refs: string[];
      if (unaRef) {
        refs = [unaRef];
      } else {
        /* Barrido completo: esto sí necesita autorización, porque lista
           reservas. La ruta con `ref` no lista nada. */
        /* El barrido no lleva clave propia y no hace falta: no DEVUELVE ningún
           identificador, solo cuántas revisó y cuántas confirmó. Quien lo llame
           no se entera de nada que no supiera. Lo único que puede provocar es
           que le preguntemos a Mercado Pago por hasta 50 reservas, y eso lo
           acota el propio filtro de abajo. */

        /* Solo las de la última hora: más atrás la reserva ya caducó y soltó la
           fecha, y confirmarla ahí sería vender una noche que quizá ya se
           vendió. Ese caso se revisa a mano. */
        const desde = new Date(Date.now() - 3600_000).toISOString();
        const r = await fetch(
          `${SB_URL}/rest/v1/bloqueos?select=id&estado=eq.pendiente&pago_medio=eq.mercadopago`
          + `&creado_at=gt.${desde}&limit=50`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
        );
        /* Si esto falla es casi siempre permisos: `service_role` necesita
           GRANT SELECT (id, estado, pago_medio, creado_at) ON bloqueos. Los
           revoke que endurecieron el esquema se lo habían quitado, y el error
           que devuelve PostgREST no dice "permisos" en ninguna parte. */
        if (!r.ok) return json({ error: 'no se pudo leer las pendientes', estado: r.status }, 500);
        refs = (await r.json()).map((x: { id: string }) => String(x.id));
      }

      const confirmadas: string[] = [];
      for (const ref of refs) {
        const b = await fetch(
          `${MP}/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=5`,
          { headers: { Authorization: `Bearer ${TOKEN}` } },
        );
        if (!b.ok) continue;
        const pagos = (await b.json())?.results ?? [];
        const pago = pagos.find((p: { status: string }) => p.status === 'approved');
        if (!pago) continue;

        try {
          // Idempotente: si el webhook llegó a tiempo, esto no hace nada.
          const res = await rpc('confirmar_reserva', {
            p_id: ref, p_pago_ref: String(pago.id), p_medio: 'mercadopago',
            p_monto: Math.round(Number(pago.transaction_amount)),
          });
          if (!res?.ya_estaba) confirmadas.push(ref);
          console.log(JSON.stringify({ evento: 'conciliada', ref, id: pago.id, ya_estaba: res?.ya_estaba }));
        } catch (e) {
          console.error(JSON.stringify({
            evento: 'DEVOLVER_DINERO', ref, id: pago.id,
            monto: pago.transaction_amount, motivo: String((e as Error).message),
          }));
        }
      }
      /* Con `ref` se devuelve cuál se confirmó —quien pregunta ya la conocía—;
         en el barrido solo el número, para no repartir ids de reservas. */
      return json({ revisadas: refs.length, confirmadas: unaRef ? confirmadas : confirmadas.length });
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500);
    }
  }

  /* ── 3. Webhook: la vía rápida cuando Mercado Pago sí nos llama ────────── */
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
          // Lo que cobro Mercado Pago, no lo que decia la cotizacion.
          p_monto: Math.round(Number(pago.transaction_amount)),
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
