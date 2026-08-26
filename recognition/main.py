"""Servicio FastAPI de reconocimiento. Arrancar con:



    uvicorn main:app --host 127.0.0.1 --port 8000

"""



from __future__ import annotations



import base64

import os

import time



from fastapi import FastAPI, Header, HTTPException

from pydantic import BaseModel, Field



from vision import match_scan_against_references



app = FastAPI(title="Recognition service", version="1.1.0")



DEFAULT_ALGORITHM = "ORB"

DEFAULT_MAX_FEATURES = 3500

DEFAULT_RATIO = 0.68

DEFAULT_RANSAC = 4.5

DEFAULT_MIN_INLIERS_MATCH = 45

DEFAULT_MIN_INLIERS_AMBIGUOUS = 18

DEFAULT_MIN_INLIER_RATIO_MATCH = 0.52

DEFAULT_MIN_COLOR_SIMILARITY = 0.70

DEFAULT_MIN_ART_SIMILARITY = 0.68

DEFAULT_MIN_APPEARANCE = 0.42

DEFAULT_MIN_SPREAD = 0.45

DEFAULT_MIN_SCORE_MATCH = 62.0

DEFAULT_SCORE_MARGIN = 10.0





class ReferenceCandidate(BaseModel):

    id: str

    image_base64: str





class MatchOptions(BaseModel):

    algorithm: str = DEFAULT_ALGORITHM

    max_features: int = DEFAULT_MAX_FEATURES

    ratio_threshold: float = DEFAULT_RATIO

    ransac_threshold: float = DEFAULT_RANSAC

    min_inliers_match: int = DEFAULT_MIN_INLIERS_MATCH

    min_inliers_ambiguous: int = DEFAULT_MIN_INLIERS_AMBIGUOUS

    min_inlier_ratio_match: float = DEFAULT_MIN_INLIER_RATIO_MATCH

    min_color_similarity_match: float = DEFAULT_MIN_COLOR_SIMILARITY

    min_art_similarity_match: float = DEFAULT_MIN_ART_SIMILARITY

    min_appearance_match: float = DEFAULT_MIN_APPEARANCE

    min_spread_match: float = DEFAULT_MIN_SPREAD

    min_score_match: float = DEFAULT_MIN_SCORE_MATCH

    score_margin: float = DEFAULT_SCORE_MARGIN





class MatchRequest(BaseModel):

    scan_image_base64: str

    candidates: list[ReferenceCandidate] = Field(default_factory=list)

    options: MatchOptions = Field(default_factory=MatchOptions)





class CandidateRanking(BaseModel):

    candidate_id: str

    verdict: str

    score: float

    inliers: int

    inlier_ratio: float

    good_matches: int

    keypoints_ref: int

    keypoints_test: int

    plausible: bool

    color_similarity: float

    art_similarity: float = 0.0

    appearance: float = 0.0

    spread: float = 0.0

    message: str





class MatchResponse(BaseModel):

    rankings: list[CandidateRanking]

    scan_keypoints: int

    latency_ms: int





def require_token(authorization: str | None) -> None:

    expected = os.environ.get("RECOGNITION_SERVICE_TOKEN", "").strip()

    if not expected:

        raise HTTPException(status_code=503, detail="service_token_not_configured")

    if not authorization or not authorization.startswith("Bearer "):

        raise HTTPException(status_code=401, detail="missing_token")

    token = authorization.removeprefix("Bearer ").strip()

    if token != expected:

        raise HTTPException(status_code=401, detail="invalid_token")





def decode_base64_image(value: str) -> bytes:

    payload = value.split(",", 1)[-1]

    return base64.b64decode(payload)





@app.get("/health")

def health() -> dict[str, str]:

    return {"status": "ok"}





@app.post("/match", response_model=MatchResponse)

def match(payload: MatchRequest, authorization: str | None = Header(default=None)) -> MatchResponse:

    require_token(authorization)

    started = time.perf_counter()



    if not payload.candidates:

        return MatchResponse(rankings=[], scan_keypoints=0, latency_ms=0)



    try:

        scan_bytes = decode_base64_image(payload.scan_image_base64)

    except Exception as exc:

        raise HTTPException(status_code=400, detail="invalid_scan_image") from exc



    references: list[tuple[str, bytes]] = []

    for candidate in payload.candidates:

        try:

            references.append((candidate.id, decode_base64_image(candidate.image_base64)))

        except Exception:

            continue



    if not references:

        raise HTTPException(status_code=400, detail="no_valid_references")



    options = payload.options

    try:

        results, scan_keypoints = match_scan_against_references(

            scan_bytes,

            references,

            algorithm=options.algorithm,

            max_features=options.max_features,

            ratio_threshold=options.ratio_threshold,

            ransac_threshold=options.ransac_threshold,

            min_inliers_match=options.min_inliers_match,

            min_inliers_ambiguous=options.min_inliers_ambiguous,

            min_inlier_ratio_match=options.min_inlier_ratio_match,

            min_color_similarity_match=options.min_color_similarity_match,

            min_art_similarity_match=options.min_art_similarity_match,

            min_appearance_match=options.min_appearance_match,

            min_spread_match=options.min_spread_match,

            min_score_match=options.min_score_match,

            score_margin=options.score_margin,

        )

    except ValueError as error:

        raise HTTPException(status_code=422, detail=str(error)) from error



    rankings = [

        CandidateRanking(

            candidate_id=item.label,

            verdict=item.verdict,

            score=item.score,

            inliers=item.inliers,

            inlier_ratio=item.inlier_ratio,

            good_matches=item.good_matches,

            keypoints_ref=item.keypoints_ref,

            keypoints_test=item.keypoints_test,

            plausible=item.plausible,

            color_similarity=item.color_similarity,

            art_similarity=item.art_similarity,

            appearance=item.appearance,

            spread=item.spread,

            message=item.message,

        )

        for item in results

    ]



    latency_ms = int((time.perf_counter() - started) * 1000)

    return MatchResponse(

        rankings=rankings,

        scan_keypoints=scan_keypoints,

        latency_ms=latency_ms,

    )


