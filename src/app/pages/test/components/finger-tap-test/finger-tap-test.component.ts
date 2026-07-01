import { Component, OnDestroy, NgZone, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface HandData {
  count: number;
  correct: number;
  avgTime: number;
  accuracy: number;
  totalTaps: number;
}

interface FingerResultItem {
  label: string;
  value: string;
  barWidth: number;
  color: string;
}

interface FingerResults {
  right: FingerResultItem[];
  left: FingerResultItem[];
  totalScore: number;
}

@Component({
  selector: 'app-finger-tap-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './finger-tap-test.component.html',
  styleUrls: ['./finger-tap-test.component.scss']
})
export class FingerTapTestComponent implements OnDestroy {
  /** Emitted when the finger tap test finishes, passing the final risk score (0-1) */
  readonly testCompleted = output<number>();

  // ── Reactive state (signals) ──────────────────────────────
  readonly fingerTimer = signal<number | string>(15);
  readonly fingerCount = signal(0);
  readonly fingerSpeed = signal('--');
  readonly fingerStarted = signal(false);
  readonly fingerHand = signal<'right' | 'left'>('right');
  readonly fingerPhase = signal(0); // 0 = select hand, 1 = testing right, 2 = testing left, 3 = done
  readonly fingerCircleActive = signal(1); // 1 or 2 (which circle is active to tap)
  readonly fingerTotalTaps = signal(0);
  readonly fingerCorrectCount = signal(0);
  readonly fingerResults = signal<FingerResults | null>(null);
  readonly fingerTested = signal<{ right: boolean; left: boolean }>({ right: false, left: false });

  // ── Private state (not signals) ───────────────────────────
  private fingerLastTap = 0;
  private fingerTapTimes: number[] = [];
  private fingerInterval: ReturnType<typeof setInterval> | null = null;
  private cdInterval: ReturnType<typeof setInterval> | null = null;
  private fingerTaps: { right: HandData | null; left: HandData | null } = { right: null, left: null };

  constructor(private readonly ngZone: NgZone) {}

  ngOnDestroy(): void {
    this.clearTimer();
  }

  // ── Public Methods ────────────────────────────────────────

  selectHand(hand: 'right' | 'left'): void {
    this.fingerHand.set(hand);
  }

  startTestPhase(): void {
    if (this.fingerPhase() !== 0) return;

    this.fingerTimer.set(15);
    this.fingerCount.set(0);
    this.fingerStarted.set(false);
    this.fingerTapTimes = [];
    this.fingerTotalTaps.set(0);
    this.fingerCorrectCount.set(0);
    this.fingerCircleActive.set(1);
    this.fingerLastTap = 0;

    let cd = 3;
    this.clearTimer(); // clear any prior intervals
    this.cdInterval = setInterval(() => {
      cd--;
      if (cd > 0) {
        this.ngZone.run(() => this.fingerTimer.set(cd + '...'));
        return;
      }
      this.clearTimer();

      this.ngZone.run(() => {
        const hand = this.fingerHand();
        this.fingerPhase.set(hand === 'right' ? 1 : 2);
        this.fingerStarted.set(true);
        let sec = 15;
        this.fingerTimer.set(sec);
        this.fingerCount.set(0);
        this.fingerTotalTaps.set(0);
        this.fingerCorrectCount.set(0);

        this.fingerInterval = setInterval(() => {
          sec--;
          this.ngZone.run(() => {
            this.fingerTimer.set(sec);
            if (sec <= 0) {
              this.clearTimer();
              this.endPhase();
            }
          });
        }, 1000);
      });
    }, 1000);
  }

  onFingerTap(circleNum: number, event?: Event): void {
    // ป้องกัน duplicate events (touchstart + mousedown + pointerdown อาจ fire พร้อมกัน)
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const phase = this.fingerPhase();
    if (phase !== 1 && phase !== 2) {
      console.log('[FingerTap] Ignored tap - wrong phase:', phase);
      return;
    }
    const timer = this.fingerTimer();
    if (Number(timer) <= 0) {
      console.log('[FingerTap] Ignored tap - timer expired:', timer);
      return;
    }

    const now = Date.now();
    const expected = this.fingerCircleActive();

    // ป้องกัน double-fire: ถ้า tap ซ้ำ circle เดิมภายใน 100ms ให้ข้ามไป
    if (now - this.fingerLastTap < 100 && circleNum === expected) {
      console.log('[FingerTap] Ignored duplicate tap within 100ms');
      return;
    }

    const totalTaps = this.fingerTotalTaps() + 1;
    this.fingerTotalTaps.set(totalTaps);

    if (circleNum === expected) {
      this.fingerCorrectCount.update(v => v + 1);
      console.log(`[FingerTap] ✅ Correct tap on circle ${circleNum} (total: ${totalTaps}, correct: ${this.fingerCorrectCount()})`);
    } else {
      console.log(`[FingerTap] ❌ Wrong tap - expected ${expected}, got ${circleNum} (total: ${totalTaps})`);
    }

    if (this.fingerLastTap > 0) {
      const interval = now - this.fingerLastTap;
      this.fingerTapTimes.push(interval);
      console.log(`[FingerTap] Interval: ${interval}ms`);
    }
    this.fingerLastTap = now;

    this.ngZone.run(() => {
      this.fingerCount.set(totalTaps);
      this.fingerCircleActive.set(circleNum === 1 ? 2 : 1);
    });
  }

  // ── Private Methods ───────────────────────────────────────

  private endPhase(): void {
    const phase = this.fingerPhase();
    const handKey = phase === 1 ? 'right' : 'left';
    const times = this.fingerTapTimes;
    const count = this.fingerTotalTaps();
    const correct = this.fingerCorrectCount();

    // Clinical Guard: if no taps were recorded, abort with error instead of fraudulent high risk score
    if (count === 0) {
      this.ngZone.run(() => {
        this.fingerTimer.set('ไม่ได้ทำการทดสอบ (ไม่มีการตอบสนอง)');
        this.fingerPhase.set(0);
        this.fingerStarted.set(false);
      });
      return;
    }

    const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const accuracy = count > 0 ? Math.round((correct / count) * 100) : 0;

    this.fingerTaps[handKey] = { count, correct, avgTime, accuracy, totalTaps: count };
    const tested = this.fingerTested();
    tested[handKey] = true;
    this.fingerTested.set({ ...tested });

    // Check if both hands are done
    if (tested.right && tested.left) {
      this.fingerPhase.set(3);
      this.calculateResults();
      return;
    }

    // Switch to the other hand
    if (!tested.right) {
      this.fingerHand.set('right');
    } else {
      this.fingerHand.set('left');
    }
    this.fingerPhase.set(0);
  }

  private calculateResults(): void {
    const r = this.fingerTaps.right;
    const l = this.fingerTaps.left;

    const makeItem = (label: string, val: string, barW: number, color: string): FingerResultItem => ({
      label, value: val, barWidth: barW, color
    });

    const rAvgMs = r?.avgTime || 0;
    const lAvgMs = l?.avgTime || 0;
    const rTotal = r?.totalTaps || 0;
    const lTotal = l?.totalTaps || 0;
    const rCorrect = r?.correct || 0;
    const lCorrect = l?.correct || 0;
    const rAccuracy = r?.accuracy || 0;
    const lAccuracy = l?.accuracy || 0;

    const totalTime = rTotal + lTotal;
    const totalCorrect = rCorrect + lCorrect;
    const overallAccuracy = totalTime > 0 ? Math.round((totalCorrect / totalTime) * 100) : 0;

    const totalScore = Math.round((rAccuracy + lAccuracy) / 2);

    const rightItems: FingerResultItem[] = [
      makeItem('เวลาในการตอบสนองเฉลี่ย', (rAvgMs || 0) + ' ms', Math.min(100, 100 - (rAvgMs || 0) / 5), rAvgMs > 300 ? '#C10508' : rAvgMs > 150 ? '#F59E0B' : '#05C134'),
      makeItem('ความแม่นยำ', (rAccuracy || 0) + '%', (rAccuracy || 0), rAccuracy >= 80 ? '#05C134' : rAccuracy >= 50 ? '#F59E0B' : '#C10508'),
      makeItem('จำนวนครั้งที่ตอบสนอง', (rTotal || 0) + ' ครั้ง', Math.min(100, ((rTotal || 0) / 60) * 100), '#EB661E')
    ];

    const leftItems: FingerResultItem[] = [
      makeItem('เวลาในการตอบสนองเฉลี่ย', (lAvgMs || 0) + ' ms', Math.min(100, 100 - (lAvgMs || 0) / 5), lAvgMs > 300 ? '#C10508' : lAvgMs > 150 ? '#F59E0B' : '#05C134'),
      makeItem('ความแม่นยำ', (lAccuracy || 0) + '%', (lAccuracy || 0), lAccuracy >= 80 ? '#05C134' : lAccuracy >= 50 ? '#F59E0B' : '#C10508'),
      makeItem('จำนวนครั้งที่ตอบสนอง', (lTotal || 0) + ' ครั้ง', Math.min(100, ((lTotal || 0) / 60) * 100), '#EB661E')
    ];

    this.fingerResults.set({ right: rightItems, left: leftItems, totalScore });

    // Calculate risk score and emit
    const riskScore = Math.min(1, Math.max(0, (100 - totalScore) / 100));
    this.testCompleted.emit(riskScore);
  }

  private clearTimer(): void {
    if (this.fingerInterval !== null) {
      clearInterval(this.fingerInterval);
      this.fingerInterval = null;
    }
    if (this.cdInterval !== null) {
      clearInterval(this.cdInterval!);
      this.cdInterval = null;
    }
  }

  // ── Template Helpers ──────────────────────────────────────

  getFingerRingDash(): string {
    const results = this.fingerResults();
    if (!results) return '0 264';
    const r = 42;
    const circ = 2 * Math.PI * r;
    const dash = circ * ((results.totalScore || 50) / 100);
    return `${dash} ${circ}`;
  }
}