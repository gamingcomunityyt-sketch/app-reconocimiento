# Modelo mínimo de datos

El motor no impone una base de datos. La web existente debe persistir al menos:

| Campo | Función |
|---|---|
| `id` | ID interno único de la referencia. No reutilizar el nombre. |
| `user_id` | Propietario. Imprescindible para privacidad. |
| `memory_id` | Recuerdo que se abrirá si esta referencia es OBJETIVO. |
| `name` | Nombre visible/editable (`Imagen 1`, `Japón`, etc.). |
| `prepared_image_url` | URL de la imagen ya recortada/preparada. |
| `created_at` | Auditoría/orden. |

## Privacidad

Antes de llamar al scanner, la web debe consultar únicamente las referencias a las que el usuario autenticado tiene acceso. El motor no debe recibir referencias de otros usuarios para "filtrarlas después".

## Nombres automáticos

El nombre no es la identidad. Se puede implementar `Imagen 1`, `Imagen 2`... tomando el menor número libre dentro del usuario. Renombrar `Imagen 2` a `Japón` puede volver a liberar `Imagen 2` para el siguiente registro. El `id` nunca cambia.
