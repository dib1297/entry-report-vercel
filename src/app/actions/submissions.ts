'use server';

import { normalizeName } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { 
  getSheetValues, 
  appendSheetRows, 
  updateSheetRow, 
  deleteSheetRow,
  insertSheetRow,
  insertSheetRows,
  formatRowLikeHeader
} from '@/lib/google-sheets';

const HEADER_ROW = [
  "SL NO.",
  "DATE",
  "DIO NAME",
  "GP NAME",
  "DAY",
  "NIGHT",
  "TOTAL (UPLOADING)",
  "REJECT",
  "MOBILE",
  "WORK F HOME"
];

function safeRevalidate() {
  try {
    revalidatePath('/old');
    revalidatePath('/');
  } catch (_) {
    // Intentionally ignored when invoked outside Next.js request context (e.g. testing/scripts)
  }
}

function toDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim().replace(/\//g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    } else if (parts[2].length === 4) {
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
  }
  return clean;
}

function toYYYYMMDD(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim().replace(/\//g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    } else if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  return clean;
}

function parseDateToTime(dateStr: string): number {
  const ddmmyyyy = toDDMMYYYY(dateStr);
  const parts = ddmmyyyy.split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d).getTime();
  }
  return 0;
}

export async function createSubmission(data: {
  date: string;
  name: string;
  mobile?: string;
  recordType: string;
  items: {
    gpName: string;
    shift: string;
    amount: number;
    problemAmount: number;
  }[];
}) {
  const sheetTitle = data.recordType === 'ENTRY' ? 'Entry' : 'Verified';
  const formattedDate = toDDMMYYYY(data.date);
  const dioName = normalizeName(data.name);
  const mobile = data.mobile ? data.mobile.trim() : '';

  // 1. Calculate Day & Night totals
  const dayAmount = data.items
    .filter(item => item.shift === 'DAY')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const nightAmount = data.items
    .filter(item => item.shift === 'NIGHT')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const totalAmount = dayAmount + nightAmount;

  const rejectAmount = data.items
    .reduce((sum, item) => sum + (Number(item.problemAmount) || 0), 0);

  // 2. Fetch existing rows from the target sheet
  const rows = await getSheetValues(sheetTitle, 'A1:J');

  // Ensure any existing repeated header rows in the sheet have exact same styling as Row 2
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (r && r[0] === 'SL NO.' && r[1] === 'DATE') {
      try {
        await formatRowLikeHeader(sheetTitle, i + 1);
      } catch (_) {}
    }
  }

  // 3. Check if DIO already has a row on the SAME DATE in this sheet
  // Rule: A DIO name cannot appear twice on the same date; GP names merge with '+' and amounts add up
  let existingRowIndex = -1;
  let existingRow: string[] | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y')) {
      const rowDate = toDDMMYYYY(r[1] || '');
      const rowDioName = (r[2] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const searchDioName = dioName.toLowerCase().replace(/\s+/g, ' ');

      if (rowDate === formattedDate && rowDioName === searchDioName) {
        existingRowIndex = i + 1; // Google Sheets row number (1-indexed)
        existingRow = r;
        break;
      }
    }
  }

  // 4. If existing row on same date is found, update in-place without adding duplicate row
  if (existingRow && existingRowIndex > 0) {
    const existingSlNo = existingRow[0] || '1';
    const existingGpRaw = existingRow[3] || '';
    const existingGps = existingGpRaw.split('+').map(g => g.trim()).filter(Boolean);
    const newGps = data.items.map(item => item.gpName?.trim()).filter(Boolean);

    // Merge GP names: combine distinct GPs preserving order
    const mergedGps: string[] = [...existingGps];
    for (const gp of newGps) {
      if (!mergedGps.some(existing => existing.toLowerCase() === gp.toLowerCase())) {
        mergedGps.push(gp);
      }
    }
    const finalGpNames = mergedGps.join('+');

    const existingDay = Number(existingRow[4]) || 0;
    const existingNight = Number(existingRow[5]) || 0;
    const existingReject = Number(existingRow[7]) || 0;
    const existingMobile = existingRow[8]?.trim() || '';
    const existingWorkFHome = existingRow[9] || '';

    const updatedDay = existingDay + dayAmount;
    const updatedNight = existingNight + nightAmount;
    const updatedTotal = updatedDay + updatedNight;
    const updatedReject = existingReject + rejectAmount;
    const updatedMobile = mobile || existingMobile;

    const updatedRow = [
      existingSlNo,
      formattedDate,
      dioName,
      finalGpNames,
      updatedDay,
      updatedNight,
      updatedTotal,
      updatedReject,
      updatedMobile,
      existingWorkFHome
    ];

    await updateSheetRow(sheetTitle, existingRowIndex, updatedRow);

    safeRevalidate();
    return { success: true };
  }

  // 5. New entry on this date: check if this date already has an existing section in the sheet
  const newGpNames = Array.from(new Set(data.items.map(item => item.gpName.trim()).filter(Boolean))).join('+');

  let lastRowIndexForThisDate = -1; // 1-based index in sheet
  let maxSlNoForThisDate = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y')) {
      const rowDate = toDDMMYYYY(r[1] || '');
      if (rowDate === formattedDate) {
        lastRowIndexForThisDate = i + 1;
        const sl = parseInt(r[0], 10);
        if (!isNaN(sl) && sl > maxSlNoForThisDate) {
          maxSlNoForThisDate = sl;
        }
      }
    }
  }

  // Case A: This date already has a section in the sheet
  if (lastRowIndexForThisDate > 0) {
    const nextSlNo = maxSlNoForThisDate + 1;
    const newRow = [
      nextSlNo,
      formattedDate,
      dioName,
      newGpNames,
      dayAmount,
      nightAmount,
      totalAmount,
      rejectAmount,
      mobile,
      ''
    ];

    if (lastRowIndexForThisDate < rows.length) {
      // Subsequent date sections (e.g. 30th date section) already exist below this date!
      // Insert right after the last row of this date (at lastRowIndexForThisDate + 1)
      await insertSheetRow(sheetTitle, lastRowIndexForThisDate + 1, newRow);
    } else {
      // This date section is currently the last section in the sheet
      await appendSheetRows(sheetTitle, [newRow]);
    }

    safeRevalidate();
    return { success: true };
  }

  // Case B: This date has no data rows in the sheet yet
  const targetTime = parseDateToTime(formattedDate);
  let firstLaterRowIndex = -1; // 1-based index where a later date starts

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y')) {
      const rowDate = toDDMMYYYY(r[1] || '');
      const rowTime = parseDateToTime(rowDate);
      if (rowTime > targetTime) {
        // Found a later date section!
        // If the row above is HEADER_ROW, insert before HEADER_ROW
        if (i > 0 && rows[i - 1][0] === 'SL NO.') {
          firstLaterRowIndex = i; // 1-based index of HEADER_ROW
        } else {
          firstLaterRowIndex = i + 1;
        }
        break;
      }
    }
  }

  const rowsToInsert: any[][] = [];
  rowsToInsert.push(HEADER_ROW);
  rowsToInsert.push([
    1,
    formattedDate,
    dioName,
    newGpNames,
    dayAmount,
    nightAmount,
    totalAmount,
    rejectAmount,
    mobile,
    ''
  ]);

  if (firstLaterRowIndex > 0) {
    // Older date submitted that belongs before a later date
    await insertSheetRows(sheetTitle, firstLaterRowIndex, rowsToInsert);
    try {
      await formatRowLikeHeader(sheetTitle, firstLaterRowIndex);
    } catch (_) {}
  } else {
    // Newer date (or first date in fresh sheet)
    const hasExistingData = rows.some(r => r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y'));
    if (hasExistingData) {
      const appendRes = await appendSheetRows(sheetTitle, rowsToInsert);
      try {
        const match = appendRes?.updates?.updatedRange?.match(/A(\d+):/);
        const headerRowIdx = match ? parseInt(match[1], 10) : (rows.length + 1);
        await formatRowLikeHeader(sheetTitle, headerRowIdx);
      } catch (_) {}
    } else {
      // First date in fresh sheet (row 2 is already HEADER_ROW)
      await appendSheetRows(sheetTitle, [
        [
          1,
          formattedDate,
          dioName,
          newGpNames,
          dayAmount,
          nightAmount,
          totalAmount,
          rejectAmount,
          mobile,
          ''
        ]
      ]);
    }
  }

  safeRevalidate();
  return { success: true };
}

