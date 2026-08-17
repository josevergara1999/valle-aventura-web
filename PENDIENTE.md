# Lo que falta, en orden

Cuatro cosas. Ninguna necesita escribir código: son datos que yo no tengo o
acciones que la extensión del navegador bloquea por seguridad.

---

## 1 · La clave anónima de Supabase  ·  2 minutos

El proyecto ya existe: **Valle Aventura**, organización propia (separada de
INMERSIA), región São Paulo.
URL: `https://wxxlqszadprwizporhbg.supabase.co`

Falta una línea:

1. Supabase → proyecto **Valle Aventura** → *Project Settings* → *API Keys*
2. Copia la clave **publicable / anon** (empieza por `sb_publishable_`)
3. Pégala en `datos.js`, en `SUPABASE_ANON_KEY`

> No la pude sacar yo: la extensión de Chrome bloquea la lectura de claves en
> la página. Es una protección deliberada y preferí no esquivarla.

**La clave secreta (`service_role`) no va ahí nunca.** Se salta RLS y quedaría
a la vista de cualquiera que abra el código de la página.

En cuanto pegues la clave, el aviso de "disponibilidad de ejemplo" desaparece
solo y el calendario pasa a leer la agenda real.

---

## 2 · Crear las tablas  ·  5 minutos

1. Supabase → proyecto Valle Aventura → **SQL Editor** → *New query*
2. Pega entero el contenido de
   `C:\Users\PC\Projects\plataforma reservas valle aventura\db\schema.sql`
3. *Run*

Crea las 5 tablas, `cotizar()`, `disponible()`, `tinaja_libre()`, las políticas
RLS, los permisos columna por columna y el bucket `comprobantes`. Deja cargadas
las 3 cabañas y la tarifa base de $180.000.

Ya dejé configurado, al crear el proyecto:

- **Data API activa** — la web necesita leer con la clave anónima
- **Exposición automática de tablas DESACTIVADA** — lo recomienda Supabase y
  encaja con tu regla: los datos de huésped no salen con la clave anónima
- **RLS automática ACTIVA** — toda tabla nueva nace protegida

> **La cabaña Host no se arrienda.** `datos.js` la filtra en tres sitios
> (consulta, recepción y entrega), así que aunque esté en la tabla nunca puede
> aparecer como disponible. Comprobado simulando que la base la devuelve.

---

## 3 · Los datos de contacto  ·  1 minuto

En el pie están marcados en amarillo. Me faltan:

- **Teléfono** (para el `wa.me`, el pie y la página de retorno del pago)
- **Dirección exacta**

La razón social ya está: *Sociedad Inmobiliaria Valle Aventura*.

Y tres enlaces sociales siguen en `href="#"` porque no tengo las cuentas:
WhatsApp, TikTok e Instagram.

---

## 4 · Los dos medios de pago

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
barra fija y la pantalla de medios de pago.
