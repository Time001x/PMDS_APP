# Deconstruction Blueprint — `TestPage` → 5 Dumb Components + 2 Services

> **Target Architecture:**
> 1. `services/motion-sensor.service.ts` — DeviceMotion, accelerometer, tremor & gait raw data + math
> 2. `services/audio-capture.service.ts` — Mic, AudioContext, getUserMedia, speech pitch/volume math
> 3. `components/speech-test/` — Pure UI for Speech 3-stage flow
> 4. `components/tremor-test/` — Pure UI for Tremor test flow
> 5. `components/finger-tap-test/` — Pure UI for Finger tapping (touch canvas, circle alternation)
> 6. `components/gait-test/` — Pure UI for Gait/walking test flow
> 7. `components/updrs-questionnaire/` — 20-question array, stepper, scoring
> 8. `test.page.ts` — Keeps ONLY: `activeTab`, overall step orchestration, `DbService` calls

---

## Legend

| Column | Meaning |
|---|---|
| **Destination** | Which file/component owns this after refactor |
| **Category** | `State` = reactive UI property; `Hardware API` = browser/native sensor call; `UI Logic` = view interaction; `Pure Math` = calculation with no side effects; `Orch` = orchestration routing calls; `Lifecycle` = Angular lifecycle |
| **Decoupling Notes / Risks** | What must be migrated carefully, what could break, dependency concerns |

---

## Full Blueprint Table

