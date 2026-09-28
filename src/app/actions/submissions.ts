'use server';

import { normalizeName } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { 
  getSheetValues, 
  appendSheetRows, 
  updateSheetRow, 
  deleteSheetRow 
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

function toDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function toYYYYMMDD(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('-');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
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

  // 2. Combine GP names with '+' (e.g. SAHEBGANJ+BARASAKDAL)
  const gpNames = Array.from(new Set(data.items.map(item => item.gpName.trim()).filter(Boolean))).join('+');

  // 3. Fetch existing rows from the target sheet
  const rows = await getSheetValues(sheetTitle, 'A1:J');

  // 4. Scan backwards to find the last data row and calculate SL NO.
  let lastDataRow: string[] | null = null;
  let lastDataDate = '';
  let lastSlNoForDate = 0;

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y')) {
      if (!lastDataRow) {
        lastDataRow = r;
        lastDataDate = r[1]?.trim() || '';
      }
      if (r[1]?.trim() === formattedDate) {
        const sl = parseInt(r[0], 10);
        if (!isNaN(sl) && sl > lastSlNoForDate) {
          lastSlNoForDate = sl;
        }
      }
    }
  }

  const rowsToAppend: any[][] = [];

  // 5. Date change logic:
  // If there are existing data rows and date changed, insert HEADER_ROW and start SL NO. at 1
  if (lastDataRow && lastDataDate !== formattedDate) {
    rowsToAppend.push(HEADER_ROW);
    rowsToAppend.push([
      1,
      formattedDate,
      dioName,
      gpNames,
      dayAmount,
      nightAmount,
      totalAmount,
      rejectAmount,
      mobile,
      ''
    ]);
  } else {
    // Same date or first entry in sheet
    const nextSlNo = lastSlNoForDate + 1;
    rowsToAppend.push([
      nextSlNo,
      formattedDate,
      dioName,
      gpNames,
      dayAmount,
      nightAmount,
      totalAmount,
      rejectAmount,
      mobile,
      ''
    ]);
  }

  await appendSheetRows(sheetTitle, rowsToAppend);

  revalidatePath('/old');
  revalidatePath('/');
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

    revalidatePath('/old');
    revalidatePath('/');
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

    revalidatePath('/old');
    revalidatePath('/');
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
