/* Medios de pago. Aquí NO va ninguna credencial: los secretos que mueven
 * dinero viven en los secretos de las Edge Functions. Lo único que hay aquí es
 * a qué endpoint llamar.
 *
 * La página pinta SOLO los medios que tengan endpoint. Si no configuras
 * ninguno, `window.VA_PAGOS` no existe y el flujo se queda en "Enviar
 * solicitud de reserva" — nunca un botón de pagar que no cobra.
 *
 * Para activar uno: despliega su función y pega la URL abajo.
 *   supabase functions deploy mercadopago --no-verify-jwt
 *   supabase functions deploy webpay      --no-verify-jwt
 */
(function () {
  'use strict';

  var ENDPOINTS = {
    /* Desplegada y pública (sin verificación de JWT, porque el webhook de
       Mercado Pago no manda ninguno). Se protege sola: `/crear` valida todo
       en la base y `/webhook` comprueba la firma HMAC.
       Ojo: la función responde 503 mientras no exista el secreto
       MP_ACCESS_TOKEN, así que esta línea solo debe estar activa cuando el
       secreto esté puesto. Un botón de pagar que no cobra es peor que no
       tener botón. */
    /* La función YA ESTÁ DESPLEGADA y conectada a la base. Solo falta que
       existan los secretos MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET; sin ellos
       responde 503. Para activar el pago online, cuando Mercado Pago apruebe
       la cuenta, basta con quitar las dos barras de la línea de abajo:
   
       Mientras esté comentada, la página lleva la reserva a WhatsApp con las
       fechas ya escritas, que es lo que de verdad pasa hoy. */
    mercadopago: 'https://wxxlqszadprwizporhbg.supabase.co/functions/v1/mercadopago',
    // p. ej. https://wxxlqszadprwizporhbg.supabase.co/functions/v1/webpay
    webpay: ''
  };

  /* Mercado Pago: se va a Checkout Pro y vuelve por back_urls. La confirmación
     de verdad llega por webhook al servidor, no en la vuelta del cliente. */
  function porMercadoPago(base, datos) {
    return fetch(base.replace(/\/$/, '') + '/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    })
      .then(leer)
      .then(function (d) {
        if (!d.url) throw new Error('respuesta sin enlace de pago');
        recordar(d.ref);
        location.href = d.url;
        return nuncaResuelve();
      });
  }

  /* Webpay: la salida es un POST de formulario con token_ws, no una
     redirección. Por eso hace falta construir el formulario a mano. */
  function porWebpay(base, datos) {
    return fetch(base.replace(/\/$/, '') + '/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    })
      .then(leer)
      .then(function (d) {
        if (!d.url || !d.token) throw new Error('respuesta incompleta');
        recordar(d.orden);
        var f = document.createElement('form');
        f.method = 'POST';
        f.action = d.url;
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = 'token_ws'; i.value = d.token;
        f.appendChild(i);
        document.body.appendChild(f);
        f.submit();
        return nuncaResuelve();
      });
  }

  function leer(r) {
    return r.json().then(function (d) {
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      return d;
    });
  }
  /* Se guarda la referencia ANTES de salir: si el cliente vuelve y el webhook
     todavía no llegó, al menos puede decirle su número de reserva. */
  function recordar(ref) { try { sessionStorage.setItem('va_ref', ref || ''); } catch (e) {} }
  // La página se está yendo: no hay nada que resolver.
  function nuncaResuelve() { return new Promise(function () {}); }

  /* Cada medio trae su MARCA, no solo su nombre. Pagar es el momento en que el
     cliente decide si se fía: reconocer el logo de la pasarela hace más por esa
     decisión que cualquier texto que escribamos nosotros.

     `logo` es la ruta al archivo OFICIAL de la marca, descargado de su propia
     página de recursos. No se redibuja ni se retoca: Mercado Pago lo prohíbe
     expresamente en el pack ("NO DEBE EDITARSE SU CONTENIDO"), y un logo mal
     copiado da menos confianza que ninguno.

     `fondo` y `tinta` son los de cada marca, no los del sitio: el botón tiene
     que parecerse a la pasarela a la que lleva, no a esta página.

     SI ACTIVAS UN MEDIO NUEVO, tiene que traer su `logo`. Sin él no se muestra
     y se avisa por consola: es preferible perder un medio de pago a enseñar un
     botón roto justo donde el cliente decide si se fía. */
  var CATALOGO = [
    { id: 'mercadopago', nombre: 'Mercado Pago', detalle: 'Crédito, débito y saldo en cuenta',
      logo: 'uploads/mercado-pago.svg', logoAlto: 42,
      fondo: '#ffffff', tinta: '#0a0080', tintaSuave: '#5d6470', linea: '#e8eaef', acento: '#00bcff',
      iniciar: porMercadoPago },
    { id: 'webpay',      nombre: 'Webpay',       detalle: 'Tarjetas chilenas y débito Redcompra',
      logo: '', logoAlto: 40,
      fondo: '#ffffff', tinta: '#e30613', tintaSuave: '#5d6470', linea: '#e8eaef', acento: '#e30613',
      iniciar: porWebpay }
  ];

  /* Un medio configurado pero sin logo no se publica. Antes decia el comentario
     de arriba que "saldria roto a proposito"; eso es hacer que el error lo
     descubra un cliente delante del boton de pagar. Se cae aqui, en la consola
     del que lo esta configurando, y el sitio sigue funcionando con el resto. */
  var activos = CATALOGO.filter(function (m) {
    if (!ENDPOINTS[m.id]) return false;
    if (!m.logo) {
      try { console.error('[VA_PAGOS] "' + m.nombre + '" tiene endpoint pero no tiene logo: no se muestra. Agrega su archivo de marca en CATALOGO.'); } catch (e) {}
      return false;
    }
    return true;
  })
    .map(function (m) {
      return {
        id: m.id, nombre: m.nombre, detalle: m.detalle,
        logo: m.logo, logoAlto: m.logoAlto,
        fondo: m.fondo, tinta: m.tinta, tintaSuave: m.tintaSuave, linea: m.linea, acento: m.acento,
        iniciar: function (datos) { return m.iniciar(ENDPOINTS[m.id], datos); }
      };
    });

  // Sin medios configurados no se define nada: la página se queda en el flujo
  // honesto en vez de enseñar botones que no cobran.
  if (!activos.length) return;

  window.VA_PAGOS = {
    metodos: activos,
    /* Atajo para cuando solo hay uno configurado. */
    iniciar: function (datos) { return activos[0].iniciar(datos); }
  };
})();
