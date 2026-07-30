---
name: arxiv-physics
version: 1.0.0
author: Z Physics Lab
description: >
  Use this skill whenever the user needs to search arXiv physics papers, look up preprints, find citations,
  explore physics sub-categories (hep-th, hep-ph, cond-mat, astro-ph, gr-qc, quant-ph, etc.), or get
  structured metadata from arXiv entries. Handles paper discovery, metadata extraction, author/abstract/DOI
  retrieval, category browsing, and citation context analysis for all physics research.
metadata:
  tags:
    - arxiv
    - physics
    - preprint
    - research
    - academic search
    - paper discovery
    - hep-th
    - cond-mat
    - quant-ph
    - astro-ph
  triggers:
    - "search arXiv"
    - "find physics paper"
    - "arxiv paper"
    - "physics preprint"
    - "latest hep-th papers"
    - "cond-mat paper"
    - "arxiv search"
    - "physics research"
---

# arXiv Physics Paper Search

> Search, discover, and extract structured metadata from arXiv physics preprints across all sub-disciplines.

## Overview

This skill provides comprehensive access to the arXiv preprint server for physics research. It covers all major
physics categories including High Energy Physics (theory, phenomenology, lattice, experiment), Condensed Matter,
Astrophysics, General Relativity/Quantum Cosmology, Quantum Physics, Nuclear Physics, Mathematical Physics, and
cross-listed areas. The skill supports paper search, metadata extraction, category browsing, author disambiguation,
and citation-aware discovery.

## Supported Categories

| Abbreviation | Full Name |
|---|---|
| `hep-th` | High Energy Physics - Theory |
| `hep-ph` | High Energy Physics - Phenomenology |
| `hep-ex` | High Energy Physics - Experiment |
| `hep-lat` | High Energy Physics - Lattice |
| `cond-mat.*` | Condensed Matter (all sub-fields) |
| `astro-ph.*` | Astrophysics (all sub-fields) |
| `gr-qc` | General Relativity and Quantum Cosmology |
| `quant-ph` | Quantum Physics |
| `nucl-th` | Nuclear Theory |
| `nucl-ex` | Nuclear Experiment |
| `math-ph` | Mathematical Physics |
| `physics.*` | Physics (general, atomic, chemical, plasma, optics, etc.) |
| `nlin.*` | Nonlinear Sciences |
| `cs.AI` | Artificial Intelligence (cross-listed) |
| `q-bio.*` | Quantitative Biology (cross-listed) |

## API Endpoint

arXiv provides a free public API based on the Atom syndication format:

```
Base URL: http://export.arxiv.org/api/query
```

### Query Parameters

| Parameter | Description | Example |
|---|---|---|
| `search_query` | Search expression | `all:electron+spin+liquid`, `au:Witten`, `cat:hep-th` |
| `start` | Result offset (0-indexed) | `0`, `15`, `30` |
| `max_results` | Number of results (max 100 per request) | `10`, `25` |
| `sortBy` | Sort field: `relevance`, `lastUpdatedDate`, `submittedDate` | `submittedDate` |
| `sortOrder` | `descending` or `ascending` | `descending` |
| `id_list` | Comma-separated arXiv IDs | `2301.00001,2301.00002` |

### Search Prefixes

| Prefix | Searches | Example |
|---|---|---|
| `ti:` | Title | `ti:"AdS/CFT correspondence"` |
| `au:` | Author | `au:Maldacena` |
| `abs:` | Abstract | `abs:"topological+insulator"` |
| `cat:` | Category | `cat:cond-mat.str-el` |
| `all:` | All fields | `all:"dark+matter+detection"` |
| `co:` | Comment (approx) | `co:"5+pages"` |
| `rn:` | Report number | `rn:"CERN-TH"` |
| `journal-ref:` | Journal reference | `journal-ref:"Phys.Rev.Lett"` |

## Workflow

### Step 1 — Parse the User's Query

Identify what the user is looking for:

- **Topic search**: "Find papers on topological order" → `all:topological+order`
- **Author search**: "Papers by Juan Maldacena" → `au:Maldacena`
- **Category browse**: "Latest hep-th papers" → `cat:hep-th`
- **Specific paper**: "arXiv 2305.10324" → `id_list=2305.10324`
- **Title search**: "Exact results in N=4 SYM" → `ti:"exact+results"+ti:"N=4+SYM"`
- **Abstract keyword**: "papers mentioning entanglement entropy" → `abs:"entanglement+entropy"`

### Step 2 — Construct the API Request

Use `curl` or a Python script to query the arXiv API:

```bash
# Example: Search for recent topological quantum computing papers
curl -s "http://export.arxiv.org/api/query?search_query=all:topological+quantum+computing&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending"
```

