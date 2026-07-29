"""CLI interface for the Logistics EDI SQL Auditor.

Usage:
    python -m edi_auditor.cli run --all
    python -m edi_auditor.cli run --domain encryption
    python -m edi_auditor.cli profiles
    python -m edi_auditor.cli list-queries
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from shared.config import SwarmConfig
from shared.database import create_engine_from_config, get_session_factory, init_schema
from shared.models import AuditFinding, AuditSeverity

from .auditor import EDIAuditor
from .queries import (
    ALL_AUDIT_QUERIES,
    ComplianceDomain,
    get_queries_by_domain,
)

console = Console()
logger = logging.getLogger(__name__)


@click.group()
@click.option("--config-path", "-c", default=None, help="Path to .env file")
@click.option("--log-level", "-l", default="INFO", help="Logging level")
@click.pass_context
def cli(ctx, config_path: Optional[str], log_level: str):
    """Maritime EDI SQL Auditor - FMS compliance audit engine."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    ctx.ensure_object(dict)
    ctx.obj["config"] = SwarmConfig.from_env()


@cli.command()
@click.option("--domain", "-d", default=None, type=click.Choice([d.value for d in ComplianceDomain]))
@click.option("--min-severity", "-s", default="low", help="Minimum severity: critical|high|medium|low|info")
@click.option("--fms-url", default=None, help="Override FMS database connection string")
@click.option("--json-output", "-j", default=None, help="Write findings as JSON to file")
@click.pass_context
def run(ctx, domain: Optional[str], min_severity: str, fms_url: Optional[str], json_output: Optional[str]):
    """Run compliance audit queries against the FMS database.

    Executes all enabled audit queries (or a filtered subset) and persists
    findings to the compliance database. Each finding is assigned a unique
    reference for tracking through the remediation pipeline.
    """
    config: SwarmConfig = ctx.obj["config"]
    auditor = EDIAuditor(config, fms_connection_string=fms_url)

    domain_enum = ComplianceDomain(domain) if domain else None

    console.print("[bold blue]Running EDI Compliance Audit[/bold blue]")
    console.print(f"  Domain filter: {domain or 'All'}")
    console.print(f"  Min severity: {min_severity}")
    console.print(f"  FMS connected: {auditor._has_fms}")
    console.print()

    findings = auditor.run_audit(domain=domain_enum, min_severity=min_severity)

    # Display findings
    if findings:
        table = Table(title="Audit Findings")
        table.add_column("Ref", style="cyan", max_width=24)
        table.add_column("Severity", style="bold")
        table.add_column("Title")
        table.add_column("Rows", justify="right")

        for f in findings:
            if "error" in f:
                table.add_row(f["query_id"], "[red]ERROR[/red]", f["error"], "")
            else:
                sev_style = {
                    "critical": "bold red",
                    "high": "red",
                    "medium": "yellow",
                    "low": "green",
                    "info": "dim",
                }.get(f["severity"], "")
                table.add_row(
                    f["finding_ref"],
                    f"[{sev_style}]{f['severity']}[/{sev_style}]",
                    f["title"],
                    str(f["affected_row_count"]),
                )
        console.print(table)
        console.print(f"\n[bold]{len(findings)} finding(s) recorded.[/bold]")
    else:
        console.print("[green]No findings. All checks passed.[/green]")

    # JSON export
    if json_output and findings:
        with open(json_output, "w", encoding="utf-8") as f:
            json.dump(findings, f, indent=2, default=str)
        console.print(f"Findings exported to {json_output}")

    auditor.close()


@cli.command(name="profiles")
@click.pass_context
def profiles_cmd(ctx):
    """Audit EDI connection profiles for encryption and compliance."""
    config: SwarmConfig = ctx.obj["config"]
    auditor = EDIAuditor(config)

    console.print("[bold blue]EDI Connection Profile Audit[/bold blue]\n")

    profiles = auditor.audit_edi_profiles()
    if not profiles:
        console.print("[yellow]No EDI profiles registered.[/yellow]")
        auditor.close()
        return

    table = Table(title="EDI Connection Profiles")
    table.add_column("Partner", style="cyan")
    table.add_column("Standard")
    table.add_column("Encrypted")
    table.add_column("Protocol")
    table.add_column("Issues", style="red")
    table.add_column("Compliant")

    compliant_count = 0
    for p in profiles:
        enc_icon = "[green]Yes[/green]" if p["encryption_enabled"] else "[red]No[/red]"
        comp_icon = "[green]Pass[/green]" if p["compliant"] else "[red]Fail[/red]"
        if p["compliant"]:
            compliant_count += 1
        table.add_row(
            p["partner_name"],
            p["edi_standard"] or "-",
            enc_icon,
            p["encryption_protocol"] or "-",
            "; ".join(p["issues"]) or "[dim]None[/dim]",
            comp_icon,
        )

    console.print(table)
    console.print(
        f"\n[bold]{compliant_count}/{len(profiles)} profiles compliant[/bold]"
    )
    auditor.close()


@cli.command(name="list-queries")
@click.option("--domain", "-d", default=None, type=click.Choice([d.value for d in ComplianceDomain]))
def list_queries_cmd(domain: Optional[str]):
    """List all available audit queries."""
    queries = get_queries_by_domain(ComplianceDomain(domain)) if domain else ALL_AUDIT_QUERIES

    table = Table(title="Audit Query Registry")
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Domain")
    table.add_column("Severity", style="bold")
    table.add_column("Tables")
    table.add_column("Description", style="dim", max_width=40)

    for q in queries:
 table.add_row(
            q.query_id,
            q.name,
            q.domain.value,
            q.severity,
            ", ".join(q.affected_tables) or "-",
            q.description[:80] + "..." if len(q.description) > 80 else q.description,
        )

    console.print(table)
    console.print(f"\n[bold]{len(queries)} queries registered[/bold]")


def main():
    cli()


if __name__ == "__main__":
    main()
