import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeName(name: string): string {
  // Trim spaces and capitalize first letter of each word to keep it consistent
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export const GP_LIST = [
  "NO ARRIVAL",
  "BAMANHAT – I",
  "BAMANHAT – II",
  "BARA SAKDAL",
  "BURIRHAT – I",
  "BURIRHAT – II",
  "CHOWDHURYHAT",
  "GOBRACHHARA NAYARHAT",
  "KISMAT DASGRAM",
  "NAZIRHAT – I",
  "NAZIRHAT – II",
  "SAHEBGANJ",
  "SUKARURKUTHI"
];

export const WFH_GP_LIST = [
  "NO ARRIVAL",
  "BAMANHAT – I",
  "BAMANHAT – II",
  "BARA SAKDAL",
  "BURIRHAT – I",
  "BURIRHAT – II",
  "CHOWDHURYHAT",
  "GOBRACHHARA NAYARHAT",
  "KISMAT DASGRAM",
  "NAZIRHAT – I",
  "NAZIRHAT – II",
  "SAHEBGANJ",
  "SUKARURKUTHI"
];

export function matchCanonicalGp(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const rawClean = clean(trimmed);

  if (rawClean.includes('NO') && (rawClean.includes('ARRIVAL') || rawClean.includes('ARAIVAL'))) {
    return 'NO ARRIVAL';
  }

  // 1. Direct alphanumeric match
  for (const gp of GP_LIST) {
    if (clean(gp) === rawClean) {
      return gp;
    }
  }

  // 2. Normalize Roman numerals and numbers
  const replaceNumerals = (s: string) =>
    s.replace(/II$/i, '2')
     .replace(/I$/i, '1')
     .replace(/2$/i, '2')
     .replace(/1$/i, '1');

  // 3. Phonetic and spelling variations (e.g., Chowdhuri vs Chowdhury, Kishamat vs Kismat, Barasakdal)
  const normalizePhonetic = (s: string) => {
    let str = clean(s);
    str = str.replace(/KISHAMAT/g, 'KISMAT');
    str = str.replace(/CHOWDHURI/g, 'CHOWDHURY');
    str = str.replace(/BARASAKDAL/g, 'BARASAKDAL');
    str = replaceNumerals(str);
    return str;
  };

  const rawNorm = normalizePhonetic(rawClean);
  for (const gp of GP_LIST) {
    if (normalizePhonetic(clean(gp)) === rawNorm) {
      return gp;
    }
  }

  return trimmed;
}

export function canonicalGp(raw: string): string {
  return matchCanonicalGp(raw);
}

export function parseAllowedGps(rawGp?: string): string[] {
  if (!rawGp || !rawGp.trim()) return [];
  const parts = rawGp.split(/[,+/;&]/).map(p => p.trim()).filter(Boolean);
  const matched = parts
    .map(p => matchCanonicalGp(p))
    .filter(gp => GP_LIST.includes(gp));
  return Array.from(new Set(matched));
}

