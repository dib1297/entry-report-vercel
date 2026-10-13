import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

let cachedAuth: { auth: JWT; spreadsheetId: string } | null = null;

export function getSheetsAuth() {
  if (cachedAuth) return cachedAuth;

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!serviceAccountEmail || !privateKey || !sheetId) {
    throw new Error('Google Sheets credentials are not properly configured in .env.local');
  }

  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cachedAuth = { auth, spreadsheetId: sheetId };
  return cachedAuth;
}

export async function getGoogleDoc() {
  const { auth, spreadsheetId } = getSheetsAuth();
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo(); 
  return doc;
}

let cachedMetadata: { timestamp: number; data: any } | null = null;

export async function getSpreadsheetMetadata(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedMetadata && (now - cachedMetadata.timestamp) < 5 * 60 * 1000) {
    return cachedMetadata.data;
  }
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res: any = await auth.request({ url });
  cachedMetadata = { timestamp: now, data: res.data };
  return res.data;
}

export async function getSheetId(sheetTitle: string): Promise<number> {
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) throw new Error(`Sheet ${sheetTitle} not found`);
  return sheetMeta.properties.sheetId;
}

export async function getSheetValues(sheetTitle: string, range: string = 'A1:K'): Promise<string[][]> {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!${range}`)}?valueRenderOption=FORMATTED_VALUE`;
  const res: any = await auth.request({ 
    url,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    }
  });
  return res.data?.values || [];
}

export async function appendSheetRows(sheetTitle: string, values: any[][]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A:K`)}:append?valueInputOption=USER_ENTERED`;
  const res: any = await auth.request({
    url,
    method: 'POST',
    data: { values },
  });
  return res.data;
}

export async function updateSheetRow(sheetTitle: string, rowIndex: number, rowValues: any[]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A${rowIndex}:K${rowIndex}`)}?valueInputOption=USER_ENTERED`;
  const res: any = await auth.request({
    url,
    method: 'PUT',
    data: { values: [rowValues] },
  });
  return res.data;
}

export async function batchUpdateSpreadsheet(requests: any[]) {
  if (!requests || requests.length === 0) return;
  const { auth, spreadsheetId } = getSheetsAuth();
  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const res: any = await auth.request({
    url: urlBatch,
    method: 'POST',
    data: { requests },
  });
  return res.data;
}

export async function batchUpdateValues(sheetTitle: string, data: { range: string; values: any[][] }[]) {
  if (!data || data.length === 0) return;
  const { auth, spreadsheetId } = getSheetsAuth();
  const urlValues = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const res: any = await auth.request({
    url: urlValues,
    method: 'POST',
    data: {
      valueInputOption: 'USER_ENTERED',
      data: data.map(d => ({
        range: `'${sheetTitle}'!${d.range}`,
        values: d.values,
      })),
    },
  });
  return res.data;
}

export const SOLID_BLACK_BORDER = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };

export function calculateGpFontSize(gpText: string): number {
  if (!gpText) return 10;
  const count = gpText.split('+').filter(Boolean).length;
  const len = gpText.length;

  if (count >= 4 || len > 45) {
    return 6;
  } else if (count === 3 || len > 30) {
    return 7;
  } else if (count === 2 || len > 18) {
    return 8;
  }
  return 10;
}

export function buildDataRowFormatRequests(
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  gpNames: string[]
): any[] {
  const requests: any[] = [];
  const start0 = startRowIndex - 1;
  const end0 = endRowIndex;

  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: start0,
        endRowIndex: end0,
        startColumnIndex: 0,
        endColumnIndex: 11,
      },
      cell: {
        userEnteredFormat: {
          verticalAlignment: 'MIDDLE',
          borders: {
            top: SOLID_BLACK_BORDER,
            bottom: SOLID_BLACK_BORDER,
            left: SOLID_BLACK_BORDER,
            right: SOLID_BLACK_BORDER,
          },
        },
      },
      fields: 'userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
    },
  });

  gpNames.forEach((gpName, idx) => {
    const r0 = start0 + idx;
    const fontSize = calculateGpFontSize(gpName);
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: r0,
          endRowIndex: r0 + 1,
          startColumnIndex: 3,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { fontSize },
          },
        },
        fields: 'userEnteredFormat.textFormat.fontSize',
      },
    });
  });

  return requests;
}

export function buildHeaderFormatRequests(sheetId: number, targetRowIndex: number): any[] {
  return [
    {
      copyPaste: {
        source: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 11,
        },
        destination: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 0,
          endColumnIndex: 11,
        },
        pasteType: 'PASTE_FORMAT',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: targetRowIndex - 1,
          endIndex: targetRowIndex,
        },
        properties: { pixelSize: 33 },
        fields: 'pixelSize',
      },
    },
  ];
}

