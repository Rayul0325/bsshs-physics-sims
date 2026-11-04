# Copyright 2026, bsshs-physics-sims contributors
# SPDX-License-Identifier: GPL-3.0-only
#
# Independent reference values for adapters/bsshs-semiconductor/cases.json (V3 physics check).
# Computed from the class/standard formulas with methods that differ from the sim's numerics:
#   - diode operating point: closed form with the Lambert W function (mpmath, 50 digits); the sim bisects;
#   - rectifier with an ideal / constant-drop diode and a smoothing capacitor: exact turn-off and turn-on
#     instants solved with brentq (continuous-time solution); the sim steps a sampled period;
#   - piecewise-linear diode with a capacitor: scipy solve_ivp (Radau, rtol 1e-11) run to a periodic
#     steady state; the sim uses an exponential integrator.
# Run: python3 adapters/bsshs-semiconductor/reference.py > /dev/null  (prints the cases JSON to stdout)
import json
import math

import mpmath as mp
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

mp.mp.dps = 50

# CODATA 2018/2022 exact or recommended values.
K_B = 1.380649e-23        # J/K
E = 1.602176634e-19       # C
EPS0 = 8.8541878188e-12   # F/m

# Device parameters (same physical choices the sim documents; not values read from the sim).
AREA = 1e-7               # m², junction area 0.1 mm²
MATERIALS = {
    #            Eg (eV), eps_r, n_i at 300 K (cm^-3), D_n/L_n (m/s), D_p/L_p (m/s)
    'silicon': (1.12, 11.7, 1.0e10, 30e-4 / 20e-6, 12e-4 / 20e-6),
    'germanium': (0.67, 16.0, 2.0e13, 90e-4 / 50e-6, 45e-4 / 50e-6),
}
SERIES_R = 1000.0         # Ω, protective resistor of the junction screen
V_ON = 0.7                # V, constant-drop / piecewise-linear turn-on voltage
R_D = 10.0                # Ω, piecewise-linear slope resistance


def junction(material, vs, na, nd, t, n):
    eg, epsr, ni300, dn_ln, dp_lp = MATERIALS[material]
    k_ev = K_B / E
    vt = K_B * t / E
    ni = ni300 * (t / 300.0) ** 1.5 * math.exp(-eg / (2 * k_ev) * (1.0 / t - 1.0 / 300.0))  # cm^-3
    ni_m, na_m, nd_m = ni * 1e6, na * 1e6, nd * 1e6
    i_s = E * AREA * ni_m ** 2 * (dn_ln / na_m + dp_lp / nd_m)  # A
    vbi = vt * math.log(na * nd / ni ** 2)
    a = n * vt
    # Lambert W closed form of  vs = V + R I_s (exp(V/a) - 1).
    arg = mp.mpf(i_s) * SERIES_R / a * mp.exp((mp.mpf(vs) + i_s * SERIES_R) / a)
    i = float(a / SERIES_R * mp.lambertw(arg).real - i_s)
    vd = vs - i * SERIES_R
    eps = epsr * EPS0
    w2 = 2 * eps * max(0.0, vbi - vd) / E * (1 / na_m + 1 / nd_m)  # m²
    w = math.sqrt(w2)
    out = {
        'bandGap': eg, 'temperature': t, 'thermalVoltage': vt, 'intrinsicDensity': ni,
        'saturationCurrent': i_s * 1e3, 'builtInVoltage': vbi, 'permittivity': eps,
        'sourceVoltage': vs, 'diodeVoltage': vd, 'diodeCurrent': i * 1e3,
        'depletionWidth': w * 1e6, 'depletionWidthSquared': w2 * 1e12,
        'barrierHeight': max(0.0, vbi - vd), 'idealityFactor': n,
        'acceptorDensity': na, 'donorDensity': nd,
    }
    if i > 0:
        out['lnCurrent'] = math.log(i * 1e3)
    return out


def eff(circuit, model, v_in):
    """Source voltage seen by the load side when the diode(s) conduct, and the series resistance."""
    drops = 0.0 if model == 'ideal' else V_ON
    if circuit == 'halfWave':
        return v_in - drops, (R_D if model == 'piecewiseLinear' else 0.0)
    return abs(v_in) - 2 * drops, (2 * R_D if model == 'piecewiseLinear' else 0.0)


