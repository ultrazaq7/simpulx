// ============================================================
// Google Sheets Service — Append rows via Service Account
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class GoogleSheetsService {
  private logger = new Logger('GoogleSheetsService');
  private auth: any;

  constructor(private readonly configService: ConfigService) {
    const keyPath = path.resolve(
      this.configService.get<string>('GCP_KEY_FILE', '/etc/simpulx/gcp-key.json'),
    );
    if (fs.existsSync(keyPath)) {
      this.auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      this.logger.log('✅ Google Sheets service initialized');
    } else {
      this.logger.warn('⚠️ GCP key file not found at ' + keyPath);
    }
  }

  async appendRow(
    spreadsheetId: string,
    sheetName: string,
    values: string[],
  ): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Sheets not configured — GCP key missing');
    }

    const sheets = google.sheets({ version: 'v4', auth: this.auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });

    this.logger.log(`✅ Row appended to ${spreadsheetId} / ${sheetName}`);
  }
}