export function buildTotalRowFormatRequests(sheetId: number, targetRowIndex: number): any[] {
  const bg = { red: 1, green: 1, blue: 0 };
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 0,
          endColumnIndex: 11,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            verticalAlignment: 'MIDDLE',
            borders: {
              top: SOLID_BLACK_BORDER,
              bottom: SOLID_BLACK_BORDER,
              left: SOLID_BLACK_BORDER,
              right: SOLID_BLACK_BORDER,
            },
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 2,
          endColumnIndex: 4,
        },
        mergeType: 'MERGE_ALL',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 2,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 4,
          endColumnIndex: 8,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: targetRowIndex - 1,
          endIndex: targetRowIndex,
        },
        properties: { pixelSize: 33 },
        fields: 'pixelSize',
      },
    },
  ];
}

export function buildGrandTotalRowFormatRequests(sheetId: number, targetRowIndex: number): any[] {
  const bg = { red: 191 / 255, green: 140 / 255, blue: 229 / 255 };
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 0,
          endColumnIndex: 11,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            verticalAlignment: 'MIDDLE',
            borders: {
              top: SOLID_BLACK_BORDER,
              bottom: SOLID_BLACK_BORDER,
              left: SOLID_BLACK_BORDER,
              right: SOLID_BLACK_BORDER,
            },
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 2,
          endColumnIndex: 4,
        },
        mergeType: 'MERGE_ALL',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 2,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: targetRowIndex - 1,
          endRowIndex: targetRowIndex,
          startColumnIndex: 4,
          endColumnIndex: 8,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: targetRowIndex - 1,
          endIndex: targetRowIndex,
        },
        properties: { pixelSize: 33 },
        fields: 'pixelSize',
      },
    },
  ];
}

export async function insertSheetRows(sheetTitle: string, rowIndex: number, rowsValues: any[][]) {
  const sheetId = await getSheetId(sheetTitle);
  const count = rowsValues.length;
  if (count === 0) return;

  await batchUpdateSpreadsheet([
    {
      insertDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex - 1 + count,
        },
        inheritFromBefore: true,
      },
    },
  ]);

  const endRowIndex = rowIndex + count - 1;
  const { auth, spreadsheetId } = getSheetsAuth();
  const urlValues = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A${rowIndex}:K${endRowIndex}`)}?valueInputOption=USER_ENTERED`;
  const res: any = await auth.request({
    url: urlValues,
    method: 'PUT',
    data: { values: rowsValues },
  });
  return res.data;
}

export async function insertSheetRow(sheetTitle: string, rowIndex: number, rowValues: any[]) {
  return insertSheetRows(sheetTitle, rowIndex, [rowValues]);
}

export async function formatRowLikeHeader(sheetTitle: string, targetRowIndex: number) {
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet(buildHeaderFormatRequests(sheetId, targetRowIndex));
}

export async function adjustGpCellFontSize(sheetTitle: string, rowIndex: number, gpText: string) {
  const fontSize = calculateGpFontSize(gpText);
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet([
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: 3,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { fontSize },
          },
        },
        fields: 'userEnteredFormat.textFormat.fontSize',
      },
    },
  ]);
}

export async function adjustAllGpFontSizes(sheetTitle: string, rows: string[][]) {
  const sheetId = await getSheetId(sheetTitle);
  const requests: any[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (
      r && 
      r.length >= 4 && 
      r[0] !== 'SL NO.' && 
      r[1] !== 'DATE' && 
      !r[0]?.includes('M M S B Y') &&
      r[2] !== 'TOTAL' &&
      r[3] !== 'TOTAL' &&
      r[2] !== 'GRAND TOTAL' &&
      r[3] !== 'GRAND TOTAL'
    ) {
      const gpText = r[3] || '';
      const fontSize = calculateGpFontSize(gpText);
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: i,
            endRowIndex: i + 1,
            startColumnIndex: 3,
            endColumnIndex: 4,
          },
          cell: {
            userEnteredFormat: {
              textFormat: { fontSize },
            },
          },
          fields: 'userEnteredFormat.textFormat.fontSize',
        },
      });
    }
  }

  if (requests.length > 0) {
    await batchUpdateSpreadsheet(requests);
  }
}

export async function formatTotalRow(sheetTitle: string, rowIndex: number) {
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet(buildTotalRowFormatRequests(sheetId, rowIndex));
}

export async function formatGrandTotalRow(sheetTitle: string, rowIndex: number) {
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet(buildGrandTotalRowFormatRequests(sheetId, rowIndex));
}

export async function formatDataRow(sheetTitle: string, rowIndex: number) {
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet([
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: 0,
          endColumnIndex: 11,
        },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            borders: {
              top: SOLID_BLACK_BORDER,
              bottom: SOLID_BLACK_BORDER,
              left: SOLID_BLACK_BORDER,
              right: SOLID_BLACK_BORDER,
            },
          },
        },
        fields: 'userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
      },
    },
  ]);
}

export async function clearColumnL(sheetTitle: string) {
  try {
    const { auth, spreadsheetId } = getSheetsAuth();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!L:L`)}:clear`;
    await auth.request({
      url,
      method: 'POST',
      data: {}
    });
  } catch (_) {}
}

export async function deleteSheetRow(sheetTitle: string, rowIndex: number) {
  const sheetId = await getSheetId(sheetTitle);
  return batchUpdateSpreadsheet([
    {
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    },
  ]);
}
