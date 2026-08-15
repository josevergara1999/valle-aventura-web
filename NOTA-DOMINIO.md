# El dominio esta a proposito desactivado

`CNAME.pendiente` contiene `valleaventura-chile.com`.

Mientras el dominio siga apuntando a Wix, activar el CNAME aqui haria que el
sitio no se pueda previsualizar (GitHub redirige al dominio, y el dominio va a
Wix). Por eso el sitio vive de momento en:

    https://josevergara1999.github.io/valle-aventura-web/

Para publicar en el dominio real, en este orden:
  1. Revisar y aprobar el sitio en la URL de arriba.
  2. `git mv CNAME.pendiente CNAME` y hacer push.
  3. En el panel de dominios de Wix, apuntar `valleaventura-chile.com` con
     cuatro registros A a 185.199.108.153, 185.199.109.153, 185.199.110.153 y
     185.199.111.153, y un CNAME de `www` a josevergara1999.github.io
  4. Esperar la propagacion (hasta 48 h) y activar "Enforce HTTPS" en GitHub.

Nunca hacer el paso 3 antes del 2: el dominio quedaria apuntando al vacio.
