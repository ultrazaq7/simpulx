# knowledge service. Context build = root v2/.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/libs

COPY services/knowledge/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY libs/python /app/libs
COPY services/knowledge /app/svc

WORKDIR /app/svc
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
