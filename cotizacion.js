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
    /* Sin titulo ni explicacion: la etiqueta del campo ya lo dice todo, y
       quien tiene un codigo no necesita que le cuenten de donde salio. */
    dentro.innerHTML =
      (error ? '<p role="alert" style="margin:0 0 12px;padding:11px 13px;' +
        'border-radius:9px;background:rgba(214,84,64,0.22);color:#ffc9c0;' +
        'font-size:13.5px;line-height:1.45">' + esc(error) + '</p>' : '') +
      '<label style="' + rotulo + '" for="cot-codigo">Ingresa tu código de reserva</label>' +
      /* El boton VA DENTRO de la caja, pegado al campo: el borde es del
         contenedor y el input va sin el suyo. Asi se lee como una sola pieza
         —escribe aqui y pulsa ahi— en vez de dos cosas sueltas. */
      '<div style="display:flex;align-items:stretch;margin-top:6px;' +
      'border:1px solid rgba(255,255,255,0.28);border-radius:10px;' +
      'background:rgba(255,255,255,0.08);overflow:hidden">' +
        '<input id="cot-codigo" type="text" autocomplete="off" placeholder="VA-0000" ' +
        'maxlength="7" style="flex:1;min-width:0;background:transparent;border:0;' +
        'outline:none;padding:13px 14px;font-size:16px;color:' + TINTA + ';' +
        'text-transform:uppercase;letter-spacing:.08em;' +
        'font-family:ui-monospace,Menlo,Consolas,monospace">' +
        '<button id="cot-validar" type="button" style="flex:none;border:0;' +
        'border-left:1px solid rgba(255,255,255,0.22);background:' + ORO + ';' +
        'color:#22271f;font-family:inherit;font-size:12.5px;font-weight:800;' +
        'letter-spacing:1px;text-transform:uppercase;padding:0 16px;cursor:pointer">' +
        'Validar</button>' +
      '</div>' +
      '<div id="cot-estado" style="margin-top:8px;font-size:13px;color:' + SUAVE + '"></div>';

    var campoCod = dentro.querySelector('#cot-codigo');
    dentro.querySelector('#cot-validar').addEventListener('click', canjear);
    campoCod.addEventListener('keydown', function (e) {
      /* Enter tambien valida: con el teclado del telefono abierto, el boton
         puede quedar debajo y no verse. */
      if (e.key === 'Enter') { e.preventDefault(); canjear(); }
    });
  }

  /* El campo, ya validado, se convierte en el boton de reservar: es el mismo
     sitio y el mismo gesto, sin un paso intermedio que no aporta. */
  function pintarBotonReservar(c) {
    dentro.innerHTML =
      '<div style="font-size:13px;color:' + SUAVE + ';margin-bottom:8px">' +
        esc(c.cabana) + ' &middot; ' + fecha(c.desde) + ' al ' + fecha(c.hasta) +
        ' &middot; ' + clp(c.precio_noche) + ' la noche</div>' +
      '<button id="cot-reservar" type="button" style="' + boton + '">Reservar ahora</button>';
    dentro.querySelector('#cot-reservar').addEventListener('click', function () {
      pintarCotizacion(c, c.nombre || '');
    });
  }

  function canjear() {
    var campoCod = dentro.querySelector('#cot-codigo');
    if (!campoCod) return;
    var codigo = campoCod.value.trim().toUpperCase();
    if (!codigo) return;
    /* Sin nombre: el codigo basta. Quien lo tiene es porque se lo mandamos. */
    var estado = dentro.querySelector('#cot-estado');
    var bt = dentro.querySelector('#cot-validar');
    estado.textContent = 'Comprobando...';
    campoCod.disabled = true;
    if (bt) { bt.disabled = true; bt.style.opacity = '.6'; }

    D.cotizacion(codigo, '').then(function (c) {
      campoCod.disabled = false;
      if (bt) { bt.disabled = false; bt.style.opacity = '1'; }
      if (!c) { estado.textContent = 'No pudimos conectar. Revisa tu señal.'; return; }
      if (!c.ok) { estado.textContent = D.motivoCotizacion(c.motivo); campoCod.focus(); return; }
      pintarBotonReservar(c);
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