| # | Original Property / Method | Target Destination | Category | Decoupling Notes / Risks |
|---|---|---|---|---|
| 1 | `Math = Math` | **`test.page.ts`** (delete — unused alias) | N/A | Dead code. Safe to remove entirely. |
| 2 | `currentUser` | **`test.page.ts`** | `State` | Needed for `db.getSession()`, `session.uid`. Keep in orchestrator. |
| 3 | `currentView` | **`test.page.ts`** | `State` | Orchestrator-level view routing (`menu \| test \| history \| result`). |
| 4 | `currentTestId` | **`test.page.ts`** | `State` | Orchestrator-level. Determines which child component to show. |
| 5 | `backStack` | **`test.page.ts`** | `State` | Navigation breadcrumb. Orchestrator concern. |
| 6 | `sensorState.speech` (entire sub-object) | **`services/audio-capture.service.ts`** | `Hardware API` / `State` | **Risk**: Migrate all MediaRecorder, AudioContext, stream, analyser, timer fields. The service must expose an `AudioCaptureState` observable. |
| 7 | `sensorState.tremor` (entire sub-object) | **`services/motion-sensor.service.ts`** | `Hardware API` / `State` | **Risk**: The `listener`, `countdown`, `simInterval`, `checkInterval` must be private to service. Service emits `TremorSample[]` via Observable. |
| 8 | `sensorState.gait` (entire sub-object) | **`services/motion-sensor.service.ts`** | `Hardware API` / `State` | Same pattern as tremor. `listener`, `countdown`, `simInterval` become private service internals. |
| 9 | `tapData: TapDataPoint[]` | **`components/finger-tap-test/`** | `State` | Touch event data. Only relevant to finger UI component. |
| 10 | `tapActive` | **`components/finger-tap-test/`** | `State` | Mirrors `fingerStarted`. Redundant — consolidate. |
| 11 | `tapCountdown` | **`components/finger-tap-test/`** | `State` / `UI Logic` | Countdown timer for finger test. Local to component. |
| 12 | `qIndex` | **`components/updrs-questionnaire/`** | `State` | Questionnaire stepper index. Move entirely. |
| 13 | `testMenuData` | **`test.page.ts`** | `State` | Derived from `testConfig.getTestList()` + `sessionScores`. Orchestrator generates menu data, passes to a `<app-test-menu>` sub-component if desired, but per spec it stays in `test.page.ts` since no dedicated menu component was listed. Keep here. |
| 14 | `historyData` | **`test.page.ts`** | `State` | Orchestrator-level history. `DbService` integration. |
| 15 | `historySummary` | **`test.page.ts`** | `State` | Derived from history. Keep in orchestrator. |
| 16 | `resultData` | **`test.page.ts`** | `State` | Result view data. Orchestrator-level. |
| 17 | `speechStage` | **`components/speech-test/`** | `State` | Core speech flow state (1→2→3). Move to speech component. |
| 18 | `speechTimer` | **`components/speech-test/`** | `State` | Countdown display. Component-local. |
| 19 | `speechStatus` | **`components/speech-test/`** | `State` | Status string for UI binding. Component-local. |
| 20 | `speechStageTitle` | **`components/speech-test/`** | `State` | Template-bound. Component-local. |
| 21 | `speechStageDesc` | **`components/speech-test/`** | `State` | Template-bound. Component-local. |
| 22 | `speechResults` | **`components/speech-test/`** | `State` | Analysis results emitted after all 3 stages. Emit via `@Output()` to parent when complete. |
| 23 | `speechStageDone` | **`components/speech-test/`** | `State` | Array `[false, false, false]`. Component-local. |
| 24 | `speechRecordedData` | **`components/speech-test/`** | `State` | Intermediate per-stage analysis data. Component-local. |
| 25 | `speechAllDone` | **`components/speech-test/`** | `State` | Boolean flag. Component-local. |
| 26 | `tremorTimer` | **`components/tremor-test/`** | `State` | Countdown display. Component-local. |
| 27 | `tremorStatus` | **`components/tremor-test/`** | `State` | Status string. Component-local. |
| 28 | `tremorDone` | **`components/tremor-test/`** | `State` | Boolean flag. Component-local. |
| 29 | `tremorResults` | **`components/tremor-test/`** | `State` | Analysis results. Emit via `@Output()` when done. |
| 30 | `gaitTimer` | **`components/gait-test/`** | `State` | Countdown display. Component-local. |
| 31 | `gaitStatus` | **`components/gait-test/`** | `State` | Status string. Component-local. |
| 32 | `gaitStarted` | **`components/gait-test/`** | `State` | Boolean flag. Component-local. |
| 33 | `gaitDone` | **`components/gait-test/`** | `State` | Boolean flag. Component-local. |
| 34 | `gaitResults` | **`components/gait-test/`** | `State` | Analysis results. Emit via `@Output()`. |
| 35 | `fingerTimer` | **`components/finger-tap-test/`** | `State` | Countdown display (`number \| string`). Component-local. |
| 36 | `fingerCount` | **`components/finger-tap-test/`** | `State` | Tap counter. Component-local. |
| 37 | `fingerSpeed` | **`components/finger-tap-test/`** | `State` | Derived display string. Component-local. |
| 38 | `fingerStarted` | **`components/finger-tap-test/`** | `State` | Boolean flag. Component-local. |
| 39 | `fingerHand` | **`components/finger-tap-test/`** | `State` | `'right' \| 'left'`. Component-local. |
| 40 | `fingerPhase` | **`components/finger-tap-test/`** | `State` | Phase 0–3. Component-local. |
| 41 | `fingerCircleActive` | **`components/finger-tap-test/`** | `State` | 1 or 2. Alternating circle. Component-local. |
| 42 | `fingerLastTap` | **`components/finger-tap-test/`** | `State` | Timestamp for inter-tap interval calc. Component-local. |
| 43 | `fingerTaps` | **`components/finger-tap-test/`** | `State` | `{ right: [], left: [] }`. Component-local. |
| 44 | `fingerTapTimes` | **`components/finger-tap-test/`** | `State` | Array of intervals. Component-local. |
| 45 | `fingerInterval` | **`components/finger-tap-test/`** | `State` / `UI Logic` | `setInterval` reference. Component-local. |
| 46 | `fingerResults` | **`components/finger-tap-test/`** | `State` | Final results. Emit via `@Output()`. |
| 47 | `fingerCorrectCount` | **`components/finger-tap-test/`** | `State` | Scoring data. Component-local. |
| 48 | `fingerTotalTaps` | **`components/finger-tap-test/`** | `State` | Scoring data. Component-local. |
| 49 | `fingerTested` | **`components/finger-tap-test/`** | `State` | `{ right: false, left: false }`. Component-local. |
| 50 | `currentQuestion` | **`components/updrs-questionnaire/`** | `State` | Current question object. Component-local. |
| 51 | `questionProgress` | **`components/updrs-questionnaire/`** | `State` | Progress string. Component-local. |
| 52 | `questionsCompleted` | **`components/updrs-questionnaire/`** | `State` | Completion flag. Emit via `@Output()`. |
| 53 | `qPart` | **`components/updrs-questionnaire/`** | `State` | Part 1 or 2. Component-local. |
| 54 | `qSelectedScore` | **`components/updrs-questionnaire/`** | `State` | Selected score 0–4. Component-local. |
| 55 | `qPercent` | **`components/updrs-questionnaire/`** | `State` | Progress percent. Component-local. |
| 56 | `partIScore` | **`components/updrs-questionnaire/`** | `State` | Part I subtotal. Component-local. |
| 57 | `partIIScore` | **`components/updrs-questionnaire/`** | `State` | Part II subtotal. Component-local. |
| 58 | `totalQScore` | **`components/updrs-questionnaire/`** | `State` | Combined total. Emit via `@Output()`. |
| 59 | `qAnswers` | **`components/updrs-questionnaire/`** | `State` | Array of answers. Component-local. |
| 60 | `resultRingPercent` | **`test.page.ts`** | `State` | Final result ring display. Orchestrator-level. |
| 61 | `resultColor` | **`test.page.ts`** | `State` | Color derived from risk score. Orchestrator-level. |
| 62 | `resultLabel` | **`test.page.ts`** | `State` | Risk level label. Orchestrator-level. |
| 63 | `resultScores` | **`test.page.ts`** | `State` | Per-test score array for result view. Orchestrator-level. |
| 64 | `modalVisible` | **`test.page.ts`** | `State` | Generic modal. Orchestrator-level. If reused heavily, could become a standalone `ModalComponent`. |
| 65 | `modalHtml` | **`test.page.ts`** | `State` | Modal inner HTML. Security risk if untrusted. Consider refactoring to component-based modal. |
| 66 | `nextTestPrompt` | **`test.page.ts`** | `State` | Prompt state after saving a score. Orchestrator-level. |
| 67 | `remainingTestsCount` | **`test.page.ts`** | `State` | Derived count. Orchestrator-level. |
| 68 | `nextTestName` | **`test.page.ts`** | `State` | Next test name string. Orchestrator-level. |
| 69 | `nextTestId` | **`test.page.ts`** | `State` | Next test id. Orchestrator-level. |
| 70 | `saveScore$` | **`test.page.ts`** | `Orch` / `RxJS` | **Keep in orchestrator.** Sequential RxJS save queue using `concatMap`. Orchestrator receives `@Output()` events from child components, pushes to this Subject. |
| 71 | `destroy$` | **`test.page.ts`** | `Orch` / `RxJS` | Cleanup Subject. Keep in orchestrator. |
| 72 | `toastMessage` | **`test.page.ts`** (or shared `ToastService`) | `State` | Toast UI. Could be extracted into a standalone `ToastService` + `ToastComponent`. For minimal refactor, keep in orchestrator. |
| 73 | `toastVisible` | **`test.page.ts`** (or shared `ToastService`) | `State` | Toast visibility flag. |
| 74 | `toastTimeout` | **`test.page.ts`** (or shared `ToastService`) | `State` / `UI Logic` | Timer reference for auto-dismiss. |
| 75 | `MDS_QUESTIONS` (readonly array, 20 items) | **`components/updrs-questionnaire/`** | `Data` / `Pure Data` | Constant data. Belongs in questionnaire component (or a shared constants file imported by component). No side effects. |
| 76 | `allTestsDone` | **`test.page.ts`** | `State` | Boolean flag. Orchestrator-level. Used by `renderTestMenu()`. |
| 77 | `constructor(db, testConfig, router, route, ngZone)` | **`test.page.ts`** (inject only `DbService`, `TestConfigService`, `Router`, `ActivatedRoute`) | `Orch` / `DI` | **Risk**: Remove `ngZone` dependency from orchestrator once child components handle their own `ngZone.run()`. Child components should inject `NgZone` locally. |
| 78 | `ngOnInit()` | **`test.page.ts`** | `Lifecycle` / `Orch` | Orchestrator initializes session check, RxJS save queue subscription, and query param routing. **Risk**: The route subscription logic (`params.type` → `startTest()`) is orchestration and stays. |
| 79 | `ngOnDestroy()` | **`test.page.ts`** (calls `stopAllSensors`) | `Lifecycle` | **Risk**: The orchestrator must have a hook to tell each child component / service to stop sensors. Use a shared cleanup method. |
| 80 | `navTo(page)` | **`test.page.ts`** | `UI Logic` / `Orch` | Simple `router.navigateByUrl()`. Stays in orchestrator. |
| 81 | `handleBack()` | **`test.page.ts`** | `Orch` / `UI Logic` | **Risk**: Contains 5 conditional blocks that each calculate `riskScore` and call `saveTestScore()` for each test type. This is orchestrator-level orchestration. However, the `riskScore` math (e.g., `(100 - quality) / 100 * 1.2`) should be moved to the respective child component or a shared utility. The orchestrator should receive the pre-calculated `riskScore` via `@Output()` from each child, not re-derive it. |
| 82 | `showToast(msg, type)` | **`test.page.ts`** (or `ToastService`) | `UI Logic` | Toast display. Keep in orchestrator or extract to shared service. |
| 83 | `renderTestMenu()` | **`test.page.ts`** | `UI Logic` / `Orch` | Generates menu data from `testConfig` + `db`. Orchestrator-level. |
| 84 | `startTest(id)` | **`test.page.ts`** | `Orch` | **Risk**: Contains a massive `switch(id)` that resets 5 different groups of UI state. This must be refactored: each component initializes its own state via `ngOnInit()` / `ngOnChanges()`. Orchestrator only sets `currentTestId`. |
| 85 | `getSpeechStagePrompt()` | **`components/speech-test/`** | `UI Logic` / `Pure Data` | Returns prompt string based on stage. Component-local template helper. |
| 86 | `toggleSpeechRecord()` | **`components/speech-test/`** | `UI Logic` | Delegates to start/stop. Component-local. |
| 87 | `startSpeechRecord()` | **`services/audio-capture.service.ts`** (hardware) + **`components/speech-test/`** (state mgmt) | `Hardware API` + `UI Logic` | **Risk**: Currently tightly coupled. The `getUserMedia`, `AudioContext`, `MediaRecorder` setup lives in component. Must extract hardware calls to service. Component calls `audioCaptureService.start()`, gets back observable/state for recording status. |
| 88 | `stopSpeechRecord()` | **`services/audio-capture.service.ts`** (cleanup) + **`components/speech-test/`** (state update) | `Hardware API` + `UI Logic` | Same split. Service cleans up hardware, component updates UI state. |
| 89 | `analyzeSpeech()` | **`services/audio-capture.service.ts`** (analysis math) + **`components/speech-test/`** (stage orchestration) | `Pure Math` + `UI Logic` | **Risk**: Contains both pure math (risk calculation for each stage) AND stage navigation logic (increment stage, update titles, decide if all done). Split: service returns `SpeechAnalysisResult`, component decides stage flow. |
| 90 | `saveSpeechResultsAndProceed()` | **`components/speech-test/`** (emit via `@Output()`) → **`test.page.ts`** (save) | `UI Logic` / `Orch` | Component emits `saveRequest` event with `riskScore`. Orchestrator calls `saveTestScore()`. |
| 91 | `nextSpeechStage()` | **`components/speech-test/`** | `UI Logic` | Stage navigation. Component-local. |
| 92 | `restartSpeechTest()` | **`components/speech-test/`** | `UI Logic` | Reset all speech state. Component-local. |
| 93 | `startTremorTest()` | **`services/motion-sensor.service.ts`** (hardware) + **`components/tremor-test/`** (state start) | `Hardware API` + `UI Logic` | **Risk**: Contains DeviceMotion permission check, event listener setup, AND fallback to simulated data. Service should encapsulate all of this. Component calls `motionSensorService.startTremorMonitoring()`. |
| 94 | `useSimulatedTremor()` | **`services/motion-sensor.service.ts`** | `Hardware API` / `Pure Math` | Fallback generator. Service internal. |
| 95 | `startTremorCountdown()` | **`components/tremor-test/`** (timer) + **`services/motion-sensor.service.ts`** (duration param) | `UI Logic` / `Orch` | Timer is UI concern. Service receives duration as parameter, stops automatically after N seconds. |
| 96 | `stopTremorTest()` | **`services/motion-sensor.service.ts`** (cleanup) + **`components/tremor-test/`** (state stop) | `Hardware API` + `UI Logic` | Service removes listeners, clears intervals. Component updates UI. |
| 97 | `analyzeTremor()` | **`services/motion-sensor.service.ts`** | `Pure Math` | Frequency analysis, zero-crossings, RMS, severity calculation. **Risk**: The random fallback (`Math.random() < 0.3` for PD) is simulation logic — keep in service but clearly demarcated. |
| 98 | `startFingerTestPhase()` | **`components/finger-tap-test/`** | `UI Logic` | Countdown + timer setup. Component-local. |
| 99 | `onFingerTap(circleNum)` | **`components/finger-tap-test/`** | `UI Logic` | Touch event handler. Component-local. |
| 100 | `endFingerPhase()` | **`components/finger-tap-test/`** | `UI Logic` / `Pure Math` | Scoring per-hand. Component-local. |
| 101 | `calculateFingerResults()` | **`components/finger-tap-test/`** | `Pure Math` | Aggregate both hands, create display items. Component-local. |
| 102 | `getFingerRingDash()` | **`components/finger-tap-test/`** | `UI Logic` / `Pure Math` | SVG ring dash calculation. Component-local template helper. |
| 103 | `startGaitTest()` | **`services/motion-sensor.service.ts`** (hardware) + **`components/gait-test/`** (state) | `Hardware API` + `UI Logic` | Same pattern as tremor. Service handles DeviceMotion permission + listener + simulation. |
| 104 | `useSimulatedGait()` | **`services/motion-sensor.service.ts`** | `Hardware API` / `Pure Math` | Simulation logic. Service internal. |
| 105 | `startGaitCountdown()` | **`components/gait-test/`** (timer) | `UI Logic` | Timer is component concern. |
| 106 | `stopGaitTest()` | **`services/motion-sensor.service.ts`** (cleanup) + **`components/gait-test/`** (state) | `Hardware API` + `UI Logic` | Service cleans up hardware. Component updates UI. |
| 107 | `analyzeGait()` | **`services/motion-sensor.service.ts`** | `Pure Math` | Peak detection, stride time, coefficient of variation, risk score. **Risk**: contains `Math.random()` simulation — keep in service. |
| 108 | `selectScore(score)` | **`components/updrs-questionnaire/`** | `UI Logic` | Score selection. Component-local. |
| 109 | `confirmAnswer()` | **`components/updrs-questionnaire/`** | `UI Logic` | Validate + advance. Component-local. |
| 110 | `finishQuestionnaire()` | **`components/updrs-questionnaire/`** | `Pure Math` | Sum scores. Component-local. Emit totals via `@Output()`. |
| 111 | `saveQuestionnaireAndBack()` | **`components/updrs-questionnaire/`** (emit) → **`test.page.ts`** (save) | `Orch` | Component emits `saveRequest` with `totalQScore`. Orchestrator normalizes and calls `saveTestScore()`. |
| 112 | `getScoreColor(score, max)` | **`components/updrs-questionnaire/`** | `UI Logic` / `Pure Math` | Color calculation. Component-local template helper. |
| 113 | `saveTestScore(testId, score)` | **`test.page.ts`** | `Orch` / `RxJS` | Pushes to `saveScore$` Subject. Core orchestrator function. |
| 114 | `showFinalResult()` | **`test.page.ts`** | `Orch` / `UI Logic` | Aggregates session scores, calls `calculateTotalRisk`, saves history, clears session. Orchestrator-level. |
| 115 | `restartTests()` | **`test.page.ts`** | `Orch` | Clears session scores, re-renders menu. Orchestrator-level. |
| 116 | `renderHistory()` | **`test.page.ts`** | `Orch` / `UI Logic` | Loads history from DB, sets `historyData` / `historySummary`. Orchestrator-level. |
| 117 | `getTestListForHistory()` | **`test.page.ts`** (or shared constants) | `Pure Data` | Returns static test metadata array. Could become a shared constant file. |
| 118 | `getTestList()` | **`test.page.ts`** | `UI Logic` | Delegates to `getTestListForHistory()`. Orchestrator-level template helper. |
| 119 | `onModalSheetClick(event)` | **`test.page.ts`** | `UI Logic` | Modal interaction. Orchestrator-level. |
| 120 | `viewHistoryDetail(h)` | **`test.page.ts`** | `UI Logic` | Generates HTML for modal detail view. **Risk**: Inline HTML strings are fragile and a security (XSS) concern. Refactor to a proper `HistoryDetailComponent`. For now, stays in orchestrator. |
| 121 | `stopAllSensors()` | **`test.page.ts`** (orchestrator calls) + **`services/audio-capture.service.ts`** + **`services/motion-sensor.service.ts`** | `Orch` / `Hardware API` | **Risk**: Currently tries to clean everything inline. Must delegate: `audioCaptureService.stop()`, `motionSensorService.stopAll()`. |
| 122 | `showModal(html)` | **`test.page.ts`** | `UI Logic` | Modal open. Orchestrator-level. |
| 123 | `closeModal()` | **`test.page.ts`** | `UI Logic` | Modal close. Orchestrator-level. |
| 124 | `getRingDashArray()` | **`test.page.ts`** | `UI Logic` / `Pure Math` | SVG ring dash for result page. Orchestrator-level template helper. |
| 125 | `getSpeechRateBarWidth()` | **`components/speech-test/`** | `UI Logic` / `Pure Math` | Bar width calculation. Component-local template helper. |
| 126 | `getSpeechResultRingDash()` | **`components/speech-test/`** | `UI Logic` / `Pure Math` | SVG ring dash. Component-local template helper. |
| 127 | `getGaitRingDash()` | **`components/gait-test/`** | `UI Logic` / `Pure Math` | SVG ring dash. Component-local template helper. |
| 128 | `getTremorRingDash()` | **`components/tremor-test/`** | `UI Logic` / `Pure Math` | SVG ring dash. Component-local template helper. |

