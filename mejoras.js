/* Mejoras de galeria para la version movil de Valle Aventura.
 *
 * Va aparte del diseno a proposito: se suma a la pagina en vez de modificar su
 * interior, asi que si volvemos a bajar la pagina desde Claude Design solo hay
 * que reponer la etiqueta <script> y no se pierde nada.
 *
 * Hace dos cosas:
 *   1. Tocar una foto la abre en grande, con desliz, flechas y cierre.
 *   2. Deslizar sobre la galeria que solo tenia botones ahora la mueve.
 *
 * Todo funciona por delegacion de eventos en el documento, no por referencias
 * guardadas a nodos: la pagina la pinta React y vuelve a crear los elementos a
 * cada rato, asi que cualquier referencia guardada quedaria muerta.
 */
(function () {
  'use strict';

  var MIN_ANCHO_GALERIA = 250;   // px; descarta miniaturas sueltas
  var MIN_IMAGENES = 3;          // menos que esto no es una galeria
  var UMBRAL_DESLIZ = 40;        // px de recorrido para contar como desliz

  // ── Utilidades ──────────────────────────────────────────────────────────
  function urlDeFondo(el) {
    var bg = '';
    try { bg = getComputedStyle(el).backgroundImage || ''; } catch (e) { return null; }
    var m = bg.match(/url\(["']?([^"')]*uploads\/[^"')]+)["']?\)/);
    return m ? m[1] : null;
  }

  function urlDeImagen(el) {
    if (el.tagName === 'IMG' && el.src && el.src.indexOf('/uploads/') > -1) return el.src;
    return urlDeFondo(el);
  }

  function imagenesDe(cont) {
    var vistas = {}, lista = [];
    var todos = [cont].concat([].slice.call(cont.querySelectorAll('*')));
    todos.forEach(function (el) {
      var u = urlDeImagen(el);
      // Las decorativas (nubes, texturas, fondos) no son parte de la galeria.
      if (!u || /(nube|textura|fondo|va-logo)/.test(u)) return;
      if (vistas[u]) return;
      vistas[u] = 1;
      lista.push(u);
    });
    return lista;
  }

  /* Sube desde un elemento hasta el contenedor de galeria mas pequeno que lo
     contenga. "Galeria" = tiene varias fotos y ocupa un ancho de verdad. */
  function galeriaDe(el) {
    var a = el;
    for (var i = 0; i < 10 && a && a !== document.body; i++) {
      var ancho = a.getBoundingClientRect().width;
      if (ancho >= MIN_ANCHO_GALERIA && imagenesDe(a).length >= MIN_IMAGENES) return a;
      a = a.parentElement;
    }
    return null;
  }

  function esFlecha(el) {
    var a = el;
    for (var i = 0; i < 4 && a; i++) {
      var t = (a.textContent || '').trim();
      if ((t === '‹' || t === '›' || t === '<' || t === '>') && a.children.length === 0) return a;
      a = a.parentElement;
    }
    return null;
  }

  function flechasDe(cont) {
    var res = { prev: null, next: null };
    [].slice.call(cont.querySelectorAll('button,div,span')).forEach(function (e) {
      if (e.children.length !== 0) return;
      if (visor && visor.contains(e)) return;   // no confundir con las del visor
      var t = (e.textContent || '').trim();
      if (t === '‹' || t === '<') res.prev = res.prev || e;
      if (t === '›' || t === '>') res.next = res.next || e;
    });
    return res;
  }

  /* Las flechas suelen estar FUERA del contenedor con las fotos: galeriaDe()
     devuelve el mas interno que tiene imagenes, y ese no las incluye. Hay que
     subir hasta encontrarlas, pero sin llegar tan arriba como para agarrar las
     del calendario, que estan en otra rama del arbol. */
  function flechasCercaDe(cont) {
    var a = cont;
    for (var i = 0; i < 4 && a && a !== document.body; i++) {
      var f = flechasDe(a);
      if (f.prev && f.next) return f;
      a = a.parentElement;
    }
    return { prev: null, next: null };
  }

  // ── Visor a pantalla completa ───────────────────────────────────────────
  var visor = null, lista = [], indice = 0;

  function construirVisor() {
    if (visor) return visor;
    visor = document.createElement('div');
    visor.setAttribute('data-va-visor', '');
    visor.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483000',
      'background:rgba(6,14,24,.94)', 'display:none',
      'align-items:center', 'justify-content:center',
      'touch-action:none', '-webkit-tap-highlight-color:transparent'
    ].join(';');

    var img = document.createElement('img');
    img.style.cssText = 'max-width:94vw;max-height:82vh;object-fit:contain;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);user-select:none;-webkit-user-drag:none';
    visor.appendChild(img);

    var contador = document.createElement('div');
    contador.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 18px);left:0;right:0;text-align:center;color:#dfe9f0;font:600 13px/1 system-ui,sans-serif;letter-spacing:.12em';
    visor.appendChild(contador);

    function boton(txt, lado) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      b.setAttribute('aria-label', lado === 'left' ? 'Anterior' : 'Siguiente');
      b.style.cssText = 'position:absolute;' + lado + ':10px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.14);color:#fff;font-size:22px;line-height:1;cursor:pointer;backdrop-filter:blur(6px)';
      visor.appendChild(b);
      return b;
    }
    var bPrev = boton('‹', 'left');
    var bNext = boton('›', 'right');

    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.textContent = '✕';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.14);color:#fff;font-size:17px;cursor:pointer;backdrop-filter:blur(6px)';
    visor.appendChild(cerrar);

    visor._img = img;
    visor._contador = contador;

    bPrev.addEventListener('click', function (e) { e.stopPropagation(); mover(-1); });
    bNext.addEventListener('click', function (e) { e.stopPropagation(); mover(1); });
    cerrar.addEventListener('click', function (e) { e.stopPropagation(); cerrarVisor(); });
    // Tocar el fondo cierra; tocar la foto no.
    visor.addEventListener('click', function (e) { if (e.target === visor) cerrarVisor(); });
    img.addEventListener('click', function (e) { e.stopPropagation(); });

    // Desliz dentro del visor
    var x0 = null;
    visor.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    visor.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > UMBRAL_DESLIZ) mover(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.body.appendChild(visor);
    return visor;
  }

  function pintar() {
    visor._img.src = lista[indice];
    visor._contador.textContent = (indice + 1) + ' / ' + lista.length;
  }

  function mover(paso) {
    if (!lista.length) return;
    indice = (indice + paso + lista.length) % lista.length;
    pintar();
  }

  function abrirVisor(imagenes, desde) {
    lista = imagenes;
    indice = Math.max(0, desde);
    construirVisor();
    pintar();
    visor.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
  }

  function cerrarVisor() {
    if (!visor) return;
    visor.style.display = 'none';
    document.documentElement.style.overflow = '';
  }

  document.addEventListener('keydown', function (e) {
    if (!visor || visor.style.display === 'none') return;
    if (e.key === 'Escape') cerrarVisor();
    if (e.key === 'ArrowLeft') mover(-1);
    if (e.key === 'ArrowRight') mover(1);
  });

  // ── Tocar una foto la abre ──────────────────────────────────────────────
  var tocado = null;

  document.addEventListener('pointerdown', function (e) {
    tocado = { x: e.clientX, y: e.clientY };
  }, true);

  document.addEventListener('click', function (e) {
    if (visor && visor.contains(e.target)) return;
    if (esFlecha(e.target)) return;              // las flechas siguen navegando
    // Si el dedo se movio, era un desliz, no un toque.
    if (tocado && (Math.abs(e.clientX - tocado.x) > 12 || Math.abs(e.clientY - tocado.y) > 12)) return;

    var url = null, a = e.target;
    for (var i = 0; i < 4 && a; i++) { url = urlDeImagen(a); if (url) break; a = a.parentElement; }
    if (!url || /(nube|textura|fondo|va-logo)/.test(url)) return;

    var cont = galeriaDe(e.target);
    if (!cont) return;
    var imgs = imagenesDe(cont);
    var pos = imgs.indexOf(url);
    if (pos < 0) { imgs = [url]; pos = 0; }
    e.preventDefault();
    e.stopPropagation();
    abrirVisor(imgs, pos);
  }, true);

  // ── Desliz en la galeria que solo tenia botones ─────────────────────────
  var ini = null, contDesliz = null;

  document.addEventListener('touchstart', function (e) {
    if (visor && visor.style.display !== 'none') return;
    var t = e.touches[0];
    ini = { x: t.clientX, y: t.clientY };
    contDesliz = galeriaDe(e.target);
  }, { passive: true, capture: true });

  document.addEventListener('touchend', function (e) {
    if (!ini || !contDesliz) { ini = null; return; }
    if (visor && visor.style.display !== 'none') { ini = null; return; }
    var t = e.changedTouches[0];
    var dx = t.clientX - ini.x, dy = t.clientY - ini.y;
    ini = null;
    // Solo horizontal claro, para no robarle el gesto al scroll vertical.
    if (Math.abs(dx) < UMBRAL_DESLIZ || Math.abs(dx) < Math.abs(dy) * 1.5) { contDesliz = null; return; }
    var f = flechasCercaDe(contDesliz);
    var destino = dx < 0 ? f.next : f.prev;
    if (destino) destino.click();
    contDesliz = null;
  }, { passive: true, capture: true });
})();
