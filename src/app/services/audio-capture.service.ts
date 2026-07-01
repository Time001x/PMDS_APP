import { Injectable, NgZone, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { NativeMic, NativeMicAudioData } from './native-mic/native-mic.plugin';

export interface AudioCaptureState {
  isRecording: boolean;
  micPermission: boolean | null;
  volume: number;
  pitch: number;
  error: string | null;
  timeRemaining: number;
}

export interface SpeechSampleData {
  duration: number;
  volumeSamples: number[];
  pitchSamples: number[];
}

export interface SpeechAnalysisResult {
  consistency: number;
  pitchStability: number;
  speechRate: number;
}

const DEFAULT_STATE: AudioCaptureState = {
  isRecording: false,
  micPermission: null,
  volume: 0,
  pitch: 0,
  error: null,
  timeRemaining: 0,
};

@Injectable({ providedIn: 'root' })
export class AudioCaptureService {
  private readonly stateSubject = new BehaviorSubject<AudioCaptureState>({ ...DEFAULT_STATE });
  readonly state$: Observable<AudioCaptureState> = this.stateSubject.asObservable();

  get state(): AudioCaptureState {
    return this.stateSubject.value;
  }

  readonly recording = signal(false);
  readonly micPermission = signal<boolean | null>(null);
  readonly volume = signal(0);
  readonly pitch = signal(0);
  readonly error = signal<string | null>(null);
  readonly timeRemaining = signal(0);

  private readonly isNative = Capacitor.isNativePlatform();

  // ── ทางหลัก (Android/iOS จริง): Native AudioRecord ผ่าน NativeMic plugin ──
  private nativeListenerHandle: { remove: () => void } | null = null;

  // ── ทางสำรอง (เว็บเบราว์เซอร์ตอน dev เท่านั้น เช่น `ionic serve`) ─────────
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  private volumeSamples: number[] = [];
  private pitchSamples: number[] = [];
  private recordingStartTime = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  private permissionGranted = false;

  constructor(private readonly ngZone: NgZone) {
    console.log('[Audio] Constructor called, isNativePlatform:', this.isNative);
  }

  async startRecording(stageDuration: number = 10): Promise<void> {
    console.log('[Audio] startRecording called, isRecording:', this.state.isRecording);
    if (this.state.isRecording) return;

    this.emitError(null);

    try {
      // ── Permission logic ──────────────────────────────────────────────
      if (!this.permissionGranted) {
        if (this.isNative) {
          const result = await NativeMic.requestMicPermission();
          console.log('[Audio] Native permission result:', JSON.stringify(result));
          if (result.granted !== true) {
            const msg = 'Microphone permission was not granted by the user.';
            console.error('[Audio] ❌ Permission denied:', msg);
            alert(msg);
            throw new Error(msg);
          }
          // Small delay for Android audio hardware initialization after "Allow"
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          const granted = await this.requestWebPermission();
          if (!granted) {
            throw new Error('Microphone permission denied');
          }
        }
        this.permissionGranted = true;
      }

      this.updateState({ micPermission: true });

      this.volumeSamples = [];
      this.pitchSamples = [];
      this.recordingStartTime = Date.now();

      if (this.isNative) {
        await this.startNativeRecording();
      } else {
        await this.startWebRecording();
      }

      this.updateRecordingState(true);

      if (stageDuration > 0) {
        this.startCountdown(stageDuration);
      } else {
        this.updateState({ timeRemaining: 0 });
      }

      console.log('[Audio] ✅ Recording started! mode =', this.isNative ? 'NATIVE (AudioRecord)' : 'WEB (getUserMedia, dev only)');
    } catch (err: any) {
      console.error('[Audio] ❌ Error:', err?.name, err?.message, err?.toString());
      this.updateState({ micPermission: false });
      this.emitError('ไม่สามารถเข้าถึงไมโครโฟนได้: ' + (err?.message || err));
      throw err;
    }
  }

  stopRecording(): SpeechSampleData | null {
    console.log('[Audio] stopRecording called, isRecording:', this.state.isRecording);
    if (!this.state.isRecording) return null;

    this.stopCountdown();

    if (this.isNative) {
      this.stopNativeRecording();
    } else {
      this.stopWebRecording();
    }

    const duration = this.recordingStartTime > 0
      ? (Date.now() - this.recordingStartTime) / 1000
      : 0;

    const sampleData: SpeechSampleData | null =
      this.volumeSamples.length > 0
        ? {
            duration,
            volumeSamples: [...this.volumeSamples],
            pitchSamples: [...this.pitchSamples],
          }
        : null;

    console.log('[Audio] Recording duration:', duration, 'samples:', this.volumeSamples.length);

    this.resetBuffers();
    this.updateRecordingState(false);

    return sampleData;
  }

  analyzeSpeech(sample: SpeechSampleData, stage: 1 | 2 | 3): SpeechAnalysisResult {
    const { volumeSamples, pitchSamples, duration } = sample;

    let consistency = 50;
    if (volumeSamples.length > 0) {
      const meanVol = volumeSamples.reduce((a, b) => a + b, 0) / volumeSamples.length;
      const variance = volumeSamples.reduce((sum, v) => sum + (v - meanVol) ** 2, 0) / volumeSamples.length;
      const stdDev = Math.sqrt(variance);
      consistency = Math.round(Math.max(0, 100 - stdDev * 3.33));
      if (stage === 1) consistency = Math.round(consistency * 0.8 + 20);
      else if (stage === 2) consistency = Math.round(consistency * 0.7 + 15);
      else consistency = Math.round(consistency * 0.75 + 18);
    }

    let pitchStability = 50;
    if (pitchSamples.length > 0) {
      const voicedPitches = pitchSamples.filter((p) => p > 60 && p < 500);
      if (voicedPitches.length > 2) {
        const meanPitch = voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length;
        const pitchVariance = voicedPitches.reduce((sum, p) => sum + (p - meanPitch) ** 2, 0) / voicedPitches.length;
        const pitchDev = Math.sqrt(pitchVariance);
        const relativeDev = meanPitch > 0 ? (pitchDev / meanPitch) * 100 : 50;
        pitchStability = Math.round(Math.max(0, 100 - relativeDev * 2));
        if (stage === 1) pitchStability = Math.round(pitchStability * 0.85 + 10);
        else if (stage === 2) pitchStability = Math.round(pitchStability * 0.65 + 15);
        else pitchStability = Math.round(pitchStability * 0.7 + 12);
      }
    }

    let speechRate = 0;
    if (duration > 0) {
      const crossings = this.countEnvelopeCrossings(volumeSamples);
      speechRate = parseFloat(((crossings * 0.5) / duration).toFixed(1));
      speechRate = Math.max(0.5, Math.min(12, speechRate));
    }

    consistency = Math.max(0, Math.min(100, Math.round(consistency)));
    pitchStability = Math.max(0, Math.min(100, Math.round(pitchStability)));

    return { consistency, pitchStability, speechRate };
  }

  cleanup(): void {
    console.log('[Audio] cleanup');
    this.stopRecording();
    this.stopCountdown();
    this.stateSubject.next({ ...DEFAULT_STATE });
    this.syncSignals(DEFAULT_STATE);
  }

  // ══════════════════════════════ NATIVE (AudioRecord) ══════════════════════════════

  private async requestNativePermission(): Promise<boolean> {
    console.log('[Audio] Requesting native RECORD_AUDIO permission...');
    const result = await NativeMic.requestMicPermission();
    console.log('[Audio] Native permission result:', JSON.stringify(result));
    return !!result.granted;
  }

  private async startNativeRecording(): Promise<void> {
    console.log('[Audio] Starting native AudioRecord capture...');

    this.nativeListenerHandle = await NativeMic.addListener('audioData', (data: NativeMicAudioData) => {
      this.volumeSamples.push(data.volume);
      this.pitchSamples.push(data.pitch);

      this.ngZone.run(() => {
        this.updateState({ volume: data.volume, pitch: data.pitch });
      });
    });

    await NativeMic.startRecording();
  }

  private stopNativeRecording(): void {
    NativeMic.stopRecording().catch((e) => console.warn('[Audio] stopRecording error:', e));
    if (this.nativeListenerHandle) {
      this.nativeListenerHandle.remove();
      this.nativeListenerHandle = null;
    }
  }

  // ══════════════════════════════ WEB (dev fallback only) ══════════════════════════════

  private async requestWebPermission(): Promise<boolean> {
    // เบราว์เซอร์ปกติไม่มี permission API แยก แค่ลองขอ getUserMedia ตรง ๆ
    return true;
  }

  private async startWebRecording(): Promise<void> {
    console.log('[Audio] [DEV MODE] Opening getUserMedia (browser only, not used on device build)...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    this.audioContext = audioContext;
    this.sourceNode = source;
    this.analyserNode = analyser;

    this.ngZone.runOutsideAngular(() => {
      this.startAnalyserLoop();
    });
  }

  private stopWebRecording(): void {
    this.stopAnalyserLoop();
    this.teardownWebHardware();
  }

  private startAnalyserLoop(): void {
    const analyser = this.analyserNode;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const timeDomain = new Uint8Array(bufferLength);
    const frequencyData = new Uint8Array(bufferLength);

    const tick = () => {
      if (!this.state.isRecording) return;

      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }

      analyser.getByteTimeDomainData(timeDomain);
      analyser.getByteFrequencyData(frequencyData);

      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (timeDomain[i] / 128.0) - 1.0;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      const volume = Math.round(Math.min(100, (rms / 0.5) * 100));
      this.volumeSamples.push(volume);

      const pitch = this.estimatePitch(frequencyData, analyser.context.sampleRate);
      this.pitchSamples.push(pitch);

      this.ngZone.run(() => {
        this.updateState({ volume, pitch });
      });

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopAnalyserLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private estimatePitch(frequencyData: Uint8Array, sampleRate: number): number {
    const binCount = frequencyData.length;
    const freqPerBin = sampleRate / 2 / binCount;
    const minBin = Math.max(1, Math.floor(60 / freqPerBin));
    const maxBin = Math.min(binCount - 1, Math.ceil(500 / freqPerBin));

    let maxAmplitude = 0;
    let dominantBin = 0;

    for (let i = minBin; i <= maxBin; i++) {
      if (frequencyData[i] > maxAmplitude) {
        maxAmplitude = frequencyData[i];
        dominantBin = i;
      }
    }

    return maxAmplitude > 30 ? Math.round(dominantBin * freqPerBin) : 0;
  }

  private teardownWebHardware(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (_) {}
      this.audioContext = null;
    }
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.analyserNode = null;
  }

  // ══════════════════════════════ Shared helpers ══════════════════════════════

  private countEnvelopeCrossings(samples: number[]): number {
    if (samples.length < 3) return 0;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if (
        (samples[i - 1] - mean >= 0 && samples[i] - mean < 0) ||
        (samples[i - 1] - mean < 0 && samples[i] - mean >= 0)
      ) crossings++;
    }
    return crossings;
  }

  private startCountdown(seconds: number): void {
    let remaining = seconds;
    this.updateState({ timeRemaining: remaining });
    this.ngZone.runOutsideAngular(() => {
      this.countdownTimer = setInterval(() => {
        remaining--;
        this.ngZone.run(() => {
          this.updateState({ timeRemaining: remaining });
          if (remaining <= 0) this.stopCountdown();
        });
      }, 1000);
    });
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private updateRecordingState(isRecording: boolean): void {
    this.updateState({ isRecording });
  }

  private emitError(error: string | null): void {
    this.updateState({ error });
  }

  private resetBuffers(): void {
    this.volumeSamples = [];
    this.pitchSamples = [];
    this.recordingStartTime = 0;
  }

  private updateState(partial: Partial<AudioCaptureState>): void {
    const next = { ...this.stateSubject.value, ...partial };
    this.stateSubject.next(next);
    this.syncSignals(next);
  }

  private syncSignals(state: AudioCaptureState): void {
    this.recording.set(state.isRecording);
    this.micPermission.set(state.micPermission);
    this.volume.set(state.volume);
    this.pitch.set(state.pitch);
    this.error.set(state.error);
    this.timeRemaining.set(state.timeRemaining);
  }
}
