FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY STRATEGY_CONTEXT.md ./

COPY docker/backend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/data

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
