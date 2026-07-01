// ============================================================
// sensor-data.model.ts
// Raw sensor data models สำหรับส่งไป AI ในอนาคต
// ============================================================

/** ข้อมูลดิบจาก Accelerometer 1 จุด */
export interface AccelSample {
  t: number;   // timestamp (ms)
  ax: number;  // acceleration X
  ay: number;  // acceleration Y
  az: number;  // acceleration Z
  total: number; // magnitude √(x²+y²+z²)
}

/** ข้อมูลดิบจากการแตะนิ้ว 1 ครั้ง */
export interface TapSample {
  t: number;        // timestamp (ms)
  interval: number; // ระยะห่างจากแตะก่อนหน้า (ms), 0 = แตะแรก
  circle: number;   // แตะ circle ที่ 1 หรือ 2
  correct: boolean; // ถูกต้องไหม
}

/** ข้อมูลดิบจากเสียงพูด 1 stage */
export interface SpeechStageSample {
  stage: 1 | 2 | 3;
  durationMs: number;       // ระยะเวลาบันทึก (ms)
  amplitudes: number[];     // RMS amplitude แต่ละ frame (0–255)
  zeroCrossings: number;    // จำนวน zero crossings รวม
  sampleRate: number;       // sample rate ของ AudioContext
}

/** ข้อมูลดิบ tremor ครบ session */
export interface TremorRawData {
  samples: AccelSample[];
  durationMs: number;
  isSimulated: boolean;
}

/** ข้อมูลดิบ gait ครบ session */
export interface GaitRawData {
  samples: AccelSample[];
  durationMs: number;
  isSimulated: boolean;
}

/** ข้อมูลดิบ finger tapping ครบ session (ทั้ง 2 มือ) */
export interface FingerRawData {
  right: TapSample[];
  left: TapSample[];
  durationPerHandMs: number;
}

/** ข้อมูลดิบ speech ครบ session (ทั้ง 3 stage) */
export interface SpeechRawData {
  stages: SpeechStageSample[];
}

/** คำตอบแบบสอบถาม MDS-UPDRS 1 ข้อ */
export interface QuestionAnswer {
  questionIndex: number;
  part: 1 | 2;
  score: number; // 0–4
}

/** ข้อมูลดิบ questionnaire ครบ session */
export interface QuestionnaireRawData {
  answers: QuestionAnswer[];
  partIScore: number;
  partIIScore: number;
  totalScore: number;
}

/** รวมข้อมูลทุก test พร้อมส่ง AI */
export interface AllSensorPayload {
  uid: string;
  collectedAt: string; // ISO timestamp
  speech: SpeechRawData | null;
  tremor: TremorRawData | null;
  finger: FingerRawData | null;
  gait: GaitRawData | null;
  questionnaire: QuestionnaireRawData | null;
}