```python
# Python helper for structured queries
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

def search_arxiv(query, start=0, max_results=10, sort_by="submittedDate", sort_order="descending"):
    """Search arXiv and return structured results."""
    params = urllib.parse.urlencode({
        'search_query': query,
        'start': start,
        'max_results': max_results,
        'sortBy': sort_by,
        'sortOrder': sort_order
    })
    url = f"http://export.arxiv.org/api/query?{params}"
    
    with urllib.request.urlopen(url) as response:
        xml_data = response.read().decode('utf-8')
    
    return parse_arxiv_xml(xml_data)

def parse_arxiv_xml(xml_string):
    """Parse arXiv Atom XML response into structured records."""
    ns = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}
    root = ET.fromstring(xml_string)
    
    results = []
    for entry in root.findall('atom:entry', ns):
        paper = {
            'id': entry.find('atom:id', ns).text,
            'arxiv_id': entry.find('arxiv:arxiv_id', ns) is not None 
                       and entry.find('arxiv:arxiv_id', ns).text 
                       or entry.find('atom:id', ns).text.split('/abs/')[-1],
            'title': entry.find('atom:title', ns).text.strip().replace('\n', ' '),
            'summary': entry.find('atom:summary', ns).text.strip().replace('\n', ' '),
            'authors': [a.find('atom:name', ns).text 
                        for a in entry.findall('atom:author', ns)],
            'categories': [c.get('term') 
                         for c in entry.findall('atom:category', ns)],
            'published': entry.find('atom:published', ns).text,
            'updated': entry.find('atom:updated', ns).text,
            'links': {l.get('title', 'link'): l.get('href') 
                     for l in entry.findall('atom:link', ns) 
                     if l.get('href')},
            'doi': next((d.text for d in entry.findall('arxiv:doi', ns)), None),
            'journal_ref': next((j.text for j in entry.findall('arxiv:journal_ref', ns)), None),
            'comment': next((c.text for c in entry.findall('arxiv:comment', ns)), None),
            'primary_category': entry.find('atom:primary_category', ns).get('term'),
        }
        results.append(paper)
    
    return results
```

### Step 3 — Format and Present Results

Present papers in a structured, readable format:

```
📄 [2305.10324] "Emergent Spacetime from Entanglement in SYK-like Models"
   Authors: John Doe, Jane Smith
   Category: hep-th → gr-qc (cross-list)
   Published: 2023-05-16  |  Updated: 2023-05-20
   Abstract: We study the emergence of spacetime geometry from quantum entanglement...
   🔗 PDF: https://arxiv.org/pdf/2305.10324
   🔗 abs: https://arxiv.org/abs/2305.10324
```

## Advanced Patterns

### Multi-Field Boolean Search

arXiv supports AND/OR/ANDNOT operators:

```bash
# Papers on AdS/CFT but NOT about holographic entanglement entropy
curl -s "http://export.arxiv.org/api/query?search_query=all:AdS/CFT+ANDNOT+all:entanglement+entropy&max_results=10"
```

### Category + Keyword Combo

```bash
# Topological papers specifically in condensed matter
curl -s "http://export.arxiv.org/api/query?search_query=cat:cond-mat.*+AND+all:topological+order&max_results=10"
```

### Date-Ranged Queries

```bash
# All hep-th papers from the last 7 days
curl -s "http://export.arxiv.org/api/query?search_query=cat:hep-th+AND+submittedDate:[202607150000 TO 202607220000]&max_results=25"
```

### Author Disambiguation

```bash
# Use quotes for exact author name matching
curl -s "http://export.arxiv.org/api/query?search_query=au:%22Maldacena%20J%22&max_results=5"
```

## Best Practices

1. **Rate limiting**: arXiv requests max 1 request per 3 seconds. Space concurrent requests by at least 3 seconds.
2. **Pagination**: Use `start` and `max_results` to page through large result sets (max 100 per request).
3. **Category scoping**: Always prefer category-scoped searches for physics-specific queries to reduce noise.
4. **Abstract truncation**: Summaries from arXiv can be long. Truncate at ~300 words for display, offer full abstract on request.
5. **Cross-lists**: Papers often appear in multiple categories. The `primary_category` is the original submission category.
6. **Version tracking**: Use the `updated` field to detect revisions. Compare with `published` for new submissions.
7. **Batch lookups**: For multiple known arXiv IDs, use `id_list` instead of separate queries (e.g., `id_list=2301.00001,2301.00002`).

## Mandatory Rules

1. Always use the public arXiv API — never scrape the HTML pages.
2. Include the arXiv ID, title, authors (first 3 + "et al." if more), category, and date in every result.
3. Provide both the abstract URL (`arxiv.org/abs/`) and PDF URL (`arxiv.org/pdf/`) for every paper.
4. When presenting abstracts, clean whitespace and newlines for readability.
5. If a query returns no results, suggest alternative search terms or broader category scope.
6. Respect arXiv terms of service and rate limits.

## Output Format

Always present results in this structured markdown format:

```markdown
## arXiv Results: "{search topic}"

**Query**: `{query_string}` | **Category**: `{category}` | **Results**: `{count}` of `{total}`

---

### 1. [{arxiv_id}] {title}
**Authors**: {author1}, {author2}, {author3} et al.
**Category**: `{primary_category}` | **Published**: `{date}`
**Abstract**: {first 300 chars}...
**Links**: [Abstract](https://arxiv.org/abs/{id}) | [PDF](https://arxiv.org/pdf/{id})

---
```

## Error Handling

- **Empty results**: Broaden search terms, try `all:` instead of `ti:`, expand category scope.
- **Network errors**: Retry once after 5 seconds. If persistent, report the issue.
- **Malformed XML**: Check API response status and handle parsing gracefully.
- **Rate limiting (429)**: Implement exponential backoff starting at 3 seconds.