def rectifier_no_c(circuit, model, vp, r):
    """Closed form: peak, average (exact integrals) of the resistive-load output."""
    drops = 0.0 if model == 'ideal' else V_ON
    nd = 1 if circuit == 'halfWave' else 2
    vd = nd * drops
    rd = nd * R_D if model == 'piecewiseLinear' else 0.0
    k = r / (r + rd)
    if vp <= vd:
        return {'peakVoltage': 0.0, 'rippleVoltage': 0.0, 'averageOutputVoltage': 0.0}
    th0 = math.asin(vd / vp)
    # (1/2π)∫ over one conducting half-cycle of (vp sinθ − vd) dθ
    half = (2 * vp * math.cos(th0) - vd * (math.pi - 2 * th0)) / (2 * math.pi)
    avg = k * half * (1 if circuit == 'halfWave' else 2)
    peak = k * (vp - vd)
    return {'peakVoltage': peak, 'rippleVoltage': peak, 'averageOutputVoltage': avg}


def rectifier_switch_c(circuit, model, vp, f, r, c_uf):
    """Ideal or constant-drop diode with a capacitor: exact continuous steady state."""
    c = c_uf * 1e-6
    rc = r * c
    w = 2 * math.pi * f
    drops = 0.0 if model == 'ideal' else V_ON
    vd = drops if circuit == 'halfWave' else 2 * drops
    teff = 1 / f if circuit == 'halfWave' else 1 / (2 * f)
    # Conduction follows v_eff = vp sin(wt) − vd on (0, T/2) (bridge: |sin| has the same shape per half period).
    ve = lambda t: vp * math.sin(w * t) - vd
    dve = lambda t: vp * w * math.cos(w * t)
    # Turn-off after the peak: diode current C dv/dt + v/R reaches zero.
    t2 = brentq(lambda t: c * dve(t) + ve(t) / r, 0.25 / f, 0.5 / f)
    v2 = ve(t2)
    # Turn-on in the next conduction window: exponential decay meets the rising source.
    g = lambda t: v2 * math.exp(-(t - t2) / rc) - ve(t - teff)
    t1 = brentq(g, teff + 1e-12, teff + 0.25 / f)
    vmin = ve(t1 - teff)
    peak = vp - vd
    # Average over one conduction period: integral of the followed source plus the decay segment.
    t_on = t1 - teff
    follow = (vp / w) * (math.cos(w * t_on) - math.cos(w * t2)) - vd * (t2 - t_on)
    decay = v2 * rc * (1 - math.exp(-(t1 - t2) / rc))
    avg = (follow + decay) / teff
    return {'peakVoltage': peak, 'rippleVoltage': peak - vmin, 'averageOutputVoltage': avg}


def rectifier_pwl_c(circuit, vp, f, r, c_uf):
    """Piecewise-linear diode with a capacitor: integrate the ODE to a periodic steady state."""
    c = c_uf * 1e-6
    w = 2 * math.pi * f
    period = 1 / f

    def rhs(t, y):
        v_e, rs = eff(circuit, 'piecewiseLinear', vp * math.sin(w * t))
        i_d = max(0.0, (v_e - y[0]) / rs)
        return [(i_d - y[0] / r) / c]

    v0 = 0.0
    for _ in range(4000):
        sol = solve_ivp(rhs, (0, period), [v0], method='Radau', rtol=1e-11, atol=1e-13, max_step=period / 2000)
        v1 = sol.y[0, -1]
        if abs(v1 - v0) < 1e-11:
            v0 = v1
            break
        v0 = v1
    ts = np.linspace(0, period, 400001)
    sol = solve_ivp(rhs, (0, period), [v0], method='Radau', rtol=1e-11, atol=1e-13, max_step=period / 2000,
                    t_eval=ts)
    v = sol.y[0]
    return {'peakVoltage': float(v.max()), 'rippleVoltage': float(v.max() - v.min()),
            'averageOutputVoltage': float(np.trapezoid(v, ts) / period)}


def pick(d, keys):
    # Round-off far below any physical value here (|x| < 1e-24, e.g. the Lambert W form at exactly 0 V) is 0.
    return {k: {'value': d[k] if abs(d[k]) >= 1e-24 else 0} for k in keys}


