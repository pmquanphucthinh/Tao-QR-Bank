import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap } from 'rxjs';

interface Bank {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string;
  transferSupported: number;
  lookupSupported: number;
}

interface BankAPIResponse {
  code: string;
  desc: string;
  data: Bank[];
}

interface SavedAccount {
  bin: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
}

const SAVED_ACCOUNT_KEY = 'vietqr_saved_account';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);

  banks = signal<Bank[]>([]);
  loadingStatus = signal<'loading' | 'loaded' | 'error'>('loading');
  savedAccount = signal<SavedAccount | null>(null);

  selectedBankBin = signal('');
  accountNumber = signal('');
  accountName = signal('');
  amount = signal<number | null>(null);

  constructor() {
    this.loadSavedAccountFromStorage();
  }

  ngOnInit() {
    this.http.get<BankAPIResponse>('https://api.vietqr.io/v2/banks')
      .pipe(
        map(response => response.data.filter(bank => bank.transferSupported === 1)),
        tap(banks => {
          const saved = this.savedAccount();
          if (saved && !banks.some(b => b.bin === saved.bin)) {
            this.forgetAccount();
          }
        }),
        catchError(() => {
          this.loadingStatus.set('error');
          return of([]);
        })
      )
      .subscribe(banks => {
        this.banks.set(banks);
        if (this.loadingStatus() !== 'error') {
            this.loadingStatus.set('loaded');
        }
      });
  }

  private loadSavedAccountFromStorage(): void {
    try {
      const savedData = localStorage.getItem(SAVED_ACCOUNT_KEY);
      if (savedData) {
        const account: SavedAccount = JSON.parse(savedData);
        this.savedAccount.set(account);
        this.selectedBankBin.set(account.bin);
        this.accountNumber.set(account.accountNumber);
        this.accountName.set(account.accountName);
      }
    } catch (e) {
      console.error('Failed to load saved account', e);
      localStorage.removeItem(SAVED_ACCOUNT_KEY);
    }
  }

  saveAccount(): void {
    const bin = this.selectedBankBin();
    const accNum = this.accountNumber();
    const accName = this.accountName();
    const bank = this.banks().find(b => b.bin === bin);

    if (!this.canSave() || !bank) {
      return;
    }

    const accountToSave: SavedAccount = {
      bin,
      accountNumber: accNum,
      accountName: accName,
      bankName: bank.shortName
    };

    try {
      localStorage.setItem(SAVED_ACCOUNT_KEY, JSON.stringify(accountToSave));
      this.savedAccount.set(accountToSave);
    } catch(e) {
      console.error('Failed to save account', e);
    }
  }

  forgetAccount(): void {
    try {
      localStorage.removeItem(SAVED_ACCOUNT_KEY);
      this.savedAccount.set(null);
      this.selectedBankBin.set('');
      this.accountNumber.set('');
      this.accountName.set('');
      this.amount.set(null);
    } catch (e) {
      console.error('Failed to remove saved account', e);
    }
  }

  canSave = computed(() => {
    return !!(this.selectedBankBin() && this.accountNumber() && this.accountName());
  });

  qrCodeUrl = computed(() => {
    const bin = this.selectedBankBin();
    const accNum = this.accountNumber().replace(/\s/g, '');

    if (!bin || !accNum) {
      return '';
    }

    const name = this.accountName();
    const amt = this.amount();
    const template = 'compact2';

    let url = `https://img.vietqr.io/image/${bin}-${accNum}-${template}.png`;
    
    const params = new URLSearchParams();
    if (name) {
      params.append('accountName', name);
    }
    if (amt && amt > 0) {
      params.append('amount', amt.toString());
    }
    
    const paramString = params.toString();
    if (paramString) {
      url += `?${paramString}`;
    }

    return url;
  });

  get qrFileName(): string {
    const bin = this.selectedBankBin();
    const accNum = this.accountNumber();
    if (!bin || !accNum) {
      return 'vietqr.png';
    }
    return `vietqr-${bin}-${accNum}.png`;
  }
}
