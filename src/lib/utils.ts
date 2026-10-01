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

export function canonicalGp(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').toUpperCase();
  if (normalized.includes('NO') && (normalized.includes('ARRIVAL') || normalized.includes('ARAIVAL'))) {
    return 'NO ARRIVAL';
  }
  const match = WFH_GP_LIST.find(
    g => g.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').toUpperCase() === normalized
  );
  return match || trimmed;
}

