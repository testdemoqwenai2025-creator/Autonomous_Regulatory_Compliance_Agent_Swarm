---
name: sympy-symbolic-math
version: 1.0.0
author: Z Physics Lab
description: >
  Use this skill whenever the user needs symbolic computation, algebraic manipulation, calculus,
  differential equations, linear algebra, tensor operations, special functions, or mathematical physics
  calculations. Powered by Python SymPy. Handles simplification, integration, differentiation,
  series expansion, equation solving, matrix operations, and physics-specific symbolic computation
  (Lagrangian mechanics, quantum operators, GR tensors, etc.).
metadata:
  tags:
    - sympy
    - symbolic math
    - calculus
    - algebra
    - differential equations
    - linear algebra
    - tensor
    - physics math
    - quantum mechanics
    - classical mechanics
  triggers:
    - "symbolic computation"
    - "solve equation"
    - "integrate"
    - "differentiate"
    - "simplify expression"
    - "SymPy"
    - "symbolic math"
    - "compute derivative"
    - "solve differential equation"
    - "matrix eigenvalues"
---

# SymPy Symbolic Math Computation

> Symbolic mathematics engine for physics and mathematical analysis using Python SymPy.

## Overview

This skill provides a comprehensive symbolic computation toolkit built on Python SymPy. It covers
algebraic manipulation, calculus (single and multivariable), differential equations (ODEs and PDEs),
linear algebra (matrices, eigenvalues, tensor products), special functions, series expansions,
and domain-specific physics computation including classical mechanics (Lagrangian/Hamiltonian formalism),
quantum mechanics (operator algebra, commutation relations), and general relativity (tensor calculus).

## Prerequisites

```bash
# Verify SymPy is installed
python3 -c "import sympy; print(f'SymPy {sympy.__version__}')"

# Install if missing
pip install sympy
```

SymPy is typically pre-installed in scientific Python environments. If not available, install via `pip`.

## Core Capabilities

### 1. Symbolic Algebra

```python
from sympy import *

x, y, z = symbols('x y z')
a, b, c = symbols('a b c', real=True, positive=True)

# Expression manipulation
expr = (x**2 - 4*x + 4) / (x - 2)
print(simplify(expr))           # → x - 2
print(expand((x + 1)**3))       # → x**3 + 3*x**2 + 3*x + 1
print(factor(x**4 - 1))         # → (x - 1)*(x + 1)*(x**2 + 1)
print(together(1/x + 1/(x+1)))  # → (2*x + 1)/(x*(x + 1))

# Substitution
expr = sin(x)**2 + cos(x)**2
print(expr.subs(x, pi/3))        # → 1 (always, by identity)
```

### 2. Calculus

#### Differentiation

```python
# Single variable
f = exp(-x**2) * sin(2*x)
print(diff(f, x))               # First derivative
print(diff(f, x, 3))            # Third derivative
print(diff(f, x, 2).simplify()) # Simplified second derivative

# Multivariable (partial derivatives)
g = x**2 * y**3 + sin(x*y)
print(diff(g, x))               # ∂g/∂x
print(diff(g, y, 2))            # ∂²g/∂y²
print(diff(g, x, y))            # Mixed partial ∂²g/(∂x∂y)
```

#### Integration

```python
# Indefinite integral
I = integrate(exp(-x**2), x)     # No closed form for exp(-x²)
print(I)                         # → sqrt(pi)*erf(x)/2

# Definite integral
print(integrate(exp(-x**2), (x, -oo, oo)))  # → sqrt(pi)
print(integrate(sin(x)/x, (x, 0, oo)))      # → pi/2

# Integration techniques
integrate(1/(x**2 + 1), x)       # → atan(x)
integrate(x*exp(-x), (x, 0, oo)) # → 1
integrate(1/sqrt(1 - x**2), x)   # → asin(x)
```

#### Series Expansion

