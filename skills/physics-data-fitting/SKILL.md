---
name: physics-data-fitting
version: 2.0.0
author: Z Physics Lab
description: >
  Use this skill whenever the user needs to fit physics experimental data to models, perform curve fitting,
  error analysis, goodness-of-fit evaluation, residual analysis, or statistical modeling of physical data.
  Covers linear/non-linear least squares, maximum likelihood, Bayesian inference, chi-squared fitting,
  uncertainty quantification, Monte Carlo error propagation, and model comparison (AIC/BIC).
  Handles common physics fitting tasks: exponential decay, Gaussian peaks, power laws, Breit-Wigner,
  Planck distribution, Boltzmann statistics, and custom physics models.
metadata:
  tags:
    - curve fitting
    - data fitting
    - least squares
    - chi-squared
    - uncertainty
    - physics experiment
    - statistical analysis
    - Bayesian
    - maximum likelihood
    - error analysis
  triggers:
    - "fit data"
    - "curve fitting"
    - "chi-squared fit"
    - "fit to model"
    - "error analysis"
    - "data analysis physics"
    - "least squares"
    - "fit exponential"
    - "fit Gaussian"
    - "uncertainty quantification"
---

# Physics Data Fitting

> Professional curve fitting and statistical analysis for physics experimental data.

## Overview

This skill provides a complete data fitting toolkit for physics experiments. It covers the full pipeline
from data ingestion through model specification, parameter estimation, uncertainty quantification, and
goodness-of-fit evaluation. All fits include proper error analysis with confidence intervals, residual
diagnostics, and model comparison metrics.

## Prerequisites

```bash
# Core scientific stack
python3 -c "import numpy, scipy, matplotlib; print('OK')"

# Install if missing
pip install numpy scipy matplotlib
```

## Workflow

### Step 1 — Understand the Data and Model

Before fitting, confirm with the user:

1. **Data source**: File path, format (CSV, TXT, HDF5), or manual entry
2. **Variables**: Independent (x) and dependent (y) with units
3. **Uncertainties**: Are there measurement errors on x and/or y? Are they Gaussian?
4. **Model**: What physics model to fit? (e.g., exponential decay, Gaussian, power law)
5. **Physical constraints**: Are parameters bounded? (e.g., lifetime must be positive)
6. **Background**: Is there a background component? (e.g., constant baseline, linear trend)

### Step 2 — Load and Inspect Data

```python
import numpy as np

def load_data(filepath, delimiter=',', skip_header=1):
    """Load experimental data from file."""
    data = np.loadtxt(filepath, delimiter=delimiter, skiprows=skip_header)
    return data

# Example: two-column file with x, y, sigma_y
# data = load_data('experiment.csv')  # → columns: x, y, dy
# x, y, dy = data[:, 0], data[:, 1], data[:, 2]
```

### Step 3 — Define the Physics Model

```python
import numpy as np
from scipy.optimize import curve_fit

# --- Common Physics Models ---

def exponential_decay(x, A, tau, C):
    """Exponential decay with constant offset: y = A·exp(-x/τ) + C"""
    return A * np.exp(-x / tau) + C

def gaussian_peak(x, A, mu, sigma, C):
    """Gaussian peak with baseline: y = A·exp(-(x-μ)²/2σ²) + C"""
    return A * np.exp(-(x - mu)**2 / (2 * sigma**2)) + C

def breit_wigner(x, A, M, Gamma, C):
    """Relativistic Breit-Wigner (Cauchy): y = A·Γ²/((x-M)²+Γ²/4) + C"""
    return A * Gamma**2 / ((x - M)**2 + Gamma**2/4) + C

def power_law(x, A, n, C):
    """Power law with offset: y = A·xⁿ + C"""
    return A * x**n + C

def planck_spectral(T, h, c, k_B):
    """Planck spectral radiance B(ν, T)."""
    nu = T  # frequency axis
    return 2*h*nu**3 / c**2 / (np.exp(h*nu/(k_B*T)) - 1)

def boltzmann(x, A, E, T, C):
    """Boltzmann distribution: y = A·exp(-E/(kT)) + C"""
    k_B = 8.617e-5  # eV/K
    return A * np.exp(-E / (k_B * T * x)) + C

def linear_model(x, m, b):
    """Simple linear: y = m·x + b"""
    return m * x + b

def lorentzian(x, A, x0, gamma, C):
    """Lorentzian peak: y = A/(1 + ((x-x0)/γ)²) + C"""
    return A / (1 + ((x - x0) / gamma)**2) + C

def voigt_profile(x, A, x0, sigma, gamma, C):
    """Voigt profile (convolution of Gaussian and Lorentzian)."""
    from scipy.special import voigt_profile as vp
    return A * vp(x - x0, sigma, gamma) + C
```

### Step 4 — Perform the Fit

