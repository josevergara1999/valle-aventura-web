/* Canjear una cotización con precio pactado.
 *
 * José cierra por WhatsApp a un precio que no es el de la web —deja la cabaña
 * en $170.000 cuando la página dice $180.000— y le manda un código. Aquí el
 * cliente escribe su nombre y ese código, ve SU reserva con SU precio, y paga
 * el anticipo con Mercado Pago.
 *
 * VIVE FUERA DEL DISEÑO, a propósito. `index.html` y `movil.html` son exports
 * de Claude Design de 100 kB que se van a rehacer; si esto estuviera dentro,
 * cada rediseño se lo llevaría por delante. Se monta solo al final de la
 * página y se estila a sí mismo, igual que `mejoras.js`. Cuando llegue el
 * diseño nuevo basta con volver a incluir la línea del script.
 *
 * AQUÍ NO SE CALCULA NINGÚN PRECIO. Se piden a `cotizacion_ver()` y se pintan.
 * Si el descuento lo decidiera este archivo, bastaría con abrir la consola del
 * navegador para pagarse la cabaña a mil pesos.
 */
(function () {
  'use strict';

  var D = window.VA_DATOS;
  if (!D || !D.cotizacion) return;

  var clp = function (n) { return '$' + Number(n).toLocaleString('es-CL'); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var fecha = function (iso) {
    var M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
             'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var p = String(iso).split('-');
    return Number(p[2]) + ' de ' + M[Number(p[1]) - 1];
  };

  /* Los colores van escritos aquí y no heredados de la página: esto tiene que
     verse igual antes y después del rediseño. Son los de la marca. */
  var VERDE = '#2d4a2e', ORO = '#f0c419', CREMA = '#f7f5ef', TINTA = '#22271f';

  var caja = document.createElement('section');
  caja.id = 'cotizacion';
  caja.setAttribute('style', [
    'background:' + CREMA, 'color:' + TINTA,
    'font-family:Manrope,system-ui,sans-serif',
    'padding:48px 20px', 'display:flex', 'justify-content:center'
  ].join(';'));

  var dentro = document.createElement('div');
  dentro.setAttribute('style', 'width:100%;max-width:460px');
  caja.appendChild(dentro);

  var campo = 'width:100%;box-sizing:border-box;padding:13px 14px;margin-top:6px;' +
              'border:1px solid #d5d2c6;border-radius:8px;font-size:16px;' +
              'font-family:inherit;color:' + TINTA + ';background:#fff';
  var rotulo = 'display:block;font-size:13px;font-weight:600;color:#5d6152';
  var boton = 'width:100%;margin-top:16px;padding:15px;border:0;border-radius:8px;' +
              'background:' + VERDE + ';color:#fff;font-size:16px;font-weight:700;' +
              'font-family:inherit;cursor:pointer';

  function pintarFormulario(error) {
    dentro.innerHTML =
      '<h2 style="font-family:Raleway,system-ui,sans-serif;font-size:24px;' +
      'font-weight:800;margin:0 0 6px">¿Tienes un código?</h2>' +
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#5d6152">' +
      'Si conversamos por WhatsApp y te pasamos un código, escríbelo aquí con ' +
      'tu nombre y te mostramos el precio que acordamos.</p>' +
      (error ? '<p role="alert" style="margin:0 0 16px;padding:12px 14px;' +
        'border-radius:8px;background:#f6e3df;color:#8c3a2e;font-size:14px;' +
        'line-height:1.45">' + esc(error) + '</p>' : '') +
      '<label style="' + rotulo + '">Nombre y apellido' +
      '<input id="cot-nombre" type="text" autocomplete="name" style="' + campo + '"></label>' +
      '<div style="height:14px"></div>' +
      '<label style="' + rotulo + '">Código' +
      /* En mayúsculas y monoespaciada: el código se copia a mano desde
         WhatsApp y así se ve si sobró un espacio. */
      '<input id="cot-codigo" type="text" autocomplete="off" placeholder="VA-0000" ' +
      'style="' + campo + ';text-transform:uppercase;letter-spacing:.08em;' +
      'font-family:ui-monospace,Menlo,Consolas,monospace"></label>' +
      '<button id="cot-ver" type="button" style="' + boton + '">Ver mi precio</button>';

    dentro.querySelector('#cot-ver').addEventListener('click', canjear);
    dentro.querySelector('#cot-codigo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') canjear();
    });
  }

  function canjear() {
    var nombre = dentro.querySelector('#cot-nombre').value.trim();
    var codigo = dentro.querySelector('#cot-codigo').value.trim().toUpperCase();
    if (!nombre || !codigo) return pintarFormulario('Escribe tu nombre completo y el código.');

    var b = dentro.querySelector('#cot-ver');
    b.disabled = true; b.textContent = 'Buscando...';

    D.cotizacion(codigo, nombre).then(function (c) {
      if (!c) return pintarFormulario('No pudimos conectar. Revisa tu señal e inténtalo de nuevo.');
      if (!c.ok) return pintarFormulario(D.motivoCotizacion(c.motivo));
      pintarCotizacion(c, nombre);
    });
  }

  function pintarCotizacion(c, nombre) {
    /* En un objeto y no en una variable suelta: el manejador de pagar se
       crea antes de que la ruleta se acepte, y una copia leeria false. */
    var aceptadoRef = { v: false };
    var extra = c.noche_extra;
    var linea = function (izq, der, fuerte) {
      return '<div style="display:flex;justify-content:space-between;gap:16px;' +
        'padding:9px 0;border-bottom:1px solid #e6e2d6;font-size:15px' +
        (fuerte ? ';font-weight:700;font-size:17px;border-bottom:0' : '') + '">' +
        '<span>' + izq + '</span><span>' + der + '</span></div>';
    };

    dentro.innerHTML =
      '<p style="margin:0 0 4px;font-size:14px;color:#5d6152">Hola ' +
        esc(String(c.nombre).split(/\s+/)[0]) + ',</p>' +
      '<h2 style="font-family:Raleway,system-ui,sans-serif;font-size:24px;' +
      'font-weight:800;margin:0 0 20px">este es el precio que acordamos</h2>' +

      '<div style="background:#fff;border:1px solid #e6e2d6;border-radius:12px;' +
      'padding:18px 18px 14px">' +
        '<div style="font-family:Raleway,system-ui,sans-serif;font-size:19px;' +
        'font-weight:800;margin-bottom:2px">' + esc(c.cabana) + '</div>' +
        '<div style="font-size:14px;color:#5d6152;margin-bottom:14px">' +
          'Del ' + fecha(c.desde) + ' al ' + fecha(c.hasta) +
          ' &middot; ' + c.noches + (c.noches === 1 ? ' noche' : ' noches') +
          ' &middot; ' + c.personas + (c.personas === 1 ? ' persona' : ' personas') +
        '</div>' +

        (extra
          ? '<button type="button" id="cot-ruleta" style="display:flex;gap:11px;' +
            'align-items:center;width:100%;box-sizing:border-box;padding:13px;' +
            'margin-bottom:14px;border:1px solid ' + ORO + ';border-radius:9px;' +
            'background:#fdf8e4;cursor:pointer;font-family:inherit;text-align:left">' +
            '<span style="width:34px;height:34px;flex:none;border-radius:50%;' +
            'background:' + ORO + ';color:#22271f;display:flex;align-items:center;' +
            'justify-content:center;font-family:Raleway,sans-serif;font-weight:800;' +
            'font-size:17px">?</span>' +
            '<span style="font-size:14px;line-height:1.45">' +
              '<b id="cot-ruleta-tit">Participa por una noche extra</b><br>' +
              '<span id="cot-ruleta-sub" style="color:#5d6152">Toca para descubrir tu beneficio</span>' +
            '</span></button>'
          : '') +

        '<div id="cot-cuentas">' +
          linea(c.noches + ' &times; ' + clp(c.precio_noche), clp(c.total)) +
          linea('Abonas ahora', clp(c.anticipo), true) +
          '<div style="font-size:13px;color:#5d6152;margin-top:2px">' +
            'Y ' + clp(c.saldo) + ' al llegar a la cabaña.</div>' +
        '</div>' +
      '</div>' +

      '<label style="' + rotulo + ';margin-top:16px">Tu correo' +
      '<input id="cot-email" type="email" autocomplete="email" style="' + campo + '"></label>' +
      '<div id="cot-error"></div>' +
      '<button id="cot-pagar" type="button" style="' + boton + '">Pagar el abono</button>' +
      '<button id="cot-otro" type="button" style="' + boton + ';background:transparent;' +
      'color:#5d6152;font-weight:600;border:1px solid #d5d2c6;margin-top:8px">' +
      'Usar otro código</button>';

    /* Las cuentas se repintan al marcar la noche extra, pero con los números
       que YA vino diciendo la base — no se multiplica nada aquí. Y al pagar se
       vuelve a validar todo en Postgres: esto es solo lo que se ve. */
    if (extra) {
      var pintarCuentas = function (on) {
        var total = on ? extra.total_con_extra : c.total;
        var anticipo = Math.round(total * (c.anticipo / c.total));
        dentro.querySelector('#cot-cuentas').innerHTML =
          linea(c.noches + ' &times; ' + clp(c.precio_noche), clp(c.total)) +
          (on ? linea('Noche extra (' + extra.pct + '%)', clp(extra.precio)) : '') +
          linea('Abonas ahora', clp(anticipo), true) +
          '<div style="font-size:13px;color:#5d6152;margin-top:2px">Y ' +
          clp(total - anticipo) + ' al llegar a la cabaña.</div>';
      };

      var el = laRuleta();
      /* El premio SIEMPRE viene de la cotizacion: la ruleta lo revela, no lo
         sortea. Si esta pantalla eligiera el gajo, el descuento lo decidiria
         el navegador del cliente. */
      dentro.querySelector('#cot-ruleta').addEventListener('click', function () {
        el.abrir({
          nombre: String(c.nombre || '').split(/\s+/)[0],
          premio: Number(extra.pct),
          precio: clp(extra.precio),
          texto: extra.tipo === 'antes'
            ? 'Llega el ' + fecha(extra.desde)
            : 'Quédate hasta el ' + fecha(extra.hasta)
        });
      });
      el.addEventListener('aceptar', function () {
        aceptadoRef.v = true;
        pintarCuentas(true);
        dentro.querySelector('#cot-ruleta-tit').textContent =
          extra.pct === 100 ? 'Noche extra gratis' : 'Noche extra al ' + extra.pct + '%';
        dentro.querySelector('#cot-ruleta-sub').textContent = 'Ya está sumada a tu reserva';
      });
      el.addEventListener('rechazar', function () { aceptadoRef.v = false; pintarCuentas(false); });
    }

    dentro.querySelector('#cot-otro').addEventListener('click', function () { pintarFormulario(); });
    dentro.querySelector('#cot-pagar').addEventListener('click', function () {
      var email = dentro.querySelector('#cot-email').value.trim();
      var err = dentro.querySelector('#cot-error');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        err.innerHTML = '<p style="margin:14px 0 0;font-size:14px;color:#8c3a2e">' +
          'Escribe un correo válido: ahí te llega la confirmación.</p>';
        return;
      }
      err.innerHTML = '';

      if (!window.VA_PAGOS) {
        err.innerHTML = '<p style="margin:14px 0 0;font-size:14px;color:#8c3a2e">' +
          'El pago en línea no está disponible ahora. Escríbenos por WhatsApp.</p>';
        return;
      }

      var b = dentro.querySelector('#cot-pagar');
      b.disabled = true; b.textContent = 'Llevándote a pagar...';

      /* Va el CÓDIGO, no el precio. El monto lo calcula Postgres al canjear;
         si aquí mandáramos la cifra, cambiarla sería cosa de un momento. */
      window.VA_PAGOS.iniciar({
        codigo: c.codigo,
        nombre: nombre,
        email: email,
        noche_extra: !!(extra && aceptadoRef.v)
      }).catch(function (e) {
        b.disabled = false; b.textContent = 'Pagar el abono';
        /* Si el fallo es de la cotizacion, el texto sale de la misma tabla
           que se uso al canjear: la causa es una y la frase tambien. */
        var texto = e && e.motivo
          ? D.motivoCotizacion(e.motivo)
          : (e && e.message) || 'No pudimos iniciar el pago. Inténtalo de nuevo.';
        err.innerHTML = '<p style="margin:14px 0 0;font-size:14px;color:#8c3a2e">' +
          esc(texto) + '</p>';
      });
    });
  }

  /* SOLO se monta si el enlace trae `#cotizacion`, que es exactamente el que
     José manda por WhatsApp con cada código. Quien entra a la web normal no ve
     nada.

     No es timidez: esta maquetación es provisional —se ve como una caja pegada
     al final, con sus propios colores— y el diseño de verdad va a ser un pop-up
     hecho en Claude Design. Mientras tanto, quien tiene un código puede pagar y
     los otros 380 visitantes del día no se encuentran una sección a medio
     terminar en un sitio que está vendiendo.

     Cuando llegue el pop-up, esto pasa a abrirse desde un enlace junto al botón
     de reservar y se quita esta condición. */
  /* La ruleta vive fuera de la tarjeta: es un pop-up a pantalla completa y
     tiene que poder taparlo todo. */
  var ruleta = null;
  function laRuleta() {
    if (!ruleta) {
      ruleta = document.createElement('va-ruleta');
      document.body.appendChild(ruleta);
    }
    return ruleta;
  }

  function montar() {
    if (location.hash !== '#cotizacion') return;
    if (document.getElementById('cotizacion')) return;
    document.body.appendChild(caja);
    pintarFormulario();
    caja.scrollIntoView({ block: 'start' });
    var n = dentro.querySelector('#cot-nombre');
    if (n) n.focus({ preventScroll: true });
  }

  /* Y si pega el enlace estando ya en la página, también. */
  window.addEventListener('hashchange', montar);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
