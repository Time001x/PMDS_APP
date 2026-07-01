import { Injectable } from '@angular/core';

export interface User {
  uid: string;
  name: string;
  age: string;
  gender: string;
  email: string;
  password: string;
  history: string;
  createdAt: string;
}

export interface TestRecord {
  id: number;
  date: string;
  riskPercent: number;
  scores: { [testId: string]: number };
  level: string;
}

export interface UsersDict {
  [uid: string]: User;
}

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private prefix = 'pmds_';

  constructor() {}

  get<T = any>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(this.prefix + key) || 'null');
    } catch {
      return null;
    }
  }

  set(key: string, value: any): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (err: any) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.warn(`[DbService] Storage quota exceeded for key "${this.prefix + key}". Consider clearing old history.`);
      } else {
        console.error(`[DbService] Failed to set "${this.prefix + key}":`, err);
      }
    }
  }

  del(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  getUsers(): UsersDict {
    return this.get<UsersDict>('users') || {};
  }

  saveUsers(u: UsersDict): void {
    this.set('users', u);
  }

  getHistory(uid: string): TestRecord[] {
    return this.get<TestRecord[]>('hist_' + uid) || [];
  }

  addHistory(uid: string, rec: any): void {
    try {
      const h = this.getHistory(uid);
      h.unshift({ ...rec, id: Date.now(), date: new Date().toISOString() });
      this.set('hist_' + uid, h.slice(0, 50));
    } catch (err: any) {
      console.error(`[DbService] Failed to add history for uid="${uid}":`, err);
    }
  }

  getSession(): User | null {
    return this.get<User>('session');
  }

  setSession(user: User): void {
    this.set('session', user);
  }

  clearSession(): void {
    this.del('session');
  }

  getSessionScores(uid: string): { [testId: string]: number } {
    return this.get<{ [testId: string]: number }>('session_scores_' + uid) || {};
  }

  setSessionScores(uid: string, scores: { [testId: string]: number }): void {
    this.set('session_scores_' + uid, scores);
  }

  clearSessionScores(uid: string): void {
    this.del('session_scores_' + uid);
  }
}