export async function updateSubmission(
  id: string,
  data: {
    date: string;
    name: string;
    mobile?: string;
    recordType: string;
    items: {
      gpName: string;
      shift: string;
      amount: number;
      problemAmount: number;
    }[];
  }
) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [originalRecType, rowIndexStr] = decoded.split('|');
    const rowIndex = parseInt(rowIndexStr, 10);
    const sheetTitle = originalRecType === 'ENTRY' ? 'Entry' : 'Verified';

    const formattedDate = toDDMMYYYY(data.date);
    const dioName = normalizeName(data.name);
    const mobile = data.mobile ? data.mobile.trim() : '';

    const dayAmount = data.items
      .filter(item => item.shift === 'DAY')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const nightAmount = data.items
      .filter(item => item.shift === 'NIGHT')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const totalAmount = dayAmount + nightAmount;
    const rejectAmount = data.items.reduce((sum, item) => sum + (Number(item.problemAmount) || 0), 0);
    const gpNames = Array.from(new Set(data.items.map(item => item.gpName.trim()).filter(Boolean))).join('+');

    const currentRows = await getSheetValues(sheetTitle, `A${rowIndex}:J${rowIndex}`);
    const slNo = currentRows[0]?.[0] || 1;

    const updatedRow = [
      slNo,
      formattedDate,
      dioName,
      gpNames,
      dayAmount,
      nightAmount,
      totalAmount,
      rejectAmount,
      mobile,
      ''
    ];

    await updateSheetRow(sheetTitle, rowIndex, updatedRow);

    safeRevalidate();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update record' };
  }
}

