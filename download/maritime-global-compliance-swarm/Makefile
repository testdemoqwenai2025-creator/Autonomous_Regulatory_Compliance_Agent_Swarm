.PHONY: help install db init gateway anonymise scan audit audit-profiles remediate update-edi report seed-policies mttr test lint docker-up docker-down clean

help: ## Show this help
	@echo 'Maritime Global Compliance Swarm - Available targets:'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''

install: ## Install Python dependencies
	pip install -r python/requirements.txt

db: ## Start PostgreSQL with PostGIS via Docker
	docker run --name maritime-db -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgis/postgis:16-3.4

init: ## Initialise database schema (SQLite dev)
	DB_DRIVER=sqlite PYTHONPATH=python python -c "from shared.database import create_engine_from_config, init_schema; from shared.config import SwarmConfig; c=SwarmConfig(); e=create_engine_from_config(c); init_schema(e); print('Schema created')"

gateway: ## Start the API gateway (Python FastAPI) on port 8000
	PYTHONPATH=python uvicorn gateway.app:create_app --factory --host 0.0.0.0 --port 8000 --reload

gateway-prod: ## Start the gateway without auto-reload
	PYTHONPATH=python uvicorn gateway.app:create_app --factory --host 0.0.0.0 --port 8000

anonymise: ## Run PII Anonymiser (usage: make anonymise FILE=path/to/manifest.json)
	PYTHONPATH=python python -m anonymiser.cli anonymise --manifest $(FILE) --dry-run

scan: ## Scan directory for PII fields
	PYTHONPATH=python python -m anonymiser.cli scan --input-dir $(DIR) --recursive

audit: ## Run EDI Compliance Audit
	PYTHONPATH=python python -m edi_auditor.cli run --all

audit-profiles: ## Audit EDI connection profiles
	PYTHONPATH=python python -m edi_auditor.cli profiles

remediate: ## Generate remediation policies (dry-run by default)
	PYTHONPATH=python python -m remediation.cli generate-policies --mode dry-run

update-edi: ## Update EDI profiles (dry-run by default)
	PYTHONPATH=python python -m remediation.cli update-edi --mode dry-run

report: ## Show remediation status report
	PYTHONPATH=python python -m remediation.cli report

seed-policies: ## Seed default masking policies
	PYTHONPATH=python python -m anonymiser.cli seed-policies

mttr: ## Build and run the Golang MTTR Tracker
	cd golang && go build -o ../bin/mttr-tracker ./cmd/mttr_tracker && ../bin/mttr-tracker

test: ## Run Python tests
	PYTHONPATH=python python -m pytest python/ -v --tb=short

lint: ## Lint Python code
	ruff check python/
	mypy python/

docker-up: ## Build and start gateway + DB + MTTR tracker
	docker compose up --build -d

docker-up-all: ## Start everything including one-shot CLI tools
	docker compose --profile tools up --build

docker-down: ## Stop all services
	docker compose down

clean: ## Remove build artefacts and data
	rm -rf bin/ data/compliance.db __pycache__ python/**/__pycache__
	find . -name '*.pyc' -delete
