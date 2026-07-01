import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../services/db.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register',
  templateUrl: 'register.page.html',
  styleUrls: ['register.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class RegisterPage {
  name = '';
  age = '';
  gender = '';
  email = '';
  password = '';
  history = 'none';
  toastMessage = '';
  toastType = '';
  toastVisible = false;
  private toastTimeout: any;

  constructor(
    private db: DbService,
    private router: Router
  ) {}

  doRegister() {
    if (!this.name.trim() || !this.email.trim() || !this.password) {
      this.showToast('กรุณากรอกข้อมูลให้ครบ', 'warn');
      return;
    }

    if (this.password.length < 6) {
      this.showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'warn');
      return;
    }

    const users = this.db.getUsers();
    const existing = Object.values(users).find((u: any) => u.email === this.email.trim());
    if (existing) {
      this.showToast('อีเมลนี้มีผู้ใช้งานแล้ว', 'warn');
      return;
    }

    const uid = 'u' + Date.now();
    const user = {
      uid,
      name: this.name.trim(),
      age: this.age,
      gender: this.gender,
      email: this.email.trim(),
      password: btoa(this.password),
      history: this.history,
      createdAt: new Date().toISOString()
    };

    users[uid] = user;
    this.db.saveUsers(users);
    this.db.setSession(user);

    this.showToast('สมัครสมาชิกสำเร็จ 🎉', 'good');
    setTimeout(() => {
      this.router.navigateByUrl('/home');
    }, 600);
  }

  goLogin() {
    this.router.navigateByUrl('/login');
  }

  private showToast(msg: string, type: string) {
    this.toastMessage = msg;
    this.toastType = type;
    this.toastVisible = true;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastVisible = false, 2500);
  }
}