export async function deleteSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [recType, rowIndexStr] = decoded.split('|');
    const rowIndex = parseInt(rowIndexStr, 10);
    const sheetTitle = recType === 'ENTRY' ? 'Entry' : 'Verified';

    await deleteSheetRow(sheetTitle, rowIndex);

    safeRevalidate();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete record' };
  }
}

export async function getSubmissions(query?: { name?: string; date?: string; recordType?: string }) {
  if (!query || Object.keys(query).length === 0) return [];

  const titlesToFetch: ('Entry' | 'Verified')[] = [];
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'ENTRY') {
    titlesToFetch.push('Entry');
  }
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'VERIFY') {
    titlesToFetch.push('Verified');
  }

  const results: any[] = [];
  const queryName = query.name ? query.name.trim().toLowerCase() : '';
  const queryDate = query.date ? toDDMMYYYY(query.date.trim()) : '';

  for (const sheetTitle of titlesToFetch) {
    const rows = await getSheetValues(sheetTitle, 'A1:J');
    const recType = sheetTitle === 'Entry' ? 'ENTRY' : 'VERIFY';

    rows.forEach((r, idx) => {
      const rowIndex = idx + 1;
      if (!r || r.length < 2) return;
      if (r[0] === 'SL NO.' || r[1] === 'DATE' || r[0]?.includes('M M S B Y')) return;

      const slNo = parseInt(r[0], 10) || 0;
      const date = r[1]?.trim() || '';
      const name = r[2]?.trim() || '';
      const gpName = r[3]?.trim() || '';
      const day = Number(r[4]) || 0;
      const night = Number(r[5]) || 0;
      const total = Number(r[6]) || 0;
      const reject = Number(r[7]) || 0;
      const mobile = r[8]?.trim() || '';

      if (queryName && !name.toLowerCase().includes(queryName)) return;
      if (queryDate && date !== queryDate) return;
      if (query.recordType && query.recordType !== 'All' && query.recordType !== recType) return;

      const uiId = Buffer.from(`${recType}|${rowIndex}|${date}|${name}`).toString('base64url');

      const gpParts = gpName.split('+').map(g => g.trim()).filter(Boolean);
      const items: any[] = [];
      if (gpParts.length > 0) {
        if (day > 0 || (day === 0 && night === 0)) {
          items.push({ gpName: gpParts[0], shift: 'DAY', amount: day, problemAmount: reject });
        }
        if (night > 0) {
          items.push({ gpName: gpParts[gpParts.length > 1 ? 1 : 0], shift: 'NIGHT', amount: night, problemAmount: 0 });
        }
        for (let k = 2; k < gpParts.length; k++) {
          items.push({ gpName: gpParts[k], shift: 'DAY', amount: 0, problemAmount: 0 });
        }
      } else {
        items.push({ gpName: '', shift: 'DAY', amount: day, problemAmount: reject });
      }

      const now = new Date();
      const todayFormatted = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
      const isToday = date === todayFormatted;

      results.push({
        id: uiId,
        rowIndex,
        slNo,
        date: toYYYYMMDD(date),
        displayDate: date,
        name,
        mobile,
        gpName,
        day,
        night,
        total,
        reject,
        recordType: recType,
        items,
        isEditable: isToday,
        editUntil: new Date(now.getTime() + 30 * 60 * 1000)
      });
    });
  }

  return results.reverse();
}

export async function getSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [recType, rowIndexStr, date, name] = decoded.split('|');
    const rowIndex = parseInt(rowIndexStr, 10);
    const sheetTitle = recType === 'ENTRY' ? 'Entry' : 'Verified';

    const rows = await getSheetValues(sheetTitle, `A${rowIndex}:J${rowIndex}`);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];

    const slNo = parseInt(r[0], 10) || 0;
    const rowDate = r[1]?.trim() || '';
    const rowName = r[2]?.trim() || '';
    const gpName = r[3]?.trim() || '';
    const day = Number(r[4]) || 0;
    const night = Number(r[5]) || 0;
    const total = Number(r[6]) || 0;
    const reject = Number(r[7]) || 0;
    const mobile = r[8]?.trim() || '';

    const gpParts = gpName.split('+').map(g => g.trim()).filter(Boolean);
    const items: any[] = [];
    if (day > 0 || (day === 0 && night === 0)) {
      items.push({ gpName: gpParts[0] || '', shift: 'DAY', amount: day, problemAmount: reject });
    }
    if (night > 0) {
      items.push({ gpName: gpParts[gpParts.length > 1 ? 1 : 0] || '', shift: 'NIGHT', amount: night, problemAmount: 0 });
    }
    for (let k = 2; k < gpParts.length; k++) {
      items.push({ gpName: gpParts[k], shift: 'DAY', amount: 0, problemAmount: 0 });
    }

    const now = new Date();
    return {
      id,
      rowIndex,
      slNo,
      date: toYYYYMMDD(rowDate),
      displayDate: rowDate,
      name: rowName,
      mobile,
      gpName,
      day,
      night,
      total,
      reject,
      recordType: recType as 'ENTRY' | 'VERIFY',
      items,
      editUntil: new Date(now.getTime() + 30 * 60 * 1000)
    };
  } catch (e) {
    return null;
  }
}
