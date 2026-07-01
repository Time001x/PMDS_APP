import { Component, OnDestroy, NgZone, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MotionSensorService, TremorAnalysisResult, MotionSensorState } from '../../../../services/motion-sensor.service';

@Component({
  selector: 'app-tremor-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tremor-test.component.html',
  styleUrls: ['./tremor-test.component.scss']
})
export class TremorTestComponent implements OnDestroy {
  readonly testCompleted = output<number>();

  readonly tremorTimer = signal(15);
  readonly tremorStatus = signal('กดเพื่อเริ่มการวัดอาการสั่น');
  readonly tremorDone = signal(false);
  readonly tremorResults = signal<TremorAnalysisResult | null>(null);
  readonly testActive = signal(false);

  readonly sensorAccX = this.motionSensor.accX;
  readonly sensorAccY = this.motionSensor.accY;
  readonly sensorAccZ = this.motionSensor.accZ;

  // ── แก้บั๊ก: subscribe state$ สำหรับ timer/status,
  //    subscribe tremorResult$ สำหรับผล analysis โดยตรง
  //    ไม่ต้องเดาจาก activeMode อีกต่อไป ──────────────────────
  private stateSub: Subscription | null = null;
  private resultSub: Subscription | null = null;

  constructor(
    private readonly motionSensor: MotionSensorService,
    private readonly ngZone: NgZone
  ) {}

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.resultSub?.unsubscribe();
    if (this.testActive() && !this.tremorDone()) {
      this.motionSensor.stopTremorTest();
    }
  }

  async startTest(): Promise<void> {
    if (this.testActive() || this.tremorDone()) return;

    this.tremorDone.set(false);
    this.tremorResults.set(null);
    this.testActive.set(true);

    // ── subscribe ผลลัพธ์ก่อนเริ่ม เพื่อไม่พลาด auto-stop ──────
    this.resultSub?.unsubscribe();
    this.resultSub = this.motionSensor.tremorResult$.subscribe((result) => {
      this.ngZone.run(() => {
        this.tremorResults.set(result);
        this.tremorDone.set(true);
        this.testActive.set(false);
        this.tremorStatus.set('✅ การวิเคราะห์เสร็จสิ้น');

        this.stateSub?.unsubscribe();
        this.resultSub?.unsubscribe();

        const riskScore = Math.min(1, Math.max(0, (100 - result.totalScore) / 100));
        this.testCompleted.emit(riskScore);
      });
    });

    // ── subscribe timer/status แยกต่างหาก ────────────────────
    this.stateSub?.unsubscribe();
    this.stateSub = this.motionSensor.state$.subscribe((state: MotionSensorState) => {
      this.ngZone.run(() => {
        if (state.activeMode === 'tremor') {
          this.tremorTimer.set(state.timeRemaining);
          this.tremorStatus.set(state.status);
        }
        if (state.error && this.testActive()) {
          this.tremorStatus.set(state.error);
          this.testActive.set(false);
          this.stateSub?.unsubscribe();
          this.resultSub?.unsubscribe();
        }
      });
    });

    try {
      await this.motionSensor.startTremorTest();
    } catch (err: any) {
      this.tremorStatus.set('❌ ไม่สามารถเริ่มทดสอบได้: ' + (err.message || ''));
      this.testActive.set(false);
      this.stateSub?.unsubscribe();
      this.resultSub?.unsubscribe();
    }
  }

  /** เรียกเมื่อผู้ใช้กดหยุดเอง (ปกติ service auto-stop ให้เมื่อหมดเวลา) */
  stopTest(): void {
    if (!this.testActive()) return;
    this.motionSensor.stopTremorTest();
    // ผลจะถูกส่งผ่าน tremorResult$ subscription ด้านบนอยู่แล้ว
  }

  getTremorRingDash(): string {
    const results = this.tremorResults();
    if (!results) return '0 264';
    const r = 42;
    const circ = 2 * Math.PI * r;
    const dash = circ * ((results.totalScore || 50) / 100);
    return `${dash} ${circ}`;
  }
}