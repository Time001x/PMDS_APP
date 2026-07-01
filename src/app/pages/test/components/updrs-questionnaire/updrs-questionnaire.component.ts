import { Component, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MdsQuestion {
  part: 1 | 2;
  text: string;
}

@Component({
  selector: 'app-updrs-questionnaire',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './updrs-questionnaire.component.html',
  styleUrls: ['./updrs-questionnaire.component.scss']
})
export class UpdrsQuestionnaireComponent {
  /** Emitted when the questionnaire finishes, passing the final risk score (0-1) */
  readonly testCompleted = output<number>();

  // ── MDS-UPDRS Screening Questions (Part I & Part II) ────
  // Part I: Non-Motor Experiences of Daily Living (10 questions)
  // Part II: Motor Experiences of Daily Living (10 questions)
  readonly MDS_QUESTIONS: MdsQuestion[] = [
    // Part I
    { part: 1, text: 'ท่านมีปัญหาเรื่องความจำหรือการจดจำสิ่งต่าง ๆ หรือไม่' },
    { part: 1, text: 'ท่านเคยเห็นภาพหรือได้ยินเสียงที่ผู้อื่นไม่เห็นหรือไม่ได้ยินหรือไม่' },
    { part: 1, text: 'ท่านรู้สึกเศร้า หดหู่ หรือหมดกำลังใจหรือไม่' },
    { part: 1, text: 'ท่านรู้สึกวิตกกังวลหรือกังวลมากผิดปกติหรือไม่' },
    { part: 1, text: 'ท่านมีปัญหาในการนอนหลับตอนกลางคืนหรือไม่' },
    { part: 1, text: 'ท่านง่วงนอนมากผิดปกติในเวลากลางวันหรือไม่' },
    { part: 1, text: 'ท่านมีอาการปวดหรือรู้สึกผิดปกติตามร่างกายหรือไม่' },
    { part: 1, text: 'ท่านมีปัญหาเกี่ยวกับการปัสสาวะหรือไม่' },
    { part: 1, text: 'ท่านมีอาการท้องผูกเป็นประจำหรือไม่' },
    { part: 1, text: 'เมื่อเปลี่ยนจากท่านั่งหรือท่านอนเป็นยืน ท่านมีอาการเวียนศีรษะหรือหน้ามืดหรือไม่' },
    // Part II
    { part: 2, text: 'ท่านมีปัญหาในการพูด เช่น พูดเบา พูดไม่ชัด หรือพูดช้าลงหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการเคี้ยวหรือกลืนอาหารหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการเขียนหนังสือ เช่น ตัวหนังสือเล็กลงหรือเขียนลำบากหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการแต่งตัว เช่น ติดกระดุมหรือรูดซิปลำบากหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการอาบน้ำหรือดูแลสุขอนามัยส่วนตัวหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการทำงานบ้านหรือกิจกรรมที่เคยทำเป็นประจำหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการเดิน เช่น เดินช้าลง ก้าวสั้น หรือเดินลำบากหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการทรงตัว หรือเคยเสียการทรงตัวหรือเกือบล้มบ่อยครั้งหรือไม่' },
    { part: 2, text: 'ท่านมีปัญหาในการลุกจากเก้าอี้หรือเตียงโดยไม่ใช้มือช่วยหรือไม่' },
    { part: 2, text: 'อาการสั่นของมือ ขา หรือส่วนอื่นของร่างกาย รบกวนการใช้ชีวิตประจำวันของท่านมากเพียงใด' },
  ];

  // ── Reactive State ──────────────────────────────────────
  readonly qIndex = signal(0);
  readonly qAnswers = signal<number[]>([]);
  readonly qSelectedScore = signal<number | null>(null);
  readonly questionsCompleted = signal(false);

  // ── Computed State ──────────────────────────────────────
  readonly currentQuestion = computed(() => this.MDS_QUESTIONS[this.qIndex()] ?? null);
  readonly qPart = computed(() => this.qIndex() < 10 ? 1 : 2);
  readonly qPercent = computed(() => Math.round((this.qIndex() / 20) * 100));
  readonly questionProgressText = computed(() => {
    const idx = this.qIndex();
    const part = idx < 10 ? 1 : 2;
    const numInPart = idx < 10 ? idx + 1 : idx - 9;
    return { part, numInPart };
  });

  readonly partIScore = computed(() => {
    const answers = this.qAnswers();
    return answers.slice(0, 10).reduce((a, b) => a + b, 0);
  });

  readonly partIIScore = computed(() => {
    const answers = this.qAnswers();
    return answers.slice(10, 20).reduce((a, b) => a + b, 0);
  });

  readonly totalQScore = computed(() => this.partIScore() + this.partIIScore());

  // ── Public Methods ──────────────────────────────────────

  /** Select a score (0-4) for the current question */
  selectScore(score: number): void {
    this.qSelectedScore.set(score);
  }

  /** Confirm the answer and advance to the next question */
  confirmAnswer(): void {
    const selected = this.qSelectedScore();
    if (selected === null) return;

    const answers = [...this.qAnswers()];
    answers.push(selected);
    this.qAnswers.set(answers);
    this.qSelectedScore.set(null);

    if (this.qIndex() >= this.MDS_QUESTIONS.length - 1) {
      this.finishQuestionnaire();
    } else {
      this.qIndex.update(i => i + 1);
    }
  }

  /** Finish the questionnaire, calculate scores, and emit result */
  finishQuestionnaire(): void {
    this.questionsCompleted.set(true);

    // Normalize: max total = 80 (10 questions * 4 per part * 2 parts)
    const riskScore = Math.min(1, this.totalQScore() / 80);

    // Emit the risk score to parent
    this.testCompleted.emit(riskScore);
  }

  /** Save and go back (called from summary view) */
  saveAndBack(): void {
    // The score was already emitted in finishQuestionnaire,
    // but we re-emit in case the parent needs the signal from this action.
    const riskScore = Math.min(1, this.totalQScore() / 80);
    this.testCompleted.emit(riskScore);
  }

  /** Reset the questionnaire to its initial state */
  resetQuestionnaire(): void {
    this.qIndex.set(0);
    this.qAnswers.set([]);
    this.qSelectedScore.set(null);
    this.questionsCompleted.set(false);
  }

  // ── Template Helpers ────────────────────────────────────

  /** Get color based on score ratio (0-4 for single question, or cumulative) */
  getScoreColor(score: number, max: number): string {
    const ratio = max > 0 ? score / max : 0;
    if (ratio <= 0.25) return '#05C134';
    if (ratio <= 0.5) return '#F59E0B';
    return '#C10508';
  }
}