.PHONY: help install db init anonymise audit remediate mttr test lint docker-up docker-down clean

help: ## Show this help
	@echo 'Maritime Global Compliance Swarm - Available targets:'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ''

install: ## Install Python dependencies
	pip install -r python/requirements.txt

db: ## Start PostgreSQL with PostGIS via Docker
	docker run --name maritime-db -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgis/postgis:16-3.4

init: ## Initialise database schema (SQLite dev)
	DB_DRIVER=sqlite python -c "from python.shared.database import create_engine_from_config, init_schema; from python.shared.config import SwarmConfig; c=SwarmConfig(); e=create_engine_from_config(c); init_schema(e); print('Schema created')"

anonymise: ## Run PII Anonymiser (usage: make anonymise FILE=path/to/manifest.json)
	python -m python.anonymiser.cli anonymise --manifest $(FILE) --dry-run

scan: ## Scan directory for PII fields
	python -m python.anonymiser.cli scan --input-dir $(DIR) --recursive

audit: ## Run EDI Compliance Audit
	python -m python.edi_auditor.cli run --all

audit-profiles: ## Audit EDI connection profiles
	python -m python.edi_auditor.cli profiles

remediate: ## Generate remediation policies (dry-run by default)
	python -m python.remediation.cli generate-policies --mode dry-run

update-edi: ## Update EDI profiles (dry-run by default)
	python -m python.remediation.cli update-edi --mode dry-run

report: ## Show remediation status report
	python -m python.remediation.cli report

seed-policies: ## Seed default masking policies
	python -m python.anonymiser.cli seed-policies

mttr: ## Build and run the Golang MTTR Tracker
	cd golang && go build -o ../bin/mttr-tracker ./cmd/mttr_tracker && ../bin/mttr-tracker

test: ## Run Python tests
	python -m pytest python/ -v --tb=short

lint: ## Lint Python code
	ruff check python/
	mypy python/

docker-up: ## Build and start all services
	docker compose up --build -d
docker-compose -f docker-compose.yml --profile tools up --build

docker-down: ## Stop all services
	docker compose down

clean: ## Remove build artefacts and data
	rm -rf bin/ data/compliance.db __pycache__ python/**/__pycache__
	find . -name '*.pyc' -delete
