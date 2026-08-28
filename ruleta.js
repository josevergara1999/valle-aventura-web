/* Ruleta Valle Aventura — carrusel de tarjetas 3D (vanilla, sin librerías).
   Dinámica tipo "elige tu tarjeta": desliza para explorar los premios;
   el botón Girar rota el carrusel hasta la tarjeta ganadora (decidida por código).
   API: el.abrir({codigo, nombre, premio, precioAntes, precioDespues, precio, texto})
        · el.girar({premio}) · el.cerrar() · el.reiniciar()
   Eventos: 'aceptar' (detail:{premio}) y 'rechazar'. El premio SIEMPRE llega desde fuera.
   Con precioAntes/precioDespues numéricos, el desenlace cuenta el precio hacia abajo
   estilo odómetro; sin ellos (o con reduced-motion) muestra el resultado directo. */
(function () {
  if (customElements.get('va-ruleta')) return;
  /* Las láminas venían en PNG de 2 MB cada una: 11,4 MB entre las cinco, y se
     precargan todas al abrir la página. En WebP pesan 2,1 MB.

     NO se han reescalado: siguen a 1049x1499, sus pixeles originales. Solo
     cambia el formato, con calidad 95 — en pantalla son indistinguibles del
     PNG. Es el mismo criterio que el resto de `uploads/`, donde las fotos del
     sitio pasaron de 43 MB a 2,6 MB sin que se note. */
  const IMGS = {
    25: "uploads/ruleta-25.webp",
    45: "uploads/ruleta-45.webp",
    50: "uploads/ruleta-50.webp",
    75: "uploads/ruleta-75.webp",
    100: "uploads/ruleta-100.webp"
  };
  const CARDS = [
    { premio: 25, label: '25%' }, { icon: 'pino' },
    { premio: 45, label: '45%' }, { premio: 50, label: '50%' },
    { icon: 'copo' }, { premio: 75, label: '75%' },
    { icon: 'montana' }, { premio: 100, label: 'GRATIS' }
  ];
  const N = CARDS.length;
  const ICONS = {
    pino: '<path d="M0,-12 L7,-1 H3.5 L10,9 H-10 L-3.5,-1 H-7 Z M-1.7,9 h3.4 v4.6 h-3.4 Z"/>',
    copo: '<g stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M0,-10.5 V10.5 M-9,-5.2 L9,5.2 M-9,5.2 L9,-5.2"/></g>',
    montana: '<path d="M-11,8.5 L-3.5,-7.5 L0.5,-0.5 L3.5,-4.5 L11,8.5 Z"/>',
    estrella: '<path d="M0,-11 L2.7,-2.7 L11,0 L2.7,2.7 L0,11 L-2.7,2.7 L-11,0 L-2.7,-2.7 Z"/>'
  };
  const S = 132, D = 112; // separación X y profundidad Z entre tarjetas
  /* transform de la tarjeta ganadora: crece Y sube un poco (el dueño pidió
     que "la tarjeta subiera"); todo lo que la toque parte de esta base */
  const TWIN = 'translate(-50%,-50%) translateY(-10px) scale(1.06)';
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
.ov{position:fixed;inset:0;z-index:400;background:rgba(7,15,27,0.78);display:flex;align-items:center;justify-content:center;padding:16px}
/* El pop-up es de alto FIJO (pedido del dueño): las zonas .zt y .zb reservan
   por CSS el sitio del estado más alto de la secuencia y todo se mueve dentro.
   En pantallas muy bajas manda max-height y el contenido hace scroll. */
.card{position:relative;width:100%;max-width:500px;max-height:88vh;background:#12243d;color:#f2f7fa;border-radius:22px;padding:30px 22px 26px;font-family:'Manrope',sans-serif;text-align:center;box-shadow:0 40px 90px rgba(0,0,0,0.55);border:1px solid rgba(63,200,218,0.25);overflow-y:auto;overflow-x:hidden}
.x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:none;border-radius:10px;background:rgba(255,255,255,0.1);color:#f2f7fa;font-size:16px;line-height:1;cursor:pointer;font-family:inherit;z-index:5}
.x:hover{background:rgba(255,255,255,0.2)}
.kick{font-size:10px;letter-spacing:3px;font-weight:800;text-transform:uppercase;color:#3fc8da}
.tit{font-family:'Raleway',sans-serif;font-weight:800;font-size:24px;line-height:1.2;margin-top:8px;color:#f2f7fa}
.sub{font-size:13.5px;line-height:1.55;color:rgba(242,247,250,0.72);margin:6px auto 0;max-width:340px}
.zt{position:relative;min-height:106px}
.zb{position:relative;min-height:106px;margin-top:8px}
.cap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.stage{position:relative;height:290px;margin-top:12px;perspective:1200px;touch-action:none;cursor:grab}
.stage.drag{cursor:grabbing}
.suelo{position:absolute;left:50%;bottom:4px;transform:translateX(-50%);width:210px;height:22px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,0.4),rgba(0,0,0,0))}
.tj{position:absolute;left:50%;top:50%;width:158px;height:226px;border-radius:16px;overflow:hidden;will-change:transform;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 18px 32px -14px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
.tj.premio{background:linear-gradient(168deg,#27587a 0%,#16374f 52%,#0f273c 100%);color:#f2f7fa;border:1px solid rgba(240,196,25,0.4)}
.tj.gratis{background:linear-gradient(168deg,#122740 0%,#0b1a2c 55%,#081221 100%);color:#f0c419;border:1px solid rgba(240,196,25,0.6)}
.tj.foto{border:1px solid rgba(240,196,25,0.45);background-size:cover;background-position:center;color:#f2f7fa}
.tj.relleno{background:linear-gradient(168deg,#f2f8f9,#dfedf0);color:#1f6d7c;border:1.5px solid rgba(53,183,201,0.35)}
.tj .marco{position:absolute;inset:6px;border:1px solid rgba(240,196,25,0.4);border-radius:9px;pointer-events:none}
.tj.relleno .marco{border-color:rgba(53,183,201,0.32)}
.tj .agua{position:absolute;bottom:-16px;right:-16px;width:112px;height:112px;fill:currentColor;opacity:0.08;pointer-events:none}
.tj .cima{position:absolute;top:12px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:6.5px;letter-spacing:2.4px;font-weight:800;text-transform:uppercase;opacity:0.82;pointer-events:none}
.tj .cima svg{width:13px;height:13px;fill:currentColor}
.tj .pct{font-family:'Raleway',sans-serif;font-weight:800;font-size:40px;letter-spacing:0.5px;line-height:1;margin-top:6px}
.tj.premio .pct{background:linear-gradient(180deg,#fff3c4 0%,#f0c419 58%,#c99b12 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.45))}
.tj.gratis .pct{font-size:25px;letter-spacing:3px}
.tj .dcto{font-size:8px;letter-spacing:2px;font-weight:700;text-transform:uppercase;opacity:0.72;margin-top:8px;color:#f2f7fa}
.tj.gratis .dcto{color:#f0c419;opacity:0.85}
.tj .linea{width:26px;height:1px;background:currentColor;opacity:0.35;margin-top:9px}
.tj .pie{position:absolute;bottom:11px;left:0;right:0;font-size:6.5px;letter-spacing:2.2px;font-weight:800;text-transform:uppercase;opacity:0.5}
.tj svg.ic{width:42px;height:42px;fill:currentColor;color:#1f6d7c;opacity:0.85;margin-top:4px}
.tj .brillo{position:absolute;inset:0;border-radius:14px;pointer-events:none;background:linear-gradient(125deg,rgba(255,255,255,0.2),rgba(255,255,255,0.04) 34%,rgba(255,255,255,0) 55%);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1),inset 0 -22px 30px -18px rgba(0,0,0,0.35)}
.tj.win{box-shadow:0 26px 48px -16px rgba(0,0,0,0.7),0 0 0 1px rgba(240,196,25,0.55),0 0 20px rgba(240,196,25,0.22)}
.hint{font-size:11px;letter-spacing:1px;color:rgba(242,247,250,0.55);margin-top:2px;transition:opacity 0.3s}
.btn{border:none;border-radius:999px;cursor:pointer;font-family:'Manrope',sans-serif;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:12px;padding:14px 28px;background:#35b7c9;color:#0d1b2e;transition:background 0.2s;white-space:nowrap}
.btn:hover{background:#3fc8da}
.btn:disabled{opacity:0.55;cursor:default}
.acciones{margin-top:14px}
.res-tit{font-family:'Raleway',sans-serif;font-weight:800;font-size:24px;color:#f0c419}
.res-precio{margin-top:8px;min-height:1.15em;font-family:'Raleway',sans-serif;font-weight:800;font-size:34px;line-height:1;color:#f0c419;font-variant-numeric:tabular-nums}
.res-precio .odo{display:inline-flex;vertical-align:top}
.res-precio .f{display:block;height:1.1em;line-height:1.1em}
.res-precio .c{display:block;height:1.1em;overflow:hidden}
.res-precio .st{display:block;will-change:transform}
.res-precio .st span{display:block;height:1.1em;line-height:1.1em}
.res-precio .grx{display:inline-block;letter-spacing:3px}
.res-sub{font-size:13px;line-height:1.55;color:rgba(242,247,250,0.78);margin-top:4px}
.res-btns{display:flex;gap:10px;justify-content:center;margin-top:14px;padding-bottom:2px}
.no{border:1.5px solid rgba(242,247,250,0.35);border-radius:999px;background:transparent;color:#f2f7fa;font-family:'Manrope',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:14px 18px;cursor:pointer;white-space:nowrap}
.no:hover{background:rgba(255,255,255,0.08)}
.res-ok{margin-top:14px;font-size:13px;font-weight:700;color:#7fd6e2}
.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
[hidden]{display:none !important}
`;
  function cardHTML(c) {
    const cima = '<div class="cima"><svg viewBox="-14 -14 28 28" aria-hidden="true">' + ICONS.pino + '</svg><span>Valle Aventura</span></div>';
    const agua = '<svg class="agua" viewBox="-14 -14 28 28" aria-hidden="true">' + ICONS.montana + '</svg>';
    if (c.premio) {
      return '<div class="tj foto" style="background-image:url(\'' + IMGS[c.premio] + '\')" aria-label="' + (c.premio === 100 ? 'Noche extra gratis' : c.label + ' de descuento') + '"><div class="brillo"></div></div>';
    }
    return '<div class="tj relleno"><div class="marco"></div>' + agua + cima +
      '<svg class="ic" viewBox="-14 -14 28 28" aria-hidden="true">' + ICONS[c.icon] + '</svg>' +
      '<span class="pie">Club del valle</span><div class="brillo"></div></div>';
  }
  class VaRuleta extends HTMLElement {
    constructor() {
      super();
      this._datos = {};
      this._pos = 0; this._anim = null; this._girando = false;
      this._seqTos = []; this._seqAnim = null; this._odoCols = null; this._odoSeps = [];
      const est = window.__vaRuletaEstado || {};
      this._codigo = est.codigo || null;
      this._resultado = est.premio != null ? est.premio : null;
      this._decidido = est.decidido || null;
      const sh = this.attachShadow({ mode: 'open' });
      sh.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="ov" hidden><div class="card" role="dialog" aria-modal="true" aria-label="Sorteo de la noche extra">' +
        '<button class="x" aria-label="Cerrar">✕</button>' +
        '<div class="kick">Valle Aventura</div>' +
        /* zona alta: capas superpuestas título/subtítulo ⇆ título del premio + precio */
        '<div class="zt">' +
        '<div class="cap rueda"><h2 class="tit">Gira por tu noche extra</h2><p class="sub"></p></div>' +
        '<div class="cap res-cab" hidden><div class="res-tit"></div><div class="res-precio" hidden></div></div>' +
        '</div>' +
        '<div class="stage"><div class="suelo"></div>' + CARDS.map(cardHTML).join('') + '</div>' +
        /* zona baja: capas superpuestas hint/Girar ⇆ texto + botones del resultado */
        '<div class="zb">' +
        '<div class="cap pie-rueda"><div class="hint">Desliza para ver los premios</div>' +
        '<div class="acciones"><button class="btn girar">Girar</button></div></div>' +
        '<div class="cap res" hidden><div class="res-sub"></div>' +
        '<div class="res-btns"><button class="btn si">La quiero</button><button class="no">No, gracias</button></div>' +
        '<div class="res-ok" hidden>Esta noche ya está sumada a tu reserva.</div></div>' +
        '</div>' +
        '<div class="live" role="status" aria-live="polite"></div>' +
        '</div></div>';
      this._$ = q => sh.querySelector(q);
      this._tjs = Array.prototype.slice.call(sh.querySelectorAll('.tj'));
      this._$('.x').addEventListener('click', () => this.cerrar());
      this._$('.ov').addEventListener('click', e => { if (e.target === this._$('.ov')) this.cerrar(); });
      this._$('.girar').addEventListener('click', () => this.girar({ premio: this._datos.premio }));
      this._$('.si').addEventListener('click', () => {
        this._decidido = 'si'; this._guardar();
        this.dispatchEvent(new CustomEvent('aceptar', { detail: { premio: this._resultado }, bubbles: true }));
        this.cerrar();
      });
      this._$('.no').addEventListener('click', () => {
        this._decidido = 'no'; this._guardar();
        this.dispatchEvent(new CustomEvent('rechazar', { bubbles: true }));
        this.cerrar();
      });
      this._onKey = e => { if (e.key === 'Escape') this.cerrar(); };
      /* pre-carga de las láminas para que el carrusel no se trabe al aparecer */
      Object.keys(IMGS).forEach(k => { const im = new Image(); im.src = IMGS[k]; });
      this._wireDrag();
      this._setPos(0);
    }
    _guardar() {
      window.__vaRuletaEstado = { premio: this._resultado, decidido: this._decidido,
                                  codigo: this._codigo || null };
    }
    /* ---- carrusel ---- */
    _setPos(p) {
      this._pos = p;
      for (let i = 0; i < N; i++) {
        if (this._tjs[i] === this._winEl) continue; // la ganadora maneja su propio transform
        let off = ((i - p) % N + N + N / 2) % N - N / 2; // -4..4, cíclico
        const a = Math.abs(off);
        const lejos = a > 2.55;
        const ry = Math.max(-38, Math.min(38, -off * 28));
        const st = this._tjs[i].style;
        st.transform = 'translate(-50%,-50%) translateX(' + (off * S).toFixed(1) + 'px) translateZ(' + (-a * D).toFixed(1) + 'px) rotateY(' + ry.toFixed(1) + 'deg)';
        st.zIndex = 100 - Math.round(a * 10);
        st.opacity = lejos ? 0 : 1;
        st.visibility = lejos ? 'hidden' : 'visible'; // no componer tarjetas fuera de vista
      }
    }
    _animarA(target, dur, ease, cb) {
      cancelAnimationFrame(this._anim);
      clearTimeout(this._animTo);
      const p0 = this._pos, t0 = performance.now();
      let fin = false;
      const done = () => { if (fin) return; fin = true; clearTimeout(this._animTo); cancelAnimationFrame(this._anim); this._setPos(target); if (cb) cb(); };
      const tick = t => {
        if (fin) return;
        const k = Math.min(1, (t - t0) / dur);
        this._setPos(p0 + (target - p0) * ease(k));
        if (k < 1) this._anim = requestAnimationFrame(tick);
        else done();
      };
      this._anim = requestAnimationFrame(tick);
      /* red de seguridad: si rAF se estrangula (pestaña oculta, ahorro de energía) */
      this._animTo = setTimeout(done, dur + 300);
    }
    _wireDrag() {
      const st = this._$('.stage');
      st.addEventListener('pointerdown', e => {
        if (this._girando || this._resultado != null) return;
        e.preventDefault();
        cancelAnimationFrame(this._anim);
        st.classList.add('drag');
        const x0 = e.clientX, p0 = this._pos, hist = [{ x: x0, t: performance.now() }];
        let moved = false;
        const mv = ev => {
          const dx = ev.clientX - x0;
          if (Math.abs(dx) > 6) moved = true;
          hist.push({ x: ev.clientX, t: performance.now() });
          if (hist.length > 6) hist.shift();
          this._setPos(p0 - dx / S);
        };
        const up = ev => {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          st.classList.remove('drag');
          if (!moved) { // tap: centrar la tarjeta tocada
            const tj = ev.target && ev.target.closest ? ev.target.closest('.tj') : null;
            if (tj) {
              const i = this._tjs.indexOf(tj);
              let off = ((i - this._pos) % N + N + N / 2) % N - N / 2;
              if (Math.round(off) !== 0) { this._animarA(this._pos + Math.round(off), 450, k => 1 - Math.pow(1 - k, 3)); return; }
            }
            this._animarA(Math.round(this._pos), 300, k => 1 - Math.pow(1 - k, 3));
            return;
          }
          // inercia suave + snap
          const a = hist[0], b = hist[hist.length - 1];
          const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px/ms
          const destino = Math.round(this._pos - v * 130 / S);
          this._animarA(destino, 480, k => 1 - Math.pow(1 - k, 3));
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }
    _idx(p) { return CARDS.findIndex(c => c.premio === Number(p)); }
    _marcarGanadora(idx) {
      const el = this._tjs[idx];
      if (this._winEl === el) return;
      this._winEl = el;
      el.style.zIndex = 200;
      const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) { el.classList.add('win'); el.style.transform = TWIN; return; }
      /* crece y SUBE un poco con suavidad (acto 1 del desenlace); el halo
         dorado entra en la misma transición */
      el.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.5s ease';
      requestAnimationFrame(() => {
        el.classList.add('win');
        el.style.transform = TWIN;
      });
      /* parallax: se inclina siguiendo el puntero. Misma escala 1.06 (antes
         saltaba a 1.08 al primer movimiento) y se engancha cuando el
         crecimiento ya terminó, para no cortar esa transición a mitad. */
      this._winMove = e => {
        const r = el.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
        el.style.transition = 'transform 0.09s ease-out';
        el.style.transform = TWIN + ' rotateX(' + (-y * 8).toFixed(1) + 'deg) rotateY(' + (x * 10).toFixed(1) + 'deg)';
      };
      this._winLeave = () => {
        el.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1)';
        el.style.transform = TWIN;
      };
      clearTimeout(this._winTo);
      this._winTo = setTimeout(() => {
        el.addEventListener('pointermove', this._winMove);
        el.addEventListener('pointerleave', this._winLeave);
      }, 520);
    }
    _quitarGanadora() {
      const el = this._winEl; if (!el) return;
      clearTimeout(this._winTo);
      el.removeEventListener('pointermove', this._winMove);
      el.removeEventListener('pointerleave', this._winLeave);
      el.style.transition = ''; el.style.zIndex = '';
      this._winEl = null;
    }
    _aterrizar() {
      const idx = this._idx(this._resultado); if (idx < 0) return;
      cancelAnimationFrame(this._anim); clearTimeout(this._animTo);
      this._setPos(idx);
      this._marcarGanadora(idx);
      this._$('.hint').hidden = true;
    }
    abrir(datos) {
      /* Cada cotizacion tiene su premio. Si el codigo NO es el de la tirada
         guardada, se empieza de cero: sin esto, canjear otro codigo mostraba
         el premio del anterior y ademas sin girar, porque la ruleta se creia
         ya jugada. */
      var cod = (datos && datos.codigo) || null;
      if (cod && this._codigo && cod !== this._codigo) this.reiniciar();
      if (cod) this._codigo = cod;
      Object.assign(this._datos, datos || {});
      this._$('.ov').hidden = false;
      window.addEventListener('keydown', this._onKey);
      if (this._resultado != null) { this._aterrizar(); this._mostrarResultado(); this._$('.si').focus(); }
      else {
        const n = (this._datos.nombre || '').trim();
        this._$('.sub').textContent = (n ? n + ', desliza' : 'Desliza') + ' para ver los premios de tu noche extra y presiona Girar: 25%, 45%, 50%, 75%… o gratis.';
        ['.rueda', '.pie-rueda'].forEach(s => {
          const e = this._$(s); e.hidden = false; e.style.transition = ''; e.style.opacity = '';
        });
        this._$('.res-cab').hidden = true; this._$('.res').hidden = true;
        this._$('.hint').hidden = false; this._$('.hint').style.opacity = '';
        this._$('.girar').disabled = false; this._$('.girar').textContent = 'Girar';
        this._$('.girar').focus();
      }
    }
    cerrar() {
      /* cerrar a mitad de la secuencia detiene todos sus timers; al reabrir,
         _mostrarResultado() repinta el estado final limpio */
      this._limpiarSecuencia();
      this._$('.ov').hidden = true;
      window.removeEventListener('keydown', this._onKey);
    }
    girar(opts) {
      const premio = Number((opts && opts.premio) != null ? opts.premio : this._datos.premio);
      const idx = this._idx(premio);
      if (idx < 0 || this._resultado != null || this._girando) return;
      this._datos.premio = premio;
      this._resultado = premio;
      this._guardar();
      const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) { this._aterrizar(); this._mostrarResultado(); return; }
      this._girando = true;
      const btn = this._$('.girar');
      btn.disabled = true; btn.textContent = 'Girando…';
      /* el hint se desvanece sin soltar su hueco: quitarlo con hidden
         encogía la tarjeta justo al pulsar Girar */
      this._$('.hint').style.opacity = '0';
      /* Lo único aleatorio es lo decorativo: cuántas vueltas da el carrusel. */
      const vueltas = 3 + Math.floor(Math.random() * 2);
      const delta = ((idx - this._pos) % N + N) % N;
      const target = this._pos + vueltas * N + delta;
      this._animarA(target, 3300, k => 1 - Math.pow(1 - k, 4), () => {
        this._girando = false;
        this._marcarGanadora(idx);
        /* un solo movimiento a la vez: la ganadora termina de crecer (0.5s)
           y recién entonces empieza el relevo de textos */
        clearTimeout(this._transTo);
        this._transTo = setTimeout(() => this._transicionResultado(), 600);
      });
    }
    _transicionResultado() {
      /* primer tiempo del relevo: las capas de la rueda (título+texto arriba,
         hint+Girar abajo) se desvanecen; como son capas absolutas dentro de
         zonas de alto fijo, nada se mueve al retirarlas */
      const outs = ['.rueda', '.pie-rueda'].map(s => this._$(s)).filter(e => !e.hidden);
      outs.forEach(e => { e.style.transition = 'opacity 0.18s ease'; e.style.opacity = '0'; });
      clearTimeout(this._swapTo);
      this._swapTo = setTimeout(() => {
        outs.forEach(e => { e.style.transition = ''; e.style.opacity = ''; e.hidden = true; });
        const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!rm && this._datosContador()) this._secuencia();
        else this._mostrarResultado(true);
      }, 190);
    }
    _mostrarResultado(animado) {
      /* El alto de .card es FIJO desde que se abre —las zonas .zt/.zb
         reservan por CSS el estado más alto— así que aquí NO se anima
         ningún alto: solo se intercambian capas superpuestas con
         opacity/transform. Con animado falsy —reduced motion o reapertura
         del pop-up— todo es instantáneo. */
      this._limpiarSecuencia();
      const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const suave = !!animado && !rm && !this._$('.ov').hidden;
      const p = this._resultado, d = this._datos;
      const tit = p === 100 ? 'Noche extra gratis' : 'Noche extra al ' + p + '%';
      const sub = (d.texto || 'Suma una noche a tu estadía') + (p === 100 ? ', sin costo.' : ' por ' + (d.precio || '') + '.');
      this._$('.rueda').hidden = true; this._$('.pie-rueda').hidden = true;
      const cab = this._$('.res-cab'), res = this._$('.res');
      /* borrar cualquier estilo que la secuencia por actos dejara a medias */
      [cab, res, this._$('.res-tit'), this._$('.res-precio'), this._$('.res-sub'), this._$('.res-btns')]
        .forEach(e => { e.style.transition = ''; e.style.opacity = ''; e.style.transform = ''; e.style.visibility = ''; });
      cab.hidden = false; res.hidden = false;
      this._$('.res-tit').textContent = tit;
      this._$('.res-sub').textContent = sub;
      /* precio final estático si llegaron los números; sin ellos, sin esa línea */
      const nums = this._datosContador();
      const ePre = this._$('.res-precio');
      if (nums) { this._precioFinal(nums); ePre.hidden = false; }
      else ePre.hidden = true;
      const yaAcepto = this._decidido === 'si';
      this._$('.res-btns').hidden = yaAcepto;
      this._$('.res-ok').hidden = !yaAcepto;
      this._$('.live').textContent = 'Resultado: ' + tit + '. ' + sub;

      if (!suave) return;
      [cab, res].forEach(e => { e.style.opacity = '0'; e.style.transform = 'translateY(8px)'; });
      requestAnimationFrame(() => {
        [cab, res].forEach(e => {
          e.style.transition = 'opacity 0.32s ease, transform 0.38s cubic-bezier(0.22,1,0.36,1)';
          e.style.opacity = '1';
          e.style.transform = 'none';
        });
      });
      clearTimeout(this._finTo);
      this._finTo = setTimeout(() => {
        [cab, res].forEach(e => { e.style.transition = ''; e.style.opacity = ''; e.style.transform = ''; });
      }, 430);
    }
    /* ---- desenlace por actos (pedido del dueño): la tarjeta sube, entra
       "Noche extra al 75%", se borra, el precio antiguo baja rodando estilo
       odómetro hasta el precio con descuento y al final aparecen los botones.
       Solo corre con precioAntes/precioDespues numéricos y sin
       prefers-reduced-motion; en cualquier otro caso, _mostrarResultado(). */
    _datosContador() {
      const a = Number(this._datos.precioAntes), b = Number(this._datos.precioDespues);
      if (!isFinite(a) || !isFinite(b) || a <= 0 || b < 0 || b >= a) return null;
      return { antes: a, despues: b, gratis: this._resultado === 100 || b <= 0 };
    }
    _fmt(n) { return n <= 0 ? 'GRATIS' : '$' + n.toLocaleString('es-CL'); }
    _precioFinal(nums) {
      const ePre = this._$('.res-precio');
      if (nums.gratis) ePre.innerHTML = '<span class="grx">GRATIS</span>';
      else ePre.textContent = this._fmt(nums.despues);
    }
    _limpiarSecuencia() {
      (this._seqTos || []).forEach(clearTimeout);
      this._seqTos = [];
      cancelAnimationFrame(this._seqAnim);
    }
    _secuencia() {
      this._limpiarSecuencia();
      const nums = this._datosContador();
      if (!nums) { this._mostrarResultado(true); return; }
      const d = this._datos, p = this._resultado;
      const tit = p === 100 ? 'Noche extra gratis' : 'Noche extra al ' + p + '%';
      const cab = this._$('.res-cab'), res = this._$('.res');
      const eTit = this._$('.res-tit'), ePre = this._$('.res-precio'),
        eSub = this._$('.res-sub'), eBtns = this._$('.res-btns');
      eTit.textContent = tit;
      eSub.textContent = d.texto || 'Suma una noche a tu estadía';
      this._buildOdo(nums.antes, nums.despues);
      this._$('.rueda').hidden = true; this._$('.pie-rueda').hidden = true;
      cab.hidden = false; res.hidden = false; ePre.hidden = false;
      eBtns.hidden = false; this._$('.res-ok').hidden = true;
      [cab, res].forEach(e => { e.style.transition = ''; e.style.opacity = ''; e.style.transform = ''; });
      /* los actores esperan invisibles pero SIN ceder su sitio: son capas
         dentro de zonas de alto fijo, así que nada se descoloca al entrar */
      [eTit, ePre, eSub, eBtns].forEach(e => {
        e.style.transition = ''; e.style.visibility = 'hidden';
        e.style.opacity = '0'; e.style.transform = 'translateY(8px)';
      });
      /* el lector de pantalla recibe el desenlace completo desde ya */
      this._$('.live').textContent = 'Resultado: ' + tit + '. Antes ' + this._fmt(nums.antes) +
        ', ahora ' + this._fmt(nums.gratis ? 0 : nums.despues) + '. ' + (d.texto || '');
      const paso = (ms, fn) => this._seqTos.push(setTimeout(fn, ms));
      const entra = e => {
        e.style.visibility = 'visible';
        e.style.transition = 'opacity 0.32s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
        e.style.opacity = '1'; e.style.transform = 'none';
      };
      /* acto 2 (0.1s): el título del premio entra */
      paso(100, () => entra(eTit));
      /* acto 3 (1.25s): el título se borra */
      paso(1250, () => {
        eTit.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        eTit.style.opacity = '0'; eTit.style.transform = 'translateY(-6px)';
      });
      /* acto 4 (1.55s): aparece el precio antiguo… */
      paso(1550, () => entra(ePre));
      /* …y en 2.05s los dígitos ruedan hacia abajo hasta el precio final */
      paso(2050, () => this._rodar(nums.antes, nums.gratis ? 0 : nums.despues, 1400, () => {
        const fin = () => {
          entra(eSub); entra(eBtns);
          this._$('.si').focus();
        };
        if (nums.gratis) {
          /* acto extra: el contador muere en $0 y GRATIS entra con un pop */
          paso(150, () => {
            ePre.innerHTML = '<span class="grx" style="opacity:0;transform:scale(0.7)">GRATIS</span>';
            const g = ePre.firstChild;
            requestAnimationFrame(() => {
              g.style.transition = 'opacity 0.25s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
              g.style.opacity = '1'; g.style.transform = 'scale(1)';
            });
            paso(400, fin);
          });
        } else paso(280, fin);
      }));
    }
    /* odómetro: una columna por dígito, cada una con la tira 0-9 (y un 0 extra
       para que el giro 0→9 sea continuo); separadores de miles es-CL */
    _buildOdo(antes, despues) {
      const ePre = this._$('.res-precio');
      ePre.innerHTML = '';
      const odo = document.createElement('span'); odo.className = 'odo';
      const mon = document.createElement('span'); mon.className = 'f'; mon.textContent = '$';
      odo.appendChild(mon);
      const n = String(Math.floor(Math.max(antes, despues, 1))).length;
      this._odoCols = []; this._odoSeps = [];
      for (let i = 0; i < n; i++) {
        const r = n - 1 - i, P = Math.pow(10, r);
        if (i > 0 && r % 3 === 2) {
          const s = document.createElement('span'); s.className = 'f'; s.textContent = '.';
          odo.appendChild(s);
          this._odoSeps.push({ el: s, P: P * 10 });
        }
        const c = document.createElement('span'); c.className = 'c';
        const st = document.createElement('span'); st.className = 'st';
        for (let k = 0; k <= 10; k++) {
          const dg = document.createElement('span'); dg.textContent = String(k % 10);
          st.appendChild(dg);
        }
        c.appendChild(st); odo.appendChild(c);
        this._odoCols.push({ el: c, st: st, P: P, pos: Math.floor(antes / P) % 10 });
      }
      ePre.appendChild(odo);
      this._pintarOdo(antes, true);
    }
    _pintarOdo(v, exacto) {
      if (!this._odoCols) return;
      v = Math.max(0, v);
      this._odoCols.forEach(c => {
        const obj = Math.floor(v / c.P) % 10;
        if (exacto) c.pos = obj;
        else {
          /* cada rueda persigue su dígito SOLO hacia abajo, con inercia: las
             unidades giran borrosas, las decenas de miles caen a saltos, y al
             agotarse la distancia todas frenan solas (el clac del odómetro) */
          const dist = ((c.pos - obj) % 10 + 10) % 10;
          c.pos = dist < 0.02 ? obj : (((c.pos - Math.max(0.02, dist * 0.35)) % 10) + 10) % 10;
        }
        c.st.style.transform = 'translateY(' + (-c.pos * 1.1).toFixed(3) + 'em)';
        c.el.style.display = (c.P === 1 || v >= c.P - 0.5) ? '' : 'none'; /* fuera ceros a la izquierda */
      });
      this._odoSeps.forEach(s => { s.el.style.display = v >= s.P - 0.5 ? '' : 'none'; });
    }
    _rodar(desde, hasta, dur, cb) {
      cancelAnimationFrame(this._seqAnim);
      const t0 = performance.now();
      let fin = false;
      const done = () => {
        if (fin) return; fin = true;
        cancelAnimationFrame(this._seqAnim);
        this._pintarOdo(hasta, true);
        cb();
      };
      const tick = t => {
        if (fin) return;
        const k = Math.min(1, (t - t0) / dur);
        this._pintarOdo(desde + (hasta - desde) * (1 - Math.pow(1 - k, 4)));
        /* tras agotar el tiempo, unas vueltas más hasta que cada rueda asiente */
        if (k >= 1 && this._odoCols.every(c => c.pos === Math.floor(hasta / c.P) % 10)) done();
        else this._seqAnim = requestAnimationFrame(tick);
      };
      this._seqAnim = requestAnimationFrame(tick);
      /* red de seguridad: si rAF se estrangula (pestaña oculta, ahorro de energía) */
      this._seqTos.push(setTimeout(done, dur + 900));
    }
    reiniciar() {
      this._resultado = null; this._decidido = null; this._datos = {};
      this._codigo = null;
      this._girando = false;
      window.__vaRuletaEstado = null;
      cancelAnimationFrame(this._anim); clearTimeout(this._animTo);
      clearTimeout(this._transTo); clearTimeout(this._swapTo); clearTimeout(this._finTo);
      this._limpiarSecuencia();
      this._quitarGanadora();
      this._tjs.forEach(t => t.classList.remove('win'));
      /* borrar cualquier estilo que la secuencia del resultado dejara a medias */
      ['.rueda', '.pie-rueda', '.res-cab', '.res', '.res-tit', '.res-precio', '.res-sub', '.res-btns'].forEach(s => {
        const e = this._$(s);
        e.style.transition = ''; e.style.opacity = ''; e.style.transform = ''; e.style.visibility = '';
      });
      this._$('.res-cab').hidden = true; this._$('.res').hidden = true;
      this._$('.res-precio').hidden = true;
      this._$('.rueda').hidden = false; this._$('.pie-rueda').hidden = false;
      this._odoCols = null; this._odoSeps = [];
      this._setPos(0);
      this._$('.hint').hidden = false; this._$('.hint').style.opacity = '';
      this.cerrar();
    }
  }
  customElements.define('va-ruleta', VaRuleta);
})();
