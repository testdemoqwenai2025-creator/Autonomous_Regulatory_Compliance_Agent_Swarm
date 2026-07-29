"""Render the Maritime Compliance Swarm workflow diagram as PNG.
Uses Playwright + CSS (Layout C: Phased Vertical).
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --text: #1F2937;
    --text-sub: #4B5563;
    --text-muted: #94A3B8;
    --bg: #FFFFFF;
    --surface: #F9FAFB;
    --border: #E5E7EB;
    --connector: #94A3B8;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  #root { width: 720px; margin: 0 auto; padding: 48px 40px 32px; }
  .diagram-title { font-size: 20px; font-weight: 700; color: #1E3A5F; text-align: center; margin-bottom: 8px; }
  .diagram-subtitle { font-size: 13px; color: var(--text-muted); text-align: center; margin-bottom: 40px; }
  .phase-group { background: #F8FAFC; border-radius: 12px; padding: 20px 24px 16px; border: 1px solid #E2E8F0; }
  .phase-title { font-size: 15px; font-weight: 700; padding: 10px 16px; border-radius: 8px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
  .phase-steps { display: flex; flex-direction: column; gap: 6px; padding-left: 8px; }
  .phase-step { font-size: 13px; font-weight: 400; color: var(--text); padding: 8px 14px; background: white; border-radius: 6px; border: 1px solid var(--border); line-height: 1.5; }
  .step-num { display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; font-size: 11px; font-weight: 600; margin-right: 8px; }
  .tool-tag { float: right; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #EFF6FF; color: #3B82F6; margin-left: 8px; }
  .phase-arrow { text-align: center; color: var(--connector); font-size: 20px; margin: 10px 0; line-height: 1; }
  .phase-arrow-label { font-size: 10px; color: var(--text-muted); display: block; margin-top: -2px; }
  .phase-1 .phase-title { background: #F0F4F8; color: #334155; border-left: 4px solid #64748B; }
  .phase-1 .step-num { background: #E2E8F0; color: #475569; }
  .phase-2 .phase-title { background: #E8EDF2; color: #1E3A5F; border-left: 4px solid #5B7A99; }
  .phase-2 .step-num { background: #DBEAFE; color: #1E3A5F; }
  .phase-3 .phase-title { background: #E0E7EF; color: #1E3050; border-left: 4px solid #4A6B8A; }
  .phase-3 .step-num { background: #D0D9E4; color: #1E3050; }
  .phase-4 .phase-title { background: #D8E0EA; color: #172540; border-left: 4px solid #3A5C7A; }
  .phase-4 .step-num { background: #C7D2E0; color: #172540; }
  .phase-5 .phase-title { background: #D2DAE5; color: #192A3E; border-left: 4px solid #2B5473; }
  .phase-5 .step-num { background: #BFC9D8; color: #192A3E; }
  .phase-6 .phase-title { background: #CAD3E0; color: #152238; border-left: 4px solid #1E3A5F; }
  .phase-6 .step-num { background: #B7C2D2; color: #152238; }
  .flow-legend { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-top: 32px; padding: 14px 20px; background: #F9FAFB; border-radius: 8px; border: 1px solid #E5E7EB; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-sub); }
  .legend-dot { width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid; }
</style>
</head>
<body>
<div id="root">
  <div class="diagram-title">Maritime Data Governance &amp; Privacy Swarm</div>
  <div class="diagram-subtitle">Operational Workflow - 4 Tools, 6 Phases</div>
  <div class="phase-group phase-1">
    <div class="phase-title">1. Ingestion</div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">1</span>FMS / EDI data streams feed raw shipping manifests into the intake queue</div>
      <div class="phase-step"><span class="step-num">2</span>Manifests parsed into structured fields (consignee, shipper, goods, route)</div>
    </div>
  </div>
  <div class="phase-arrow">\u2193 <span class="phase-arrow-label">raw data</span></div>
  <div class="phase-group phase-2">
    <div class="phase-title">2. Detection &amp; Classification <span class="tool-tag">Anonymiser Rules</span></div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">3</span>Rule Engine scans field names + values against PII patterns (GDPR, CCPA, LGPD)</div>
      <div class="phase-step"><span class="step-num">4</span>Fields classified: consignee_identity, contact_info, government_id, financial_id</div>
      <div class="phase-step"><span class="step-num">5</span>Non-PII fields routed directly to the EDI SQL Auditor</div>
    </div>
  </div>
  <div class="phase-arrow">\u2193 <span class="phase-arrow-label">flagged fields</span></div>
  <div class="phase-group phase-3">
    <div class="phase-title">3. Cryptographic Tokenisation <span class="tool-tag">Manifest_PII_Anonymiser</span></div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">6</span>HMAC-SHA256 vault generates deterministic tokens (consistent per input, non-reversible)</div>
      <div class="phase-step"><span class="step-num">7</span>Specialised handlers: date generalisation, email domain preservation, Fernet encryption for DPA fields</div>
      <div class="phase-step"><span class="step-num">8</span>Anonymisation records persisted to compliance DB (original hash, token, timestamp)</div>
    </div>
  </div>
  <div class="phase-arrow">\u2193 <span class="phase-arrow-label">anonymised data</span></div>
  <div class="phase-group phase-4">
    <div class="phase-title">4. EDI Compliance Audit <span class="tool-tag">Logistics_EDI_SQL_Auditor</span></div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">9</span>11 parametric SQL queries run against FMS (encryption, customs, EDI format, retention, access)</div>
      <div class="phase-step"><span class="step-num">10</span>Each violation becomes an AuditFinding with severity, risk category, and evidence samples</div>
      <div class="phase-step"><span class="step-num">11</span>EDI connection profiles audited for TLS version, certificate expiry, customs doc requirements</div>
    </div>
  </div>
  <div class="phase-arrow">\u2193 <span class="phase-arrow-label">open findings</span></div>
  <div class="phase-group phase-5">
    <div class="phase-title">5. Automated Remediation <span class="tool-tag">Remediation_Route_Generator</span></div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">12</span>Decision matrix maps each risk category to remediation action (tokenise, encrypt, enforce TLS)</div>
      <div class="phase-step"><span class="step-num">13</span>Masking policies generated and staged (dry-run) or applied (auto-apply) based on config</div>
      <div class="phase-step"><span class="step-num">14</span>EDI connection profiles updated: encryption enabled, protocol upgraded to TLS 1.3</div>
    </div>
  </div>
  <div class="phase-arrow">\u2193 <span class="phase-arrow-label">remediation events</span></div>
  <div class="phase-group phase-6">
    <div class="phase-title">6. MTTR Telemetry <span class="tool-tag">Telemetry_MTTR_Tracker (Go)</span></div>
    <div class="phase-steps">
      <div class="phase-step"><span class="step-num">15</span>Golang service ingests phase-transition events via HTTP API with buffered batch writes</div>
      <div class="phase-step"><span class="step-num">16</span>MTTR metrics computed: avg, median, P95 resolution time by risk category</div>
      <div class="phase-step"><span class="step-num">17</span>Compliance reports generated with KPIs: open/closed findings, MTTR trends</div>
    </div>
  </div>
  <div class="flow-legend">
    <div class="legend-item"><div class="legend-dot" style="border-color:#5B7A99;background:#E8EDF2;"></div>Python Tools (3)</div>
    <div class="legend-item"><div class="legend-dot" style="border-color:#1E3A5F;background:#CAD3E0;"></div>Golang Service (1)</div>
    <div class="legend-item"><div class="legend-dot" style="border-color:#64748B;background:#F8FAFC;"></div>Shared Database</div>
    <div class="legend-item"><div class="legend-dot" style="border-color:#3B82F6;background:#EFF6FF;"></div>Tool Tags</div>
  </div>
</div>
</body>
</html>'''

OUTPUT = '/home/z/my-project/maritime-global-compliance-swarm/docs/workflow_diagram.png'

async def main():
    html_path = Path('/home/z/my-project/scripts/_workflow_diagram.html')
    html_path.write_text(HTML, encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 800, 'height': 1600}, device_scale_factor=2)
        await page.goto(f'file://{html_path}', wait_until='networkidle')
        await page.wait_for_timeout(500)
        size = await page.evaluate('''() => {
            const el = document.getElementById('root');
            const rect = el.getBoundingClientRect();
            return { w: Math.ceil(rect.width + 80), h: Math.ceil(rect.height + 80) };
        }''')
        await page.set_viewport_size({'width': size['w'], 'height': size['h']})
        await page.wait_for_timeout(200)
        el = page.locator('#root')
        await el.screenshot(path=OUTPUT)
        await browser.close()
    print(f'Diagram saved to {OUTPUT}')

if __name__ == '__main__':
    asyncio.run(main())
