import { Injectable, NgZone, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface MotionSensorState {
  permission: boolean | null;
  activeMode: 'idle' | 'tremor' | 'gait';
  accX: number;
  accY: number;
  accZ: number;
  error: string | null;
  timeRemaining: number;
  status: string;
}

export interface MotionSample {
  ax: number; ay: number; az: number; total: number; t: number;
}

export interface TremorSample {
  ax: number; ay: number; az: number; total: number; t: number;
}

export interface TremorAnalysisResult {
  frequency: string;
  severity: string;
  duration: number;
  freqPercent: number;
  freqColor: string;
  severityPercent: number;
  severityColor: string;
  totalScore: number;
}

export interface GaitSample {
  ax: number; ay: number; az: number; total: number; t: number;
}

export interface GaitAnalysisResult {
  walkingSpeed: number;
  walkingSpeedLabel: string;
  balanceScore: number;
  balanceLabel: string;
  regularity: number;
  regularityLabel: string;
  totalScore: number;
}

const DEFAULT_STATE: MotionSensorState = {
  permission: null,
  activeMode: 'idle',
  accX: 0, accY: 0, accZ: 0,
  error: null,
  timeRemaining: 0,
  status: '',
};

const TREMOR_DURATION = 15;
const GAIT_DURATION = 20;

@Injectable({ providedIn: 'root' })
export class MotionSensorService {
  private readonly stateSubject = new BehaviorSubject<MotionSensorState>({ ...DEFAULT_STATE });
  readonly state$: Observable<MotionSensorState> = this.stateSubject.asObservable();

  get state(): MotionSensorState {
    return this.stateSubject.value;
  }

  // ── ผล analysis แยก Subject ของตัวเอง ────────────────────────
  // ป้องกัน race condition: component ไม่ต้อง "เดา" จาก activeMode
  // อีกต่อไป แต่รอผลตรงจาก Subject นี้แทน ไม่ว่าจะ auto-stop
  // (countdown หมดเอง) หรือ manual-stop (ผู้ใช้กดเอง) ก็ได้ผลแน่นอน
  private readonly tremorResultSubject = new Subject<TremorAnalysisResult>();
  readonly tremorResult$: Observable<TremorAnalysisResult> = this.tremorResultSubject.asObservable();

  private readonly gaitResultSubject = new Subject<GaitAnalysisResult>();
  readonly gaitResult$: Observable<GaitAnalysisResult> = this.gaitResultSubject.asObservable();

  readonly permission = signal<boolean | null>(null);
  readonly activeMode = signal<'idle' | 'tremor' | 'gait'>('idle');
  readonly accX = signal(0);
  readonly accY = signal(0);
  readonly accZ = signal(0);
  readonly error = signal<string | null>(null);
  readonly timeRemaining = signal(0);
  readonly status = signal('');

  private tremorData: TremorSample[] = [];
  private gaitData: GaitSample[] = [];

  private tremorListener: ((event: DeviceMotionEvent) => void) | null = null;
  private gaitListener: ((event: DeviceMotionEvent) => void) | null = null;

  private tremorWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private gaitWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private tremorDataReceived = false;
  private gaitDataReceived = false;

  private tremorCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private gaitCountdownTimer: ReturnType<typeof setInterval> | null = null;

  // guard ป้องกันการ stop/analysis ซ้ำซ้อน
  private tremorStopping = false;
  private gaitStopping = false;

  constructor(private readonly ngZone: NgZone) {}

  // ── Public API — Tremor ────────────────────────────────────

  async startTremorTest(): Promise<boolean> {
    if (this.state.activeMode !== 'idle') {
      throw new Error('A motion test is already active');
    }

    this.tremorData = [];
    this.tremorDataReceived = false;
    this.tremorStopping = false;
    this.updateState({
      activeMode: 'tremor',
      error: null,
      status: '🔴 กำลังบันทึกข้อมูล... ถือให้นิ่ง',
    });

    if (typeof DeviceMotionEvent === 'undefined') {
      this.abortTest('tremor', 'ไม่สามารถอ่านค่าเซ็นเซอร์ความเร่งได้ กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
      throw new Error('DeviceMotionEvent is not supported on this device');
    }

    const permissionFn = (DeviceMotionEvent as any).requestPermission;
    if (typeof permissionFn === 'function') {
      try {
        const result: string = await permissionFn.call(DeviceMotionEvent);
        if (result !== 'granted') {
          this.updateState({ permission: false });
          this.abortTest('tremor', 'ไม่ได้รับอนุญาตเข้าถึงเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
          throw new Error('DeviceMotion permission denied');
        }
        this.updateState({ permission: true });
      } catch (_err) {
        this.updateState({ permission: false });
        this.abortTest('tremor', 'ไม่ได้รับอนุญาตเข้าถึงเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
        throw new Error('DeviceMotion permission denied');
      }
    } else {
      this.updateState({ permission: true });
    }

    this.attachTremorListener();
    this.startTremorWatchdog();

    return true;
  }

  /**
   * หยุดการวัด tremor — ใช้ได้ทั้งจาก auto-stop (countdown) และ
   * manual-stop (component เรียกเอง) ผล analysis จะถูก emit ผ่าน
   * tremorResult$ เสมอ ไม่ว่าจะถูกเรียกจากทางไหนก็ตาม
   */
  stopTremorTest(): TremorAnalysisResult | null {
    if (this.state.activeMode !== 'tremor') {
      return null;
    }
    if (this.tremorStopping) {
      return null; // ป้องกันเรียกซ้ำ
    }
    this.tremorStopping = true;

    this.clearTremorTimers();
    this.detachTremorListener();
    this.updateState({ activeMode: 'idle' });

    const result = this.analyzeTremorInternal();

    // ── emit ผลผ่าน Subject เสมอ ──────────────────────────────
    this.ngZone.run(() => {
      this.tremorResultSubject.next(result);
    });

    this.tremorStopping = false;
    return result;
  }

  // ── Public API — Gait ──────────────────────────────────────

  async startGaitTest(): Promise<boolean> {
    if (this.state.activeMode !== 'idle') {
      throw new Error('A motion test is already active');
    }

    this.gaitData = [];
    this.gaitDataReceived = false;
    this.gaitStopping = false;
    this.updateState({
      activeMode: 'gait',
      error: null,
      status: '🔴 กำลังบันทึก — เริ่มเดินได้เลย',
    });

    if (typeof DeviceMotionEvent === 'undefined') {
      this.abortTest('gait', 'ไม่สามารถอ่านค่าเซ็นเซอร์ความเร่งได้ กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
      throw new Error('DeviceMotionEvent is not supported on this device');
    }

    const permissionFn = (DeviceMotionEvent as any).requestPermission;
    if (typeof permissionFn === 'function') {
      try {
        const result: string = await permissionFn.call(DeviceMotionEvent);
        if (result !== 'granted') {
          this.updateState({ permission: false });
          this.abortTest('gait', 'ไม่ได้รับอนุญาตเข้าถึงเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
          throw new Error('DeviceMotion permission denied');
        }
        this.updateState({ permission: true });
      } catch (_err) {
        this.updateState({ permission: false });
        this.abortTest('gait', 'ไม่ได้รับอนุญาตเข้าถึงเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
        throw new Error('DeviceMotion permission denied');
      }
    } else {
      this.updateState({ permission: true });
    }

    this.attachGaitListener();
    this.startGaitWatchdog();

    return true;
  }

  stopGaitTest(): GaitAnalysisResult | null {
    if (this.state.activeMode !== 'gait') {
      return null;
    }
    if (this.gaitStopping) {
      return null;
    }
    this.gaitStopping = true;

    this.clearGaitTimers();
    this.detachGaitListener();
    this.updateState({ activeMode: 'idle' });

    const result = this.analyzeGaitInternal();

    this.ngZone.run(() => {
      this.gaitResultSubject.next(result);
    });

    this.gaitStopping = false;
    return result;
  }

  // ── Permission helpers ──────────────────────────────────────

  isDeviceMotionSupported(): boolean {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  requiresIosPermission(): boolean {
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    );
  }

  // ── Universal cleanup ────────────────────────────────────────

  stopAll(): void {
    this.detachTremorListener();
    this.detachGaitListener();
    this.clearTremorTimers();
    this.clearGaitTimers();
    this.tremorData = [];
    this.gaitData = [];
    this.tremorStopping = false;
    this.gaitStopping = false;
    this.stateSubject.next({ ...DEFAULT_STATE });
    this.syncSignals(DEFAULT_STATE);
  }

  cleanup(): void {
    this.stopAll();
  }

  // ── Internal — Tremor Listener ───────────────────────────────

  private attachTremorListener(): void {
    let lastUpdate = 0;
    const updateInterval = 50;

    this.tremorListener = (event: DeviceMotionEvent) => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return;
      lastUpdate = now;

      const acc = event.accelerationIncludingGravity || event.acceleration;
      const rawX = acc?.x ?? 0;
      const rawY = acc?.y ?? 0;
      const rawZ = acc?.z ?? 0;

      const ax = Math.round(rawX * 100) / 100;
      const ay = Math.round(rawY * 100) / 100;
      const az = Math.round(rawZ * 100) / 100;
      const total = Math.sqrt(ax * ax + ay * ay + az * az);

      if (!this.tremorDataReceived && (ax !== 0 || ay !== 0 || az !== 0)) {
        this.tremorDataReceived = true;
        this.clearWatchdogTimer('tremor');
      }

      this.tremorData.push({ ax, ay, az, total, t: now });

      this.ngZone.run(() => {
        this.updateState({ accX: ax, accY: ay, accZ: az });
      });
    };

    window.addEventListener('devicemotion', this.tremorListener, { passive: true });
    this.startTremorCountdown();
  }

  private detachTremorListener(): void {
    if (this.tremorListener) {
      window.removeEventListener('devicemotion', this.tremorListener);
      this.tremorListener = null;
    }
  }

  // ── Internal — Tremor Watchdog ────────────────────────────────

  private startTremorWatchdog(): void {
    this.clearWatchdogTimer('tremor');
    this.tremorWatchdogTimer = setTimeout(() => {
      if (!this.tremorDataReceived) {
        this.ngZone.run(() => {
          this.abortTest('tremor', 'ไม่ได้รับข้อมูลจากเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
        });
      }
    }, 1500);
  }

  // ── Internal — Tremor Countdown ───────────────────────────────

  private startTremorCountdown(): void {
    let remaining = TREMOR_DURATION;
    this.updateState({ timeRemaining: remaining });
    this.ngZone.runOutsideAngular(() => {
      this.tremorCountdownTimer = setInterval(() => {
        remaining--;
        this.ngZone.run(() => {
          this.updateState({ timeRemaining: remaining });
          if (remaining <= 0) {
            if (this.tremorCountdownTimer !== null) {
              clearInterval(this.tremorCountdownTimer);
              this.tremorCountdownTimer = null;
            }
            // auto-stop: ผล analysis จะถูก emit ผ่าน tremorResultSubject
            this.stopTremorTest();
          }
        });
      }, 1000);
    });
  }

  private clearTremorTimers(): void {
    if (this.tremorCountdownTimer !== null) {
      clearInterval(this.tremorCountdownTimer);
      this.tremorCountdownTimer = null;
    }
    if (this.tremorWatchdogTimer !== null) {
      clearTimeout(this.tremorWatchdogTimer);
      this.tremorWatchdogTimer = null;
    }
  }

  // ── Internal — Tremor Analysis ────────────────────────────────

  private analyzeTremorInternal(): TremorAnalysisResult {
    const data = this.tremorData;

    if (data.length <= 10) {
      return {
        frequency: '0.0', severity: '0.000', duration: TREMOR_DURATION,
        freqPercent: 0, freqColor: '#9CA3AF',
        severityPercent: 0, severityColor: '#9CA3AF', totalScore: 0,
      };
    }

    const axData = data.map((d) => d.ax);
    const rmsX = Math.sqrt(axData.reduce((sum, x) => sum + x * x, 0) / axData.length);
    const amplitude = rmsX.toFixed(3);
    const severityNum = parseFloat(amplitude);

    let zeroCrossings = 0;
    const meanAx = axData.reduce((a, b) => a + b, 0) / axData.length;
    for (let i = 1; i < axData.length; i++) {
      if (
        (axData[i - 1] - meanAx >= 0 && axData[i] - meanAx < 0) ||
        (axData[i - 1] - meanAx < 0 && axData[i] - meanAx >= 0)
      ) {
        zeroCrossings++;
      }
    }
    const durationSeconds = (data[data.length - 1].t - data[0].t) / 1000;
    let dominantFreq = '0.0';
    if (durationSeconds > 0) {
      dominantFreq = (zeroCrossings / 2 / durationSeconds).toFixed(1);
    }
    const freqNum = parseFloat(dominantFreq);

    if (isNaN(freqNum) || isNaN(severityNum) || severityNum === 0) {
      return {
        frequency: '0.0', severity: '0.000', duration: TREMOR_DURATION,
        freqPercent: 0, freqColor: '#9CA3AF',
        severityPercent: 0, severityColor: '#9CA3AF', totalScore: 0,
      };
    }

    const inPDRange = freqNum >= 4 && freqNum <= 6;
    const freqPercent = Math.min(100, (freqNum / 8) * 100);
    const severityPercent = Math.min(100, (severityNum / 2) * 100);
    const freqColor = inPDRange ? '#C10508' : freqNum > 2 ? '#F59E0B' : '#05C134';
    const severityColor = severityNum > 1 ? '#C10508' : severityNum > 0.5 ? '#F59E0B' : '#05C134';

    const riskScore = Math.min(1, (freqNum / 8) * 0.5 + (severityNum / 2) * 0.5);
    const totalScore = Math.round(100 - riskScore * 100);

    return {
      frequency: dominantFreq, severity: amplitude, duration: TREMOR_DURATION,
      freqPercent, freqColor, severityPercent, severityColor, totalScore,
    };
  }

  // ── Internal — Gait Listener ──────────────────────────────────

  private attachGaitListener(): void {
    let lastUpdate = 0;
    const updateInterval = 50;

    this.gaitListener = (event: DeviceMotionEvent) => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return;
      lastUpdate = now;

      const acc = event.accelerationIncludingGravity || event.acceleration;
      const rawX = acc?.x ?? 0;
      const rawY = acc?.y ?? 0;
      const rawZ = acc?.z ?? 0;

      const ax = Math.round(rawX * 100) / 100;
      const ay = Math.round(rawY * 100) / 100;
      const az = Math.round(rawZ * 100) / 100;
      const total = Math.sqrt(ax * ax + ay * ay + az * az);

      if (!this.gaitDataReceived && (ax !== 0 || ay !== 0 || az !== 0)) {
        this.gaitDataReceived = true;
        this.clearWatchdogTimer('gait');
      }

      this.gaitData.push({ ax, ay, az, total, t: now });

      this.ngZone.run(() => {
        this.updateState({ accX: ax, accY: ay, accZ: az });
      });
    };

    window.addEventListener('devicemotion', this.gaitListener, { passive: true });
    this.startGaitCountdown();
  }

  private detachGaitListener(): void {
    if (this.gaitListener) {
      window.removeEventListener('devicemotion', this.gaitListener);
      this.gaitListener = null;
    }
  }

  // ── Internal — Gait Watchdog ──────────────────────────────────

  private startGaitWatchdog(): void {
    this.clearWatchdogTimer('gait');
    this.gaitWatchdogTimer = setTimeout(() => {
      if (!this.gaitDataReceived) {
        this.ngZone.run(() => {
          this.abortTest('gait', 'ไม่ได้รับข้อมูลจากเซ็นเซอร์ความเร่ง กรุณาตรวจสอบสิทธิ์ Motion & Orientation หรือทดสอบบนอุปกรณ์ที่มือถือจริงเท่านั้น');
        });
      }
    }, 1500);
  }

  // ── Internal — Gait Countdown ─────────────────────────────────

  private startGaitCountdown(): void {
    let remaining = GAIT_DURATION;
    this.updateState({ timeRemaining: remaining });
    this.ngZone.runOutsideAngular(() => {
      this.gaitCountdownTimer = setInterval(() => {
        remaining--;
        this.ngZone.run(() => {
          this.updateState({ timeRemaining: remaining });
          if (remaining <= 0) {
            if (this.gaitCountdownTimer !== null) {
              clearInterval(this.gaitCountdownTimer);
              this.gaitCountdownTimer = null;
            }
            this.stopGaitTest();
          }
        });
      }, 1000);
    });
  }

  private clearGaitTimers(): void {
    if (this.gaitCountdownTimer !== null) {
      clearInterval(this.gaitCountdownTimer);
      this.gaitCountdownTimer = null;
    }
    if (this.gaitWatchdogTimer !== null) {
      clearTimeout(this.gaitWatchdogTimer);
      this.gaitWatchdogTimer = null;
    }
  }

  // ── Internal — Gait Analysis ───────────────────────────────────

  private analyzeGaitInternal(): GaitAnalysisResult {
    const data = this.gaitData;

    if (data.length <= 20) {
      return {
        walkingSpeed: 0, walkingSpeedLabel: '0 m/s',
        balanceScore: 0, balanceLabel: '0 คะแนน',
        regularity: 0, regularityLabel: '0%', totalScore: 0,
      };
    }

    const azData = data.map((d) => d.az);
    const threshold = azData.reduce((a, b) => a + b, 0) / azData.length;
    const peaks: number[] = [];

    for (let i = 1; i < azData.length - 1; i++) {
      if (azData[i] > azData[i - 1] && azData[i] > azData[i + 1] && azData[i] > threshold) {
        peaks.push(i);
      }
    }

    const strideTimes: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      const timeDiff = data[peaks[i]].t - data[peaks[i - 1]].t;
      if (timeDiff > 200 && timeDiff < 2000) {
        strideTimes.push(timeDiff);
      }
    }

    let cv = 0;
    if (strideTimes.length > 0) {
      const mean = strideTimes.reduce((a, b) => a + b, 0) / strideTimes.length;
      const sd = Math.sqrt(strideTimes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / strideTimes.length);
      cv = (sd / mean) * 100;
    }

    if (strideTimes.length === 0) {
      return {
        walkingSpeed: 0, walkingSpeedLabel: '0 m/s',
        balanceScore: 0, balanceLabel: '0 คะแนน',
        regularity: 0, regularityLabel: '0%', totalScore: 0,
      };
    }

    const riskScore = Math.min(1, (cv / 5) * 0.6 + 0.4 * (cv / 10));
    const totalScore = Math.round(100 - riskScore * 100);

    const meanStrideTimeMs = strideTimes.reduce((a, b) => a + b, 0) / strideTimes.length;
    const walkingSpeed = parseFloat((1.5 / (meanStrideTimeMs / 1000)).toFixed(1));
    const balanceScore = Math.round(Math.max(0, Math.min(100, 100 - cv)));
    const regularity = Math.round(Math.max(0, Math.min(100, 100 - cv)));

    return {
      walkingSpeed, walkingSpeedLabel: walkingSpeed + ' m/s',
      balanceScore, balanceLabel: balanceScore + ' คะแนน',
      regularity, regularityLabel: regularity + '%', totalScore,
    };
  }

  // ── Internal — Test Abort Helper ────────────────────────────────

  private abortTest(mode: 'tremor' | 'gait', message: string): void {
    if (mode === 'tremor') {
      this.detachTremorListener();
      this.clearTremorTimers();
      this.tremorStopping = false;
    } else {
      this.detachGaitListener();
      this.clearGaitTimers();
      this.gaitStopping = false;
    }

    this.updateState({
      activeMode: 'idle',
      error: message,
      status: '',
      timeRemaining: 0,
    });
  }

  // ── Internal — Watchdog Timer Helper ────────────────────────────

  private clearWatchdogTimer(mode: 'tremor' | 'gait'): void {
    if (mode === 'tremor' && this.tremorWatchdogTimer !== null) {
      clearTimeout(this.tremorWatchdogTimer);
      this.tremorWatchdogTimer = null;
    }
    if (mode === 'gait' && this.gaitWatchdogTimer !== null) {
      clearTimeout(this.gaitWatchdogTimer);
      this.gaitWatchdogTimer = null;
    }
  }

  // ── Internal — State helpers ──────────────────────────────────

  private updateState(partial: Partial<MotionSensorState>): void {
    const next = { ...this.stateSubject.value, ...partial };
    this.stateSubject.next(next);
    this.syncSignals(next);
  }

  private syncSignals(state: MotionSensorState): void {
    this.permission.set(state.permission);
    this.activeMode.set(state.activeMode);
    this.accX.set(state.accX);
    this.accY.set(state.accY);
    this.accZ.set(state.accZ);
    this.error.set(state.error);
    this.timeRemaining.set(state.timeRemaining);
    this.status.set(state.status);
  }
}