```python
# Taylor series
print(series(sin(x), x, 0, 7))       # → x - x³/3! + x⁵/5! + O(x⁷)
print(series(exp(x), x, 0, 5))       # → 1 + x + x²/2! + x³/3! + x⁴/4! + O(x⁵)
print(series(1/(1-x), x, 0, 6))       # → 1 + x + x² + x³ + x⁴ + x⁵ + O(x⁶)

# Asymptotic expansion
print(series(exp(x)/x, x, oo, 3))     # Expansion at infinity
```

### 3. Equation Solving

```python
# Algebraic equations
sol = solve(Eq(x**2 + 3*x - 4, 0), x)  # → [1, -4]
print(sol)

# System of equations
sol = solve([Eq(x + y, 5), Eq(x - y, 1)], [x, y])  # → {x: 3, y: 2}
print(sol)

# Symbolic parameters
m, k, omega = symbols('m k omega')
sol = solve(Eq(m*omega**2 - k, 0), omega)  # → [-sqrt(k/m), sqrt(k/m)]
print(sol)
```

### 4. Differential Equations

#### ODEs

```python
from sympy import Function, dsolve, Eq

# Define dependent variable and function
t = symbols('t')
y = Function('y')

# Simple harmonic oscillator: y'' + ω²y = 0
omega = symbols('omega', positive=True, real=True)
ode = Eq(diff(y(t), t, 2) + omega**2 * y(t), 0)
solution = dsolve(ode, y(t))
# → y(t) = C₁·sin(ωt) + C₂·cos(ωt)

# Damped oscillator: y'' + 2γy' + ω₀²y = 0
gamma, omega0 = symbols('gamma omega0', positive=True, real=True)
ode_damped = Eq(diff(y(t), t, 2) + 2*gamma*diff(y(t), t) + omega0**2 * y(t), 0)
sol_damped = dsolve(ode_damped, y(t))

# With initial conditions
ode_ic = Eq(diff(y(t), t, 2) + omega**2 * y(t), 0)
sol_ic = dsolve(ode_ic, y(t), ics={y(0): 1, diff(y(t), t).subs(t, 0): 0})
# → y(t) = cos(ωt)
```

### 5. Linear Algebra

```python
from sympy import Matrix

# Matrix operations
A = Matrix([[1, 2], [3, 4]])
B = Matrix([[5, 6], [7, 8]])

print(A + B)         # Addition
print(A * B)         # Matrix multiplication
print(A.T)           # Transpose
print(A.inv())        # Inverse
print(A.det())        # Determinant
print(A.eigenvals())  # Eigenvalues → {−1/2 + √33/2: 1, −1/2 − √33/2: 1}
print(A.eigenvects()) # Eigenvalues with eigenvectors

# Symbolic matrices
n = symbols('n', integer=True, positive=True)
H = Matrix([[0, 1], [1, 0]])  # Pauli-X
Z = Matrix([[1, 0], [0, -1]]) # Pauli-Z
print(commutator(H, Z))  # [H, Z] = HZ - ZH
```

### 6. Physics-Specific Computation

#### Lagrangian Mechanics

```python
# Simple pendulum Lagrangian
theta = symbols('theta')
theta_dot = symbols('thetadot')
L = symbols('L', positive=True)
g = symbols('g', positive=True)
m = symbols('m', positive=True)

# T = ½mL²θ̇², V = -mgL cos(θ)
T = Rational(1, 2) * m * L**2 * theta_dot**2
V = -m * g * L * cos(theta)
lagrangian = T - V

# Euler-Lagrange equation: d/dt(∂L/∂θ̇) - ∂L/∂θ = 0
theta_ddot = Function('theta')
theta_t = symbols('theta_t')
theta_func = Function('theta')(symbols('t'))
```

#### Quantum Mechanics Operators

```python
# Commutator algebra
X, P = symbols('X P')
hbar = symbols('hbar', real=True, positive=True)

# [X, P] = iℏ (formal, for display)
# Verify Pauli matrix commutation relations
sigma_x = Matrix([[0, 1], [1, 0]])
sigma_y = Matrix([[0, -I], [I, 0]])
sigma_z = Matrix([[1, 0], [0, -1]])

comm_xy = sigma_x * sigma_y - sigma_y * sigma_x  # → 2i σ_z
print(simplify(comm_xy / (2*I)))  # → σ_z

# Angular momentum algebra
Jx = Matrix(symbols('Jx: (3,3)'))
Jy = Matrix(symbols('Jy: (3,3)'))
Jz = Matrix(symbols('Jz: (3,3)'))
```

