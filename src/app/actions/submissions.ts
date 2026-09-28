'use server';

import { normalizeName } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { getGoogleDoc } from '@/lib/google-sheets';

export type RecordRow = {
  Date: string;
  Name: string;
  Mobile?: string;
  'GP (entry or verify)': string;
  Day: number;
  Night: number;
  Total: number;
  Reject: number;
  'Submitted At': string;
  'Last Update': string;
  'Record Type': 'ENTRY' | 'VERIFY';
};

// Helper to synthesize a unique URL-safe ID for UI group
function generateUIId(date: string, name: string, recordType: string) {
  return Buffer.from(`${date}|${name}|${recordType}`).toString('base64url');
}

// Helper to get or create sheet based on type
async function getSheetForType(doc: any, type: 'ENTRY' | 'VERIFY') {
  if (type === 'ENTRY') {
    const sheet = doc.sheetsByIndex[0];
    try {
      await sheet.setHeaderRow(['Date', 'Name', 'Mobile', 'GP (entry or verify)', 'Day', 'Night', 'Total', 'Reject', 'Submitted At', 'Last Update', 'Record Type']);
    } catch (e) {}
    return sheet;
  } else {
    let sheet = doc.sheetsByTitle['Verify'];
    if (!sheet) {
      sheet = await doc.addSheet({ title: 'Verify' });
      await sheet.setHeaderRow(['Date', 'Name', 'Mobile', 'GP (entry or verify)', 'Day', 'Night', 'Total', 'Reject', 'Submitted At', 'Last Update', 'Record Type']);
    } else {
      try {
        await sheet.setHeaderRow(['Date', 'Name', 'Mobile', 'GP (entry or verify)', 'Day', 'Night', 'Total', 'Reject', 'Submitted At', 'Last Update', 'Record Type']);
      } catch (e) {}
    }
    return sheet;
  }
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
  const normalizedName = normalizeName(data.name);
  const type = data.recordType as 'ENTRY' | 'VERIFY';
  
  const doc = await getGoogleDoc();
  const sheet = await getSheetForType(doc, type);

  const rows = await sheet.getRows();
  const nowString = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  for (const item of data.items) {
    const existingRow = rows.find((r: any) => 
      r.get('Date') === data.date && 
      r.get('Name') === normalizedName && 
      r.get('GP (entry or verify)') === item.gpName && 
      r.get('Record Type') === type
    );

    if (existingRow) {
      let updatedDay = Number(existingRow.get('Day')) || 0;
      let updatedNight = Number(existingRow.get('Night')) || 0;
      let existingProblem = Number(existingRow.get('Reject')) || 0;
      
      if (item.shift === 'DAY') updatedDay += item.amount;
      else updatedNight += item.amount;
      
      const updatedTotal = updatedDay + updatedNight;

      existingRow.assign({
        Day: updatedDay,
        Night: updatedNight,
        Reject: existingProblem + item.problemAmount,
        Total: updatedTotal,
        'Last Update': nowString
      });
      await existingRow.save();
    } else {
      await sheet.addRow({
        Date: data.date,
        Name: normalizedName,
        Mobile: data.mobile || '',
        'GP (entry or verify)': item.gpName,
        Day: item.shift === 'DAY' ? item.amount : 0,
        Night: item.shift === 'NIGHT' ? item.amount : 0,
        Total: item.amount,
        Reject: item.problemAmount,
        'Submitted At': nowString,
        'Last Update': nowString,
        'Record Type': type,
      });
    }
  }

  revalidatePath('/old');
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
  const type = data.recordType as 'ENTRY' | 'VERIFY';
  const decoded = Buffer.from(id, 'base64url').toString('utf8');
  const [originalDate, originalName, originalRecordType] = decoded.split('|');

  if (!originalDate || !originalName || originalRecordType !== type) {
    return { success: false, error: 'Invalid ID' };
  }

  const doc = await getGoogleDoc();
  const sheet = await getSheetForType(doc, type);
  const rows = await sheet.getRows();

  const existingRows = rows.filter((r: any) => 
    r.get('Date') === originalDate && 
    r.get('Name') === originalName && 
    r.get('Record Type') === type
  );

  if (existingRows.length === 0) return { success: false, error: 'Submission not found' };

  const submittedAtDate = new Date(existingRows[0].get('Submitted At'));
  if (!isNaN(submittedAtDate.getTime())) {
    const editUntil = new Date(submittedAtDate.getTime() + 30 * 60 * 1000);
    if (new Date() > editUntil) return { success: false, error: 'Edit Time Expired' };
  }

  const normalizedName = normalizeName(data.name);
  const nowString = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const originalSubmittedAt = existingRows[0].get('Submitted At');

  // Delete old rows
  for (const row of existingRows) {
    await row.delete();
  }

  // Insert new rows
  const mergedMap = new Map<string, any>();
  for (const item of data.items) {
    const key = `${data.date}_${normalizedName}_${item.gpName}`;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        Date: data.date,
        Name: normalizedName,
        Mobile: data.mobile || '',
        'GP (entry or verify)': item.gpName,
        Day: 0,
        Night: 0,
        Total: 0,
        Reject: 0,
        'Submitted At': originalSubmittedAt,
        'Last Update': nowString,
        'Record Type': type
      });
    }
    const merged = mergedMap.get(key)!;
    if (item.shift === 'DAY') merged.Day = item.amount;
    if (item.shift === 'NIGHT') merged.Night = item.amount;
    merged.Reject = item.problemAmount;
    merged.Total = merged.Day + merged.Night;
  }

  const newRows = Array.from(mergedMap.values());
  if (newRows.length > 0) {
    await sheet.addRows(newRows);
  }

  revalidatePath('/old');
  return { success: true };
}