#### Method A: Non-Linear Least Squares (scipy.optimize.curve_fit)

```python
def perform_fit(model_func, x, y, p0, bounds=(-np.inf, np.inf), sigma=None):
    """
    Perform non-linear least squares fit.
    
    Parameters:
        model_func: callable f(x, *params)
        x: independent variable data
        y: dependent variable data
        p0: initial parameter guesses
        bounds: (lower, upper) bounds for parameters
        sigma: uncertainties on y data
    
    Returns:
        popt: optimal parameters
        pcov: covariance matrix
    """
    popt, pcov = curve_fit(
        model_func, x, y,
        p0=p0,
        sigma=sigma,
        absolute_sigma=True,  # Use actual sigma values
        bounds=bounds,
        maxfev=10000
    )
    perr = np.sqrt(np.diag(pcov))  # 1-sigma uncertainties
    return popt, pcov, perr
```

#### Method B: Chi-Squared Minimization

```python
def chi_squared_minimization(model_func, x, y, dy, p0):
    """
    Minimize χ² = Σ [(y_i - f(x_i))² / σ_i²]
    """
    from scipy.optimize import minimize
    
    def chi2(params):
        y_model = model_func(x, *params)
        return np.sum(((y - y_model) / dy)**2)
    
    result = minimize(chi2, p0, method='Nelder-Mead')
    return result.x, result.fun, len(x) - len(p0)
```

#### Method C: Maximum Likelihood Estimation

```python
def log_likelihood(params, model_func, x, y, dy):
    """Log-likelihood assuming Gaussian errors."""
    y_model = model_func(x, *params)
    return -0.5 * np.sum(((y - y_model) / dy)**2 + np.log(2*np.pi*dy**2))

def mle_fit(model_func, x, y, dy, p0):
    """Maximum likelihood estimation using scipy.optimize."""
    from scipy.optimize import minimize
    
    result = minimize(lambda p: -log_likelihood(p, model_func, x, y, dy), p0)
    return result.x
```

### Step 5 — Evaluate Goodness of Fit

```python
def goodness_of_fit(model_func, x, y, dy, popt):
    """
    Compute goodness-of-fit statistics.
    
    Returns: chi2, reduced_chi2, p_value, ndof, residuals
    """
    y_fit = model_func(x, *popt)
    residuals = y - y_fit
    chi2 = np.sum((residuals / dy)**2)
    ndof = len(x) - len(popt)
    red_chi2 = chi2 / ndof
    
    # p-value from chi-squared distribution
    from scipy.stats import chi2 as chi2_dist
    p_value = 1 - chi2_dist.cdf(chi2, ndof)
    
    return {
        'chi2': chi2,
        'reduced_chi2': red_chi2,
        'p_value': p_value,
        'ndof': ndof,
        'residuals': residuals
    }
```

### Step 6 — Model Comparison

```python
def model_comparison(x, y, dy, models_results):
    """
    Compare multiple models using AIC and BIC.
    
    models_results: list of dicts with 'n_params' and 'log_likelihood'
    """
    n = len(x)
    results = []
    
    for name, res in models_results:
        k = res['n_params']
        log_L = res['log_likelihood']
        
        # AIC = -2·ln(L) + 2k
        aic = -2 * log_L + 2 * k
        
        # BIC = -2·ln(L) + k·ln(n)
        bic = -2 * log_L + k * np.log(n)
        
        results.append({
            'model': name,
            'AIC': aic,
            'BIC': bic,
            'n_params': k
        })
    
    return sorted(results, key=lambda r: r['AIC'])
```

### Step 7 — Visualization

