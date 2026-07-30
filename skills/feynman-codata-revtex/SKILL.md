---
name: feynman-codata-revtex
version: 3.0.0
author: Z Physics Lab
description: >
  Composite skill for advanced physics workflows. Combines four capabilities:
  (1) Feynman diagram notation and drawing — standard QFT diagram conventions, propagator labels,
  vertex rules, and ASCII/LaTeX representation;
  (2) CODATA physical constants — latest recommended values for fundamental constants (c, h, G, e,
  k_B, N_A, σ, ε₀, μ₀, etc.) with uncertainties and units;
  (3) RevTeX 4.2 document preparation — APS/APS-style LaTeX templates for physics papers
  (PR/PRL/PRL-style formatting, biblatex, two-column);
  (4) Jupyter notebook physics — interactive computation notebooks with SymPy, SciPy, NumPy,
  matplotlib for physics demonstrations and exploratory analysis.
  Use this skill for: writing physics papers, computing with physical constants, drawing Feynman diagrams,
  preparing APS submissions, or creating interactive physics notebooks.
metadata:
  tags:
    - feynman diagrams
    - CODATA constants
    - RevTeX
    - Jupyter
    - physics paper
    - APS
    - QFT
    - fundamental constants
    - LaTeX
    - computational physics
  triggers:
    - "Feynman diagram"
    - "physical constants"
    - "CODATA"
    - "RevTeX"
    - "physics paper"
    - "APS paper"
    - "Jupyter physics"
    - "fundamental constants"
    - "speed of light"
    - "planck constant"
    - "write physics paper"
---

# Feynman + CODATA + RevTeX + Jupyter Physics Suite

> Advanced physics toolkit combining Feynman diagrams, CODATA constants, RevTeX papers, and Jupyter notebooks.

## Overview

This composite skill integrates four essential capabilities for physics research and publication:

1. **Feynman Diagrams** — Standard QFT diagram notation and LaTeX drawing
2. **CODATA Constants** — Authoritative fundamental physical constants
3. **RevTeX 4.2** — APS journal-style LaTeX document preparation
4. **Jupyter Notebooks** — Interactive computational physics

---

## Part 1: Feynman Diagrams

### Notation Conventions

| Element | Symbol | Description |
|---|---|---|
| Fermion (electron, quark) | Solid straight line → | Arrow indicates charge flow |
| Antifermion | Solid straight line ← | Arrow opposite to momentum |
| Photon / Gluon | Wavy line ~~~ | Massless gauge boson |
| W/Z boson | Dashed wavy line | Massive gauge boson |
| Scalar (Higgs) | Dotted line ··· | Scalar field |
| Ghost | Dashed line - - - | Faddeev-Popov ghost |
| Vertex | Solid dot ● | Interaction point |
| Propagator label | Momentum p with arrow | On internal lines |

### LaTeX Drawing (TikZ-Feynman)

```latex
% Feynman diagram with tikz-feynman package
% Compile with: lualatex or xelatex (required for automatic layout)
\usepackage[compat=1.1.0]{tikz-feynman}

% Basic QED vertex: electron-photon interaction
\feynmandiagram [horizontal=a to b] {
  i1 [particle=\(e^-\)] -- [fermion] a -- [fermion] i2 [particle=\(e^-\)],
  a -- [photon, edge label'=\(\gamma\)] b,
};

% Electron-electron scattering (Møller)
\feynmandiagram [horizontal=a to b] {
  i1 [particle=\(e^-\)] -- [fermion] a -- [fermion] i2 [particle=\(e^-\)],
  a -- [photon, edge label'=\(\gamma\)] b,
  f1 [particle=\(e^-\)] -- [fermion] b -- [fermion] f2 [particle=\(e^-\)],
};

% Quark-gluon vertex (QCD)
\feynmandiagram [horizontal=a to b] {
  i1 [particle=\(q\)] -- [fermion] a -- [fermion] i2 [particle=\(q\)],
  a -- [gluon, edge label'=\(g\)] b,
  f1 [particle=\(q\)] -- [fermion] b -- [fermion] f2 [particle=\(q\)],
};

% Higgs-strahlung at e+e- collider
\feynmandiagram [horizontal=a to b] {
  i1 [particle=\(e^-\)] -- [fermion] a -- [fermion] i2 [particle=\(e^+\)],
  a -- [photon, edge label'=\(\gamma/Z\)] b,
  b -- [scalar, edge label'=\(H\)] f1 [particle=\(H\)],
};
```

### ASCII Representation (for chat/plain text)

```
Electron-positron annihilation (e+e- → μ+μ-):

    e- ───────╮
              ╰─── γ ~~~───╮
    e+ ───────╮            │
              ╰───────────╯
                         ╭─── μ-
                         │
                         ╰─── μ+
```

