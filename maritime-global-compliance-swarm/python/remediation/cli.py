"""CLI interface for the Remediation Route Generator.

Usage:
    python -m remediation.cli generate-policies --all
    python -m remediation.cli generate-policies --finding AUD-ENC-001-abc123
    python -m remediation.cli update-edi --mode dry-run
    python -m remediation.cli report
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
from shared.models import AuditFinding, AuditSeverity, AuditStatus, MaskingPolicy

from .edi_updater import EDIProfileUpdater
from .policy_gen import PolicyGenerator

console = Console()
logger = logging.getLogger(__name__)


@click.group()
@click.option("--config-path", "-c", default=None, help="Path to .env file")
@click.option("--log-level", "-l", default="INFO", help="Logging level")
@click.pass_context
def cli(ctx, config_path: Optional[str], log_level: str):
    """Maritime Remediation Route Generator - Auto-generate masking policies & EDI fixes."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    ctx.ensure_object(dict)
    ctx.obj["config"] = SwarmConfig.from_env()


@cli.command(name="generate-policies")
@click.option("--all", "run_all", is_flag=True, default=True, help="Process all open findings")
@click.option("--finding", "-f", multiple=True, help="Specific finding ref to remediate")
@click.option("--mode", "-m", default=None, type=click.Choice(["dry-run", "staged", "apply"]))
@click.option("--json-output", "-j", default=None, help="Write policies as JSON")
@click.pass_context
def generate_policies(ctx, run_all: bool, finding: tuple, mode: Optional[str], json_output: Optional[str]):
    """Generate data masking policies from open audit findings.

    Analyses each open finding, applies the remediation decision matrix,
    and creates MaskingPolicy records. By default runs in dry-run mode
    to preview changes before applying.
    """
    config: SwarmConfig = ctx.obj["config"]
    generator = PolicyGenerator(config)

    finding_refs = list(finding) if finding else None
    effective_mode = mode or config.remediation.edi_profile_update_mode

    console.print("[bold blue]Generating Remediation Policies[/bold blue]")
    console.print(f"  Mode: {effective_mode}")
    console.print(f"  Findings: {'all open' if not finding_refs else ', '.join(finding_refs)}")
    console.print()

    policies = generator.generate_policies(finding_refs=finding_refs, mode=effective_mode)

    if policies:
        table = Table(title="Generated Policies")
        table.add_column("Policy Name", style="cyan", max_width=40)
        table.add_column("Action")
        table.add_column("GDPR Article")
        table.add_column("Status")

        for p in policies:
 status_style = "green" if p["status"] in ("created_enabled", "created_staged") else "dim"
            table.add_row(
                p["name"],
                p.get("action", "-"),
                p.get("gdpr_article", "-"),
                f"[{status_style}]{p['status']}[/{status_style}]",
            )
        console.print(table)
        console.print(f"\n[bold]{len(policies)} polic(ies) generated.[/bold]")
    else:
        console.print("[yellow]No open findings requiring policy generation.[/yellow]")

    if json_output and policies:
        with open(json_output, "w", encoding="utf-8") as f:
            json.dump(policies, f, indent=2, default=str)
        console.print(f"Policies exported to {json_output}")

    generator.close()


@cli.command(name="update-edi")
@click.option("--mode", "-m", default=None, type=click.Choice(["dry-run", "staged", "apply"]))
@click.pass_context
def update_edi(ctx, mode: Optional[str]):
    """Update EDI connection profiles to fix encryption and certificate issues.

    Finds profiles flagged by the auditor and applies the necessary
    security configuration changes (enable TLS, update protocol version).
    """
    config: SwarmConfig = ctx.obj["config"]
    updater = EDIProfileUpdater(config)
    effective_mode = mode or config.remediation.edi_profile_update_mode

    console.print("[bold blue]Updating EDI Connection Profiles[/bold blue]")
    console.print(f"  Mode: {effective_mode}")
    console.print()

    results = updater.update_profiles(mode=effective_mode)

    if results:
        table = Table(title="EDI Profile Updates")
        table.add_column("Partner", style="cyan")
        table.add_column("Action")
        table.add_column("Changes")

        for r in results:
            changes = r.get("changes", {})
            if changes:
                change_desc = "\n".join(
                    f"  {k}: {v['from']} -> {v['to']}" for k, v in changes.items()
                )
            else:
                change_desc = "[dim]None[/dim]"
            table.add_row(
                r.get("partner_name", r["partner_id"]),
                r["action"],
                change_desc,
            )
        console.print(table)
        console.print(f"\n[bold]{len(results)} profile(s) processed.[/bold]")
    else:
        console.print("[green]No EDI profile updates needed.[/green]")

    updater.close()


@cli.command()
@click.pass_context
def report(ctx):
    """Show a summary of the current remediation status."""
    config: SwarmConfig = ctx.obj["config"]
    engine = create_engine_from_config(config)
    init_schema(engine)
    session_factory = get_session_factory(engine)

    with session_factory() as session:
        # Findings by status
        total = session.query(AuditFinding).count()
        open_count = session.query(AuditFinding).filter(AuditFinding.status == AuditStatus.OPEN).count()
        in_progress = session.query(AuditFinding).filter(AuditFinding.status == AuditStatus.IN_PROGRESS).count()
        remediated = session.query(AuditFinding).filter(AuditFinding.status == AuditStatus.REMEDIATED).count()

        # Policies by action
        policies = session.query(MaskingPolicy).all()
        enabled_policies = [p for p in policies if p.enabled]

        # Severity breakdown for open findings
        open_critical = session.query(AuditFinding).filter(
            AuditFinding.status == AuditStatus.OPEN,
            AuditFinding.severity == AuditSeverity.CRITICAL,
        ).count()
        open_high = session.query(AuditFinding).filter(
            AuditFinding.status == AuditStatus.OPEN,
            AuditFinding.severity == AuditSeverity.HIGH,
        ).count()

    table = Table(title="Remediation Status Report")
    table.add_column("Metric", style="bold")
    table.add_column("Value", style="cyan")
    table.add_row("Total Findings", str(total))
    table.add_row("Open", f"[red]{open_count}[/red]  (critical: {open_critical}, high: {open_high})")
    table.add_row("In Progress", str(in_progress))
    table.add_row("Remediated", f"[green]{remediated}[/green]")
    table.add_row("", "")
    table.add_row("Masking Policies (total)", str(len(policies)))
    table.add_row("Masking Policies (enabled)", f"[green]{len(enabled_policies)}[/green]")
    console.print(table)

    engine.dispose()


def main():
    cli()


if __name__ == "__main__":
    main()
