/* Capa de datos de Valle Aventura — el ÚNICO sitio donde vive la ocupación.
 *
 * Hoy responde con datos de ejemplo. Cuando exista el Supabase real, se rellena
 * CONFIG abajo y `VA_DATOS.cargar()` pasa a leer de la base sin que haya que
 * tocar una sola línea de la página.
 *
 * Antes existían dos fuentes distintas —`VA_OCUPACION` en index.html y `CAL_OCC`
 * en movil.html— que no coincidían: el teléfono y el notebook mostraban
 * disponibilidad diferente para las mismas cabañas. Este archivo existe para
 * que eso no pueda volver a pasar.
 */
(function () {
  'use strict';

  var CONFIG = {
    // Proyecto "Valle Aventura", organización propia, región São Paulo.
    SUPABASE_URL: 'https://wxxlqszadprwizporhbg.supabase.co',

    /* Clave PUBLICABLE (anon). Es pública por diseño: viaja al navegador de
       todas formas, y solo puede hacer lo que la base le permita — leer
       cabañas, tarifas, reglas, y la ocupación a través de la vista
       `ocupacion`. Sobre la tabla `bloqueos` no tiene ningún permiso, así que
       el nombre, el teléfono y el email del huésped no pueden salir por aquí.
       Escribir no puede: la única forma de tocar la agenda desde la web es
       `solicitar_reserva()`, que valida todo antes de anotar nada.
       La clave SECRETA (sb_secret_ / service_role) NO va aquí nunca: se salta
       RLS y quedaría a la vista de cualquiera que abra el código. */
    SUPABASE_ANON_KEY: 'sb_publishable_2AuGtg42OxMoFDm7t3TbKA_ukrx_wDM'
  };

  /* ⚠️ SE ARRIENDAN TRES. NUNCA CUATRO.
   *
   * La tabla `cabanas` de Supabase tiene una cuarta fila, la **Host**, que es
   * la casa de José. Está ahí porque consume pellet y hay que contabilizarlo,
   * pero `arrienda = false`: no entra en el calendario, ni en el cotizador,
   * ni en "cuántas quedan libres", ni en la asignación.
   *
   * Este archivo la filtra por dos sitios a la vez —en la consulta y otra vez
   * al entregar la lista— a propósito: si alguien cambia la consulta algún
   * día, la casa de José sigue sin poder aparecer como disponible. Un solo
   * filtro es un olvido a la espera de pasar, y aquí el fallo sería vender la
   * casa donde vive el dueño.
   */
  var EJEMPLO = {
    cabanas: [
      { id: 'shangri-la', nombre: 'Shangri-la', capacidad: 8, arrienda: true, reservas: [
        ['2026-08-20','2026-08-23'], ['2026-09-11','2026-09-13'], ['2026-09-18','2026-09-21'],
        ['2026-10-09','2026-10-12'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]},
      { id: 'el-chueco', nombre: 'El Chueco', capacidad: 9, arrienda: true, reservas: [
        ['2026-08-21','2026-08-24'], ['2026-09-18','2026-09-20'], ['2026-10-09','2026-10-11'],
        ['2026-10-30','2026-11-01'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]},
      { id: 'nevados', nombre: 'Nevados', capacidad: 8, arrienda: true, reservas: [
        ['2026-08-21','2026-08-23'], ['2026-08-28','2026-08-30'], ['2026-09-17','2026-09-22'],
        ['2026-10-09','2026-10-12'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]}
    ]
  };

  /* El segundo filtro, el que no depende de cómo esté escrita la consulta. */
  function soloArrendables(lista) {
    return (lista || []).filter(function (c) { return c && c.arrienda !== false; });
  }

  var estado = {
    cabanas: EJEMPLO.cabanas,
    real: false,          // ¿son datos de la base o del ejemplo?
    error: null
  };

  function conectado() {
    return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  var cab = function () {
    return CONFIG.SUPABASE_URL.replace(/\/$/, '') +
      /* PRIMER filtro: la Host ni siquiera viaja por la red.
         La columna del schema es `capacidad_max`, no `capacidad` — se renombra
         al recibirla. Y `activa` porque una cabaña dada de baja tampoco se
         vende, aunque siga en la tabla. */
      '/rest/v1/cabanas?select=id,nombre,capacidad_max,arrienda,activa' +
      '&arrienda=eq.true&activa=eq.true&order=orden.asc';
  };
  /* `ocupacion` es una vista, no la tabla `bloqueos`. La tabla tiene nombre,
     teléfono y email del huésped; la vista solo tiene qué cabaña y qué días.
     Aunque mañana alguien añada un campo delicado a la tabla, aquí no puede
     aparecer sin que alguien lo escriba a mano.
     La vista además esconde las reservas pendientes que ya caducaron: si un
     cliente abandona el pago, esas fechas vuelven a salir libres solas. */
  var blo = function () {
    return CONFIG.SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/ocupacion?select=cabana_id,desde,hasta&order=desde.asc';
  };
  var cabecera = function () {
    return { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY };
  };

  /* Lee el catálogo y los bloqueos con la clave anónima. El schema da permiso
     columna por columna: id, cabana_id, desde, hasta. Nombre y teléfono quedan
     fuera del grant, así que esto no puede exponer datos de huésped ni por
     error. */
  function cargar() {
    if (!conectado()) return Promise.resolve(estado);

    var pide = function (url) {
      return fetch(url, { headers: cabecera() }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    };

    return Promise.all([pide(cab()), pide(blo())])
      .then(function (res) {
        var catalogo = soloArrendables(res[0]);   // SEGUNDO filtro
        var filas = res[1];
        var porCabana = {};
        filas.forEach(function (f) {
          (porCabana[f.cabana_id] = porCabana[f.cabana_id] || []).push([f.desde, f.hasta]);
        });
        /* Si el catálogo viniera vacío se conserva el ejemplo: es preferible
           una página que funciona y avisa, a uno que dice "no hay cabañas". */
        var base = catalogo.length ? catalogo : EJEMPLO.cabanas;
        estado.cabanas = soloArrendables(base).map(function (c) {
          return {
            id: c.id,
            nombre: c.nombre,
            // capacidad_max en la base; capacidad en la página
            capacidad: c.capacidad_max != null ? c.capacidad_max : c.capacidad,
            arrienda: true,
            reservas: porCabana[c.id] || []
          };
        // Capacidad 0 es la casa del anfitrión: no se vende ni por error.
        }).filter(function (c) { return c.capacidad > 0; });
        estado.real = catalogo.length > 0;
        estado.error = null;
        return estado;
      })
      .catch(function (e) {
        // Si la base falla, se sigue con el ejemplo pero el aviso queda visible:
        // es preferible una página que funciona y lo advierte, a una en blanco.
        estado.error = e.message || 'sin conexión';
        return estado;
      });
  }

  window.VA_DATOS = {
    /* TERCER punto de filtrado, el último antes de que la página vea nada.
       Nadie que consuma esto puede recibir la casa de José, venga de donde
       venga la lista. */
    cabanas: function () { return soloArrendables(estado.cabanas); },
    /* Cuántas se arriendan de verdad. La página lo usa como tope de personas
       y como "quedan N libres"; si algún día se suma una cuarta cabaña real
       aquí sale sola, y la Host sigue fuera. */
    total: function () { return soloArrendables(estado.cabanas).length; },
    esReal: function () { return estado.real; },
    error: function () { return estado.error; },
    conectado: conectado,
    cargar: cargar
  };
})();
