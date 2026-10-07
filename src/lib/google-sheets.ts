import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export function getSheetsAuth() {
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

  return { auth, spreadsheetId: sheetId };
}

export async function getGoogleDoc() {
  const { auth, spreadsheetId } = getSheetsAuth();
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo(); 
  return doc;
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

export async function insertSheetRows(sheetTitle: string, rowIndex: number, rowsValues: any[][]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) throw new Error(`Sheet ${sheetTitle} not found`);
  const sheetId = sheetMeta.properties.sheetId;

  const count = rowsValues.length;
  if (count === 0) return;

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex - 1 + count,
            },
            inheritFromBefore: true,
          },
        },
      ],
    },
  });

  const endRowIndex = rowIndex + count - 1;
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
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) throw new Error(`Sheet ${sheetTitle} not found`);
  const sheetId = sheetMeta.properties.sheetId;

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: sheetId,
              startRowIndex: 1, // Row 2 (0-based index 1)
              endRowIndex: 2,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            destination: {
              sheetId: sheetId,
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
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: targetRowIndex - 1,
              endIndex: targetRowIndex,
            },
            properties: {
              pixelSize: 33,
            },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });
}

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

export async function adjustGpCellFontSize(sheetTitle: string, rowIndex: number, gpText: string) {
  const fontSize = calculateGpFontSize(gpText);
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) throw new Error(`Sheet ${sheetTitle} not found`);
  const sheetId = sheetMeta.properties.sheetId;

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 3, // Column D (GP NAME)
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  fontSize: fontSize,
                },
              },
            },
            fields: 'userEnteredFormat.textFormat.fontSize',
          },
        },
      ],
    },
  });
}

export async function adjustAllGpFontSizes(sheetTitle: string, rows: string[][]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) return;
  const sheetId = sheetMeta.properties.sheetId;

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
            sheetId: sheetId,
            startRowIndex: i,
            endRowIndex: i + 1,
            startColumnIndex: 3,
            endColumnIndex: 4,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                fontSize: fontSize,
              },
            },
          },
          fields: 'userEnteredFormat.textFormat.fontSize',
        },
      });
    }
  }

  if (requests.length > 0) {
    const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await auth.request({
      url: urlBatch,
      method: 'POST',
      data: { requests },
    });
  }
}

export async function formatTotalRow(sheetTitle: string, rowIndex: number) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) return;
  const sheetId = sheetMeta.properties.sheetId;

  const border = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
  const bg = { red: 1, green: 1, blue: 0 }; // Yellow (#FFFF00)

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: bg,
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: border,
                  bottom: border,
                  left: border,
                  right: border,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
          },
        },
        {
          mergeCells: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 2,
              endColumnIndex: 4,
            },
            mergeType: 'MERGE_ALL',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 2,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: {
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 4,
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: {
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
            properties: {
              pixelSize: 33,
            },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });
}

export async function formatGrandTotalRow(sheetTitle: string, rowIndex: number) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) return;
  const sheetId = sheetMeta.properties.sheetId;

  const border = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
  const bg = { red: 0.75, green: 0.55, blue: 0.9 }; // Purple (#BF8CE6)

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: bg,
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: border,
                  bottom: border,
                  left: border,
                  right: border,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
          },
        },
        {
          mergeCells: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 2,
              endColumnIndex: 4,
            },
            mergeType: 'MERGE_ALL',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 2,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: {
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 4,
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: {
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
            properties: {
              pixelSize: 33,
            },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });
}

export async function formatDataRow(sheetTitle: string, rowIndex: number) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) return;
  const sheetId = sheetMeta.properties.sheetId;

  const border = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };

  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await auth.request({
    url: urlBatch,
    method: 'POST',
    data: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: border,
                  bottom: border,
                  left: border,
                  right: border,
                },
              },
            },
            fields: 'userEnteredFormat.verticalAlignment,userEnteredFormat.borders',
          },
        },
      ],
    },
  });
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

export async function getSpreadsheetMetadata() {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res: any = await auth.request({ url });
  return res.data;
}

export async function deleteSheetRow(sheetTitle: string, rowIndex: number) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const meta = await getSpreadsheetMetadata();
  const sheetMeta = meta.sheets?.find((s: any) => s.properties.title === sheetTitle);
  if (!sheetMeta) throw new Error(`Sheet ${sheetTitle} not found`);
  const sheetId = sheetMeta.properties.sheetId;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const res: any = await auth.request({
    url,
    method: 'POST',
    data: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
  return res.data;
}
