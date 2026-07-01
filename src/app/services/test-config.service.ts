import { Injectable } from '@angular/core';

export interface TestConfig {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  bg: string;
  duration: number;
  desc: string;
}

@Injectable({
  providedIn: 'root'
})
export class TestConfigService {

  getTestList(): TestConfig[] {
    return [
      { id: 'speech', name: 'ทดสอบเสียงพูด', shortName: 'เสียง', icon: '🎤', bg: 'rgba(239,68,68,0.1)', duration: 10, desc: 'วิเคราะห์ jitter, shimmer, HNR' },
      { id: 'tremor', name: 'ทดสอบอาการสั่น', shortName: 'สั่น', icon: '📳', bg: 'rgba(245,158,11,0.1)', duration: 15, desc: 'วิเคราะห์การสั่นความถี่ 4-6 Hz' },
      { id: 'finger', name: 'ทดสอบการแตะนิ้ว', shortName: 'นิ้ว', icon: '👆', bg: 'rgba(0,212,170,0.1)', duration: 15, desc: 'วัดความเร็วและความสม่ำเสมอ' },
      { id: 'gait', name: 'ทดสอบการเดิน', shortName: 'เดิน', icon: '🚶', bg: 'rgba(59,130,246,0.1)', duration: 20, desc: 'วิเคราะห์ stride-time variability' },
      { id: 'questionnaire', name: 'แบบสอบถาม', shortName: 'คำถาม', icon: '📝', bg: 'rgba(168,85,247,0.1)', duration: 60, desc: '20 ข้อ ตาม MDS-UPDRS' }
    ];
  }

  getRiskInfo(pct: number | string): { color: string; label: string; badgeClass: string } {
    if (pct === '--') return { color: '#888', label: 'ไม่มีข้อมูล', badgeClass: 'badge-teal' };
    const n = Number(pct);
    if (n < 30) return { color: '#05C134', label: 'ความเสี่ยงต่ำ', badgeClass: 'badge-normal' };
    if (n < 60) return { color: '#F59E0B', label: 'ความเสี่ยงปานกลาง', badgeClass: 'badge-warn' };
    return { color: '#C10508', label: 'ความเสี่ยงสูง', badgeClass: 'badge-risk' };
  }

  readonly weights: { [id: string]: number } = {
    speech: 0.2,
    tremor: 0.25,
    finger: 0.2,
    gait: 0.25,
    questionnaire: 0.1
  };

  calculateTotalRisk(scores: { [id: string]: number }): number {
    const tests = this.getTestList();
    let total = 0;
    for (const t of tests) {
      total += (scores[t.id] || 0) * (this.weights[t.id] || 0.2);
    }
    return Math.min(100, Math.round(total * 100));
  }
}