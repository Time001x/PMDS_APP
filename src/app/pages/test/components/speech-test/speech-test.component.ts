import { Component, OnDestroy, NgZone, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioCaptureService, AudioCaptureState } from '../../../../services/audio-capture.service';

@Component({
  selector: 'app-speech-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './speech-test.component.html',
  styleUrls: ['./speech-test.component.scss']
})
export class SpeechTestComponent implements OnDestroy {
  readonly testCompleted = output<number>();

  readonly speechStage = signal<1 | 2 | 3>(1);
  readonly speechTimer = signal(10);
  readonly speechStatus = signal('กดเพื่อเริ่มบันทึกเสียง');
  readonly speechStageTitle = signal('ขั้นตอนที่ 1: พูดเสียง "อา"');
  readonly speechStageDesc = signal('พูดเสียง "อา" ยาวๆ ต่อเนื่อง 10 วินาที');
  readonly speechStageDone = signal<boolean[]>([false, false, false]);
  readonly speechRecordedData = signal<any[]>([]);
  readonly speechResults = signal<any | null>(null);
  readonly speechAllDone = signal(false);

  readonly recording = this.audioService.recording;
  readonly volume = this.audioService.volume;
  readonly pitch = this.audioService.pitch;
  readonly timeRemaining = this.audioService.timeRemaining;
  readonly micError = this.audioService.error;
  readonly micPermission = this.audioService.micPermission;

  readonly showIntro = signal(true);

  // ── แก้บั๊ก: ไม่ใช้ effect() อีกต่อไป เพราะ effect ที่ track
  //    timeRemaining ทุกค่าทำให้ trigger ซ้ำตอน component init
  //    (remaining=0 เป็นค่าเริ่มต้น) ดูเหมือนแอป "รีโหลด" ตัวเอง
  //    ใช้ countdown ของตัวเอง + stopRecording() ตรงๆ แทน ───────
  private localCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private autoStopHandled = false;

  constructor(
    private readonly audioService: AudioCaptureService,
    private readonly ngZone: NgZone
  ) {}

  ngOnDestroy(): void {
    this.clearLocalCountdown();
    this.cleanup();
  }

  onStartRecording(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    void this.startRecording();
  }

  onStopRecording(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopRecording();
  }

  onNextStage(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.nextStage();
  }

  async startRecording(): Promise<void> {
    console.log('[SPEECH DEBUG] 1. startRecording called, recording()=', this.recording());
    if (this.recording()) return;

    this.autoStopHandled = false;
    this.speechStatus.set('⏳ กำลังขอสิทธิ์ใช้งานไมโครโฟน...');
    console.log('[SPEECH DEBUG] 2. showIntro not yet hidden - waiting for permission');

    try {
      const duration = this.speechStage() === 3 ? 0 : 10;
      console.log('[SPEECH DEBUG] 3. calling audioService.startRecording, duration=', duration);
      await this.audioService.startRecording(duration);
      console.log('[SPEECH DEBUG] 4. audioService.startRecording resolved! recording()=', this.recording());

      // ── ซ่อน intro หลังจาก permission ได้และ recording เริ่มแล้วเท่านั้น ──
      this.showIntro.set(false);

      this.ngZone.run(() => {
        this.speechStatus.set('🔴 กำลังบันทึก... ' + this.getStagePrompt());
        console.log('[SPEECH DEBUG] 5. status updated inside ngZone.run, recording()=', this.recording());

        if (this.speechStage() !== 3) {
          this.startLocalCountdown(10);
        } else {
          this.speechTimer.set(0);
        }
      });
    } catch (err: any) {
      console.error('[SPEECH DEBUG] ERROR caught - FULL DETAILS:', {
        name: err?.name,
        message: err?.message,
        constraint: err?.constraint,
        toString: err?.toString(),
      });
      this.ngZone.run(() => {
        this.speechStatus.set('❌ ไม่สามารถเข้าถึงไมโครโฟนได้');
        this.showIntro.set(true);
      });
    }
  }

  /** นับถอยหลังเอง ไม่พึ่ง effect — ชัดเจน ควบคุมได้ ไม่มี race condition */
  private startLocalCountdown(seconds: number): void {
    this.clearLocalCountdown();
    let remaining = seconds;
    this.speechTimer.set(remaining);

    this.ngZone.runOutsideAngular(() => {
      this.localCountdownTimer = setInterval(() => {
        remaining--;
        this.ngZone.run(() => {
          this.speechTimer.set(Math.max(0, remaining));
          if (remaining <= 0) {
            this.clearLocalCountdown();
            if (!this.autoStopHandled && this.recording()) {
              this.autoStopHandled = true;
              this.doStopAndAnalyze();
            }
          }
        });
      }, 1000);
    });
  }

  private clearLocalCountdown(): void {
    if (this.localCountdownTimer !== null) {
      clearInterval(this.localCountdownTimer);
      this.localCountdownTimer = null;
    }
  }

  stopRecording(): void {
    if (!this.recording()) return;
    this.clearLocalCountdown();
    this.autoStopHandled = true;
    this.doStopAndAnalyze();
  }

