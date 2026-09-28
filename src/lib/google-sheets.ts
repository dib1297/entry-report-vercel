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

export async function getSheetValues(sheetTitle: string, range: string = 'A1:J'): Promise<string[][]> {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!${range}`)}`;
  const res: any = await auth.request({ url });
  return res.data?.values || [];
}

export async function appendSheetRows(sheetTitle: string, values: any[][]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A:J`)}:append?valueInputOption=USER_ENTERED`;
  const res: any = await auth.request({
    url,
    method: 'POST',
    data: { values },
  });
  return res.data;
}

export async function updateSheetRow(sheetTitle: string, rowIndex: number, rowValues: any[]) {
  const { auth, spreadsheetId } = getSheetsAuth();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A${rowIndex}:J${rowIndex}`)}?valueInputOption=USER_ENTERED`;
  const res: any = await auth.request({
    url,
    method: 'PUT',
    data: { values: [rowValues] },
  });
  return res.data;
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
