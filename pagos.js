/* Lado navegador de Webpay. Define `window.VA_PAGOS` SOLO si hay endpoint
 * configurado: mientras ENDPOINT esté vacío este archivo no define nada, y
 * `nuevo.html` se queda en el flujo honesto de "Enviar solicitud" en vez de
 * mostrar un botón de pagar que no cobra.
 *
 * Para activarlo: despliega supabase/functions/webpay y pega su URL aquí.
 */
(function () {
  'use strict';

  var ENDPOINT = '';   // p. ej. https://xxxx.supabase.co/functions/v1/webpay

  if (!ENDPOINT) return;

  /* Webpay no es una ventana ni un iframe: es una salida del sitio. Se llega
     con un POST de formulario llevando token_ws, y se vuelve por el retorno de
     la Edge Function. Por eso hay que dejar la reserva anotada ANTES de irse. */
  function irAWebpay(url, token) {
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = url;
    var i = document.createElement('input');
    i.type = 'hidden';
    i.name = 'token_ws';
    i.value = token;
    f.appendChild(i);
    document.body.appendChild(f);
    f.submit();
  }

  window.VA_PAGOS = {
    iniciar: function (datos) {
      return fetch(ENDPOINT.replace(/\/$/, '') + '/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      })
        .then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
            return d;
          });
        })
        .then(function (d) {
          if (!d.url || !d.token) throw new Error('respuesta incompleta');
          try { sessionStorage.setItem('va_orden', d.orden || ''); } catch (e) {}
          irAWebpay(d.url, d.token);
          // No resuelve: la página se está yendo a Transbank.
          return new Promise(function () {});
        });
    }
  };
})();
