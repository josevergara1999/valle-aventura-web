# Lo que falta, en orden

Al 17-ago-2026. Nada de esto necesita escribir código: son credenciales que no
debo manejar, datos que no tengo, o decisiones tuyas.

---

## ✅ Ya está hecho

- **El sitio vive en `https://valleaventura-chile.com`**, con HTTPS obligatorio.
  El de Wix sigue existiendo intacto como marcha atrás.
- **Supabase conectado de punta a punta.** Proyecto `wxxlqszadprwizporhbg`,
  organización propia, São Paulo. La web lee la disponibilidad real y el panel
  escribe sobre las mismas tablas.
- **La versión de teléfono es la variante B.**
- **Reserva por WhatsApp** con fechas, personas, total, abono del 50% y saldo ya
  escritos en el mensaje. Cero enlaces muertos en todo el sitio.
- **SEO blindado**: canonical al dominio propio, H1, `robots.txt`, `sitemap.xml`
  y datos estructurados `LodgingBusiness` con dirección, precio y servicios.

### Cómo quedaron los permisos

| Rol | `cabanas` `reglas` `tarifas` | `ocupacion` | `bloqueos` | `pellet` |
|---|---|---|---|---|
| `anon` (la web) | solo lectura | solo lectura | **sin acceso** | sin acceso |
| `authenticated` (el panel) | lectura y escritura | — | lectura y escritura | lectura y escritura |

La web ve la ocupación por la **vista `ocupacion`**, no por `bloqueos`: la tabla
guarda nombre, teléfono y email del huésped. Comprobado desde fuera con la clave
pública que cualquier intento sobre `bloqueos` devuelve **401**.

> **Tres trampas que costaron encontrar y conviene no repetir:**
>
> El proyecto se creó con la **exposición automática de tablas desactivada**. Es
> la postura correcta, pero *nada* tiene permisos salvo lo que el schema escriba.
> Una política RLS no concede nada: filtra filas dentro de lo que el permiso de
> tabla ya permite. El panel entraba bien y se caía con `permission denied`.
>
> `anon` venía del bootstrap de Supabase con **TRUNCATE** sobre tres tablas.
> Vacía una tabla entera y **RLS no lo puede impedir**, porque las políticas
> filtran filas y TRUNCATE no lee filas. Revocado.
>
> `buscar_disponibilidad()` filtraba por `activa` pero no por `arrienda`, así que
> ofrecía la **cabaña Host** —la casa del dueño— como disponible. Y esa función
> también la usa el bot. Corregido en la base y con un segundo filtro en el panel.

---

## 1 · Esperando respuesta de las pasarelas

Las dos **están desplegadas, conectadas a la base y probadas**. Solo falta que
entreguen credenciales.

El circuito es el mismo para ambas y ya está validado: `solicitar_reserva()`
aparta la cabaña **30 minutos** mientras el cliente paga y la suelta sola si el
pago no llega; `confirmar_reserva()` la confirma y es **idempotente**, porque
Mercado Pago reintenta el mismo aviso varias veces. El monto lo calcula
`cotizar()` en Postgres, nunca el navegador.

### Mercado Pago

Cuenta de la sociedad **en verificación desde el 16-ago-2026, hasta 24 h**.
Cuando aprueben:

1. Crear la aplicación en developers: producto **Pagos online**, sin plataforma
   de e-commerce, solución **Checkout Pro**.
2. Copiar el **Access Token** (empezar por el de prueba, `TEST-…`).
3. En **Webhooks**, poner esta URL y marcar el evento *Pagos*:
   `https://wxxlqszadprwizporhbg.supabase.co/functions/v1/mercadopago/webhook`
   Al guardar genera la **clave secreta de firma**.
4. En Supabase, *Edge Functions → Secrets*: `MP_ACCESS_TOKEN`,
   `MP_WEBHOOK_SECRET` y `MP_ENV=prueba`.
5. Descomentar la línea de `mercadopago` en `pagos.js`.

### Webpay

**Ya sois comercio Transbank**: RUT 77.128.553-8, código 597052979500, con
Webpay **Links de pago** funcionando y ventas reales. Lo que falta es otro
producto sobre el mismo comercio: **Webpay Plus REST**, el que cobra dentro de
la propia web.

Pedirlo por *Ayuda → Asesoría online para contratar* del portal privado. Hay que
usar exactamente estas palabras o te mandan a los links de pago que ya tienes:

> código de comercio y **API Key Secret de producción de Webpay Plus REST**

Cuando lleguen: `TBK_COMMERCE_CODE`, `TBK_API_KEY` y `TBK_ENV=produccion` en los
secretos, y descomentar `webpay` en `pagos.js`.

**Preguntar la comisión** al ejecutivo y compararla con la de Mercado Pago antes
de decidir cuál queda de principal: con reservas de $180.000 el porcentaje pesa.

### Mientras tanto no hay nada roto

La web cierra por WhatsApp y **no bloquea ninguna fecha**: José ve la
conversación y carga la reserva a mano en el panel si se concreta. Además la
clave pública no tiene permiso de escritura, así que la página no podría ocupar
una fecha ni por error.

---

## 2 · Rotar la clave secreta · 1 minuto

La `sb_secret_` se pegó en un chat. **Se salta RLS y todos los permisos de
arriba**: con ella se lee el teléfono de cada huésped y se puede borrar la
agenda entera.

*Project Settings → API Keys → **Rotate*** sobre la `sb_secret_`. No hay que
tocar ningún archivo: esa clave no está en el código.

---

## 3 · Decidir el correo de contacto

Hay dos y no sé cuál va en la web:

- `valleaventuraspa@gmail.com` — el que figura en Transbank
- `reservasvalleaventura@gmail.com` — el que me diste

---

## Estado del sitio

| | |
|---|---|
| Publicado y sirviendo | `index.html` (PC) + `movil.html` (teléfono, variante B) |
| Sin usar | `variante-a.html`, `variante-b.html` (origen de `movil.html`) |
| Vuelta atrás del diseño | `git checkout pre-fusion-2026-08-16` |
| Vuelta atrás del dominio | devolver los registros A a Wix |

**Razón social:** Valle Aventura SpA · **Dirección:** Callejón Los Pretiles 211,
Valle Las Trancas, Pinto, Ñuble · **WhatsApp:** +56 9 8239 8527

El panel de reservas vive en el otro proyecto
(`plataforma reservas valle aventura`) y hoy se sirve a mano en el puerto 8300.
Si algún día tiene que estar siempre disponible, hay que alojarlo.

> **Al editar estos HTML, no usar `perl` con acentos.** Escribe los bytes en
> latin-1 sobre ficheros UTF-8 y corrompe el archivo sin avisar. Pasó el
> 16-ago-2026 con el pie del móvil. Usar Python con `encoding='utf-8'`.
