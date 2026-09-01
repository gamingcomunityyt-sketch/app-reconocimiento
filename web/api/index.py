# -*- coding: utf-8 -*-
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vision.router import router as vision_router

app = FastAPI(title="Memories Vision API", version="10.7-web")
app.include_router(vision_router)

# Si frontend y API viven en el mismo proyecto Vercel, no hace falta CORS.
# Para otro dominio: VISION_ALLOWED_ORIGINS=https://tuweb.com,https://preview.vercel.app
origins = [x.strip() for x in os.getenv("VISION_ALLOWED_ORIGINS", "").split(",") if x.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

@app.get("/api")
def api_root():
    return {"ok": True, "service": "Memories Vision API", "engine": "10.7-web"}
