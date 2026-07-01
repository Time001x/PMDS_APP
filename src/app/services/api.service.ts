import { Injectable } from '@angular/core';

// ── เปลี่ยน IP ตรงนี้ถ้า IP เปลี่ยน ─────────────────────────
const API_URL = 'http://192.168.0.40:8000';

export interface PredictPayload {
  uid: string;
  SpeechProblems: number;
  Tremor: number;
  PosturalInstability: number;
  Bradykinesia: number;
  UPDRS: number;
  Rigidity: number;
  MoCA: number;
  FunctionalAssessment: number;
  Age: number;
}

export interface PredictResult {
  uid: string;
  riskScore: number;
  riskPercent: number;
  diagnosis: string;
  label: string;
  color: string;
  confidence: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  // ── เช็คว่า API ทำงานอยู่ไหม ──────────────────────────────
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/health`, { method: 'GET' });
      const data = await res.json();
      return data.model_ready === true;
    } catch {
      return false;
    }
  }

  // ── ส่งข้อมูลเซนเซอร์ไปให้โมเดลวิเคราะห์ ──────────────────
  async predict(payload: PredictPayload): Promise<PredictResult> {
    const res = await fetch(`${API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  }

  // ── แปลงค่าจากแอปให้เป็น payload ที่ API รับได้ ────────────
  buildPayload(
    uid: string,
    sessionScores: { [testId: string]: number },
    userAge: number = 60
  ): PredictPayload {
    // แปลง risk score (0-1) จากแต่ละ test เป็น feature ที่โมเดลใช้

    const speech = sessionScores['speech'] || 0;
    const tremor = sessionScores['tremor'] || 0;
    const finger = sessionScores['finger'] || 0;
    const gait = sessionScores['gait'] || 0;
    const questionnaire = sessionScores['questionnaire'] || 0;

    return {
      uid,
      // เสียงพูด: risk score สูง = มีปัญหา (0 หรือ 1)
      SpeechProblems: speech > 0.5 ? 1 : 0,
      // อาการสั่น: แปลงเป็น 0-1
      Tremor: tremor > 0.5 ? 1 : 0,
      // การเดิน → PosturalInstability
      PosturalInstability: gait > 0.5 ? 1 : 0,
      // แตะนิ้ว → Bradykinesia
      Bradykinesia: finger > 0.5 ? 1 : 0,
      // แบบสอบถาม → UPDRS (แปลงจาก 0-1 เป็น 0-100)
      UPDRS: Math.round(questionnaire * 100),
      // ค่าเสริม (ใช้ค่าเฉลี่ยจากทุก test)
      Rigidity: tremor > 0.5 ? 1 : 0,
      MoCA: Math.round(26 - questionnaire * 10), // MoCA ยิ่งต่ำยิ่งเสี่ยง
      FunctionalAssessment: Math.round(100 - questionnaire * 50),
      Age: userAge,
    };
  }
}