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
    SUPABASE_URL: '',        // p. ej. https://xxxx.supabase.co
    SUPABASE_ANON_KEY: ''    // la clave ANÓNIMA. La service_role NO va aquí nunca.
  };

  /* Datos de ejemplo. Se usan solo mientras CONFIG esté vacío, y la página lo
     dice en pantalla para que nadie los confunda con disponibilidad real. */
  var EJEMPLO = {
    cabanas: [
      { id: 'shangri-la', nombre: 'Shangri-la', capacidad: 8, reservas: [
        ['2026-08-20','2026-08-23'], ['2026-09-11','2026-09-13'], ['2026-09-18','2026-09-21'],
        ['2026-10-09','2026-10-12'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]},
      { id: 'el-chueco', nombre: 'El Chueco', capacidad: 9, reservas: [
        ['2026-08-21','2026-08-24'], ['2026-09-18','2026-09-20'], ['2026-10-09','2026-10-11'],
        ['2026-10-30','2026-11-01'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]},
      { id: 'nevados', nombre: 'Nevados', capacidad: 8, reservas: [
        ['2026-08-21','2026-08-23'], ['2026-08-28','2026-08-30'], ['2026-09-17','2026-09-22'],
        ['2026-10-09','2026-10-12'], ['2026-11-13','2026-11-15'], ['2026-12-24','2026-12-27']
      ]}
    ]
  };

  var estado = {
    cabanas: EJEMPLO.cabanas,
    real: false,          // ¿son datos de la base o del ejemplo?
    error: null
  };

  function conectado() {
    return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  /* Lee `bloqueos` con la clave anónima. El schema da permiso columna por
     columna: id, cabana_id, desde, hasta. Nombre y teléfono quedan fuera del
     grant, así que esta llamada no puede exponer datos de huésped ni por error. */
  function cargar() {
    if (!conectado()) return Promise.resolve(estado);

    var url = CONFIG.SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/bloqueos?select=cabana_id,desde,hasta&order=desde.asc';

    return fetch(url, {
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (filas) {
        var porCabana = {};
        filas.forEach(function (f) {
          (porCabana[f.cabana_id] = porCabana[f.cabana_id] || []).push([f.desde, f.hasta]);
        });
        // Las capacidades vienen del catálogo; si aún no se expone, se conservan
        // las del ejemplo para no quedarse sin el filtro por tamaño de grupo.
        estado.cabanas = EJEMPLO.cabanas.map(function (c) {
          return { id: c.id, nombre: c.nombre, capacidad: c.capacidad, reservas: porCabana[c.id] || [] };
        });
        estado.real = true;
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
    cabanas: function () { return estado.cabanas; },
    esReal: function () { return estado.real; },
    error: function () { return estado.error; },
    conectado: conectado,
    cargar: cargar
  };
})();
