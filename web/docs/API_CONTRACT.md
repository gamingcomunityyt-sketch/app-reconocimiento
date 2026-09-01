# Contrato del Vision API

## GET `/api/vision/health`

Comprueba despliegue, OpenCV y disponibilidad de SIFT.

## POST `/api/vision/suggest-crop`

`multipart/form-data`

- `image`: foto de registro
- `intent_x`: 0..1, default 0.5
- `intent_y`: 0..1, default 0.5

Respuesta:

```json
{
  "box": {"x1":0.2,"y1":0.1,"x2":0.8,"y2":0.9},
  "note":"recorte automatico V10.7 (...)"
}
```

La caja está normalizada; sirve independientemente de la resolución de preview.

## POST `/api/vision/prepare-reference`

`multipart/form-data`

- `image`: foto original de registro
- `crop_json`: JSON opcional con `x1,y1,x2,y2` normalizados. Si falta, usa recorte automático.
- `intent_x`, `intent_y`: usados si el recorte es automático
- `correct_perspective`: default `false`
- `jpeg_quality`: 70..95, default 90

Respuesta incluye `prepared_image_base64`. La web debe convertirlo en Blob, subirlo a su storage y guardar la URL.

## POST `/api/vision/scan`

`multipart/form-data`

- `image`: captura del escaneo
- `reticle_x`: 0..1
- `reticle_y`: 0..1
- `references_json`: array JSON

Ejemplo:

```json
[
  {
    "id":"ref_a1",
    "name":"Australia roja",
    "memory_id":"memory_123",
    "image_url":"https://storage.../ref_a1.jpg"
  },
  {
    "id":"ref_b2",
    "name":"Paris",
    "memory_id":"memory_456",
    "image_url":"https://storage.../ref_b2.jpg"
  }
]
```

También existe `image_base64` para pruebas pequeñas, pero **no se recomienda** con muchas referencias por límite de payload.

Respuesta resumida:

```json
{
  "verdict":"MATCH",
  "target":{
    "reference_id":"ref_a1",
    "memory_id":"memory_123",
    "name":"Australia roja",
    "role":"OBJETIVO",
    "verdict":"MATCH",
    "evidence":81.4,
    "reticle_affinity":98.0
  },
  "secondary":[...],
  "ranking":[...],
  "total_ms":923.4,
  "sift_used":false
}
```

### Semántica

- `target`: único objeto que la web debe abrir.
- `secondary`: objetos visualmente reconocidos pero no apuntados; no abrir.
- `REPETIR FOTO`: no abrir nada.
- `NO MATCH`: no abrir nada.
