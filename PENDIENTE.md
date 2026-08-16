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

En cuanto pegues la clave, el aviso naranjo de "disponibilidad de ejemplo"
desaparece solo y el calendario pasa a leer la agenda real.

---

## 2 · Crear las tablas  ·  5 minutos

1. Supabase → proyecto Valle Aventura → **SQL Editor** → *New query*
2. Pega entero el contenido de
   `C:\Users\PC\Projects\plataforma reservas valle aventura\db\schema.sql`
3. *Run*

Crea las 5 tablas, `cotizar()`, `disponible()`, `tinaja_libre()`, las
políticas RLS, los permisos columna por columna y el bucket `comprobantes`.
Deja cargadas las 3 cabañas y la tarifa base de $180.000.

Es el paso 1 del README del panel. El proyecto está vacío, así que no puede
romper nada.

> Lo intenté por el navegador y el editor SQL no llegó a cargar en el contexto
> automatizado.

Ya dejé configurado, en la creación del proyecto:
- **Data API activa** — la web necesita leer con la clave anónima
- **Exposición automática de tablas DESACTIVADA** — lo recomienda Supabase y
  encaja con tu regla: los datos de huésped no salen con la clave anónima
- **RLS automática ACTIVA** — toda tabla nueva nace protegida

---

## 3 · Los datos de contacto  ·  1 minuto

En el pie de `nuevo.html` están marcados en amarillo. Me faltan:

- **Teléfono** (para el `wa.me` y el pie)
- **Dirección exacta**

La razón social ya está: *Sociedad Inmobiliaria Valle Aventura*.

Y tres enlaces sociales siguen en `href="#"` porque no tengo las cuentas:
WhatsApp, TikTok e Instagram, en la cabecera.

---

## 4 · Transbank  ·  cuando lo tengas

Necesito el **código de comercio** y la **API Key Secret** de Webpay Plus.

No entré a buscarlas todavía a propósito: hasta que exista la Edge Function
desplegada no hay dónde ponerlas de forma segura, y **en este repositorio no
pueden entrar nunca** — es público en GitHub, subir ahí una llave de
producción de Transbank es publicarla.

El sitio para ellas son los secretos de la función:

```
supabase secrets set TBK_COMMERCE_CODE=... TBK_API_KEY=... TBK_ENV=produccion
supabase functions deploy webpay --no-verify-jwt
```

(La CLI no está instalada; corre con `npx supabase ...` sin instalar nada.)

Mientras tanto el código funciona contra el ambiente de **integración** de
Transbank con sus credenciales públicas de prueba, que no mueven dinero.

Y quedan dos `TODO` marcados en `supabase/functions/webpay/index.ts`, ambos
dependientes de las tablas del paso 2: anotar la reserva como pendiente
**antes** de ir a Transbank, y confirmarla al volver. Sin el primero, un
cliente que abandona el pago deja la fecha bloqueada; sin el segundo, la
reserva no existe aunque haya pagado.

---

## Estado del sitio

| | |
|---|---|
| Publicado y sirviendo | `index.html` + `movil.html` (sin tocar) |
| A revisar | `nuevo.html` — la fusión responsive |
| Vuelta atrás | `git checkout pre-fusion-2026-08-16` |

`nuevo.html` no reemplaza a nada hasta que tú lo apruebes.
