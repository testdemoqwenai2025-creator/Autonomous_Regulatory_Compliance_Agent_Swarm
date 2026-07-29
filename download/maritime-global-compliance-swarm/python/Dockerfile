# Python tools image
FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ shared/
COPY anonymiser/ anonymiser/
COPY edi_auditor/ edi_auditor/
COPY remediation/ remediation/

ENV PYTHONPATH=/app

# Default: run anonymiser
ENTRYPOINT ["python", "-m", "anonymiser.cli"]
