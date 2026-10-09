FROM python:3.11-slim

WORKDIR /app

# Install system utilities & libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy ML models and application code
COPY ml /app/ml
COPY backend /app/backend

WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV DATABASE_URL="sqlite:///./ignite_shield.db"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