---

## Summary Statistics

| Destination | Items Mapped |
|---|---|
| **`test.page.ts`** (orchestrator only) | 26 items (ctor, lifecycle, view routing, save queue, nav, menu, history, result, modal) |
| **`services/audio-capture.service.ts`** | 10 items (mic, AudioContext, MediaRecorder, getUsermedia, speech analysis math) |
| **`services/motion-sensor.service.ts`** | 16 items (DeviceMotion, tremor listener, gait listener, simulation intervals, FFT math) |
| **`components/speech-test/`** | 22 items (3-stage state + all template helpers) |
| **`components/tremor-test/`** | 10 items (timer, status, results, ring dash helper) |
| **`components/finger-tap-test/`** | 23 items (full tap state, touch handler, per-hand scoring, SVG helpers) |
| **`components/gait-test/`** | 9 items (timer, status, results, ring dash helper) |
| **`components/updrs-questionnaire/`** | 17 items (MDS_QUESTIONS data, stepper state, scoring logic, color helper) |

---

## Key Architectural Principles for the Refactor

1. **Services own Hardware + Pure Math**: Both `audio-capture.service.ts` and `motion-sensor.service.ts` expose clean Observable-based APIs. Child components subscribe to state streams and call start/stop methods.
2. **Child components own UI State**: All `speech*`, `tremor*`, `gait*`, `finger*`, `q*` properties migrate into `@Input()` / local state. No `sensorState` leakage.
3. **Child components emit events upward**: Each component outputs `testComplete` or `saveRequest` events containing the pre-calculated `riskScore` / `totalQScore`. The orchestrator never re-derives these.
4. **Orchestrator (`test.page.ts`) becomes a coordinator shell**: It manages `currentView`, `currentTestId`, the `saveScore$` queue, `DbService` calls, and top-level navigation. It no longer knows about `speechStage`, `tremorTimer`, etc.
5. **`stopAllSensors()`** becomes: call `audioCaptureService.stop()` + `motionSensorService.stopAll()`.
6. **`startTest(id)`** becomes a simple `currentTestId = id` setter. Each child component reads the test ID via `@Input()` and self-initializes in `ngOnInit()` / `ngOnChanges()`.
7. **Modal and Toast** remain in the orchestrator for now but could be extracted later into a shared UI module.
8. **`Math = Math`** — delete entirely (orphan alias).
9. **`handleBack()`** — the 5 conditional blocks with `riskScore` recalculation are eliminated. The orchestrator receives pre-calculated scores from child `@Output()` events and stores them. `handleBack()` simply pops the view stack.