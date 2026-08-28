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
    'margin:18px 0 0'
  ].join(';'));

  var dentro = document.createElement('div');
  dentro.setAttribute('style', 'width:100%');
  caja.appendChild(dentro);

  var campo = 'width:100%;box-sizing:border-box;padding:13px 14px;margin-top:6px;' +
              'border:1px solid rgba(255,255,255,0.28);border-radius:10px;font-size:16px;' +
              'font-family:inherit;color:' + TINTA + ';background:rgba(255,255,255,0.08)';
  var rotulo = 'display:block;font-size:12.5px;font-weight:700;color:' + SUAVE + ';margin-bottom:8px';
  var boton = 'width:100%;margin-top:10px;padding:15px 10px;border:0;border-radius:999px;' +
              'background:' + ORO + ';color:#22271f;font-size:11.5px;font-weight:800;' +
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
      '<div style="display:flex;align-items:stretch;' +
      'border:1px solid rgba(255,255,255,0.28);border-radius:999px;' +
      'background:rgba(255,255,255,0.08);overflow:hidden">' +
        '<input id="cot-codigo" type="text" autocomplete="off" placeholder="VA-0000" ' +
        'maxlength="7" style="flex:1;min-width:0;background:transparent;border:0;' +
        'outline:none;padding:15px 20px;font-size:15px;color:' + TINTA + ';' +
        'text-transform:uppercase;letter-spacing:.08em;' +
        'font-family:ui-monospace,Menlo,Consolas,monospace">' +
        '<button id="cot-validar" type="button" style="flex:none;border:0;' +
        'border-left:1px solid rgba(255,255,255,0.22);background:' + ORO + ';' +
        'color:#22271f;font-family:inherit;font-size:11.5px;font-weight:800;' +
        'letter-spacing:1px;text-transform:uppercase;padding:0 20px;cursor:pointer">' +
        'Validar</button>' +
      '</div>' +
      '<div id="cot-estado" style="margin-top:10px;font-size:11.5px;line-height:1.5;color:' + SUAVE + '"></div>';

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
      '<div style="font-size:11px;line-height:1.5;color:' + SUAVE + ';margin-bottom:8px">' +
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

  /* La MISMA vista que el resumen de reserva del sitio: la lista de dt/dd, el
     50/50 en dos tarjetas del mismo peso, el recargo antes de la cifra grande.
     Las clases y medidas salen del propio HTML, no las elegí yo — si esto se
     pareciera "bastante" en vez de ser igual, se notaría al momento.

     Lo único que se añade es el botón de la ruleta y el nombre de quien
     reserva, que aquí sí se sabe. */
  function pintarCotizacion(c, nombre) {
    var dentro = abrirPopup();
    var extra = c.noche_extra;
    /* En un objeto y no en una variable suelta: el manejador de pagar se crea
       antes de que la ruleta se acepte, y una copia leería false. */
    var aceptadoRef = { v: false };

    var fila = function (k, v, opts) {
      opts = opts || {};
      return '<div style="display:flex;justify-content:space-between;gap:12px' +
        (opts.separa ? ';border-top:1px solid rgba(255,255,255,0.18);padding-top:9px' : '') +
        (opts.grande ? ';font-size:16px' : '') +
        (opts.chica ? ';font-size:12.5px' : '') + '">' +
        '<dt style="color:rgba(255,255,255,0.65);margin:0">' + k + '</dt>' +
        '<dd style="margin:0"><b' + (opts.tenue ? ' style="color:rgba(255,255,255,0.85)"' : '') +
        '>' + v + '</b></dd></div>';
    };

    var recargo = (D.recargoPasarela && window.VA_PAGOS) ? D.recargoPasarela(c.anticipo) : 0;
    var total = c.total, anticipo = c.anticipo, saldo = c.saldo;

    dentro.innerHTML =
      '<div style="font-size:10px;letter-spacing:1.8px;font-weight:800;' +
        'text-transform:uppercase;color:#7fd6e2">Tu precio acordado</div>' +
      '<h2 style="font-family:Raleway,system-ui,sans-serif;font-size:21px;' +
        'font-weight:800;margin:6px 0 0;line-height:1.2">Reserva de ' +
        esc(c.nombre || nombre || '') + '</h2>' +
      '<div style="font-size:11.5px;color:rgba(255,255,255,0.6);margin:4px 0 14px">' +
        'Código ' + esc(c.codigo) + '</div>' +

      '<dl id="cot-detalle" style="margin:0;background:rgba(255,255,255,0.07);' +
        'border:1px solid rgba(255,255,255,0.18);border-radius:12px;padding:14px 16px;' +
        'display:flex;flex-direction:column;gap:9px;font-size:13px"></dl>' +

      /* El botón de la ruleta, entre el detalle y las dos tarjetas del 50/50:
         es lo último que puede cambiar el precio antes de pagarlo. */
      (extra
        ? '<button type="button" id="cot-ruleta" style="display:flex;gap:11px;' +
          'align-items:center;width:100%;box-sizing:border-box;padding:12px 13px;' +
          'margin-top:10px;border:1px solid rgba(240,196,25,0.55);border-radius:12px;' +
          'background:rgba(240,196,25,0.12);cursor:pointer;font-family:inherit;' +
          'text-align:left;color:#ffffff">' +
          '<span style="width:32px;height:32px;flex:none;border-radius:50%;' +
          'background:' + ORO + ';color:#22271f;display:flex;align-items:center;' +
          'justify-content:center;font-family:Raleway,sans-serif;font-weight:800;' +
          'font-size:16px">?</span>' +
          '<span style="font-size:13px;line-height:1.45">' +
            '<b id="cot-ruleta-tit">Participa por una noche extra</b><br>' +
            '<span id="cot-ruleta-sub" style="color:rgba(255,255,255,0.65);font-size:11.5px">' +
            'Toca para descubrir tu beneficio</span>' +
          '</span></button>'
        : '') +

      '<div id="cot-5050" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"></div>' +

      '<label style="display:block;font-size:12.5px;font-weight:700;' +
        'color:rgba(255,255,255,0.65);margin:14px 0 0">Tu correo' +
      '<input id="cot-email" type="email" autocomplete="email" style="width:100%;' +
        'box-sizing:border-box;margin-top:8px;padding:14px 16px;border-radius:999px;' +
        'border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.08);' +
        'color:#ffffff;font-size:15px;font-family:inherit;outline:none"></label>' +
      '<div id="cot-error"></div>' +
      '<button id="cot-pagar" type="button" style="' + boton + '">Pagar el abono</button>' +
      '<button id="cot-otro" type="button" style="' + boton + ';background:transparent;' +
        'color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.28);' +
        'margin-top:8px">Usar otro código</button>';

    /* El detalle y el 50/50 se repintan enteros al aceptar la noche extra: son
       las dos cosas que cambian, y rehacerlas juntas evita que una quede con
       la cifra vieja. */
    function pintarNumeros(conExtra) {
      var t = conExtra && extra ? extra.total_con_extra : total;
      var a = Math.round(t * (anticipo / total));
      var r = (D.recargoPasarela && window.VA_PAGOS) ? D.recargoPasarela(a) : 0;

      dentro.querySelector('#cot-detalle').innerHTML =
        fila('Fechas', fecha(c.desde) + ' → ' + fecha(conExtra && extra ? extra.hasta : c.hasta)) +
        fila('Noches', String(c.noches + (conExtra && extra ? 1 : 0))) +
        fila('Cabaña', esc(c.cabana)) +
        fila('Huéspedes', c.adultos + (c.adultos === 1 ? ' adulto' : ' adultos') +
             (c.ninos ? ' y ' + c.ninos + (c.ninos === 1 ? ' niño' : ' niños') : '')) +
        fila('Noches × tarifa', c.noches + ' × ' + clp(c.precio_noche), { separa: true }) +
        (conExtra && extra
          ? fila('Noche extra (' + extra.pct + '%)', clp(extra.precio))
          : '') +
        fila('Total', clp(t), { grande: true }) +
        (r > 0 ? fila('Comisión de la pasarela', '+' + clp(r), { chica: true, tenue: true }) : '');

      dentro.querySelector('#cot-5050').innerHTML =
        '<div style="background:rgba(53,183,201,0.18);border:1px solid rgba(63,200,218,0.5);' +
          'border-radius:12px;padding:12px 13px">' +
          '<div style="font-size:10px;letter-spacing:1.6px;font-weight:800;' +
          'text-transform:uppercase;color:#7fd6e2">Pagas ahora</div>' +
          '<div style="font-size:18px;font-weight:800;margin-top:4px;color:#7fd6e2">' +
          clp(a + r) + '</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:2px">' +
          (r > 0 ? '50% + comisión' : '50% del total') + '</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);' +
          'border-radius:12px;padding:12px 13px">' +
          '<div style="font-size:10px;letter-spacing:1.6px;font-weight:800;' +
          'text-transform:uppercase;color:rgba(255,255,255,0.7)">Al llegar</div>' +
          '<div style="font-size:18px;font-weight:800;margin-top:4px">' + clp(t - a) + '</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:2px">' +
          'en la cabaña</div>' +
        '</div>';
    }
    pintarNumeros(false);

    if (extra) {
      var el = laRuleta();
      /* El premio SIEMPRE viene de la cotización: la ruleta lo revela, no lo
         sortea. Si esta pantalla eligiera el gajo, el descuento lo decidiría
         el navegador del cliente. */
      dentro.querySelector('#cot-ruleta').addEventListener('click', function () {
        el.abrir({
          codigo: c.codigo,
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
        pintarNumeros(true);
        dentro.querySelector('#cot-ruleta-tit').textContent =
          extra.pct === 100 ? 'Noche extra gratis' : 'Noche extra al ' + extra.pct + '%';
        dentro.querySelector('#cot-ruleta-sub').textContent = 'Ya está sumada a tu reserva';
      });
      el.addEventListener('rechazar', function () {
        aceptadoRef.v = false;
        pintarNumeros(false);
      });
    }

    dentro.querySelector('#cot-otro').addEventListener('click', function () {
      /* Se borra la tirada anterior aqui mismo: si se dejara para cuando la
         ruleta note el cambio de codigo, el boton del premio viejo aparecería
         un instante sobre la cotizacion nueva. */
      if (ruleta && ruleta.reiniciar) ruleta.reiniciar();
      cerrarPopup(); pintarFormulario();
    });

    dentro.querySelector('#cot-pagar').addEventListener('click', function () {
      var email = dentro.querySelector('#cot-email').value.trim();
      var err = dentro.querySelector('#cot-error');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        err.innerHTML = '<p style="margin:12px 0 0;font-size:12.5px;color:#ffc9c0">' +
          'Escribe un correo válido: ahí te llega la confirmación.</p>';
        return;
      }
      err.innerHTML = '';

      if (!window.VA_PAGOS) {
        err.innerHTML = '<p style="margin:12px 0 0;font-size:12.5px;color:#ffc9c0">' +
          'El pago en línea no está disponible ahora. Escríbenos por WhatsApp.</p>';
        return;
      }

      var b = dentro.querySelector('#cot-pagar');
      b.disabled = true; b.textContent = 'Llevándote a pagar...';

      /* Va el CÓDIGO, no el precio. El monto lo calcula Postgres al canjear;
         si aquí mandáramos la cifra, cambiarla sería cosa de un momento. */
      window.VA_PAGOS.iniciar({
        codigo: c.codigo,
        nombre: c.nombre || nombre,
        email: email,
        noche_extra: aceptadoRef.v
      }).catch(function (e) {
        b.disabled = false; b.textContent = 'Pagar el abono';
        /* Si el fallo es de la cotización, el texto sale de la misma tabla que
           se usó al canjear: la causa es una y la frase también. */
        var texto = e && e.motivo
          ? D.motivoCotizacion(e.motivo)
          : (e && e.message) || 'No pudimos iniciar el pago. Inténtalo de nuevo.';
        err.innerHTML = '<p style="margin:12px 0 0;font-size:12.5px;color:#ffc9c0">' +
          esc(texto) + '</p>';
      });
    });
  }

  var ruleta = null;

  /* La cotizacion se enseña en un pop-up, igual que la reserva normal del
     sitio. Las medidas salen del propio HTML —velo rgba(6,14,24,.74), tarjeta
     de 400px, borde a .25, radio 16, padding 20/18 y 88vh de alto maximo— para
     que sea el mismo objeto y no uno parecido. */
  var velo = null;
  function abrirPopup() {
    if (velo) return velo.querySelector('.cot-cuerpo');
    velo = document.createElement('div');
    velo.setAttribute('role', 'dialog');
    velo.setAttribute('aria-modal', 'true');
    velo.setAttribute('aria-label', 'Tu reserva');
    velo.setAttribute('style', 'position:fixed;inset:0;z-index:90;' +
      'background:rgba(6,14,24,0.74);display:flex;align-items:center;' +
      'justify-content:center;padding:14px;box-sizing:border-box');
    var tarjeta = document.createElement('div');
    tarjeta.className = 'cot-cuerpo';
    tarjeta.setAttribute('style', 'width:100%;max-width:400px;background:#0e1c30;' +
      'border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:20px 18px;' +
      'box-sizing:border-box;box-shadow:0 40px 90px rgba(0,0,0,0.6);color:#ffffff;' +
      "font-family:'Manrope',sans-serif;max-height:88vh;overflow:auto");
    velo.appendChild(tarjeta);
    /* Se cierra tocando fuera y con Escape, como el de reservar. */
    velo.addEventListener('click', function (e) { if (e.target === velo) cerrarPopup(); });
    document.addEventListener('keydown', escPopup);
    document.body.appendChild(velo);
    document.body.style.overflow = 'hidden';
    return tarjeta;
  }
  function escPopup(e) { if (e.key === 'Escape') cerrarPopup(); }
  function cerrarPopup() {
    if (!velo) return;
    document.removeEventListener('keydown', escPopup);
    if (velo.parentNode) velo.parentNode.removeChild(velo);
    velo = null;
    document.body.style.overflow = '';
  }

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
