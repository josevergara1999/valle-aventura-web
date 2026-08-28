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
  var ORO = '#f0c419', TINTA = '#ffffff';
  var SUAVE = 'rgba(255,255,255,0.65)';

  var caja = document.createElement('section');
  caja.id = 'cotizacion';
  caja.setAttribute('style', [
    'color:' + TINTA, 'font-family:Manrope,system-ui,sans-serif',
    'margin:0 0 16px'
  ].join(';'));

  var dentro = document.createElement('div');
  dentro.setAttribute('style', 'width:100%');
  caja.appendChild(dentro);

  var campo = 'width:100%;box-sizing:border-box;padding:13px 14px;margin-top:6px;' +
              'border:1px solid rgba(255,255,255,0.28);border-radius:10px;font-size:16px;' +
              'font-family:inherit;color:' + TINTA + ';background:rgba(255,255,255,0.08)';
  var rotulo = 'display:block;font-size:12.5px;font-weight:700;color:' + SUAVE;
  var boton = 'width:100%;margin-top:14px;padding:14px;border:0;border-radius:999px;' +
              'background:' + ORO + ';color:#22271f;font-size:14px;font-weight:800;' +
              'letter-spacing:1px;text-transform:uppercase;font-family:inherit;cursor:pointer';

  function pintarFormulario(error) {
    dentro.innerHTML =
      '<h2 style="font-family:Raleway,system-ui,sans-serif;font-size:24px;' +
      'font-weight:800;margin:0 0 6px">¿Tienes un código?</h2>' +
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:rgba(255,255,255,0.65)">' +
      'Si conversamos por WhatsApp y te pasamos un código, escríbelo aquí y ' +
      'te mostramos el precio que acordamos.</p>' +
      (error ? '<p role="alert" style="margin:0 0 16px;padding:12px 14px;' +
        'border-radius:8px;background:#f6e3df;color:#8c3a2e;font-size:14px;' +
        'line-height:1.45">' + esc(error) + '</p>' : '') +
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
    var codigo = dentro.querySelector('#cot-codigo').value.trim().toUpperCase();
    if (!codigo) return pintarFormulario('Escribe el código que te enviamos.');
    /* Sin nombre: el codigo basta. Quien lo tiene es porque se lo mandamos. */
    var nombre = '';

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
        'padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.14);font-size:15px' +
        (fuerte ? ';font-weight:700;font-size:17px;border-bottom:0' : '') + '">' +
        '<span>' + izq + '</span><span>' + der + '</span></div>';
    };

    dentro.innerHTML =
      '<p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,0.65)">Hola ' +
        esc(String(c.nombre).split(/\s+/)[0]) + ',</p>' +
      '<h2 style="font-family:Raleway,system-ui,sans-serif;font-size:24px;' +
      'font-weight:800;margin:0 0 20px">este es el precio que acordamos</h2>' +

      '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:12px;' +
      'padding:18px 18px 14px">' +
        '<div style="font-family:Raleway,system-ui,sans-serif;font-size:19px;' +
        'font-weight:800;margin-bottom:2px">' + esc(c.cabana) + '</div>' +
        '<div style="font-size:14px;color:rgba(255,255,255,0.65);margin-bottom:14px">' +
          'Del ' + fecha(c.desde) + ' al ' + fecha(c.hasta) +
          ' &middot; ' + c.noches + (c.noches === 1 ? ' noche' : ' noches') +
          ' &middot; ' + c.personas + (c.personas === 1 ? ' persona' : ' personas') +
        '</div>' +

        (extra
          ? '<button type="button" id="cot-ruleta" style="display:flex;gap:11px;' +
            'align-items:center;width:100%;box-sizing:border-box;padding:13px;' +
            'margin-bottom:14px;border:1px solid ' + ORO + ';border-radius:9px;' +
            'background:rgba(240,196,25,0.12);cursor:pointer;font-family:inherit;text-align:left">' +
            '<span style="width:34px;height:34px;flex:none;border-radius:50%;' +
            'background:' + ORO + ';color:#22271f;display:flex;align-items:center;' +
            'justify-content:center;font-family:Raleway,sans-serif;font-weight:800;' +
            'font-size:17px">?</span>' +
            '<span style="font-size:14px;line-height:1.45">' +
              '<b id="cot-ruleta-tit">Participa por una noche extra</b><br>' +
              '<span id="cot-ruleta-sub" style="color:rgba(255,255,255,0.65)">Toca para descubrir tu beneficio</span>' +
            '</span></button>'
          : '') +

        '<div id="cot-cuentas">' +
          linea(c.noches + ' &times; ' + clp(c.precio_noche), clp(c.total)) +
          linea('Abonas ahora', clp(c.anticipo), true) +
          '<div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:2px">' +
            'Y ' + clp(c.saldo) + ' al llegar a la cabaña.</div>' +
        '</div>' +
      '</div>' +

      '<label style="' + rotulo + ';margin-top:16px">Tu correo' +
      '<input id="cot-email" type="email" autocomplete="email" style="' + campo + '"></label>' +
      '<div id="cot-error"></div>' +
      '<button id="cot-pagar" type="button" style="' + boton + '">Pagar el abono</button>' +
      '<button id="cot-otro" type="button" style="' + boton + ';background:transparent;' +
      'color:rgba(255,255,255,0.65);font-weight:600;border:1px solid rgba(255,255,255,0.28);margin-top:8px">' +
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
          '<div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:2px">Y ' +
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

  /* Va DEBAJO del boton de reservar, al final del cotizador: quien llega ahi
     ya miro fechas y precio, que es cuando un codigo significa algo. Antes
     colgaba del final de la pagina y habia que buscarlo.

     El sitio lo pinta React y vuelve a crear los nodos cada dos por tres, asi
     que no vale con insertarlo una vez: hay que vigilar que siga puesto. Es la
     misma razon por la que `mejoras.js` trabaja por delegacion. */
  function anclaReservar() {
    /* El boton que cierra el cotizador NO se llama igual en las dos paginas:
       en el escritorio es "Reservar esta cabaña" y en el telefono "Buscar
       disponibilidad". Buscar solo uno dejaba el movil sin nada, que es por
       donde entra casi todo el mundo.

       Y "Reservar" a secas NO vale: en el movil ese es el de la cabecera, que
       ademas viene en versalitas y le pegaba el uppercase al formulario. */
    var bs = document.querySelectorAll('button, a');
    var mejor = null, masAbajo = -1;
    for (var i = 0; i < bs.length; i++) {
      var t = (bs[i].textContent || '').trim();
      if (t.indexOf('Reservar esta caba') !== 0 && t.indexOf('Buscar disponibilidad') !== 0) continue;
      var y = bs[i].getBoundingClientRect().top + (window.scrollY || 0);
      if (y > masAbajo) { masAbajo = y; mejor = bs[i]; }
    }
    return mejor;
  }

  function montar() {
    var ancla = anclaReservar();
    if (!ancla || !ancla.parentNode) return false;
    /* Si ya esta puesto en el sitio correcto, no se toca: reinsertarlo en cada
       repintado haria parpadear el formulario a medio escribir. */
    if (caja.parentNode === ancla.parentNode && caja.previousElementSibling === ancla) return true;
    ancla.parentNode.insertBefore(caja, ancla.nextSibling);
    if (!caja.dataset.pintado) { caja.dataset.pintado = '1'; pintarFormulario(); }
    return true;
  }

  function vigilar() {
    montar();
    var obs = new MutationObserver(function () { montar(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vigilar);
  } else {
    vigilar();
  }
})();
