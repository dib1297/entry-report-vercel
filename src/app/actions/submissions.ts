'use server';

import { normalizeName, canonicalGp, isAllGpAccess, GP_LIST } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { getSession, getLiveUsersCached } from '@/lib/auth';
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
  clearColumnL,
  formatTotalRow,
  formatGrandTotalRow,
  getSheetId,
  batchUpdateSpreadsheet,
  batchUpdateValues,
  buildDataRowFormatRequests,
  buildHeaderFormatRequests,
  buildTotalRowFormatRequests,
  buildGrandTotalRowFormatRequests,
  calculateGpFontSize
} from '@/lib/google-sheets';

const HEADER_ROW = [
  "SL NO.",
  "DATE",
  "DEO NAME",
  "GP NAME",
  "DAY",
  "NIGHT",
  "TOTAL",
  "PROBLEM",
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

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function safeRevalidate() {
  try {
    revalidatePath('/old');
    revalidatePath('/');
  } catch (_) {
    // Intentionally ignored when invoked outside Next.js request context
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

function checkRowType(r: string[]) {
  if (!r || r.length === 0) return 'EMPTY';
  const c0 = (r[0] || '').toString().trim().toUpperCase();
  const c1 = (r[1] || '').toString().trim().toUpperCase();
  const c2 = (r[2] || '').toString().trim().toUpperCase();
  const c3 = (r[3] || '').toString().trim().toUpperCase();

  if (c0.includes('M M S B Y')) return 'TITLE';
  if (c0 === 'SL NO.' && c1 === 'DATE') return 'HEADER';
  if (c2 === 'GRAND TOTAL' || c3 === 'GRAND TOTAL' || c1 === 'GRAND TOTAL' || c0 === 'GRAND TOTAL') return 'GRAND_TOTAL';
  if (c2 === 'TOTAL' || c3 === 'TOTAL' || c1 === 'TOTAL' || c0 === 'TOTAL') return 'TOTAL';

  const rowDate = toDDMMYYYY(r[1] || '');
  if (rowDate && (c2 || c3)) return 'DATA';
  return 'OTHER';
}

export async function syncSheetTotals(sheetTitle: string) {
  try {
    const rows = await getSheetValues(sheetTitle, 'A1:L');
    if (!rows || rows.length < 2) return;

    let lastDataRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (checkRowType(r) === 'DATA') {
        lastDataRowIdx = i + 1;
      }
    }
    if (lastDataRowIdx <= 0) return;

    interface DateSection {
      date: string;
      firstDataRow: number;
      lastDataRow: number;
      totalRow: number | null;
    }

    const dateSections: DateSection[] = [];
    let currentSection: DateSection | null = null;

    for (let i = 0; i < rows.length; i++) {
      const rowIdx = i + 1;
      const r = rows[i] || [];
      const type = checkRowType(r);
      const rowDate = toDDMMYYYY(r[1] || '');

      if (type === 'DATA') {
        if (!currentSection || currentSection.date !== rowDate) {
          currentSection = {
            date: rowDate,
            firstDataRow: rowIdx,
            lastDataRow: rowIdx,
            totalRow: null
          };
          dateSections.push(currentSection);
        } else {
          currentSection.lastDataRow = rowIdx;
        }
      } else if (type === 'TOTAL' && currentSection) {
        if (!currentSection.totalRow) {
          currentSection.totalRow = rowIdx;
        }
      }
    }

    if (dateSections.length === 0) return;

    const valuesUpdates: { range: string; values: any[][] }[] = [];

    for (const sec of dateSections) {
      const startRow = sec.firstDataRow;
      const endRow = sec.lastDataRow;
      const totalRowValues = [
        '',
        '',
        'TOTAL',
        '',
        `=SUM(E${startRow}:E${endRow})`,
        `=SUM(F${startRow}:F${endRow})`,
        `=SUM(G${startRow}:G${endRow})`,
        `=SUM(H${startRow}:H${endRow})`,
        '',
        '',
        ''
      ];

      if (sec.totalRow) {
        const existingRow = rows[sec.totalRow - 1] || [];
        if (
          existingRow[4] !== totalRowValues[4] ||
          existingRow[5] !== totalRowValues[5] ||
          existingRow[6] !== totalRowValues[6] ||
          existingRow[7] !== totalRowValues[7]
        ) {
          valuesUpdates.push({
            range: `A${sec.totalRow}:K${sec.totalRow}`,
            values: [totalRowValues]
          });
        }
      }
    }

    let grandIdx = -1;
    let lastDateTotal = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i] || [];
      if (checkRowType(r) === 'TOTAL' && lastDateTotal === -1) {
        lastDateTotal = i + 1;
      }
      if (checkRowType(r) === 'GRAND_TOTAL') {
        grandIdx = i + 1;
      }
    }

    if (lastDateTotal > 0 && grandIdx > 0) {
      const limit = grandIdx - 1;
      const grandRowValues = [
        '',
        '',
        'GRAND TOTAL',
        '',
        `=SUMIF(C$2:C${limit}, "TOTAL", E$2:E${limit})`,
        `=SUMIF(C$2:C${limit}, "TOTAL", F$2:F${limit})`,
        `=SUMIF(C$2:C${limit}, "TOTAL", G$2:G${limit})`,
        `=SUMIF(C$2:C${limit}, "TOTAL", H$2:H${limit})`,
        '',
        '',
        ''
      ];
      const existingGrand = rows[grandIdx - 1] || [];
      if (
        existingGrand[4] !== grandRowValues[4] ||
        existingGrand[5] !== grandRowValues[5] ||
        existingGrand[6] !== grandRowValues[6] ||
        existingGrand[7] !== grandRowValues[7]
      ) {
        valuesUpdates.push({
          range: `A${grandIdx}:K${grandIdx}`,
          values: [grandRowValues]
        });
      }
    }

    if (valuesUpdates.length > 0) {
      await batchUpdateValues(sheetTitle, valuesUpdates);
    }
  } catch (err) {
    console.error(`Error in syncSheetTotals for ${sheetTitle}:`, err);
  }
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

  // Live real-time sync with Google Sheet using fast cached users
  if (mobile) {
    try {
      const liveUsers = await getLiveUsersCached();
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
      wfhQty: idx === 0 ? wfhQtyVal : '',
      wfhGp: idx === 0 ? wfhGpVal : '',
    };
  });

  // 2. Fetch existing rows and sheetId in parallel
  const [rows, sheetId] = await Promise.all([
    getSheetValues(sheetTitle, 'A1:L'),
    getSheetId(sheetTitle),
  ]);

  // 3. Scan existing rows for date section & totals
  let firstRowForThisDate = -1;
  let lastRowIndexForThisDate = -1;
  let maxSlNoForThisDate = 0;
  let existingTotalRowIdx = -1;
  let grandTotalIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const type = checkRowType(r);
    const rowIdx = i + 1;

    if (type === 'DATA') {
      const rowDate = toDDMMYYYY(r[1] || '');
      if (rowDate === formattedDate) {
        if (firstRowForThisDate === -1) firstRowForThisDate = rowIdx;
        lastRowIndexForThisDate = rowIdx;
        const sl = parseInt(r[0], 10);
        if (!isNaN(sl) && sl > maxSlNoForThisDate) {
          maxSlNoForThisDate = sl;
        }
      }
    } else if (type === 'TOTAL') {
      if (lastRowIndexForThisDate > 0 && existingTotalRowIdx === -1) {
        existingTotalRowIdx = rowIdx;
      }
    } else if (type === 'GRAND_TOTAL') {
      grandTotalIdx = rowIdx;
    }
  }

  // ================= CASE A: DATE ALREADY HAS ROWS IN THE SHEET =================
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

    const count = rowsToAdd.length;
    const insertAtRow = lastRowIndexForThisDate + 1; // 1-based index to insert
    const newEndRow = lastRowIndexForThisDate + count;
    const newTotalRowIdx = existingTotalRowIdx > 0 && existingTotalRowIdx >= insertAtRow
      ? existingTotalRowIdx + count
      : newEndRow + 1;
    const newGrandTotalIdx = grandTotalIdx > 0 && grandTotalIdx >= insertAtRow
      ? grandTotalIdx + count
      : -1;

    const totalRowValues = [
      '',
      '',
      'TOTAL',
      '',
      `=SUM(E${firstRowForThisDate}:E${newEndRow})`,
      `=SUM(F${firstRowForThisDate}:F${newEndRow})`,
      `=SUM(G${firstRowForThisDate}:G${newEndRow})`,
      `=SUM(H${firstRowForThisDate}:H${newEndRow})`,
      '',
      '',
      ''
    ];

    // Combine insertDimension + formatting into a SINGLE batchUpdate
    const batchRequests: any[] = [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: insertAtRow - 1,
            endIndex: insertAtRow - 1 + count,
          },
          inheritFromBefore: true,
        },
      },
      ...buildDataRowFormatRequests(sheetId, insertAtRow, newEndRow, gpRowsData.map(g => g.gpName)),
    ];

    // If there was previously no total row for this date section, insert and format it
    let totalRowNeedsInsert = existingTotalRowIdx <= 0;
    if (totalRowNeedsInsert) {
      batchRequests.push(
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: newTotalRowIdx - 1,
              endIndex: newTotalRowIdx,
            },
            inheritFromBefore: true,
          },
        },
        ...buildTotalRowFormatRequests(sheetId, newTotalRowIdx)
      );
    }

    await batchUpdateSpreadsheet(batchRequests);

    // Combine all value writes (data rows + total row + grand total) into a SINGLE batchUpdateValues
    const valuesBatch: { range: string; values: any[][] }[] = [
      {
        range: `A${insertAtRow}:K${newEndRow}`,
        values: rowsToAdd,
      },
      {
        range: `A${newTotalRowIdx}:K${newTotalRowIdx}`,
        values: [totalRowValues],
      },
    ];

    if (newGrandTotalIdx > 0) {
      const grandFormulaLimit = newGrandTotalIdx - 1;
      const grandRowValues = [
        '',
        '',
        'GRAND TOTAL',
        '',
        `=SUMIF(C$2:C${grandFormulaLimit}, "TOTAL", E$2:E${grandFormulaLimit})`,
        `=SUMIF(C$2:C${grandFormulaLimit}, "TOTAL", F$2:F${grandFormulaLimit})`,
        `=SUMIF(C$2:C${grandFormulaLimit}, "TOTAL", G$2:G${grandFormulaLimit})`,
        `=SUMIF(C$2:C${grandFormulaLimit}, "TOTAL", H$2:H${grandFormulaLimit})`,
        '',
        '',
        ''
      ];
      valuesBatch.push({
        range: `A${newGrandTotalIdx}:K${newGrandTotalIdx}`,
        values: [grandRowValues],
      });
    }

    await batchUpdateValues(sheetTitle, valuesBatch);

    safeRevalidate();
    return { success: true };
  }

  // ================= CASE B: NEW DATE SECTION =================
  const targetTime = parseDateToTime(formattedDate);
  let firstLaterRowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (checkRowType(r) === 'DATA') {
      const rowDate = toDDMMYYYY(r[1] || '');
      const rowTime = parseDateToTime(rowDate);
      if (rowTime > targetTime) {
        if (i > 0 && rows[i - 1][0] === 'SL NO.') {
          firstLaterRowIndex = i;
        } else {
          firstLaterRowIndex = i + 1;
        }
        break;
      }
    }
  }

  const rowsToAdd = gpRowsData.map((gpData, idx) => [
    1 + idx,
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

  const count = rowsToAdd.length;

  if (firstLaterRowIndex > 0) {
    // Older date submitted that belongs before a later date
    const insertAtRow = firstLaterRowIndex;
    const totalRowsToInsert = 1 + count + 1; // Header + Data + Total
    const headerRowIdx = insertAtRow;
    const dataStartRow = insertAtRow + 1;
    const dataEndRow = insertAtRow + count;
    const totalRowIdx = insertAtRow + count + 1;

    const totalRowValues = [
      '',
      '',
      'TOTAL',
      '',
      `=SUM(E${dataStartRow}:E${dataEndRow})`,
      `=SUM(F${dataStartRow}:F${dataEndRow})`,
      `=SUM(G${dataStartRow}:G${dataEndRow})`,
      `=SUM(H${dataStartRow}:H${dataEndRow})`,
      '',
      '',
      ''
    ];

    const batchRequests: any[] = [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: insertAtRow - 1,
            endIndex: insertAtRow - 1 + totalRowsToInsert,
          },
          inheritFromBefore: true,
        },
      },
      ...buildHeaderFormatRequests(sheetId, headerRowIdx),
      ...buildDataRowFormatRequests(sheetId, dataStartRow, dataEndRow, gpRowsData.map(g => g.gpName)),
      ...buildTotalRowFormatRequests(sheetId, totalRowIdx),
    ];

    await batchUpdateSpreadsheet(batchRequests);

    const newGrandTotalIdx = grandTotalIdx > 0 ? grandTotalIdx + totalRowsToInsert : -1;
    const valuesBatch: { range: string; values: any[][] }[] = [
      {
        range: `A${headerRowIdx}:K${totalRowIdx}`,
        values: [HEADER_ROW, ...rowsToAdd, totalRowValues],
      },
    ];

    if (newGrandTotalIdx > 0) {
      const grandLimit = newGrandTotalIdx - 1;
      const grandRowValues = [
        '',
        '',
        'GRAND TOTAL',
        '',
        `=SUMIF(C$2:C${grandLimit}, "TOTAL", E$2:E${grandLimit})`,
        `=SUMIF(C$2:C${grandLimit}, "TOTAL", F$2:F${grandLimit})`,
        `=SUMIF(C$2:C${grandLimit}, "TOTAL", G$2:G${grandLimit})`,
        `=SUMIF(C$2:C${grandLimit}, "TOTAL", H$2:H${grandLimit})`,
        '',
        '',
        ''
      ];
      valuesBatch.push({
        range: `A${newGrandTotalIdx}:K${newGrandTotalIdx}`,
        values: [grandRowValues],
      });
    }

    await batchUpdateValues(sheetTitle, valuesBatch);
    safeRevalidate();
    return { success: true };
  }

  // Newer date (or first date in fresh sheet)
  const hasExistingData = rows.some(r => checkRowType(r) === 'DATA');

  if (grandTotalIdx > 0) {
    const insertAtRow = grandTotalIdx;
    const totalRowsToInsert = 1 + count + 1; // Header + Data + Total
    const headerRowIdx = insertAtRow;
    const dataStartRow = insertAtRow + 1;
    const dataEndRow = insertAtRow + count;
    const totalRowIdx = insertAtRow + count + 1;
    const newGrandTotalIdx = grandTotalIdx + totalRowsToInsert;

    const totalRowValues = [
      '',
      '',
      'TOTAL',
      '',
      `=SUM(E${dataStartRow}:E${dataEndRow})`,
      `=SUM(F${dataStartRow}:F${dataEndRow})`,
      `=SUM(G${dataStartRow}:G${dataEndRow})`,
      `=SUM(H${dataStartRow}:H${dataEndRow})`,
      '',
      '',
      ''
    ];

    const grandLimit = newGrandTotalIdx - 1;
    const grandRowValues = [
      '',
      '',
      'GRAND TOTAL',
      '',
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", E$2:E${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", F$2:F${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", G$2:G${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", H$2:H${grandLimit})`,
      '',
      '',
      ''
    ];

    const batchRequests: any[] = [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: insertAtRow - 1,
            endIndex: insertAtRow - 1 + totalRowsToInsert,
          },
          inheritFromBefore: true,
        },
      },
      ...buildHeaderFormatRequests(sheetId, headerRowIdx),
      ...buildDataRowFormatRequests(sheetId, dataStartRow, dataEndRow, gpRowsData.map(g => g.gpName)),
      ...buildTotalRowFormatRequests(sheetId, totalRowIdx),
    ];

    await batchUpdateSpreadsheet(batchRequests);

    const valuesBatch: { range: string; values: any[][] }[] = [
      {
        range: `A${headerRowIdx}:K${totalRowIdx}`,
        values: [HEADER_ROW, ...rowsToAdd, totalRowValues],
      },
      {
        range: `A${newGrandTotalIdx}:K${newGrandTotalIdx}`,
        values: [grandRowValues],
      },
    ];

    await batchUpdateValues(sheetTitle, valuesBatch);
    safeRevalidate();
    return { success: true };
  }

  if (hasExistingData) {
    const insertAtRow = rows.length + 1;
    const totalRowsToInsert = 1 + count + 1 + 1; // Header + Data + Total + Grand Total
    const headerRowIdx = insertAtRow;
    const dataStartRow = insertAtRow + 1;
    const dataEndRow = insertAtRow + count;
    const totalRowIdx = insertAtRow + count + 1;
    const newGrandTotalIdx = totalRowIdx + 1;

    const totalRowValues = [
      '',
      '',
      'TOTAL',
      '',
      `=SUM(E${dataStartRow}:E${dataEndRow})`,
      `=SUM(F${dataStartRow}:F${dataEndRow})`,
      `=SUM(G${dataStartRow}:G${dataEndRow})`,
      `=SUM(H${dataStartRow}:H${dataEndRow})`,
      '',
      '',
      ''
    ];

    const grandLimit = newGrandTotalIdx - 1;
    const grandRowValues = [
      '',
      '',
      'GRAND TOTAL',
      '',
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", E$2:E${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", F$2:F${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", G$2:G${grandLimit})`,
      `=SUMIF(C$2:C${grandLimit}, "TOTAL", H$2:H${grandLimit})`,
      '',
      '',
      ''
    ];

    const batchRequests: any[] = [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: insertAtRow - 1,
            endIndex: insertAtRow - 1 + totalRowsToInsert,
          },
          inheritFromBefore: true,
        },
      },
      ...buildHeaderFormatRequests(sheetId, headerRowIdx),
      ...buildDataRowFormatRequests(sheetId, dataStartRow, dataEndRow, gpRowsData.map(g => g.gpName)),
      ...buildTotalRowFormatRequests(sheetId, totalRowIdx),
      ...buildGrandTotalRowFormatRequests(sheetId, newGrandTotalIdx),
    ];

    await batchUpdateSpreadsheet(batchRequests);

    const valuesBatch: { range: string; values: any[][] }[] = [
      {
        range: `A${headerRowIdx}:K${newGrandTotalIdx}`,
        values: [HEADER_ROW, ...rowsToAdd, totalRowValues, grandRowValues],
      },
    ];

    await batchUpdateValues(sheetTitle, valuesBatch);
    safeRevalidate();
    return { success: true };
  }

  // First date in fresh sheet (row 2 is already HEADER_ROW)
  const insertAtRow = 3;
  const totalRowsToInsert = count + 1 + 1; // Data + Total + Grand Total
  const dataStartRow = 3;
  const dataEndRow = 3 + count - 1;
  const totalRowIdx = dataEndRow + 1;
  const newGrandTotalIdx = totalRowIdx + 1;

  const totalRowValues = [
    '',
    '',
    'TOTAL',
    '',
    `=SUM(E${dataStartRow}:E${dataEndRow})`,
    `=SUM(F${dataStartRow}:F${dataEndRow})`,
    `=SUM(G${dataStartRow}:G${dataEndRow})`,
    `=SUM(H${dataStartRow}:H${dataEndRow})`,
    '',
    '',
    ''
  ];

  const grandLimit = newGrandTotalIdx - 1;
  const grandRowValues = [
    '',
    '',
    'GRAND TOTAL',
    '',
    `=SUMIF(C$2:C${grandLimit}, "TOTAL", E$2:E${grandLimit})`,
    `=SUMIF(C$2:C${grandLimit}, "TOTAL", F$2:F${grandLimit})`,
    `=SUMIF(C$2:C${grandLimit}, "TOTAL", G$2:G${grandLimit})`,
    `=SUMIF(C$2:C${grandLimit}, "TOTAL", H$2:H${grandLimit})`,
    '',
    '',
    ''
  ];

  const batchRequests: any[] = [
    {
      insertDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: insertAtRow - 1,
          endIndex: insertAtRow - 1 + totalRowsToInsert,
        },
        inheritFromBefore: true,
      },
    },
    ...buildDataRowFormatRequests(sheetId, dataStartRow, dataEndRow, gpRowsData.map(g => g.gpName)),
    ...buildTotalRowFormatRequests(sheetId, totalRowIdx),
    ...buildGrandTotalRowFormatRequests(sheetId, newGrandTotalIdx),
  ];

  await batchUpdateSpreadsheet(batchRequests);

  const valuesBatch: { range: string; values: any[][] }[] = [
    {
      range: `A${dataStartRow}:K${newGrandTotalIdx}`,
      values: [...rowsToAdd, totalRowValues, grandRowValues],
    },
  ];

  await batchUpdateValues(sheetTitle, valuesBatch);
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
      try {
        await syncSheetTotals(originalSheetTitle);
      } catch (err) {
        console.error(`Error syncing sheet totals for ${originalSheetTitle}:`, err);
      }
      const res = await createSubmission(data);
      safeRevalidate();
      return res;
    }

    // In-place update within same date section and same sheet
    const formattedDate = newFormattedDate;
    let deoName = data.name ? normalizeName(data.name) : (session?.name ? normalizeName(session.name) : '');
    let mobile = data.mobile ? data.mobile.trim() : (session?.mobile ? session.mobile.trim() : '');

    // Live real-time sync with Google Sheet using fast cached users
    if (mobile) {
      try {
        const liveUsers = await getLiveUsersCached();
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
      const sheetId = await getSheetId(originalSheetTitle);
      await batchUpdateSpreadsheet(
        buildDataRowFormatRequests(sheetId, targetRowIdx + 1, targetRowIdx + additionalRows.length, gpRowsData.slice(1).map(g => g.gpName))
      );
      try {
        await syncSheetTotals(originalSheetTitle);
      } catch (err) {
        console.error(`Error syncing sheet totals for ${originalSheetTitle}:`, err);
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

    try {
      await syncSheetTotals(sheetTitle);
    } catch (err) {
      console.error(`Error syncing sheet totals for ${sheetTitle}:`, err);
    }

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
      if (checkRowType(r) === 'TITLE' || checkRowType(r) === 'HEADER' || checkRowType(r) === 'TOTAL' || checkRowType(r) === 'GRAND_TOTAL') return;

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
          return;
        }
      } else {
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

let knownDeoCache: { timestamp: number; names: string[] } | null = null;

export async function getKnownDeoNames(): Promise<string[]> {
  const now = Date.now();
  if (knownDeoCache && (now - knownDeoCache.timestamp) < 60000) {
    return knownDeoCache.names;
  }
  try {
    const [entryRows, verifiedRows] = await Promise.all([
      getSheetValues('Entry', 'C3:C100'),
      getSheetValues('Verified', 'C3:C100'),
    ]);
    const names = new Set<string>();

    [...entryRows, ...verifiedRows].forEach(r => {
      const name = r?.[0]?.trim();
      if (name && name !== 'DIO NAME' && name !== 'DEO NAME' && name !== 'TOTAL' && name !== 'GRAND TOTAL' && !name.includes('M M S B Y') && name.length >= 2) {
        names.add(normalizeName(name));
      }
    });

    const result = Array.from(names).sort();
    knownDeoCache = { timestamp: now, names: result };
    return result;
  } catch {
    return [];
  }
}

export async function getKnownDioNames(): Promise<string[]> {
  return getKnownDeoNames();
}
