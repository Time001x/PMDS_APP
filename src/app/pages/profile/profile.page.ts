import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService } from '../../services/db.service';

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class ProfilePage implements OnInit {
  currentUser: any = null;
  avgRisk: number | string = '--';
  historyCount = 0;
  initials = '';

  constructor(
    private db: DbService,
    private router: Router
  ) {}

  ngOnInit() {
    const session = this.db.getSession();
    if (!session) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.currentUser = session;
    this.initials = session.name.split(' ').slice(0,2).map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
    this.loadData();
  }

  loadData() {
    const hist = this.db.getHistory(this.currentUser.uid);
    this.historyCount = hist.length;
    this.avgRisk = hist.length > 0 ? Math.round(hist.reduce((s: number, h: any) => s + h.riskPercent, 0) / hist.length) : '--';
  }

  navTo(page: string) {
    this.router.navigateByUrl('/' + page);
  }

  showAbout() {
    // Will use a modal approach
    alert('Parkinson Multi-Modal Digital Screener (PMDS)\n\nพัฒนาโดยนักศึกษาสาขาวิทยาการคอมพิวเตอร์ และเทคโนโลยีสารสนเทศ คณะวิทยาศาสตร์ มหาวิทยาลัยนเรศวร\n\nระบบนี้ใช้เกณฑ์ MDS-UPDRS เป็นมาตรฐาน\n\n⚠️ ระบบนี้ใช้เพื่อการคัดกรองเบื้องต้นเท่านั้น');
  }

  clearHistory() {
    if (confirm('ล้างประวัติ?\nข้อมูลจะถูกลบถาวรและไม่สามารถกู้คืนได้')) {
      this.db.del('hist_' + this.currentUser.uid);
      this.loadData();
    }
  }

  getHealthLabel(history: string): string {
    const labels: {[key: string]: string} = {
      'none': 'ไม่เคยได้รับการวินิจฉัย',
      'pd': 'ได้รับการวินิจฉัยโรคพาร์กินสัน',
      'suspect': 'สงสัยว่าอาจเป็น PD',
      'family': 'มีประวัติครอบครัว'
    };
    return labels[history] || '-';
  }

  logout() {
    this.db.clearSession();
    this.router.navigateByUrl('/login');
  }
}
