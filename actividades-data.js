/* Las actividades del valle, para la sección de carpetas del sitio.
 *
 * PENDIENTE: los textos y las fotos los tiene que dar José. El diseño de
 * Claude Design carga este archivo, pero no vino en el export.
 *
 * Se deja definido y vacío A PROPÓSITO: `actVals()` ya cae a este mismo
 * valor si no existe, así que el sitio funciona igual — pero sin el archivo
 * la consola escupe un 404 en cada visita, y un 404 permanente es ruido que
 * acaba tapando el error del día que sí importe.
 *
 * Formato esperado, por lo que hace `actVals()`:
 *   window.VA_ACTS = {
 *     recinto:  [{ nombre, texto, img }, ...],   // dentro del complejo
 *     exterior: [{ nombre, texto, img }, ...]    // en el valle
 *   };
 * Como mucho cinco de cada: la pestaña de cada carpeta está colocada a mano
 * en 3%, 15%, 27%, 38% y 48%.
 */
window.VA_ACTS = { recinto: [], exterior: [] };