  private doStopAndAnalyze(): void {
    this.speechStatus.set('⏳ กำลังวิเคราะห์...');
    const sampleData = this.audioService.stopRecording();

    if (sampleData && sampleData.volumeSamples.length > 0) {
      this.runAnalysis(sampleData);
    } else {
      this.handleRecordingError();
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.recording()) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  nextStage(): void {
    const currentStage = this.speechStage();
    if (currentStage < 3) {
      const nextStage = (currentStage + 1) as 1 | 2 | 3;
      this.speechStage.set(nextStage);
      this.speechTimer.set(nextStage === 3 ? 0 : 10);
      this.speechStageTitle.set(
        'ขั้นตอนที่ ' + nextStage + ': ' +
        (nextStage === 2 ? 'พูด "ปา ตา กา"' : 'อ่านประโยค')
      );
      this.speechStageDesc.set(
        nextStage === 2
          ? 'พูด "ปา ตา กา" ซ้ำๆ เร็วที่สุด 10 วินาที'
          : 'อ่านประโยค "ยายพาหลานไปซื้อขนมที่ตลาด"'
      );
      this.speechStatus.set('✅ บันทึกแล้ว! กดเพื่อเริ่มขั้นตอนถัดไป');
      this.showIntro.set(true);
    }
  }

  restartTest(): void {
    this.cleanup();
    this.clearLocalCountdown();
    this.autoStopHandled = false;
    this.speechStage.set(1);
    this.speechTimer.set(10);
    this.speechStatus.set('กดเพื่อเริ่มบันทึกเสียง');
    this.speechStageTitle.set('ขั้นตอนที่ 1: พูดเสียง "อา"');
    this.speechStageDesc.set('พูดเสียง "อา" ยาวๆ ต่อเนื่อง 10 วินาที');
    this.speechStageDone.set([false, false, false]);
    this.speechRecordedData.set([]);
    this.speechResults.set(null);
    this.speechAllDone.set(false);
    this.showIntro.set(true);
  }

  getStagePrompt(): string {
    const stage = this.speechStage();
    switch (stage) {
      case 1: return 'พูดเสียง "อา" ยาวๆ ต่อเนื่อง';
      case 2: return 'พูด "ปา ตา กา" ซ้ำๆ เร็วที่สุด';
      case 3: return 'พูด "ยายพาหลานไปซื้อขนมที่ตลาด"';
      default: return '';
    }
  }

  getSpeechResultRingDash(): string {
    const results = this.speechResults();
    if (!results) return '0 264';
    const r = 42;
    const circ = 2 * Math.PI * r;
    const dash = circ * (results.totalScore / 100);
    return `${dash} ${circ}`;
  }

  getSpeechRateBarWidth(): number {
    const results = this.speechResults();
    if (!results) return 0;
    return Math.min(100, results.speechRate * 20);
  }

  private runAnalysis(sampleData: { duration: number; volumeSamples: number[]; pitchSamples: number[] }): void {
    const stage = this.speechStage();
    const analysis = this.audioService.analyzeSpeech(
      {
        duration: sampleData.duration || 10,
        volumeSamples: sampleData.volumeSamples,
        pitchSamples: sampleData.pitchSamples,
      },
      stage
    );

    this.ngZone.run(() => {
      const done = [...this.speechStageDone()];
      done[stage - 1] = true;
      this.speechStageDone.set(done);

      const recorded = [...this.speechRecordedData()];
      recorded[stage - 1] = analysis;
      this.speechRecordedData.set(recorded);

      if (stage < 3) {
        this.speechStatus.set('✅ บันทึกขั้นตอนที่ ' + stage + ' แล้ว');
      } else {
        this.finalizeResults();
      }
    });
  }

  private handleRecordingError(): void {
    this.ngZone.run(() => {
      this.speechStatus.set('❌ ไม่ได้รับข้อมูลเสียงจากไมโครโฟน กรุณาตรวจสอบไมโครโฟนและลองอีกครั้ง');
      this.showIntro.set(true);
    });
  }

  private finalizeResults(): void {
    const recorded = this.speechRecordedData();
    if (recorded.length < 3) return;

    const avgConsistency = Math.round(recorded.reduce((s: number, d: any) => s + d.consistency, 0) / 3);
    const avgPitchStability = Math.round(recorded.reduce((s: number, d: any) => s + d.pitchStability, 0) / 3);
    const avgSpeechRate = parseFloat((recorded.reduce((s: number, d: any) => s + d.speechRate, 0) / 3).toFixed(1));

    const totalQuality = (avgConsistency + avgPitchStability) / 2;
    const riskScore = Math.min(1, Math.max(0, (100 - totalQuality) / 100 * 1.2));

    this.speechResults.set({
      consistency: avgConsistency,
      pitchStability: avgPitchStability,
      speechRate: avgSpeechRate,
      totalScore: Math.round(100 - riskScore * 100)
    });
    this.speechAllDone.set(true);
    this.speechStatus.set('✅ ทดสอบเสียงครบทั้ง 3 ขั้นตอน');

    this.testCompleted.emit(riskScore);
  }

  private cleanup(): void {
    if (this.recording()) {
      this.audioService.stopRecording();
    }
    this.audioService.cleanup();
  }
}