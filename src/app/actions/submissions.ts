'use server';

import { normalizeName, canonicalGp, isAllGpAccess, GP_LIST } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { getSession, fetchUsersFromGoogleSheet } from '@/lib/auth';
import { 
  getSheetValues, 
  appendSheetRows, 
  updateSheetRow, 
  deleteSheetRow,
  insertSheetRow,
  insertSheetRows,
  formatRowLikeHeader,
  adjustGpCellFontSize,
  adjustAllGpFontSizes,
  formatDataRow,
  clearColumnL
} from '@/lib/google-sheets';

const HEADER_ROW = [
  "SL NO.",
  "DATE",
  "DEO NAME",
  "GP NAME",
  "DAY",
  "NIGHT",
  "TOTAL",
  "REJECT",
  "MOBILE",
  "WORK F HOME QTY",
  "WORK F HOME GP"
];

function extractRowData(r: string[]) {
  const slNo = parseInt(r[0], 10) || 0;
  const date = r[1]?.trim() || '';
  const name = r[2]?.trim() || '';
  const gpName = r[3]?.trim() || '';
  const day = Number(r[4]) || 0;
  const night = Number(r[5]) || 0;
  const total = Number(r[6]) || 0;
  const reject = Number(r[7]) || 0;
  const mobile = r[8]?.trim() || '';

  let wfhQty: number | undefined = undefined;
  let wfhGp: string = '';
  let rawTimestamp: string = '';

  const col9 = r[9]?.trim() || '';
  const col10 = r[10]?.trim() || '';
  const col11 = r[11]?.trim() || '';

  if (col11) {
    rawTimestamp = col11;
    if (col9 && !isNaN(Number(col9))) wfhQty = Number(col9);
    wfhGp = canonicalGp(col10);
  } else if (col10) {
    if (col10.includes('T') && (col10.includes(':') || col10.endsWith('Z'))) {
      rawTimestamp = col10;
      if (col9 && !isNaN(Number(col9))) wfhQty = Number(col9);
    } else {
      wfhGp = canonicalGp(col10);
      if (col9 && !isNaN(Number(col9))) wfhQty = Number(col9);
    }
  } else if (col9) {
    if (col9.includes('T') && (col9.includes(':') || col9.endsWith('Z'))) {
      rawTimestamp = col9;
    } else if (!isNaN(Number(col9))) {
      wfhQty = Number(col9);
    }
  }

  return {
    slNo,
    date,
    name,
    gpName,
    day,
    night,
    total,
    reject,
    mobile,
    workFromHomeQty: wfhQty,
    workFromHomeGp: wfhGp,
    rawTimestamp
  };
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

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

function normalizeGpName(gp: string): string {
  return canonicalGp(gp);
}

export async function createSubmission(data: {
  date: string;
  name: string;
  mobile?: string;
  recordType: string;
  workFromHomeGp?: string;
  workFromHomeQty?: number;
  items: {
    gpName: string;
    shift: string;
    amount: number;
    problemAmount: number;
  }[];
}) {
  const sheetTitle = data.recordType === 'ENTRY' ? 'Entry' : 'Verified';
  const formattedDate = toDDMMYYYY(data.date);
  const session = await getSession();
  let deoName = session?.name ? normalizeName(session.name) : normalizeName(data.name);
  let mobile = session?.mobile ? session.mobile.trim() : (data.mobile ? data.mobile.trim() : '');

  // Live real-time sync with Google Sheet
  if (mobile) {
    try {
      const liveUsers = await fetchUsersFromGoogleSheet();
      const currentLive = liveUsers.find(u => u.mobile === mobile);
      if (currentLive) {
        if (currentLive.access === 'NO') {
          return { success: false, error: 'Your account access has been revoked.' };
        }
        if (currentLive.name) {
          deoName = normalizeName(currentLive.name);
        }
      }
    } catch (_) {}
  }

  // GP authorization check
  const isAllGp = isAllGpAccess(session?.gp) || (session?.allowedGps && session.allowedGps.length >= GP_LIST.length);
  if (!isAllGp && session?.allowedGps && session.allowedGps.length > 0) {
    for (const item of data.items) {
      const canonical = canonicalGp(item.gpName);
      if (!session.allowedGps.includes(canonical)) {
        return { success: false, error: `Unauthorized GP "${item.gpName}". You only have access to: ${session.allowedGps.join(', ')}` };
      }
    }
  }

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

  const wfhQtyVal = (data.workFromHomeQty !== undefined && data.workFromHomeQty !== null && !isNaN(Number(data.workFromHomeQty)) && Number(data.workFromHomeQty) > 0)
    ? Number(data.workFromHomeQty)
    : '';
  const wfhGpVal = data.workFromHomeGp ? canonicalGp(data.workFromHomeGp) : '';

  // 1. Group items by distinct GP (preserving order of entry)
  const distinctGps: string[] = [];
  data.items.forEach(item => {
    const cGp = canonicalGp(item.gpName?.trim() || '');
    if (cGp && !distinctGps.includes(cGp)) {
      distinctGps.push(cGp);
    }
  });

  if (distinctGps.length === 0 && data.items.length > 0) {
    distinctGps.push(canonicalGp(data.items[0].gpName?.trim() || '') || data.items[0].gpName?.trim() || '');
  }

  const gpRowsData = distinctGps.map((gp, idx) => {
    const gpItems = data.items.filter(item => canonicalGp(item.gpName?.trim() || '') === gp);
    const dayAmount = gpItems
      .filter(item => item.shift === 'DAY')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const nightAmount = gpItems
      .filter(item => item.shift === 'NIGHT')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalAmount = dayAmount + nightAmount;
    const rejectAmount = gpItems
      .reduce((sum, item) => sum + (Number(item.problemAmount) || 0), 0);

    return {
      gpName: gp,
      dayAmount,
      nightAmount,
      totalAmount,
      rejectAmount,
      // Only attach WFH details to the first row of this submission
      wfhQty: idx === 0 ? wfhQtyVal : '',
      wfhGp: idx === 0 ? wfhGpVal : '',
    };
  });

  // 2. Fetch existing rows from the target sheet
  const rows = await getSheetValues(sheetTitle, 'A1:L');

  // Ensure any existing repeated header rows in the sheet have exact same styling as Row 2
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (r && r[0] === 'SL NO.' && r[1] === 'DATE') {
      try {
        await formatRowLikeHeader(sheetTitle, i + 1);
      } catch (_) {}
    }
  }

  // Ensure all existing rows have proper font size
  try {
    await adjustAllGpFontSizes(sheetTitle, rows);
  } catch (_) {}

  // 3. Check if this date already has an existing section in the sheet
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
    const rowsToAdd = gpRowsData.map((gpData, idx) => {
      const nextSlNo = maxSlNoForThisDate + 1 + idx;
      return [
        nextSlNo,
        formattedDate,
        deoName,
        gpData.gpName,
        gpData.dayAmount,
        gpData.nightAmount,
        gpData.totalAmount,
        gpData.rejectAmount,
        mobile,
        gpData.wfhQty,
        gpData.wfhGp
      ];
    });

    if (lastRowIndexForThisDate < rows.length) {
      // Subsequent date sections exist below this date!
      // Insert right after the last row of this date (at lastRowIndexForThisDate + 1)
      const insertAtRow = lastRowIndexForThisDate + 1;
      await insertSheetRows(sheetTitle, insertAtRow, rowsToAdd);
      for (let k = 0; k < rowsToAdd.length; k++) {
        const targetRow = insertAtRow + k;
        try {
          await adjustGpCellFontSize(sheetTitle, targetRow, gpRowsData[k].gpName);
          await formatDataRow(sheetTitle, targetRow);
        } catch (_) {}
      }
    } else {
      // This date section is currently the last section in the sheet
      const appendRes = await appendSheetRows(sheetTitle, rowsToAdd);
      try {
        const match = appendRes?.updates?.updatedRange?.match(/A(\d+):/);
        const startRowIdx = match ? parseInt(match[1], 10) : (rows.length + 1);
        for (let k = 0; k < rowsToAdd.length; k++) {
          const targetRow = startRowIdx + k;
          await adjustGpCellFontSize(sheetTitle, targetRow, gpRowsData[k].gpName);
          await formatDataRow(sheetTitle, targetRow);
        }
      } catch (_) {}
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

  const rowsToAdd = gpRowsData.map((gpData, idx) => {
    const slNo = 1 + idx;
    return [
      slNo,
      formattedDate,
      deoName,
      gpData.gpName,
      gpData.dayAmount,
      gpData.nightAmount,
      gpData.totalAmount,
      gpData.rejectAmount,
      mobile,
      gpData.wfhQty,
      gpData.wfhGp
    ];
  });

  if (firstLaterRowIndex > 0) {
    // Older date submitted that belongs before a later date
    const rowsToInsert = [HEADER_ROW, ...rowsToAdd];
    await insertSheetRows(sheetTitle, firstLaterRowIndex, rowsToInsert);
    try {
      await formatRowLikeHeader(sheetTitle, firstLaterRowIndex);
      for (let k = 0; k < rowsToAdd.length; k++) {
        const targetRow = firstLaterRowIndex + 1 + k;
        await adjustGpCellFontSize(sheetTitle, targetRow, gpRowsData[k].gpName);
        await formatDataRow(sheetTitle, targetRow);
      }
    } catch (_) {}
  } else {
    // Newer date (or first date in fresh sheet)
    const hasExistingData = rows.some(r => r && r.length >= 2 && r[0] !== 'SL NO.' && r[1] !== 'DATE' && !r[0]?.includes('M M S B Y'));
    if (hasExistingData) {
      const rowsToAppend = [HEADER_ROW, ...rowsToAdd];
      const appendRes = await appendSheetRows(sheetTitle, rowsToAppend);
      try {
        const match = appendRes?.updates?.updatedRange?.match(/A(\d+):/);
        const headerRowIdx = match ? parseInt(match[1], 10) : (rows.length + 1);
        await formatRowLikeHeader(sheetTitle, headerRowIdx);
        for (let k = 0; k < rowsToAdd.length; k++) {
          const targetRow = headerRowIdx + 1 + k;
          await adjustGpCellFontSize(sheetTitle, targetRow, gpRowsData[k].gpName);
          await formatDataRow(sheetTitle, targetRow);
        }
      } catch (_) {}
    } else {
      // First date in fresh sheet (row 2 is already HEADER_ROW)
      const appendRes = await appendSheetRows(sheetTitle, rowsToAdd);
      try {
        const match = appendRes?.updates?.updatedRange?.match(/A(\d+):/);
        const startRowIdx = match ? parseInt(match[1], 10) : 3;
        for (let k = 0; k < rowsToAdd.length; k++) {
          const targetRow = startRowIdx + k;
          await adjustGpCellFontSize(sheetTitle, targetRow, gpRowsData[k].gpName);
          await formatDataRow(sheetTitle, targetRow);
        }
      } catch (_) {}
    }
  }

  safeRevalidate();
  return { success: true };
}

function parseSheetRowToItems(gpName: string, day: number, night: number, reject: number) {
  const gpParts = (gpName || '').split('+').map(g => canonicalGp(g.trim())).filter(Boolean);
  const items: { gpName: string; shift: 'DAY' | 'NIGHT'; amount: number; problemAmount: number }[] = [];

  if (gpParts.length === 0) {
    items.push({ gpName: '', shift: day >= night ? 'DAY' : 'NIGHT', amount: day || night || 0, problemAmount: reject });
    return items;
  }

  if (day > 0 && night > 0) {
    items.push({ gpName: gpParts[0], shift: 'DAY', amount: day, problemAmount: reject });
    items.push({ gpName: gpParts[1] || gpParts[0], shift: 'NIGHT', amount: night, problemAmount: 0 });
    for (let k = 2; k < gpParts.length; k++) {
      items.push({ gpName: gpParts[k], shift: 'DAY', amount: 0, problemAmount: 0 });
    }
  } else if (day > 0) {
    items.push({ gpName: gpParts[0], shift: 'DAY', amount: day, problemAmount: reject });
    for (let k = 1; k < gpParts.length; k++) {
      items.push({ gpName: gpParts[k], shift: 'DAY', amount: 0, problemAmount: 0 });
    }
  } else if (night > 0) {
    items.push({ gpName: gpParts[0], shift: 'NIGHT', amount: night, problemAmount: reject });
    for (let k = 1; k < gpParts.length; k++) {
      items.push({ gpName: gpParts[k], shift: 'NIGHT', amount: 0, problemAmount: 0 });
    }
  } else {
    items.push({ gpName: gpParts[0], shift: 'DAY', amount: 0, problemAmount: reject });
    for (let k = 1; k < gpParts.length; k++) {
      items.push({ gpName: gpParts[k], shift: 'DAY', amount: 0, problemAmount: 0 });
    }
  }

  return items;
}

export async function updateSubmission(
  id: string,
  data: {
    date: string;
    name: string;
    mobile?: string;
    recordType: string;
    workFromHomeGp?: string;
    workFromHomeQty?: number;
    items: {
      gpName: string;
      shift: string;
      amount: number;
      problemAmount: number;
    }[];
  }
) {
  try {
    const session = await getSession();
    const isAllGp = isAllGpAccess(session?.gp) || (session?.allowedGps && session.allowedGps.length >= GP_LIST.length);
    if (!isAllGp && session?.allowedGps && session.allowedGps.length > 0) {
      for (const item of data.items) {
        const canonical = canonicalGp(item.gpName);
        if (!session.allowedGps.includes(canonical)) {
          return { success: false, error: `Unauthorized GP "${item.gpName}". You only have access to: ${session.allowedGps.join(', ')}` };
        }
      }
    }

    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [originalRecType, rowIndexStr, originalDate, originalName] = decoded.split('|');
    const originalRowIndex = parseInt(rowIndexStr, 10);
    const originalSheetTitle = originalRecType === 'ENTRY' ? 'Entry' : 'Verified';

    const rows = await getSheetValues(originalSheetTitle, 'A1:L');
    let targetRowIdx = originalRowIndex;
    const targetRow = rows[targetRowIdx - 1];
    const matches = targetRow && 
      toDDMMYYYY(targetRow[1]) === toDDMMYYYY(originalDate) && 
      normalizeName(targetRow[2]) === normalizeName(originalName);

    if (!matches) {
      const foundIdx = rows.findIndex((r, idx) => {
        if (idx < 2) return false;
        return toDDMMYYYY(r[1]) === toDDMMYYYY(originalDate) && normalizeName(r[2]) === normalizeName(originalName);
      });
      if (foundIdx !== -1) {
        targetRowIdx = foundIdx + 1;
      } else {
        return { success: false, error: 'Original record could not be found to update.' };
      }
    }

    const targetRecType = data.recordType as 'ENTRY' | 'VERIFY';
    const newFormattedDate = toDDMMYYYY(data.date);
    const oldFormattedDate = toDDMMYYYY(originalDate);

    // If record moved to a different sheet or different date section
    if (targetRecType !== originalRecType || newFormattedDate !== oldFormattedDate) {
      await deleteSheetRow(originalSheetTitle, targetRowIdx);
      const res = await createSubmission(data);
      safeRevalidate();
      return res;
    }

    // In-place update within same date section and same sheet
    const formattedDate = newFormattedDate;
    let deoName = data.name ? normalizeName(data.name) : (session?.name ? normalizeName(session.name) : '');
    let mobile = data.mobile ? data.mobile.trim() : (session?.mobile ? session.mobile.trim() : '');

    // Live real-time sync with Google Sheet
    if (mobile) {
      try {
        const liveUsers = await fetchUsersFromGoogleSheet();
        const currentLive = liveUsers.find(u => u.mobile === mobile);
        if (currentLive) {
          if (currentLive.access === 'NO') {
            return { success: false, error: 'Your account access has been revoked.' };
          }
          if (currentLive.name) {
            deoName = normalizeName(currentLive.name);
          }
        }
      } catch (_) {}
    }

    const wfhQtyVal = (data.workFromHomeQty !== undefined && data.workFromHomeQty !== null && !isNaN(Number(data.workFromHomeQty)) && Number(data.workFromHomeQty) > 0)
      ? Number(data.workFromHomeQty)
      : '';
    const wfhGpVal = data.workFromHomeGp ? canonicalGp(data.workFromHomeGp) : '';

    // Group items by distinct GP
    const distinctGps: string[] = [];
    data.items.forEach(item => {
      const cGp = canonicalGp(item.gpName?.trim() || '');
      if (cGp && !distinctGps.includes(cGp)) {
        distinctGps.push(cGp);
      }
    });

    if (distinctGps.length === 0 && data.items.length > 0) {
      distinctGps.push(canonicalGp(data.items[0].gpName?.trim() || '') || data.items[0].gpName?.trim() || '');
    }

    const gpRowsData = distinctGps.map((gp, idx) => {
      const gpItems = data.items.filter(item => canonicalGp(item.gpName?.trim() || '') === gp);
      const dayAmount = gpItems
        .filter(item => item.shift === 'DAY')
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const nightAmount = gpItems
        .filter(item => item.shift === 'NIGHT')
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const totalAmount = dayAmount + nightAmount;
      const rejectAmount = gpItems
        .reduce((sum, item) => sum + (Number(item.problemAmount) || 0), 0);

      return {
        gpName: gp,
        dayAmount,
        nightAmount,
        totalAmount,
        rejectAmount,
        wfhQty: idx === 0 ? wfhQtyVal : '',
        wfhGp: idx === 0 ? wfhGpVal : '',
      };
    });

    const currentRows = await getSheetValues(originalSheetTitle, `A${targetRowIdx}:L${targetRowIdx}`);
    const currentRowData = extractRowData(currentRows[0] || []);
    const slNo = currentRowData.slNo || 1;

    // 30 MINUTE WINDOW: Verify submission time
    const rawTimestamp = currentRowData.rawTimestamp;
    let submittedAt: number | null = null;
    if (rawTimestamp) {
      const parsed = Date.parse(rawTimestamp);
      if (!isNaN(parsed)) submittedAt = parsed;
      else {
        const num = Number(rawTimestamp);
        if (!isNaN(num) && num > 0) submittedAt = num;
      }
    }
    if (submittedAt && (Date.now() - submittedAt > THIRTY_MINUTES_MS)) {
      return {
        success: false,
        error: 'রিপোর্ট সাবমিট করার ৩০ মিনিট পার হয়ে গেছে। এটি আর এডিট করা যাবে না।'
      };
    }

    const firstGp = gpRowsData[0];
    const updatedRow = [
      slNo,
      formattedDate,
      deoName,
      firstGp.gpName,
      firstGp.dayAmount,
      firstGp.nightAmount,
      firstGp.totalAmount,
      firstGp.rejectAmount,
      mobile,
      firstGp.wfhQty,
      firstGp.wfhGp
    ];

    await updateSheetRow(originalSheetTitle, targetRowIdx, updatedRow);
    try {
      await adjustGpCellFontSize(originalSheetTitle, targetRowIdx, firstGp.gpName);
      await formatDataRow(originalSheetTitle, targetRowIdx);
    } catch (_) {}

    // If more than 1 GP was included in the update, insert subsequent GPs into next rows
    if (gpRowsData.length > 1) {
      const additionalRows = gpRowsData.slice(1).map((gpData) => [
        slNo,
        formattedDate,
        deoName,
        gpData.gpName,
        gpData.dayAmount,
        gpData.nightAmount,
        gpData.totalAmount,
        gpData.rejectAmount,
        mobile,
        gpData.wfhQty,
        gpData.wfhGp
      ]);
      await insertSheetRows(originalSheetTitle, targetRowIdx + 1, additionalRows);
      for (let k = 0; k < additionalRows.length; k++) {
        const nextRow = targetRowIdx + 1 + k;
        try {
          await adjustGpCellFontSize(originalSheetTitle, nextRow, gpRowsData[k + 1].gpName);
          await formatDataRow(originalSheetTitle, nextRow);
        } catch (_) {}
      }
    }

    safeRevalidate();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update record' };
  }
}

export async function deleteSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [recType, rowIndexStr, date, name] = decoded.split('|');
    let rowIndex = parseInt(rowIndexStr, 10);
    const sheetTitle = recType === 'ENTRY' ? 'Entry' : 'Verified';

    const rows = await getSheetValues(sheetTitle, 'A1:L');
    let targetRowIdx = rowIndex;
    let targetRow = rows[targetRowIdx - 1];
    const matches = targetRow && 
      toDDMMYYYY(targetRow[1]) === toDDMMYYYY(date) && 
      normalizeName(targetRow[2]) === normalizeName(name);

    if (!matches) {
      const foundIdx = rows.findIndex((r, idx) => {
        if (idx < 2) return false;
        return toDDMMYYYY(r[1]) === toDDMMYYYY(date) && normalizeName(r[2]) === normalizeName(name);
      });
      if (foundIdx !== -1) {
        targetRowIdx = foundIdx + 1;
        targetRow = rows[foundIdx];
      } else {
        return { success: false, error: 'Record could not be located in sheet to delete.' };
      }
    }

    // 30 MINUTE WINDOW: Verify submission time
    const rowData = extractRowData(targetRow);
    const rawTimestamp = rowData.rawTimestamp;
    let submittedAt: number | null = null;
    if (rawTimestamp) {
      const parsed = Date.parse(rawTimestamp);
      if (!isNaN(parsed)) submittedAt = parsed;
      else {
        const num = Number(rawTimestamp);
        if (!isNaN(num) && num > 0) submittedAt = num;
      }
    }
    if (submittedAt && (Date.now() - submittedAt > THIRTY_MINUTES_MS)) {
      return {
        success: false,
        error: 'রিপোর্ট সাবমিট করার ৩০ মিনিট পার হয়ে গেছে। এটি আর ডিলিট করা যাবে না।'
      };
    }

    await deleteSheetRow(sheetTitle, targetRowIdx);
    safeRevalidate();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete record' };
  }
}

