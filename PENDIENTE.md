# Lo que falta, en orden

Tres cosas. Ninguna necesita escribir código: son datos que yo no tengo,
credenciales que no debo manejar, o decisiones tuyas.

---

## ✅ Ya hecho — Supabase y la sincronía

El proyecto existe y está conectado de punta a punta.

- **Proyecto:** Valle Aventura, organización propia (separada de INMERSIA),
  región São Paulo · `https://wxxlqszadprwizporhbg.supabase.co`
- **Tablas creadas** con `db/schema.sql`: 5 tablas, `cotizar()`,
  `disponible()`, `tinaja_libre()`, RLS, permisos y el bucket `comprobantes`.
  Cargadas las 3 cabañas arrendables + la Host, y la tarifa base de $180.000.
- **Clave publicable** puesta en `datos.js` y en `panel/config.js`.
- **`index.html` y `movil.html` leen la misma fuente.** Antes el teléfono
  mostraba la disponibilidad real y el notebook una inventada.

Verificado con una reserva de prueba en las tres cabañas: el calendario tacha
la noche completa y pinta en diagonal el día de entrada y el de salida
(check-out 11:00 / check-in 16:00 — el día de salida queda libre). La prueba
se borró después.

### Cómo quedaron los permisos

| Rol | `cabanas` `reglas` `tarifas` | `bloqueos` | `pellet` |
|---|---|---|---|
| `anon` (la web) | solo lectura | 5 columnas: id, cabana_id, desde, hasta, origen | sin acceso |
| `authenticated` (el panel) | lectura y escritura | lectura y escritura | lectura y escritura |

Comprobado desde fuera con la clave pública: `bloqueos.nombre`,
`bloqueos.telefono`, `select=*`, `pellet` y cualquier escritura devuelven
**401**. El nombre y el teléfono del huésped no salen por la web.

> **Dos cosas que costaron y conviene no repetir:**
>
> El proyecto se creó con la **exposición automática de tablas desactivada**.
> Es la postura correcta, pero significa que *nada* tiene permisos salvo lo
> que el schema escriba. Las políticas RLS no bastan: una política filtra
> filas dentro de lo que el permiso de tabla ya permite, no concede nada. El
> panel entraba bien y se caía con `permission denied for table reglas`.
>
> Y `anon` venía del bootstrap de Supabase con **TRUNCATE** sobre tres tablas.
> `TRUNCATE` vacía una tabla entera y RLS no lo puede impedir, porque las
> políticas filtran filas y `TRUNCATE` no lee filas. La clave publicable va
> dentro de la web, así que todo lo que `anon` pueda hacer lo puede hacer
> cualquiera. Revocado.
>
> Las dos correcciones están en `db/schema.sql` con su explicación.

> **La cabaña Host no se arrienda.** `datos.js` la filtra en tres sitios
> (consulta, recepción y entrega), así que aunque esté en la tabla nunca puede
> aparecer como disponible. Está ahí porque consume pellet.

---

## 1 · Rotar la clave secreta  ·  1 minuto  ·  **hazlo primero**

La `sb_secret_` se pegó en un chat. Esa clave **se salta RLS y todos los
permisos de arriba**: con ella se lee el teléfono de cada huésped y se puede
borrar la agenda entera.

*Project Settings* → *API Keys* → **Rotate** sobre la `sb_secret_`.

No hay que tocar ningún archivo del proyecto: esa clave no está en el código,
solo la usarían las funciones de pago y todavía no están desplegadas.

---

## 2 · Los datos de contacto  ·  1 minuto

En el pie están marcados en amarillo. Me faltan:

- **Teléfono** (para el `wa.me`, el pie y la página de retorno del pago —
  en `gracias.html` la constante `WA` está a medias)
- **Dirección exacta**

La razón social ya está: *Sociedad Inmobiliaria Valle Aventura*.

Y tres enlaces sociales siguen en `href="#"` porque no tengo las cuentas:
WhatsApp, TikTok e Instagram.

---

## 3 · Los dos medios de pago

El cliente elige con cuál paga. La página lista **solo los que tengan endpoint
configurado** en `pagos.js`: si no configuras ninguno, no aparece ningún botón
de pagar y el flujo se queda en "Enviar solicitud de reserva".

### Mercado Pago  ·  ya tienes la cuenta

1. Panel de Mercado Pago → **Tus integraciones** → tu aplicación → **Credenciales**
2. Copia el **Access Token**: `APP_USR-…` en producción, `TEST-…` en pruebas
3. En **Webhooks**, crea la clave secreta de firma

```
supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... MP_ENV=prueba
supabase functions deploy mercadopago --no-verify-jwt
```

Empieza con `MP_ENV=prueba` y las credenciales `TEST-…`. Cuando el flujo
completo funcione de punta a punta, cambias a las de producción.

### Webpay

Necesitas el **código de comercio** y la **API Key Secret** de Transbank.

```
supabase secrets set TBK_COMMERCE_CODE=... TBK_API_KEY=... TBK_ENV=produccion
supabase functions deploy webpay --no-verify-jwt
```

Sin configurar, funciona contra el ambiente de **integración** de Transbank,
con credenciales públicas de prueba que no mueven dinero.

### Después de desplegar

Pega las URLs de las funciones en `pagos.js`, en `ENDPOINTS`. Nada más.

**En el repositorio no entra ninguna credencial.** Es público en GitHub: subir
ahí un access token es publicarlo.

### Lo que falta en las funciones, y depende de la base

Marcado como `TODO` en el código de las dos:

1. **Anotar la reserva como pendiente ANTES de mandar a pagar**, y liberarla
   sola si en 30 minutos no llega la confirmación. Sin eso, un cliente que
   abandona el pago deja la fecha bloqueada para siempre.
2. **Confirmarla al recibir el aviso, de forma idempotente.** Mercado Pago
   reintenta el mismo webhook varias veces y no puede acabar en dos reservas.

Y el monto: hoy la función acepta el que manda la página, acotado a un rango.
En producción tiene que recalcularlo con `cotizar()` en Postgres — cualquiera
puede editar lo que envía el navegador antes de mandarlo.

> **Por qué el webhook manda y no la vuelta del cliente:** `back_urls` depende
> de que el cliente regrese. Si cierra la pestaña, se queda sin batería o
> pierde señal en la montaña, la reserva nunca se confirmaría aunque haya
> pagado. El webhook llega igual y reintenta. La vuelta del cliente sirve solo
> para enseñarle el resultado.

---

## Estado del sitio

| | |
|---|---|
| Publicado y sirviendo | `index.html` (PC) + `movil.html` (teléfono) |
| A elegir | `variante-a.html` y `variante-b.html` |
| Descartada | `nuevo.html` — la fusión que salió mal |
| Vuelta atrás | `git checkout pre-fusion-2026-08-16` |

La **variante B** es la que lleva la portada nueva, la cinta del valle, la
barra fija y la pantalla de medios de pago. **Falta decidir si reemplaza a
`movil.html`**, que es lo que hoy ve cualquiera que entre desde el teléfono.

El panel de reservas vive en el otro proyecto
(`plataforma reservas valle aventura`) y hoy se sirve a mano en el puerto
8300. Si algún día tiene que estar siempre disponible, hay que alojarlo.
