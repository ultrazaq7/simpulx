# ai-agent service. Context build = root v2/.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/libs

# libgomp1: OpenMP runtime used by the catboost wheel (lead_score.py).
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/ai-agent/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY libs/python /app/libs
COPY services/ai-agent /app/svc

WORKDIR /app/svc
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