export async function getSubmissions(query?: { name?: string; date?: string; recordType?: string; mobile?: string }) {
  const titlesToFetch: ('Entry' | 'Verified')[] = [];
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'ENTRY') {
    titlesToFetch.push('Entry');
  }
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'VERIFY') {
    titlesToFetch.push('Verified');
  }

  const results: any[] = [];
  const queryName = query?.name ? query.name.trim().toLowerCase() : '';
  const queryDate = query?.date ? toDDMMYYYY(query.date.trim()) : '';
  const queryMobile = query?.mobile ? query.mobile.trim().replace(/\D/g, '') : '';

  for (const sheetTitle of titlesToFetch) {
    const rows = await getSheetValues(sheetTitle, 'A1:L');
    const recType = sheetTitle === 'Entry' ? 'ENTRY' : 'VERIFY';

    rows.forEach((r, idx) => {
      const rowIndex = idx + 1;
      if (!r || r.length < 2) return;
      if (r[0] === 'SL NO.' || r[1] === 'DATE' || r[2] === 'DIO NAME' || r[2] === 'DEO NAME' || r[0]?.includes('M M S B Y')) return;

      const rowData = extractRowData(r);
      const { slNo, date, name, gpName, day, night, total, reject, mobile, workFromHomeQty, workFromHomeGp, rawTimestamp } = rowData;

      if (!date || !name) return;

      // 30 MINUTE WINDOW: Only show reports submitted within the last 30 minutes!
      let submittedAt: number | null = null;
      if (rawTimestamp) {
        const parsed = Date.parse(rawTimestamp);
        if (!isNaN(parsed)) {
          submittedAt = parsed;
        } else {
          const num = Number(rawTimestamp);
          if (!isNaN(num) && num > 0) submittedAt = num;
        }
      }

      const now = Date.now();
      if (submittedAt) {
        const ageMs = now - submittedAt;
        if (ageMs > THIRTY_MINUTES_MS) {
          // More than 30 minutes old -> DO NOT SHOW
          return;
        }
      } else {
        // Fallback for older rows without timestamp: only show if created today
        const todayStr = toDDMMYYYY(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
        if (toDDMMYYYY(date) !== todayStr) {
          return;
        }
      }

      // Filter by Name and/or Mobile
      if (queryName && queryMobile) {
        const normRowName = name.toLowerCase().replace(/\s+/g, '');
        const normQueryName = queryName.toLowerCase().replace(/\s+/g, '');
        const nameMatches = normRowName.includes(normQueryName) || normQueryName.includes(normRowName);
        const cleanRowMobile = mobile.replace(/\D/g, '');
        const mobileMatches = Boolean(cleanRowMobile && (cleanRowMobile.includes(queryMobile) || queryMobile.includes(cleanRowMobile)));
        if (!nameMatches && !mobileMatches) return;
      } else if (queryName) {
        const normRowName = name.toLowerCase().replace(/\s+/g, '');
        const normQueryName = queryName.toLowerCase().replace(/\s+/g, '');
        if (!normRowName.includes(normQueryName) && !normQueryName.includes(normRowName)) return;
      } else if (queryMobile) {
        const cleanRowMobile = mobile.replace(/\D/g, '');
        if (!cleanRowMobile.includes(queryMobile)) return;
      }

      if (queryDate && toDDMMYYYY(date) !== queryDate) return;
      if (query?.recordType && query.recordType !== 'All' && query.recordType !== recType) return;

      const editUntilTime = submittedAt ? (submittedAt + THIRTY_MINUTES_MS) : (now + THIRTY_MINUTES_MS);
      const remainingMinutes = Math.max(1, Math.ceil((editUntilTime - now) / 60000));

      const uiId = Buffer.from(`${recType}|${rowIndex}|${date}|${name}`).toString('base64url');
      const items = parseSheetRowToItems(gpName, day, night, reject);

      results.push({
        id: uiId,
        rowIndex,
        slNo,
        date: toYYYYMMDD(date),
        displayDate: toDDMMYYYY(date) || date,
        name,
        mobile,
        gpName,
        day,
        night,
        total,
        reject,
        workFromHomeQty,
        workFromHomeGp,
        recordType: recType,
        items,
        createdAt: now,
        isEditable: true,
        remainingMinutes,
        editUntil: new Date(editUntilTime)
      });
    });
  }

  const parseDateKey = (dStr: string) => {
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dStr;
  };

  return results.sort((a, b) => parseDateKey(b.displayDate).localeCompare(parseDateKey(a.displayDate)));
}