### Standard Diagram Types

| Diagram | Process | Key Features |
|---|---|---|
| Tree-level s-channel | e⁺e⁻ → μ⁺μ⁻ (QED) | Single photon propagator |
| Tree-level t-channel | e⁻μ⁻ → e⁻μ⁻ (QED) | Photon exchange |
| Box diagram | γγ → γγ (light-by-light) | Four external legs, fermion loop |
| Triangle anomaly | π⁰ → γγ | Fermion triangle loop |
| Self-energy | Photon/electron loop | Renormalization diagram |
| Vertex correction | 3-point loop correction | Wavefunction renormalization |
| Gluon self-interaction | 3-gluon, 4-gluon vertices | QCD-specific |
| Higgs production | gg → H (loop), VH, VBF | Multiple production modes |

---

## Part 2: CODATA Physical Constants (2022/2024)

### Fundamental Constants Table

```python
# CODATA 2022 Recommended Values
# All values stored with uncertainty as (value, uncertainty)
CODATA = {
    # === Universal Constants ===
    'speed_of_light_vacuum': (2.99792458e8, 0.0),           # m/s (exact)
    'planck_constant': (6.62607015e-34, 0.0),               # J·Hz⁻¹ (exact, SI 2019)
    'reduced_planck_constant': (1.054571817e-34, 0.0),       # J·s (exact)
    'gravitational_constant': (6.67430e-11, 1.5e-15),      # m³·kg⁻¹·s⁻²
    'boltzmann_constant': (1.380649e-23, 0.0),              # J/K (exact)
    'avogadro_constant': (6.02214076e23, 0.0),              # mol⁻¹ (exact)
    
    # === Electromagnetic Constants ===
    'elementary_charge': (1.602176634e-19, 0.0),             # C (exact)
    'vacuum_permittivity': (8.8541878128e-12, 1.3e-20),     # F/m
    'vacuum_permeability': (1.25663706212e-6, 1.9e-15),    # N/A²
    'fine_structure_constant': (7.2973525693e-3, 1.1e-12),  # dimensionless
    'magnetic_flux_quantum': (2.067833848e-15, 2.5e-23),   # Wb
    'conductance_quantum': (7.748091729e-5, 2.4e-14),      # S
    'josephson_constant': (4.8359784392e14, 1.2e3),        # Hz/V
    
    # === Mass Constants ===
    'electron_mass': (9.1093837015e-31, 2.8e-40),          # kg
    'proton_mass': (1.67262192369e-27, 5.1e-37),            # kg
    'neutron_mass': (1.67492749804e-27, 9.1e-37),           # kg
    'alpha_particle_mass': (6.6446573357e-27, 2.0e-36),     # kg
    'muon_mass': (1.883531627e-28, 4.2e-38),               # kg
    'tau_mass': (3.16747e-27, 5.7e-33),                    # kg
    'higgs_boson_mass': (125.10, 0.14),                    # GeV/c² (PDG)
    'w_boson_mass': (80.379, 0.012),                        # GeV/c² (PDG)
    'z_boson_mass': (91.1876, 0.0021),                      # GeV/c² (PDG)
    
    # === Length and Energy Constants ===
    'bohr_radius': (5.29177210903e-11, 8.0e-23),           # m
    'rydberg_constant': (10973731.568160, 2.1e-3),          # m⁻¹
    'hartree_energy': (4.3597447222071e-18, 8.5e-32),      # J
    'electron_volt': (1.602176634e-19, 0.0),               # J (exact)
    
    # === Derived Constants ===
    'classical_electron_radius': (2.8179403262e-15, 1.3e-24),  # m
    'thomson_cross_section': (6.6524587321e-29, 6.0e-39),     # m²
    'bohr_magneton': (9.2740100783e-24, 2.8e-33),            # J/T
    'nuclear_magneton': (5.0507837461e-27, 1.5e-36),          # J/T
    'compton_wavelength_electron': (2.42631023867e-12, 7.3e-22),  # m
    
    # === Thermodynamic Constants ===
    'stefan_boltzmann_constant': (5.670374419e-8, 1.9e-13),  # W·m⁻²·K⁻⁴
    'wien_displacement_constant': (2.897771955e-3, 1.7e-9),  # m·K
    'molar_gas_constant': (8.314462618, 1.5e-6),             # J·mol⁻¹·K⁻¹
    'faraday_constant': (96485.33212, 6.0e-2),               # C/mol
    
    # === Cosmological Constants ===
    'hubble_constant': (67.4, 0.5),                          # km·s⁻¹·Mpc⁻¹
    'cosmic_microwave_bg_temp': (2.7255, 6.0e-4),            # K
}

def get_constant(name, units=False):
    """Retrieve a CODATA constant by name."""
    if name in CODATA:
        val, unc = CODATA[name]
        if units:
            return f"{val:.6e} ± {unc:.2e}"
        return val, unc
    raise ValueError(f"Unknown constant: {name}")
```

