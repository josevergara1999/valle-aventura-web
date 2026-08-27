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

  /* Lo que se usa mientras la base no responde. Son los mismos números que
     tiene la base hoy, para que una caída no cambie el precio en pantalla. Si
     algún día divergen, manda la base: esto solo existe para el rato en que no
     hay respuesta. */
  var TARIFAS_EJEMPLO = [{ nombre: 'Base', desde: null, hasta: null, precio_base: 180000, prioridad: 0 }];
  var REGLAS_EJEMPLO = {
    personas_incluidas: 5, precio_persona_extra: 5000,
    minimo_noches: 2, porcentaje_anticipo: 50, edad_nino_max: 11,
    /* Sin respuesta de la base NO se inventa un recargo: cobrar de mas por un
       fallo de red seria mucho peor que perder la comision de una reserva. */
    recargo_pasarela_pct: 0
  };

  var estado = {
    cabanas: EJEMPLO.cabanas,
    tarifas: TARIFAS_EJEMPLO,
    reglas: REGLAS_EJEMPLO,
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
  /* Precios y reglas. Antes la página los llevaba escritos a mano —$180.000 en
     el hero, 5.000 por persona extra, mínimo 2 noches— y el cobro real lo hacía
     `cotizar()` en Postgres. Bastaba con que José cambiara una tarifa en el
     panel para que la web prometiera un precio y la pasarela cobrara otro. */
  var tar = function () {
    return CONFIG.SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/tarifas?select=id,nombre,desde,hasta,precio_base,prioridad,' +
      'desde_dia,desde_mes,hasta_dia,hasta_mes' +
      '&activa=eq.true&order=prioridad.desc';
  };
  var reg = function () {
    return CONFIG.SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/reglas?select=personas_incluidas,precio_persona_extra,minimo_noches,' +
      'porcentaje_anticipo,edad_nino_max,recargo_pasarela_pct&limit=1';
  };

  var cabecera = function () {
    return { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY };
  };

  /* MISMO CRITERIO QUE `tarifa_de()` EN POSTGRES, a proposito y palabra por
     palabra. Si esto se separa de la funcion de la base, la pagina vuelve a
     mostrar un numero distinto del que se cobra, que es justo el problema que
     vino a resolver.

     Tres niveles de especificidad, de mas a menos:
       2 · rango con anio exacto  → la excepcion puntual
       1 · temporada recurrente   → dia y mes, se repite todos los anios
       0 · base sin fechas        → la red de seguridad
     Dentro del mismo nivel manda la prioridad, y si empatan, el id: el mismo
     desempate estable que hace Postgres, para que la web no pueda elegir una
     temporada distinta de la que cobrara la pasarela. */
  function precioNoche(fechaISO) {
    var f = new Date(fechaISO + 'T00:00:00');
    /* El dia del anio como numero MMDD: el 15 de junio es 615. Asi el rango
       se compara sin que el anio estorbe. */
    var md = (f.getMonth() + 1) * 100 + f.getDate();
    var mejor = null, nivelMejor = -1;

    for (var i = 0; i < estado.tarifas.length; i++) {
      var t = estado.tarifas[i], nivel, aplica;

      if (t.desde || t.hasta) {
        nivel  = 2;
        aplica = (!t.desde || fechaISO >= t.desde) &&
                 (!t.hasta || fechaISO <= t.hasta);   // `hasta` es inclusivo
      } else if (t.desde_mes) {
        nivel = 1;
        var dd = t.desde_mes * 100 + t.desde_dia;
        /* "Hasta el 28 de febrero" quiere decir hasta que se acabe febrero.
           Sin esta linea, en anio bisiesto el 29 se queda fuera de la
           temporada y se vende al precio base: una noche de plena alta de
           verano al precio mas bajo del anio, cada cuatro anios, sin que
           nadie lo note hasta que ya paso. */
        var hh = (t.hasta_mes === 2 && t.hasta_dia >= 28)
                   ? 229
                   : t.hasta_mes * 100 + t.hasta_dia;
        /* Cuando la temporada CRUZA EL ANIO NUEVO —la alta de verano, del 15
           de diciembre al 28 de febrero— su inicio es mayor que su fin. Un
           rango ingenuo daria vacio justo en las noches mas caras del anio. */
        aplica = dd <= hh ? (md >= dd && md <= hh) : (md >= dd || md <= hh);
      } else {
        nivel = 0; aplica = true;
      }

      if (!aplica) continue;
      if (!mejor || nivel > nivelMejor) { mejor = t; nivelMejor = nivel; continue; }
      if (nivel < nivelMejor) continue;

      var pt = t.prioridad || 0, pm = mejor.prioridad || 0;
      if (pt > pm) mejor = t;
      else if (pt === pm && String(t.id) < String(mejor.id)) mejor = t;
    }
    return mejor ? mejor.precio_base : null;
  }

  /* El precio "de portada", el del hero: el de la temporada que rige HOY.
     Es el numero que ve alguien que entra sin haber elegido fechas todavia.

     Estuvo un rato siendo el MINIMO de los proximos doce meses, y era
     defendible sobre el papel —"desde" promete el mas barato del anio— pero
     en la practica es cebo: el 25 de agosto anunciaba $100.000 y quien
     reservaba para septiembre pagaba $180.000. Ver un precio y que te cobren
     otro no se lee como una temporada distinta, se lee como una trampa.

     Al reves no pasa nada: quien entra en agosto viendo $180.000 y busca
     fechas de abril se encuentra $100.000, y esa sorpresa juega a favor.

     La palabra "desde" del hero sigue siendo cierta: el precio sube con los
     adultos que pasan de los incluidos. */
  function precioBase() {
    var h = new Date();
    var hoy = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0')
            + '-' + String(h.getDate()).padStart(2, '0');
    var p = precioNoche(hoy);
    return p != null ? p : 180000;
  }

  /* Cotización local, para pintar algo mientras la de verdad viaja y para
     cuando no hay red. Replica la regla de `cotizar()`: el recargo lo pagan los
     ADULTOS que exceden los incluidos —los niños ocupan cama pero no suman— y
     el precio se busca noche a noche, porque una estadía puede cruzar de
     temporada. La cotización que manda sigue siendo la de la base. */
  function cotizarLocal(desde, hasta, adultos, ninos) {
    var r = estado.reglas || REGLAS_EJEMPLO;
    var noches = Math.round((new Date(hasta) - new Date(desde)) / 86400000);
    if (!(noches > 0)) return null;
    var extra = Math.max(0, (adultos || 0) - r.personas_incluidas) * r.precio_persona_extra;
    var total = 0, d = new Date(desde + 'T00:00:00');
    for (var i = 0; i < noches; i++) {
      var f = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
            + '-' + String(d.getDate()).padStart(2, '0');
      var base = precioNoche(f);
      if (base == null) return null;      // sin tarifa no se inventa un precio
      total += base + extra;
      d.setDate(d.getDate() + 1);
    }
    var anticipo = Math.round(total * (r.porcentaje_anticipo / 100));
    var recargo = recargoPasarela(anticipo);
    return {
      ok: true, noches: noches, total: total,
      anticipo: anticipo, saldo: total - anticipo,
      /* `recargo` es lo que se suma por pagar online; `aPagar` es lo que se
         cobra de verdad. El `saldo` de la cabaña NO lo lleva. */
      recargo: recargo, aPagar: anticipo + recargo,
      local: true
    };
  }

  /* Recargo por pagar con pasarela. ESPEJO EXACTO de `recargo_pasarela()` en
     Postgres, y por la misma razón que el resto: la página lo ENSEÑA, la base
     lo COBRA, y si discreparan el cliente veria un numero y pagaria otro.

     Se despeja al reves, no se multiplica. Sumarle el 3,8% al anticipo deja
     corto, porque Mercado Pago cobra su comision tambien sobre el recargo:
     de 180.000 + 6.833 se llevaria 7.102 y quedarian 179.731. La cuenta buena
     es monto / (1 - comision).

     Y va sobre el ANTICIPO, no sobre el total: por la pasarela solo pasa el
     50%, el resto se paga en la cabaña y no tiene comision. */
  function recargoPasarela(anticipo) {
    var r = estado.reglas || REGLAS_EJEMPLO;
    var pct = Number(r.recargo_pasarela_pct) || 0;
    if (!(anticipo > 0) || pct <= 0) return 0;
    return Math.round(anticipo / (1 - pct / 100)) - anticipo;
  }

  /* La cotización de verdad: la calcula Postgres, la misma función que usa el
     panel y la que decide cuánto cobra Mercado Pago. `stable` y con permiso
     para `anon`, así que la web puede preguntarla sin exponer nada. */
  function cotizar(cabana, desde, hasta, adultos, ninos) {
    if (!conectado()) return Promise.resolve(null);
    return fetch(CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/cotizar', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cabecera()),
      body: JSON.stringify({
        p_cabana: cabana, p_entrada: desde, p_salida: hasta,
        p_adultos: adultos, p_ninos: ninos || 0
      })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ---- Cotizaciones con precio pactado ----------------------------------
     José cierra por WhatsApp a un precio que no es el de la web y le manda un
     código. Aquí solo se pregunta: el precio, quién es y si sigue valiendo lo
     decide Postgres. Esta función no puede rebajar nada por su cuenta, y esa
     es exactamente la idea. */
  function cotizacion(codigo, nombre) {
    if (!conectado()) return Promise.resolve(null);
    return fetch(CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/cotizacion_ver', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cabecera()),
      body: JSON.stringify({ p_codigo: codigo, p_nombre: nombre })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* Los textos de por qué un código no sirve, en UN solo sitio. La base
     devuelve el motivo en seco (`vencida`, `ya_usada`) y quien lo enseñe usa
     esto: la página al canjear y la función de pago al cobrar dan el mismo
     motivo, así que tienen que dar la misma frase.

     "No encontramos esa cotización" vale para el código que no existe Y para
     el nombre que no cuadra, a propósito: si se distinguieran, el formulario
     serviría para averiguar qué códigos hay. */
  var MOTIVOS = {
    no_encontrada:    'No encontramos esa cotización. Revisa que el nombre y el código estén tal cual te los enviamos.',
    vencida:          'Esa cotización ya venció. Escríbenos por WhatsApp y te hacemos una nueva.',
    ya_usada:         'Ese código ya se usó para tomar una reserva.',
    anulada:          'Esa cotización ya no está disponible. Escríbenos por WhatsApp.',
    fecha_pasada:     'Las fechas de esa cotización ya pasaron.',
    ya_no_disponible: 'Esas fechas se ocuparon mientras tanto. Escríbenos y buscamos otras.',
    noche_extra_no_disponible: 'La noche extra ya no está libre. Puedes seguir con tus fechas originales.'
  };
  function motivoCotizacion(m) {
    return MOTIVOS[m] || 'No pudimos abrir esa cotización. Escríbenos por WhatsApp.';
  }

  /* El precio que Google enseña en el resultado de búsqueda sale del bloque
     `application/ld+json` de la cabecera, que está escrito en el HTML y por
     tanto también se quedaba fijo. Aquí se reescribe con el de la base en
     cuanto llega, junto con el mínimo de noches y el porcentaje de anticipo
     que aparecen en la descripción. Si el bloque no existe o cambió de forma,
     no pasa nada: se deja como estaba. */
  function marcado() {
    try {
      var et = document.querySelector('script[type="application/ld+json"]');
      if (!et) return;
      var d = JSON.parse(et.textContent);
      if (!d || !d.makesOffer) return;
      var r = estado.reglas || REGLAS_EJEMPLO;
      d.makesOffer.price = String(precioBase());
      d.makesOffer.description = 'Precio por noche. Estadía mínima ' + r.minimo_noches
        + ' noches. Anticipo del ' + r.porcentaje_anticipo + '% para tomar la fecha.';
      et.textContent = JSON.stringify(d, null, 2);
    } catch (e) { /* el marcado nunca puede romper la página */ }
  }

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

    /* Precios y reglas van con `catch` propio y no dentro del `Promise.all`
       duro: si la tabla de tarifas fallara, el calendario y la disponibilidad
       —que es lo que la gente viene a ver— tienen que seguir funcionando. */
    var opcional = function (url, siFalla) {
      return pide(url).catch(function () { return siFalla; });
    };

    return Promise.all([
      pide(cab()), pide(blo()),
      opcional(tar(), null), opcional(reg(), null),
    ])
      .then(function (res) {
        var catalogo = soloArrendables(res[0]);   // SEGUNDO filtro
        var filas = res[1];
        if (Array.isArray(res[2]) && res[2].length) estado.tarifas = res[2];
        if (Array.isArray(res[3]) && res[3].length) estado.reglas = res[3][0];
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
        marcado();
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
    cargar: cargar,

    /* Precios. Ninguna página vuelve a escribir un número de estos a mano. */
    reglas: function () { return estado.reglas || REGLAS_EJEMPLO; },
    precioBase: precioBase,
    precioNoche: precioNoche,
    recargoPasarela: recargoPasarela,
    cotizarLocal: cotizarLocal,
    cotizar: cotizar,

    /* Cotizaciones con precio pactado. */
    cotizacion: cotizacion,
    motivoCotizacion: motivoCotizacion
  };
})();
