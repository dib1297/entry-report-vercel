'use server';

import { verifyCredentials, createSession, clearSession, getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function loginAction(params: {
  mobile: string;
  password: string;
  captchaInput: string;
  captchaExpected: string;
}): Promise<{ success: boolean; error?: string }> {
  const { mobile, password, captchaInput, captchaExpected } = params;

  // 1. Verify Captcha
  const cleanEnteredCaptcha = (captchaInput || '').trim().toUpperCase();
  const cleanExpectedCaptcha = (captchaExpected || '').trim().toUpperCase();

  if (!cleanEnteredCaptcha) {
    return { success: false, error: 'ক্যাপচা কোড লিখুন।' };
  }

  if (cleanEnteredCaptcha !== cleanExpectedCaptcha) {
    return { success: false, error: 'ক্যাপচা কোড মেলেনি! দয়া করে সঠিক ক্যাপচা কোড লিখুন।' };
  }

  // 2. Verify Credentials against Google Sheet
  const result = await verifyCredentials(mobile, password);

  if (!result.success || !result.user) {
    return { success: false, error: result.error || 'মোবাইল নম্বর অথবা পাসওয়ার্ড ভুল!' };
  }

  // 3. Create Session
  await createSession(result.user);

  try {
    revalidatePath('/');
    revalidatePath('/new');
    revalidatePath('/old');
  } catch (_) {}

  return { success: true };
}

export async function logoutAction() {
  await clearSession();
  try {
    revalidatePath('/');
    revalidatePath('/login');
  } catch (_) {}
  redirect('/login');
}

export async function getSessionUserAction() {
  return await getSession();
}