#### Special Functions for Physics

```python
# Bessel functions
x = symbols('x')
print(besselj(0, x))       # J₀(x)
print(besselj(1, x).series(x, 0, 5))  # Series expansion

# Spherical harmonics
theta, phi = symbols('theta phi')
print(spherical_harmonic(1, 0, theta, phi))  # Y₁₀
print(spherical_harmonic(2, 1, theta, phi))  # Y₂₁

# Legendre polynomials
print(legendre(3, x))        # P₃(x)
print(assoc_legendre(2, 1, x))  # P₂¹(x)

# Gamma and Beta functions
print(gamma(Rational(3, 2)))  # → √π/2
print(beta(2, 3))            # → 1/12

# Hypergeometric functions
print(hyper([1, 1], [2], x))  # ₂F₁(1,1;2;x) = -ln(1-x)/x
```

### 7. Tensor Calculus

```python
from sympy.tensor.array import Array, tensorproduct, tensorcontraction

# Define tensors
A = Array(range(6), (2, 3))  # 2×3 matrix as tensor
B = Array(range(6, 12), (3, 2))  # 3×2 matrix

# Tensor product (outer product)
C = tensorproduct(A, B)

# Contraction (trace-like operations)
D = tensorcontraction(C, (1, 2))  # Contract indices 1 and 2

# Symmetric/antisymmetric tensors
# Useful for stress-energy, electromagnetic field tensors
```

## Execution Pattern

### Standard Workflow

1. **Write a Python script** to `/home/z/my-project/scripts/sympy_compute.py`
2. **Execute** with `python3 /home/z/my-project/scripts/sympy_compute.py`
3. **Read output** and format results for the user

### Script Template

```python
#!/usr/bin/env python3
"""SymPy symbolic computation for [specific physics problem]."""
import sympy as sp
from sympy import *

def main():
    # === Define symbols ===
    # Add your symbols here

    # === Perform computation ===
    # Add your symbolic math here

    # === Print formatted results ===
    sp.pprint(result)

if __name__ == '__main__':
    main()
```

## Mandatory Rules

1. **Always persist scripts** to `/home/z/my-project/scripts/` before executing.
2. **Use `sp.init_printing()`** or `sp.pprint()` for readable symbolic output.
3. **Declare symbol assumptions** explicitly (real, positive, integer, etc.) when known — this helps SymPy simplify correctly.
4. **Simplify results** before presenting to the user — use `simplify()`, `trigsimp()`, `radsimp()`, or domain-specific simplification.
5. **Verify dimensional consistency** — ensure symbolic expressions have correct physical dimensions.
6. **Handle convergence** — always check convergence conditions for infinite series and improper integrals.
7. **State assumptions** — clearly list all assumptions (real, positive, commutative, etc.) made about symbols.

## Common Physics Applications

| Application | SymPy Feature |
|---|---|
| Harmonic oscillator | `dsolve` for ODE, trig simplification |
| Hydrogen atom | Special functions (spherical harmonics, Laguerre) |
| Classical field theory | Lagrangian mechanics, variational calculus |
| Group theory | Matrix groups, character tables, representation theory |
| Statistical mechanics | Gamma functions, Stirling approximation |
| Quantum field theory | Perturbation series, Feynman diagram algebra |
| General relativity | Tensor operations, Christoffel symbols |
| Solid state physics | Bloch theorem, reciprocal lattice sums |

## Error Handling

- **Integration failures**: Try `integrate()` first; if it returns unevaluated, attempt manual substitution or `meijerg` functions.
- **Simplification timeout**: Use specific simplifiers (`trigsimp`, `radsimp`, `powsimp`) instead of generic `simplify`.
- **Large expressions**: Use `collect()` to group terms, `cancel()` for rational simplification.
- **Numerical verification**: When symbolic results are uncertain, substitute numerical values to cross-check with `evalf()`.
