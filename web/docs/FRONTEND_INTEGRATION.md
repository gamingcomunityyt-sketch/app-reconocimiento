# Integración con la cámara/web

## Regla principal de la retícula

La retícula es **interfaz**, no debe pintarse en los píxeles enviados al motor. La foto se manda limpia y las coordenadas se envían aparte como `x` e `y` normalizadas entre `0` y `1`.

- centro: `{ x: 0.5, y: 0.5 }`
- 25 % desde la izquierda, 70 % desde arriba: `{ x: 0.25, y: 0.70 }`

El motor usa esas coordenadas para decidir cuál de varios MATCH visuales es el **OBJETIVO**. Los demás pueden volver como **SECUNDARIO** y no deben abrir ningún recuerdo.

## Registro

1. La cámara muestra la retícula encima del preview.
2. El usuario coloca el objeto aproximadamente bajo la retícula y captura.
3. Enviar la captura a `POST /api/vision/suggest-crop`.
4. Dibujar la caja propuesta sobre la foto.
5. El usuario puede:
   - aceptar la caja automática, o
   - modificarla con el cropper que ya tenga la web.
6. Enviar foto + caja final a `POST /api/vision/prepare-reference`.
7. El API devuelve una imagen JPEG preparada (base64) de máximo ~1000 px en su lado largo.
8. La web sube ESA imagen preparada a su storage y guarda su URL en la base de datos.

`correct_perspective` debe quedarse en `false` por defecto. Solo activarlo si el usuario decide enderezar un objeto claramente rectangular fotografiado oblicuo.

## Datos mínimos a guardar por referencia

```ts
{
  id: "ref_...",            // ID único, nunca el nombre
  user_id: "...",           // propietario
  memory_id: "...",         // recuerdo a abrir
  name: "Imán Australia",   // editable
  prepared_image_url: "https://..."
}
```

El nombre puede cambiar sin alterar el ID.

## Escaneo

1. Mostrar la cámara con la retícula.
2. Capturar la imagen limpia.
3. Obtener de la base de datos **solo las referencias del usuario actual**.
4. Enviar `image`, `reticle_x`, `reticle_y` y el manifiesto de referencias a `POST /api/vision/scan`.
5. Si `verdict === "MATCH"`, abrir `target.memory_id`.
6. `secondary` se puede mostrar/registrar, pero **no abre recuerdos automáticamente**.
7. Si `verdict === "REPETIR FOTO"`, pedir al usuario que centre/acercque el objeto.
8. Si `verdict === "NO MATCH"`, no abrir nada.

## No mandar todas las fotos originales

El scanner debe comparar con las **referencias preparadas** (recortadas) guardadas en storage, no con las fotos originales de registro. Esto reduce tiempo, memoria y tráfico.

## Tamaño de capturas

Vercel limita el payload de una Function. La cámara debe generar JPEG razonablemente comprimido. No conviene reducir el lado largo por debajo de ~1800–2200 px en escenas con objetos pequeños si el archivo sigue dentro del límite, porque V10.7 usa la foto original para rescates de alta resolución.