### Quick Reference Card

| Symbol | Name | Value | Unit |
|---|---|---|---|
| c | Speed of light | 2.998 × 10⁸ | m/s |
| ℏ | Reduced Planck constant | 1.055 × 10⁻³⁴ | J·s |
| G | Gravitational constant | 6.674 × 10⁻¹¹ | m³·kg⁻¹·s⁻² |
| e | Elementary charge | 1.602 × 10⁻¹⁹ | C |
| k_B | Boltzmann constant | 1.381 × 10⁻²³ | J/K |
| N_A | Avogadro constant | 6.022 × 10²³ | mol⁻¹ |
| σ | Stefan-Boltzmann | 5.670 × 10⁻⁸ | W·m⁻²·K⁻⁴ |
| ε₀ | Vacuum permittivity | 8.854 × 10⁻¹² | F/m |
| μ₀ | Vacuum permeability | 1.257 × 10⁻⁶ | N/A² |
| α | Fine structure constant | 1/137.036 | — |
| m_e | Electron mass | 9.109 × 10⁻³¹ | kg |
| m_p | Proton mass | 1.673 × 10⁻²⁷ | kg |
| a₀ | Bohr radius | 5.292 × 10⁻¹¹ | m |
| H₀ | Hubble constant | 67.4 | km·s⁻¹·Mpc⁻¹ |

---

## Part 3: RevTeX 4.2 Document Preparation

### Template for APS Journal Submission

```latex
% RevTeX 4.2 Template — APS Physical Review / Physical Review Letters
% Compile with: pdflatex, bibtex, pdflatex, pdflatex
\documentclass[aps,prl,reprint,superscriptaddress,showpacs]{revtex4-2}

% === Packages ===
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{graphicx}
\usepackage{dcolumn}
\usepackage{bm}           % Bold math
\usepackage{slashed}        % Feynman slash notation
\usepackage{tikz-feynman}  % Feynman diagrams
\usepackage{siunitx}        % SI units
\usepackage{hyperref}
\usepackage{cleveref}

% === Custom Commands ===
\newcommand{\ee}{\mathrm{e}}                    % Euler's e
\newcommand{\ii}{\mathrm{i}}                    % Imaginary unit
\newcommand{\dd}{\mathrm{d}}                    % Differential d
\newcommand{\bra}[1]{\langle #1 |}              % Bra
\newcommand{\ket}[1]{| #1 \rangle}              % Ket
\newcommand{\braket}[2]{\langle #1 | #2 \rangle}  % Bracket
\newcommand{\Tr}{\mathrm{Tr}}                   % Trace
\newcommand{\diag}{\mathrm{diag}}                % Diagonal
\newcommand{\sqr}[1]{\slashed{#1}}               % Feynman slash

% === Metadata ===
\begin{document}

\title{Your Paper Title Here: A Study of Something in Physics}
\author{First Author}
\affiliation{Department of Physics, University Name, City, Country}
\author{Second Author}
\affiliation{Department of Physics, Another University, City, Country}
\date{\today}

\begin{abstract}
Your abstract should be a single paragraph summarizing the motivation, method,
key results, and implications. For PRL, the abstract must be fewer than 500 characters.
\end{abstract}
\pacs{05.30.-d, 11.25.-w, 12.38.-t}  % Physics and Astronomy Classification Scheme
\keywords{keyword1, keyword2, keyword3}

\maketitle

% === Sections ===
\section{Introduction}
\label{sec:introduction}

The introduction should establish the broader context, review relevant prior work,
identify the gap or open question, and state the contribution of this paper.

\section{Formalism}
\label{sec:formalism}

Define your theoretical framework here. Include equations with proper numbering.

The Lagrangian density for our model is given by
\begin{equation}
    \mathcal{L} = -\frac{1}{4}F_{\mu\nu}F^{\mu\nu} 
    + \bar{\psi}(\ii\sqr{D} - m)\psi + \mathcal{L}_{\mathrm{int}},
    \label{eq:lagrangian}
\end{equation}
where $F_{\mu\nu} = \partial_\mu A_\nu - \partial_\nu A_\mu$ is the field strength
tensor and $\sqr{D} = \gamma^\mu D_\mu$ is the slashed covariant derivative.

\section{Methodology}
\label{sec:methodology}

Describe your computational or experimental approach.

\section{Results}
\label{sec:results}

Present your findings with figures and tables.

\begin{figure}[h]
    \centering
    \includegraphics[width=\columnwidth]{figures/result_plot.pdf}
    \caption{Description of the figure.}
    \label{fig:result}
\end{figure}

\begin{table}[h]
    \centering
    \caption{Numerical results for various parameter values.}
    \label{tab:results}
    \begin{tabular}{ccc}
        \hline
        Parameter & Value & Uncertainty \\
        \hline
        $\alpha_s$ & 0.118 & 0.002 \\
        $m_t$ & 172.9 GeV & 0.4 GeV \\
        \hline
    \end{tabular}
\end{table}

\section{Discussion}
\label{sec:discussion}

Interpret the results and compare with prior work.

\section{Conclusions}
\label{sec:conclusions}

Summarize key findings and future directions.

\section*{Acknowledgments}
We thank [names] for useful discussions. This work was supported by [funding agency].

\bibliographystyle{apsrev4-2}
\bibliography{references}

\end{document}
```

