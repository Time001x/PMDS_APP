import { registerPlugin } from '@capacitor/core';

export interface NativeMicPermissionResult {
  granted: boolean;
}

export interface NativeMicAudioData {
  volume: number;
  pitch: number;
  timestamp: number;
}

export interface NativeMicPlugin {
  requestMicPermission(): Promise<NativeMicPermissionResult>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  addListener(
    eventName: 'audioData',
    listenerFunc: (data: NativeMicAudioData) => void
  ): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

// Native Android plugin (AudioRecord ตรง ๆ) — ไม่ผ่าน WebView getUserMedia()
export const NativeMic = registerPlugin<NativeMicPlugin>('NativeMic');