```python
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

# Font setup for physics plots
fm.fontManager.addfont('/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf')
plt.rcParams['font.sans-serif'] = ['Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

def plot_fit(x, y, dy, model_func, popt, perr, xlabel, ylabel, title, 
             residuals=True, save_path=None):
    """
    Publication-quality fit plot with optional residual subplot.
    """
    if residuals:
        fig, (ax_main, ax_res) = plt.subplots(
            2, 1, figsize=(8, 10), gridspec_kw={'height_ratios': [3, 1]},
            constrained_layout=True
        )
    else:
        fig, ax_main = plt.subplots(figsize=(8, 6), constrained_layout=True)
    
    x_fine = np.linspace(min(x), max(x), 500)
    y_fit_fine = model_func(x_fine, *popt)
    y_fit = model_func(x, *popt)
    
    # Data with error bars
    ax_main.errorbar(x, y, yerr=dy, fmt='o', markersize=5, 
                    color='navy', capsize=3, label='Data', zorder=3)
    
    # Fit curve with confidence band
    ax_main.plot(x_fine, y_fit_fine, 'r-', linewidth=2, label='Fit', zorder=2)
    
    # 1-sigma uncertainty band (approximate)
    y_upper = model_func(x_fine, *(popt + perr))
    y_lower = model_func(x_fine, *(popt - perr))
    ax_main.fill_between(x_fine, y_lower, y_upper, alpha=0.15, color='red',
                         label='1σ uncertainty')
    
    ax_main.set_xlabel(xlabel, fontsize=13)
    ax_main.set_ylabel(ylabel, fontsize=13)
    ax_main.set_title(title, fontsize=14, fontweight='bold')
    ax_main.legend(fontsize=11)
    ax_main.grid(True, alpha=0.3)
    
    # Format parameter annotation
    param_names = model_func.__code__.co_varnames[1:]  # Skip 'x'
    param_str = '\n'.join(
        f'{name} = {val:.4g} ± {err:.4g}'
        for name, val, err in zip(param_names, popt, perr)
    )
    ax_main.text(0.02, 0.98, param_str, transform=ax_main.transAxes,
                fontsize=9, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    # Residuals subplot
    if residuals:
        res = y - y_fit
        norm_res = res / dy if dy is not None else res
        ax_res.errorbar(x, norm_res, yerr=1.0 if dy is not None else None,
                       fmt='o', markersize=4, color='navy', capsize=2)
        ax_res.axhline(0, color='red', linestyle='--', alpha=0.7)
        ax_res.set_xlabel(xlabel, fontsize=13)
        ax_res.set_ylabel('Normalized Residual', fontsize=11)
        ax_res.grid(True, alpha=0.3)
    
    if save_path:
        fig.savefig(save_path, dpi=300, bbox_inches='tight')
    
    plt.show()
    return fig
```

## Script Template

Save to `/home/z/my-project/scripts/fit_physics.py`:

```python
#!/usr/bin/env python3
"""
Physics Data Fitting Script
Fits [physics model] to [data description].
"""
import numpy as np
from scipy.optimize import curve_fit
from scipy.stats import chi2 as chi2_dist
import matplotlib.pyplot as plt

# === USER CONFIGURATION ===
DATA_FILE = '/home/z/my-project/download/data.csv'
MODEL_NAME = 'exponential_decay'
X_LABEL = 'Time (s)'
Y_LABEL = 'Counts'
TITLE = 'Radioactive Decay Fit'

# === LOAD DATA ===
data = np.loadtxt(DATA_FILE, delimiter=',', skiprows=1)
x, y, dy = data[:, 0], data[:, 1], data[:, 2]

# === DEFINE MODEL ===
def model(x, A, tau, C):
    return A * np.exp(-x / tau) + C

# === INITIAL GUESSES ===
p0 = [y.max(), x[len(x)//2], y.min()]

# === FIT ===
popt, pcov = curve_fit(model, x, y, p0=p0, sigma=dy, absolute_sigma=True)
perr = np.sqrt(np.diag(pcov))

# === GOODNESS OF FIT ===
y_fit = model(x, *popt)
chi2 = np.sum(((y - y_fit) / dy)**2)
ndof = len(x) - len(popt)
red_chi2 = chi2 / ndof
p_value = 1 - chi2_dist.cdf(chi2, ndof)

# === PRINT RESULTS ===
print(f"Fit Parameters:")
for i, (name, val, err) in enumerate(zip(
    model.__code__.co_varnames[1:], popt, perr)):
    print(f"  {name} = {val:.6g} ± {err:.6g}")
print(f"\nChi-squared / ndof: {red_chi2:.2f} / {ndof}")
print(f"p-value: {p_value:.4f}")

# === PLOT ===
# ... (use plot_fit function above)
```

## Common Physics Fitting Scenarios

| Scenario | Model | Key Parameters |
|---|---|---|
| Radioactive decay | `A·exp(-t/τ) + C` | A, τ (lifetime), C (background) |
| Spectral line | Gaussian/Lorentzian/Voigt | A, μ (center), σ/γ (width) |
| Resonance | Breit-Wigner | A, M (mass), Γ (width) |
| Power law | `A·xⁿ + C` | A, n (index), C |
| Thermal distribution | Boltzmann/Planck | A, E (activation energy), T |
| RLC circuit response | Damped sinusoid | A, γ, ω₀, φ |
| Blackbody radiation | Planck function | T (temperature) |
| Semiconductor I-V | Shockley diode | Iₛ, n, V_T |

## Mandatory Rules

1. **Always persist scripts** to `/home/z/my-project/scripts/` before executing.
2. **Use physical units** consistently — label all axes with units.
3. **Include uncertainties** — never fit without error bars if they exist.
4. **Report reduced χ² and p-value** for every fit.
5. **Show residuals** — plot normalized residuals to check for systematic deviations.
6. **Use `absolute_sigma=True`** in `curve_fit` when uncertainties are absolute (not relative).
7. **Validate with synthetic data** if the fit looks suspicious — generate test data and verify recovery.
8. **Constrain parameters** when physics demands it (e.g., positive masses, positive widths).
