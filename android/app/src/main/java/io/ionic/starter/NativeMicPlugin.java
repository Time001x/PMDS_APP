package io.ionic.starter;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * NativeMicPlugin
 * ----------------
 * ใช้ android.media.AudioRecord อ่านเสียงตรงจากไมโครโฟนของเครื่อง (Native API)
 * ไม่ผ่าน WebView / getUserMedia() เลย จึงไม่ติดปัญหา WebView ปฏิเสธ permission
 *
 * คำนวณ RMS volume + dominant-frequency pitch (autocorrelation แบบง่าย) ฝั่ง native
 * แล้วยิง event "audioData" กลับไปที่ JS ทุก ~100ms ระหว่างอัดเสียง
 */
@CapacitorPlugin(
    name = "NativeMic",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class NativeMicPlugin extends Plugin {

    private static final int SAMPLE_RATE = 44100;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    private AudioRecord audioRecord;
    private Thread recordThread;
    private volatile boolean isRecording = false;

    @PluginMethod
    public void requestMicPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("microphone", call, "micPermsCallback");
        }
    }

    @PermissionCallback
    private void micPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (isRecording) {
            call.resolve();
            return;
        }

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission not granted");
            return;
        }

        try {
            int minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (minBufferSize <= 0) {
                call.reject("Unable to determine AudioRecord buffer size on this device");
                return;
            }
            int bufferSize = minBufferSize * 2;

            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                call.reject("AudioRecord failed to initialize (device/driver issue)");
                audioRecord = null;
                return;
            }

            audioRecord.startRecording();
            isRecording = true;

            final int chunkSamples = bufferSize / 2; // 16-bit -> 2 bytes/sample
            recordThread = new Thread(() -> recordLoop(chunkSamples), "NativeMicRecordThread");
            recordThread.setPriority(Thread.MAX_PRIORITY);
            recordThread.start();

            call.resolve();
        } catch (SecurityException se) {
            call.reject("Microphone permission denied by OS: " + se.getMessage());
        } catch (Exception e) {
            call.reject("Failed to start recording: " + e.getMessage());
        }
    }

    private void recordLoop(int chunkSamples) {
        short[] buffer = new short[chunkSamples];

        // ส่ง event รวมทุก ๆ ~100ms แทนทุก read() เพื่อไม่ยิง JS bridge ถี่เกินไป
        final int samplesPerEmit = (int) (SAMPLE_RATE * 0.1);
        int accumulated = 0;
        long sumSquares = 0;

        while (isRecording && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);
            if (read <= 0) continue;

            for (int i = 0; i < read; i++) {
                sumSquares += (long) buffer[i] * (long) buffer[i];
            }
            accumulated += read;

            if (accumulated >= samplesPerEmit) {
                double rms = Math.sqrt((double) sumSquares / accumulated);
                // 16-bit PCM full scale = 32768
                double volume = Math.min(100.0, (rms / 32768.0) * 100.0 * 4.0);

                double pitch = estimatePitch(buffer, read, SAMPLE_RATE);

                JSObject data = new JSObject();
                data.put("volume", Math.round(volume));
                data.put("pitch", Math.round(pitch));
                data.put("timestamp", System.currentTimeMillis());

                notifyListeners("audioData", data);

                accumulated = 0;
                sumSquares = 0;
            }
        }
    }

    /**
     * ประมาณ pitch ด้วย autocorrelation แบบง่าย บน chunk ล่าสุดที่อ่านมา
     * ครอบคลุมช่วงเสียงพูดมนุษย์ทั่วไป 60-500 Hz
     */
    private double estimatePitch(short[] buffer, int length, int sampleRate) {
        int minLag = sampleRate / 500; // 500 Hz
        int maxLag = sampleRate / 60;  // 60 Hz
        if (maxLag >= length) return 0;

        double bestCorrelation = 0;
        int bestLag = -1;

        for (int lag = minLag; lag <= maxLag; lag++) {
            double correlation = 0;
            for (int i = 0; i < length - lag; i++) {
                correlation += buffer[i] * buffer[i + lag];
            }
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestLag = lag;
            }
        }

        if (bestLag <= 0) return 0;

        // ถ้าพลังงานสัญญาณต่ำเกินไป ถือว่าไม่มีเสียง (silence/noise floor)
        double energy = 0;
        for (int i = 0; i < length; i++) energy += (double) buffer[i] * buffer[i];
        double normalizedCorrelation = bestCorrelation / (energy + 1e-9);
        if (normalizedCorrelation < 0.01) return 0;

        return (double) sampleRate / bestLag;
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        isRecording = false;

        if (recordThread != null) {
            try {
                recordThread.join(500);
            } catch (InterruptedException ignored) {
            }
            recordThread = null;
        }

        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
            }
            audioRecord.release();
            audioRecord = null;
        }

        call.resolve();
    }
}
