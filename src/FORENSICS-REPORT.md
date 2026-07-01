# 🔴 FORENSICS AUDIT REPORT — PMDS Codebase

**Auditor Mode:** Principal QA Auditor & Security Forensics  
**Scope:** All `.ts`, `.html`, `.scss` files under `src/`  
**Targets Scanned:** 4  
**Date:** 2026-06-28

---

## ⛔ RESULT: CERTIFICATION **FAILED** — CONTAMINATED CODEBASE

> ❌ **This codebase is NOT 100% pure. `Math.random`, simulated analysis, and mock data injection are present in production-adjacent paths.**

---

## Target 1: `Math.random` — **MATCHES FOUND** ⚠️

### File: `speech-test.component.ts` — `runSimulatedAnalysis()` method

| Line | Code Snippet |
|------|-------------|
| 212 | `const baseRisk = Math.random() * 0.4;` |
| 218 | `consistency = 70 + Math.random() * 25 - (baseRisk * 30);` |
| 219 | `pitchStability = 65 + Math.random() * 30 - (baseRisk * 40);` |
| 223 | `consistency = 60 + Math.random() * 30 - (baseRisk * 35);` |
| 224 | `pitchStability = 70 + Math.random() * 25 - (baseRisk * 25);` |
| 225 | `speechRate = 2.5 + Math.random() * 3 - (baseRisk * 2);` |
| 228 | `consistency = 65 + Math.random() * 28 - (baseRisk * 30);` |
| 229 | `pitchStability = 60 + Math.random() * 32 - (baseRisk * 35);` |
| 230 | `speechRate = 3 + Math.random() * 3 - (baseRisk * 2);` |

**Context:** When `audioService.stopRecording()` returns empty data (no real mic data), the component falls back to `runSimulatedAnalysis()` which fabricates all speech metrics using `Math.random()`.

### File: `motion-sensor.service.ts` — `analyzeTremorInternal()` method

| Line | Code Snippet |
|------|-------------|
| 481 | `const isPD = Math.random() < 0.3;` |
| 484 | `(4.2 + Math.random() * 1.6).toFixed(1)` — dominant frequency (fake) |
| 485 | `(0.8 + Math.random() * 2).toFixed(1)` — alternative frequency (fake) |
| 486 | `(0.1 + Math.random() * 0.5).toFixed(3)` — amplitude (fake) |
| 525 | `0.5 + Math.random() * 0.4` — risk score when in PD range |
| 526 | `Math.random() * 0.3` — risk score when not in PD range |

**Context:** Tremor analysis fabricates PD status, frequency, amplitude, and risk scores when real data is insufficient (`data.length <= 10`), or **even when real data IS present** (lines 525-526 always run regardless).

### File: `motion-sensor.service.ts` — `analyzeGaitInternal()` method

| Line | Code Snippet |
|------|-------------|
| 653 | `const isPD = Math.random() < 0.28;` |
| 655 | `let cv = isPD ? 2.5 + Math.random() * 2 : 1 + Math.random() * 1.2;` |
| 696 | `... 0.4 * Math.random()` — risk score always includes random component |
| 700 | `parseFloat((0.8 + Math.random() * 0.8).toFixed(1))` — walking speed (fake) |
| 701 | `Math.round(50 + Math.random() * 45)` — balance score (fake) |
| 702 | `Math.round(60 + Math.random() * 35)` — regularity (fake) |

**Context:** Even when real gait data IS present and processed (peak detection, stride times, CV calculation), the final metrics are **overwritten with randomized values** on lines 696-702.

---

## Target 2: Mock / Dummy / Fake / Simulat / Seed — **MATCHES FOUND** ⚠️

| File | Line | Offending Snippet | Category |
|------|------|-------------------|----------|
| `speech-test.component.ts` | 78 | `this.runSimulatedAnalysis();` | **simulat** |
| `speech-test.component.ts` | 104 | `this.runSimulatedAnalysis();` | **simulat** |
| `speech-test.component.ts` | 210 | `private runSimulatedAnalysis(): void {` | **simulat** |

**Context:** The production test component has a direct mock injection path. When real microphone recording fails or returns empty data, the system silently substitutes fake data via `runSimulatedAnalysis()` and reports results as if they were real.

---

## Target 3: Hardcoded Fallback Arrays — **CLEAN** ✅

| File | Line | Code | Verdict |
|------|------|------|---------|
| `db.service.ts` | 36 | `localStorage.getItem(...) \|\| 'null'` | ❌ Clean — standard localStorage null-catch |
| `db.service.ts` | 59 | `this.get<TestRecord[]>('hist_' + uid) \|\| []` | ❌ Clean — returns empty array when no history exists. **This is a legitimate empty default, NOT injected test data.** |

No artificially injected test history or user data arrays were found.

---

## Target 4: `Date.now() %` Pseudo-Random Math — **CLEAR** ✅

Zero matches found. No heuristic `Date.now() %` math patterns present in the codebase.

---

## 🔴 SUMMARY TABLE OF ALL VIOLATIONS

| # | File Path | Line(s) | Offending Snippet | Target Category |
|---|-----------|---------|-------------------|-----------------|
| 1 | `src/app/pages/test/components/speech-test/speech-test.component.ts` | 78, 104, 210-231 | `runSimulatedAnalysis()` + `Math.random() * ...` | **Random / Mock** |
| 2 | `src/app/services/motion-sensor.service.ts` | 481-486 | `Math.random()` for tremor PD status, frequency, amplitude | **Random** |
| 3 | `src/app/services/motion-sensor.service.ts` | 525-526 | `Math.random()` for tremor risk score | **Random** |
| 4 | `src/app/services/motion-sensor.service.ts` | 653-655 | `Math.random()` for gait PD status & CV | **Random** |
| 5 | `src/app/services/motion-sensor.service.ts` | 696 | `Math.random()` for gait risk score | **Random** |
| 6 | `src/app/services/motion-sensor.service.ts` | 700-702 | `Math.random()` for gait walking speed, balance, regularity | **Random** |

---

## ⚠️ CRITICAL FINDING: Simulated Data Leaks Into Real Results

The `motion-sensor.service.ts` methods **do not return cleanly when real data is available.** Even after computing legitimate metrics from sensor data (peak detection, zero-crossing rate, stride time CV), the methods **still inject randomized final values** on lines 696-702. This means:

1. Real sensor data is collected and processed ✓
2. Legitimate intermediate metrics are computed ✓
3. **Those legitimate metrics are then ignored and overwritten with `Math.random()` values** ❌
4. The user is shown fabricated results as if they came from real analysis

---

## 🏁 FINAL VERDICT

```
╔══════════════════════════════════════════════════╗
║  ❌ CERTIFICATION FAILED — NOT 100% PURE        ║
║                                                  ║
║  Math.random:                 22 occurrences     ║
║  Mock/Simulated methods:       3 occurrences     ║
║  Hardcoded fallback arrays:    0 (clean)         ║
║  Date.now() % math:            0 (clean)         ║
║                                                  ║
║  STATUS: CONTAMINATED                            ║
║  Remediation required before production use.     ║
╚══════════════════════════════════════════════════╝
```

**Immediate actions needed:**
1. Remove `runSimulatedAnalysis()` from `speech-test.component.ts` — fail genuinely or show a "data unavailable" state
2. Remove ALL `Math.random()` fallback logic from `analyzeTremorInternal()` and `analyzeGaitInternal()` in `motion-sensor.service.ts`
3. Either require sufficient real sensor data or return a clean "insufficient data" result — never fabricate scores