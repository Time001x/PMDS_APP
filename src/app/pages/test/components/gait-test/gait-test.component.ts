import { Component, OnDestroy, NgZone, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MotionSensorService, GaitAnalysisResult, MotionSensorState } from '../../../../services/motion-sensor.service';

@Component({
  selector: 'app-gait-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gait-test.component.html',
  styleUrls: ['./gait-test.component.scss']
})
export class GaitTestComponent implements OnDestroy {
  readonly testCompleted = output<number>();

  readonly gaitTimer = signal(20);
  readonly gaitStatus = signal('กดเพื่อเริ่มการทดสอบการเดิน');
  readonly gaitStarted = signal(false);
  readonly gaitDone = signal(false);
  readonly gaitResults = signal<GaitAnalysisResult | null>(null);
  readonly testActive = signal(false);

  // ── แก้บั๊ก: subscribe ตรงกับ gaitResult$ แทนการเดาจาก mode ───
  private stateSub: Subscription | null = null;
  private resultSub: Subscription | null = null;

  constructor(
    private readonly motionSensor: MotionSensorService,
    private readonly ngZone: NgZone
  ) {}

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.resultSub?.unsubscribe();
    if (this.testActive() && !this.gaitDone()) {
      this.motionSensor.stopGaitTest();
    }
  }

  async startTest(): Promise<void> {
    if (this.testActive() || this.gaitDone()) return;

    this.gaitDone.set(false);
    this.gaitResults.set(null);
    this.gaitStarted.set(false);
    this.testActive.set(true);

    this.resultSub?.unsubscribe();
    this.resultSub = this.motionSensor.gaitResult$.subscribe((result) => {
      this.ngZone.run(() => {
        this.gaitResults.set(result);
        this.gaitDone.set(true);
        this.testActive.set(false);
        this.gaitStatus.set('✅ การวิเคราะห์เสร็จสิ้น');

        this.stateSub?.unsubscribe();
        this.resultSub?.unsubscribe();

        const riskScore = Math.min(1, Math.max(0, (100 - result.totalScore) / 100));
        this.testCompleted.emit(riskScore);
      });
    });

    this.stateSub?.unsubscribe();
    this.stateSub = this.motionSensor.state$.subscribe((state: MotionSensorState) => {
      this.ngZone.run(() => {
        if (state.activeMode === 'gait') {
          this.gaitStarted.set(true);
          this.gaitTimer.set(state.timeRemaining);
          this.gaitStatus.set(state.status);
        }
        if (state.error && this.testActive()) {
          this.gaitStatus.set(state.error);
          this.testActive.set(false);
          this.stateSub?.unsubscribe();
          this.resultSub?.unsubscribe();
        }
      });
    });

    try {
      await this.motionSensor.startGaitTest();
    } catch (err: any) {
      this.gaitStatus.set('❌ ไม่สามารถเริ่มทดสอบได้: ' + (err.message || ''));
      this.testActive.set(false);
      this.stateSub?.unsubscribe();
      this.resultSub?.unsubscribe();
    }
  }

  stopTest(): void {
    if (!this.testActive()) return;
    this.motionSensor.stopGaitTest();
  }

  getGaitRingDash(): string {
    const results = this.gaitResults();
    if (!results) return '0 264';
    const r = 42;
    const circ = 2 * Math.PI * r;
    const dash = circ * ((results.totalScore || 50) / 100);
    return `${dash} ${circ}`;
  }
}