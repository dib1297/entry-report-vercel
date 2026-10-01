import { JWT } from 'google-auth-library';
import { cookies } from 'next/headers';

export interface UserRecord {
  mobile: string;
  password: string;
  name: string;
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
    if (err?.code === 403 || err?.status === 403 || err?.response?.status === 403) {
      throw new Error(
        'GOOGLE_SHEET_PERMISSION_DENIED: গুগল শিটে পারমিশন নেই! আপনার গুগল শিটটি (1zdJuU27q4oNgsVHm8O0JD-pZJ6Q-8iHRL23JD9IbZ2Q) sheets-api@primeval-voyage-495317-n2.iam.gserviceaccount.com কে Viewer পারমিশন দিন।'
      );
    }
    throw err;
  }

  // 2. Fetch rows from the sheet
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A1:Z500`)}`;
  let valuesRes: any;
  try {
    valuesRes = await auth.request({ url: valuesUrl });
  } catch (err: any) {
    if (err?.code === 403 || err?.status === 403 || err?.response?.status === 403) {
      throw new Error(
        'GOOGLE_SHEET_PERMISSION_DENIED: গুগল শিটে পারমিশন নেই! আপনার গুগল শিটটি (1zdJuU27q4oNgsVHm8O0JD-pZJ6Q-8iHRL23JD9IbZ2Q) sheets-api@primeval-voyage-495317-n2.iam.gserviceaccount.com কে Viewer পারমিশন দিন।'
      );
    }
    throw err;
  }

  const rows: string[][] = valuesRes.data?.values || [];
  if (rows.length === 0) return [];

  // 3. Detect column indices
  const headerRow = rows[0].map(h => String(h || '').trim().toLowerCase());
  
  let mobileIdx = -1;
  let passIdx = -1;
  let nameIdx = -1;

  headerRow.forEach((col, idx) => {
    if (col.includes('mobile') || col.includes('phone') || col.includes('contact') || col.includes('number') || col.includes('মোবাইল')) {
      if (mobileIdx === -1) mobileIdx = idx;
    } else if (col.includes('pass') || col.includes('pwd') || col.includes('pin') || col.includes('পাসওয়ার্ড')) {
      if (passIdx === -1) passIdx = idx;
    } else if (col.includes('name') || col.includes('deo') || col.includes('user') || col.includes('নাম')) {
      if (nameIdx === -1) nameIdx = idx;
    }
  });

  let dataRows = rows;
  const isHeaderPresent = mobileIdx !== -1 || passIdx !== -1;
  if (isHeaderPresent) {
    dataRows = rows.slice(1);
  } else {
    // If no explicit header found, fallback:
    // Check if column 0 looks like mobile (digits)
    const firstCellDigits = cleanMobile(rows[0][0]);
    if (firstCellDigits.length === 10) {
      mobileIdx = 0;
      passIdx = 1;
      nameIdx = 2;
    } else {
      // Maybe Column 0 is Name, Column 1 is Mobile, Column 2 is Password
      const secondCellDigits = cleanMobile(rows[0][1]);
      if (secondCellDigits.length === 10) {
        nameIdx = 0;
        mobileIdx = 1;
        passIdx = 2;
      } else {
        // Default assumption
        mobileIdx = 0;
        passIdx = 1;
        nameIdx = 2;
      }
    }
  }

  // Ensure default fallbacks if one is missing
  if (mobileIdx === -1) mobileIdx = 0;
  if (passIdx === -1) passIdx = mobileIdx === 0 ? 1 : 0;

  const users: UserRecord[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const rawMobile = row[mobileIdx] || '';
    const rawPass = row[passIdx] || '';
    const rawName = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '';

    const mobile = cleanMobile(rawMobile);
    const password = String(rawPass).trim();

    if (mobile && password) {
      users.push({
        mobile,
        password,
        name: rawName || `DEO (${mobile.slice(-4)})`,
      });
    }
  }

  return users;
}

export async function verifyCredentials(mobileInput: string, passwordInput: string): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  const cleanInput = cleanMobile(mobileInput);
  const trimmedPass = String(passwordInput || '').trim();

  if (!cleanInput) {
    return { success: false, error: 'সঠিক মোবাইল নম্বর লিখুন।' };
  }
  if (!trimmedPass) {
    return { success: false, error: 'পাসওয়ার্ড লিখুন।' };
  }

  let users: UserRecord[] = [];
  try {
    users = await fetchUsersFromGoogleSheet();
  } catch (err: any) {
    console.error('Error fetching users from sheet:', err);
    if (err.message?.includes('GOOGLE_SHEET_PERMISSION_DENIED')) {
      return {
        success: false,
        error: 'গুগল শিট পারমিশন নেই! অনুগ্রহ করে শিটে sheets-api@primeval-voyage-495317-n2.iam.gserviceaccount.com কে Viewer পারমিশন দিন।',
      };
    }
    return {
      success: false,
      error: 'গুগল শিট থেকে ডেটা পড়তে সমস্যা হচ্ছে: ' + (err.message || 'অজানা ত্রুটি'),
    };
  }

  if (users.length === 0) {
    return {
      success: false,
      error: 'গুগল শিটে কোনো ব্যবহারকারীর তথ্য পাওয়া যায়নি। অনুগ্রহ করে শিটে মোবাইল নম্বর ও পাসওয়ার্ড যুক্ত করুন।',
    };
  }

  const matchedUser = users.find(
    u => u.mobile === cleanInput && u.password === trimmedPass
  );

  if (!matchedUser) {
    return {
      success: false,
      error: 'মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়!',
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
    httpOnly: false, // Accessible to read on client if needed
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