JKEYS = ['bandGap', 'thermalVoltage', 'intrinsicDensity', 'saturationCurrent', 'builtInVoltage',
         'diodeVoltage', 'diodeCurrent', 'depletionWidth', 'depletionWidthSquared']


def jcase(name, keys=JKEYS, **p):
    params = {'screen': 'junction', 'material': 'silicon', 'sourceVoltage': 0, 'acceptorDensity': 1e16,
              'donorDensity': 1e16, 'temperature': 300, 'idealityFactor': 1}
    params.update(p)
    d = junction(params['material'], params['sourceVoltage'], params['acceptorDensity'], params['donorDensity'],
                 params['temperature'], params['idealityFactor'])
    return {'name': name, 'params': params, 'expect': pick(d, [k for k in keys if k in d])}


def rparams(**p):
    params = {'screen': 'rectifier', 'circuit': 'halfWave', 'diodeModel': 'constantDrop', 'inputAmplitude': 10,
              'signalFrequency': 60, 'loadResistance': 1000, 'capacitance': 0}
    params.update(p)
    return params


def rcase(name, keys=('peakVoltage', 'rippleVoltage', 'averageOutputVoltage'), rel=None, **p):
    params = rparams(**p)
    c, m = params['circuit'], params['diodeModel']
    vp, f, r, cuf = params['inputAmplitude'], params['signalFrequency'], params['loadResistance'], params['capacitance']
    if not cuf:
        d = rectifier_no_c(c, m, vp, r)
    elif m == 'piecewiseLinear':
        d = rectifier_pwl_c(c, vp, f, r, cuf)
    else:
        d = rectifier_switch_c(c, m, vp, f, r, cuf)
    if cuf:
        d['inverseCapacitance'] = 1 / cuf
        keys = list(keys) + ['inverseCapacitance']
    exp = pick(d, keys)
    if rel is not None:
        for k in exp:
            exp[k]['relTol'] = rel
    return {'name': name, 'params': params, 'expect': exp}


def approx_ripple_case(name, **p):
    params = rparams(**p)
    vp_out = params['inputAmplitude'] - (V_ON if params['circuit'] == 'halfWave' else 2 * V_ON)
    f_eff = params['signalFrequency'] * (1 if params['circuit'] == 'halfWave' else 2)
    dv = vp_out / (f_eff * params['loadResistance'] * params['capacitance'] * 1e-6)
    # The linear-discharge approximation overestimates the exact ripple by the conduction fraction (a few %).
    return {'name': name, 'params': params, 'expect': {'rippleVoltage': {'value': dv, 'relTol': 0.06}}}


def cursor_case(name, cursor_ms, **p):
    params = rparams(**p)
    params['cursorTime'] = cursor_ms
    vp, f, r = params['inputAmplitude'], params['signalFrequency'], params['loadResistance']
    v_in = vp * math.sin(2 * math.pi * f * cursor_ms / 1000)
    # Constant-drop half-wave, no capacitor (the only cursor cases): v_out = max(0, v_in − 0.7).
    assert params['circuit'] == 'halfWave' and params['diodeModel'] == 'constantDrop' and not params['capacitance']
    v_out = max(0.0, v_in - V_ON)
    i_ma = v_out / r * 1e3
    v_d = V_ON if v_out > 0 else v_in
    d = {'inputVoltage': v_in, 'outputVoltage': v_out, 'diodeCurrent': i_ma, 'diodeVoltage': v_d,
         'cursorTime': cursor_ms}
    return {'name': name, 'params': params, 'expect': pick(d, list(d))}