export async function getSubmissions(query?: { name?: string; date?: string; recordType?: string }) {
  const doc = await getGoogleDoc();
  let allRows: any[] = [];
  
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'ENTRY') {
    const entrySheet = doc.sheetsByIndex[0];
    if (entrySheet) allRows.push(...await entrySheet.getRows());
  }
  if (!query?.recordType || query.recordType === 'All' || query.recordType === 'VERIFY') {
    const verifySheet = doc.sheetsByTitle['Verify'];
    if (verifySheet) allRows.push(...await verifySheet.getRows());
  }

  let filteredRows = allRows;

  if (query?.name?.trim()) {
    const regex = new RegExp(query.name.trim(), 'i');
    filteredRows = filteredRows.filter((r: any) => regex.test(r.get('Name')));
  }
  if (query?.date?.trim()) {
    filteredRows = filteredRows.filter((r: any) => r.get('Date') === query.date?.trim());
  }
  if (query?.recordType && query.recordType !== 'All') {
    filteredRows = filteredRows.filter((r: any) => r.get('Record Type') === query.recordType);
  }

  // If no query parameters are provided (and it's not a generic fetch), we might want to return empty.
  // But wait, the original returned empty if NO query parameters were provided.
  if (!query || Object.keys(query).length === 0) return [];

  const grouped = new Map<string, any>();
  for (const row of filteredRows) {
    const date = row.get('Date');
    const name = row.get('Name');
    const recordType = row.get('Record Type');
    const uiId = generateUIId(date, name, recordType);
    
    if (!grouped.has(uiId)) {
      let submittedDate = new Date(row.get('Submitted At'));
      if (isNaN(submittedDate.getTime())) submittedDate = new Date();
      
      grouped.set(uiId, {
        id: uiId,
        date: date,
        name: name,
        mobile: row.get('Mobile') || '',
        recordType: recordType,
        createdAt: submittedDate,
        editUntil: new Date(submittedDate.getTime() + 30 * 60 * 1000),
        items: []
      });
    }
    
    const sub = grouped.get(uiId);
    const day = Number(row.get('Day')) || 0;
    const night = Number(row.get('Night')) || 0;
    const problem = Number(row.get('Reject')) || 0;
    const gp = row.get('GP (entry or verify)');

    if (day > 0 || (day === 0 && night === 0)) {
      sub.items.push({ gpName: gp, shift: 'DAY', amount: day, problemAmount: problem });
    }
    if (night > 0) {
      sub.items.push({ gpName: gp, shift: 'NIGHT', amount: night, problemAmount: 0 });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [date, name, recordType] = decoded.split('|');
    if (!date || !name || !recordType) return { success: false, error: 'Invalid ID' };

    const doc = await getGoogleDoc();
    const sheet = await getSheetForType(doc, recordType as 'ENTRY' | 'VERIFY');
    const rows = await sheet.getRows();
    
    const rowsToDelete = rows.filter((r: any) => 
      r.get('Date') === date && 
      r.get('Name') === name && 
      r.get('Record Type') === recordType
    );

    for (const row of rowsToDelete) {
      await row.delete();
    }

    revalidatePath('/old');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete submission' };
  }
}

export async function getSubmission(id: string) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const [date, name, recordType] = decoded.split('|');
    if (!date || !name || !recordType) return null;
    
    const submissions = await getSubmissions({ name, date, recordType });
    return submissions.find(s => s.id === id) || null;
  } catch (e) {
    return null;
  }
}
