import { JWT } from 'google-auth-library';
import { cookies } from 'next/headers';

export interface UserRecord {
  mobile: string;
  password: string;
  name: string;
  access?: string;
}

export interface SessionUser {
  mobile: string;
  name: string;
  loginAt: number;
}

export function getAuthSheetsClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const usersSheetId = process.env.GOOGLE_USERS_SHEET_ID || '1zdJuU27q4oNgsVHm8O0JD-pZJ6Q-8iHRL23JD9IbZ2Q';

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Sheets credentials are not properly configured.');
  }

  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return { auth, spreadsheetId: usersSheetId };
}

export function cleanMobile(num: any): string {
  if (!num) return '';
  const digits = String(num).replace(/\D/g, '');
  // If starts with 91 and has 12 digits, extract last 10
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If starts with 0 and has 11 digits, extract last 10
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export async function fetchUsersFromGoogleSheet(): Promise<UserRecord[]> {
  const { auth, spreadsheetId } = getAuthSheetsClient();

  // 1. Fetch spreadsheet metadata to get the first sheet's title
  let sheetTitle = 'Sheet1';
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    const metaRes: any = await auth.request({ url: metaUrl });
    if (metaRes.data?.sheets?.length > 0) {
      sheetTitle = metaRes.data.sheets[0].properties.title;
    }
  } catch (err: any) {
    console.error('Error fetching sheet metadata:', err);
    throw err;
  }

  // 2. Fetch rows from the sheet
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A1:Z500`)}`;
  const valuesRes: any = await auth.request({ url: valuesUrl });
  const rows: string[][] = valuesRes.data?.values || [];
  if (rows.length === 0) return [];

  // 3. Detect header row by scanning first 5 rows
  let headerRowIndex = -1;
  let mobileIdx = -1;
  let passIdx = -1;
  let nameIdx = -1;
  let accessIdx = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r].map(c => String(c || '').trim().toLowerCase());
    const mIdx = row.findIndex(c => 
      c.includes('mobile') || c.includes('phone') || c.includes('contact') || c.includes('number') || c.includes('মোবাইল')
    );
    const pIdx = row.findIndex(c => 
      c.includes('pass') || c.includes('pwd') || c.includes('pin') || c.includes('পাসওয়ার্ড')
    );
    if (mIdx !== -1 && pIdx !== -1) {
      headerRowIndex = r;
      mobileIdx = mIdx;
      passIdx = pIdx;
      nameIdx = row.findIndex(c => 
        c.includes('name') || c.includes('deo') || c.includes('user') || c.includes('নাম')
      );
      accessIdx = row.findIndex(c => 
        c.includes('access') || c.includes('status') || c.includes('অনুমতি')
      );
      break;
    }
  }

  let dataRows: string[][];
  if (headerRowIndex !== -1) {
    dataRows = rows.slice(headerRowIndex + 1);
  } else {
    // Fallback if headers are not found in row 0-4
    mobileIdx = 0;
    passIdx = 1;
    nameIdx = 2;
    dataRows = rows;
  }

  const users: UserRecord[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const rawMobile = row[mobileIdx] || '';
    const rawPass = row[passIdx] || '';
    const rawName = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '';
    const rawAccess = accessIdx !== -1 && row[accessIdx] ? String(row[accessIdx]).trim().toUpperCase() : 'YES';

    const mobile = cleanMobile(rawMobile);
    const password = String(rawPass).trim();

    if (mobile && password) {
      users.push({
        mobile,
        password,
        name: rawName || `DEO (${mobile.slice(-4)})`,
        access: rawAccess,
      });
    }
  }

  return users;
}

export async function verifyCredentials(mobileInput: string, passwordInput: string): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  const cleanInput = cleanMobile(mobileInput);
  const trimmedPass = String(passwordInput || '').trim();

  if (!cleanInput || !trimmedPass) {
    return { success: false, error: 'Incorrect mobile no. and pass word' };
  }

  let users: UserRecord[] = [];
  try {
    users = await fetchUsersFromGoogleSheet();
  } catch (err: any) {
    console.error('Error fetching users from sheet:', err);
    return {
      success: false,
      error: 'Incorrect mobile no. and pass word',
    };
  }

  if (users.length === 0) {
    return {
      success: false,
      error: 'Incorrect mobile no. and pass word',
    };
  }

  const matchedUser = users.find(
    u => u.mobile === cleanInput && u.password === trimmedPass
  );

  if (!matchedUser) {
    return {
      success: false,
      error: 'Incorrect mobile no. and pass word',
    };
  }

  // Check if access is explicitly restricted (e.g. access === 'NO')
  if (matchedUser.access && matchedUser.access === 'NO') {
    return {
      success: false,
      error: 'Incorrect mobile no. and pass word',
    };
  }

  return {
    success: true,
    user: {
      mobile: matchedUser.mobile,
      name: matchedUser.name,
      loginAt: Date.now(),
    },
  };
}

export async function createSession(user: SessionUser) {
  const cookieStore = await cookies();
  const sessionData = JSON.stringify(user);
  cookieStore.set('auth_session', sessionData, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth_session');
    if (!sessionCookie?.value) return null;
    return JSON.parse(sessionCookie.value) as SessionUser;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_session');
}
