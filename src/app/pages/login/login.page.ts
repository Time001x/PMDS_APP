import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../services/db.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LoginPage {
  email = '';
  password = '';
  toastMessage = '';
  toastType = '';
  toastVisible = false;
  private toastTimeout: any;

  constructor(
    private db: DbService,
    private router: Router
  ) {}

  doLogin() {
    if (!this.email.trim() || !this.password) {
      this.showToast('กรุณากรอกข้อมูลให้ครบ', 'warn');
      return;
    }

    const users = this.db.getUsers();
    const user = Object.values(users).find(
      (u: any) => u.email === this.email.trim() && u.password === btoa(this.password)
    );

    if (!user) {
      this.showToast('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'danger');
      return;
    }

    this.db.setSession(user);
    this.showToast('เข้าสู่ระบบสำเร็จ 👋', 'good');
    setTimeout(() => {
      this.router.navigateByUrl('/home');
    }, 600);
  }

  goRegister() {
    this.router.navigateByUrl('/register');
  }

  private showToast(msg: string, type: string) {
    this.toastMessage = msg;
    this.toastType = type;
    this.toastVisible = true;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastVisible = false, 2500);
  }
}