from fastapi import FastAPI

app = FastAPI(title="OJ API", version="0.1.0")


@app.get("/api/v1/healthz")
async def healthz():
    return {"status": "ok"}