cases = [
    jcase('PN 접합 실리콘, 전원 0 V (평형): 전류 0, V_bi = (kT/e)ln(N_A N_D/n_i²), 공핍층 폭'),
    jcase('실리콘 역방향 −5 V: 전류 ≈ −I_s (경계), 공핍층이 넓어짐', sourceVoltage=-5),
    jcase('실리콘 순방향 +5 V (보호 저항 1 kΩ): 쇼클리 식 동작점, 공핍층이 좁아짐', keys=JKEYS + ['lnCurrent'],
          sourceVoltage=5),
    jcase('실리콘 순방향 +1 V: 쇼클리 식 동작점', keys=JKEYS + ['lnCurrent'], sourceVoltage=1),
    jcase('저마늄 순방향 +5 V: 띠 간격 0.67 eV, 문턱 전압이 낮음', keys=JKEYS + ['lnCurrent'],
          material='germanium', sourceVoltage=5),
    jcase('저마늄 역방향 −2 V: 전류 ≈ −I_s (경계)', material='germanium', sourceVoltage=-2),
    jcase('비대칭 도핑 N_A = 10¹⁵, N_D = 10¹⁷ cm⁻³, 역방향 −3 V', acceptorDensity=1e15, donorDensity=1e17,
          sourceVoltage=-3),
    jcase('온도 350 K, 순방향 +2 V: n_i와 I_s가 커짐', keys=JKEYS + ['lnCurrent'], temperature=350,
          sourceVoltage=2),
    jcase('이상 계수 n = 2, 순방향 +2 V: 같은 전류에 V_D가 약 n배',
          keys=['thermalVoltage', 'saturationCurrent', 'diodeVoltage', 'diodeCurrent', 'lnCurrent'],
          idealityFactor=2, sourceVoltage=2),
    jcase('도핑 10¹⁵ cm⁻³, 순방향 +5 V: V_D ≥ V_bi이면 공핍층 근사 폭 0 (경계)',
          keys=['builtInVoltage', 'diodeVoltage', 'depletionWidth', 'barrierHeight'],
          acceptorDensity=1e15, donorDensity=1e15, sourceVoltage=5),
    jcase('저온 250 K, 역방향 −1 V: 전류 ≈ −I_s (경계)', temperature=250, sourceVoltage=-1),

    rcase('반파 정류, 고정 전압 강하 모델, 축전기 없음: 출력 최대 = V_p − 0.7 V'),
    rcase('브리지 정류, 고정 전압 강하 모델, 축전기 없음: 출력 최대 = V_p − 1.4 V', circuit='bridge'),
    rcase('반파 정류, 이상적인 다이오드: 평균 = V_p/π', diodeModel='ideal'),
    rcase('브리지 정류, 이상적인 다이오드: 평균 = 2V_p/π', circuit='bridge', diodeModel='ideal'),
    rcase('반파 정류, 구간 선형 모델, R = 100 Ω: 최대 = (V_p − V_on)R/(R + r_d)', diodeModel='piecewiseLinear',
          loadResistance=100),
    rcase('브리지 정류, 구간 선형 모델, R = 100 Ω: 최대 = (V_p − 2V_on)R/(R + 2r_d)', circuit='bridge',
          diodeModel='piecewiseLinear', loadResistance=100),
    rcase('반파 + 평활 축전기 470 μF, R = 1 kΩ, 60 Hz: 리플 (정확한 해)', capacitance=470),
    approx_ripple_case('반파 + 평활 축전기 1000 μF: 근사식 ΔV ≈ V_p/(fRC)와 6% 안', capacitance=1000),
    rcase('브리지 + 평활 축전기 470 μF: 리플 (정확한 해)', circuit='bridge', capacitance=470),
    approx_ripple_case('브리지 + 평활 축전기 1000 μF: 근사식 ΔV ≈ V_p/(2fRC)와 6% 안', circuit='bridge',
                       capacitance=1000),
    rcase('반파 + 축전기 100 μF, 진동수 120 Hz, 이상적인 다이오드: 리플 (정확한 해)', diodeModel='ideal',
          capacitance=100, signalFrequency=120),
    rcase('반파 + 축전기 220 μF, 구간 선형 모델, R = 470 Ω: 리플 (미분 방정식 해)', diodeModel='piecewiseLinear',
          capacitance=220, loadResistance=470),
    rcase('진폭 0.5 V < 0.7 V: 고정 전압 강하 반파 출력 0 (경계)', inputAmplitude=0.5),
    cursor_case('커서 위상 30°: v_in = V_p/2, v_out = v_in − 0.7 V', 1000 / 720),
    cursor_case('커서 위상 270° (역방향 반주기): 출력 0, 다이오드 양단 −V_p (경계)', 12.5),
]

print(json.dumps(cases, ensure_ascii=False, indent=1))