### File Structure for Physics Paper

```
paper/
├── main.tex              # Main document
├── references.bib        # BibTeX references
├── figures/
│   ├── fig1_schematic.pdf
│   ├── fig2_results.pdf
│   └── fig3_comparison.pdf
├── tables/
│   └── data_table.tex     % \input'd tables
└── appendix.tex          % Supplementary material
```

### Bibliography Entry Template

```bibtex
@article{Author2023,
  author  = {Last, First and Second, Author},
  title   = {Paper Title},
  journal = {Phys. Rev. Lett.},
  volume  = {131},
  number  = {1},
  pages   = {011601},
  year    = {2023},
  doi     = {10.1103/PhysRevLett.131.011601}
}

@book{Peskin1995,
  author    = {Peskin, Michael E. and Schroeder, Daniel V.},
  title     = {An Introduction to Quantum Field Theory},
  publisher = {Westview Press},
  year      = {1995},
  isbn      = {978-0201503975}
}
```

---

## Part 4: Jupyter Notebooks for Physics

### Notebook Template

```python
# %% [markdown]
# # Physics Computation: [Title]
# **Author**: [Name] | **Date**: [Date] | **Topic**: [Subject]
#
# ## Overview
# [Brief description of what this notebook computes/demonstrates]

# %% [markdown]
# ## 1. Setup and Imports

# %%
import numpy as np
from scipy import integrate, optimize, special
import matplotlib.pyplot as plt
import sympy as sp
sp.init_printing()

# Physics constants
hbar = 1.054571817e-34  # J·s
c = 2.99792458e8        # m/s
k_B = 1.380649e-23      # J/K
e_charge = 1.602176634e-19  # C
m_e = 9.1093837015e-31  # kg

# Natural units (ℏ = c = k_B = 1)
# Convenient for HEP computations

# %% [markdown]
# ## 2. [Section Title]
# [Explanation of what this section computes]

# %%
# Code cell with computation
x = np.linspace(0, 10, 1000)
y = np.exp(-x) * np.cos(2*np.pi*x)

# %% [markdown]
# ## 3. Results and Visualization

# %%
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(x, y, 'b-', linewidth=2)
ax.set_xlabel('x')
ax.set_ylabel('y(x)')
ax.set_title('Plot Title')
ax.grid(True, alpha=0.3)
plt.show()
```

### Common Notebook Types

| Type | Use Case | Key Libraries |
|---|---|---|
| Analytical derivation | Step-by-step symbolic computation | SymPy |
| Numerical simulation | Solving ODEs, PDEs, integrals | SciPy, NumPy |
| Data analysis | Fitting experimental data | NumPy, SciPy, Pandas |
| Visualization | Plotting results, phase diagrams | Matplotlib, Plotly |
| Monte Carlo | Statistical physics, path integrals | NumPy, NumPy.random |
| Group theory | Character tables, Clebsch-Gordan | SymPy, custom |

---

## Mandatory Rules

1. **CODATA**: Always cite the source year (e.g., "CODATA 2022") when using constant values.
2. **Feynman diagrams**: Use TikZ-Feynman for LaTeX output; ASCII for plain text environments.
3. **RevTeX**: Use `revtex4-2` document class with appropriate journal options (`prl`, `prb`, `rmp`).
4. **Jupyter**: Always persist notebooks as `.ipynb` files; include markdown documentation cells.
5. **Units**: Always specify units for physical quantities — never present dimensionless numbers for dimensional quantities.
6. **Uncertainties**: Always propagate uncertainties when using measured constants.
7. **Significant figures**: Report values with appropriate significant figures matching the uncertainty (e.g., 6.67430(15) × 10⁻¹¹).
8. **References**: Use proper BibTeX entries with DOIs for all cited works.