export async function getSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [recType, rowIndexStr, date, name] = decoded.split('|');
    let rowIndex = parseInt(rowIndexStr, 10);
    const sheetTitle = recType === 'ENTRY' ? 'Entry' : 'Verified';

    const rows = await getSheetValues(sheetTitle, 'A1:L');
    let targetRowIdx = rowIndex;
    let r: string[] | null = rows[targetRowIdx - 1] || null;
    const matches = r && 
      toDDMMYYYY(r[1]) === toDDMMYYYY(date) && 
      normalizeName(r[2]) === normalizeName(name);

    if (!matches) {
      const foundIdx = rows.findIndex((row, idx) => {
        if (idx < 2) return false;
        return toDDMMYYYY(row[1]) === toDDMMYYYY(date) && normalizeName(row[2]) === normalizeName(name);
      });
      if (foundIdx !== -1) {
        targetRowIdx = foundIdx + 1;
        r = rows[foundIdx];
      } else {
        r = null;
      }
    }

    if (!r || r.length < 2) return null;

    const rowData = extractRowData(r);
    const rawTimestamp = rowData.rawTimestamp;
    let submittedAt: number | null = null;
    if (rawTimestamp) {
      const parsed = Date.parse(rawTimestamp);
      if (!isNaN(parsed)) submittedAt = parsed;
      else {
        const num = Number(rawTimestamp);
        if (!isNaN(num) && num > 0) submittedAt = num;
      }
    }

    const now = Date.now();
    if (submittedAt && (now - submittedAt > THIRTY_MINUTES_MS)) {
      return {
        id,
        expired: true,
        displayDate: toDDMMYYYY(rowData.date) || rowData.date,
        name: rowData.name,
      } as any;
    }

    const items = parseSheetRowToItems(rowData.gpName, rowData.day, rowData.night, rowData.reject);
    const editUntilTime = submittedAt ? (submittedAt + THIRTY_MINUTES_MS) : (now + THIRTY_MINUTES_MS);
    const remainingMinutes = Math.max(1, Math.ceil((editUntilTime - now) / 60000));

    return {
      id,
      rowIndex: targetRowIdx,
      slNo: rowData.slNo,
      date: toYYYYMMDD(rowData.date),
      displayDate: rowData.date,
      name: rowData.name,
      mobile: rowData.mobile,
      gpName: rowData.gpName,
      day: rowData.day,
      night: rowData.night,
      total: rowData.total,
      reject: rowData.reject,
      workFromHomeQty: rowData.workFromHomeQty,
      workFromHomeGp: rowData.workFromHomeGp,
      recordType: recType as 'ENTRY' | 'VERIFY',
      items,
      createdAt: now,
      remainingMinutes,
      editUntil: new Date(editUntilTime)
    };
  } catch (e) {
    return null;
  }
}

export async function getKnownDeoNames(): Promise<string[]> {
  try {
    const entryRows = await getSheetValues('Entry', 'C3:C100');
    const verifiedRows = await getSheetValues('Verified', 'C3:C100');
    const names = new Set<string>();

    [...entryRows, ...verifiedRows].forEach(r => {
      const name = r?.[0]?.trim();
      if (name && name !== 'DIO NAME' && name !== 'DEO NAME' && !name.includes('M M S B Y') && name.length >= 2) {
        names.add(normalizeName(name));
      }
    });

    return Array.from(names).sort();
  } catch {
    return [];
  }
}

export async function getKnownDioNames(): Promise<string[]> {
  return getKnownDeoNames();
}
