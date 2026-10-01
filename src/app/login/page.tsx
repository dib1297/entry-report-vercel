'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Lock, Eye, EyeOff, LogIn, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import CaptchaBox from '@/components/captcha-box';
import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaExpected, setCaptchaExpected] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanMobile = mobile.trim().replace(/\D/g, '');
    if (!cleanMobile) {
      setErrorMessage('দয়া করে আপনার মোবাইল নম্বর লিখুন।');
      return;
    }
    if (cleanMobile.length < 10) {
      setErrorMessage('সঠিক ১০ সংখ্যার মোবাইল নম্বর লিখুন।');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('দয়া করে আপনার পাসওয়ার্ড লিখুন।');
      return;
    }
    if (!captchaInput.trim()) {
      setErrorMessage('দয়া করে ক্যাপচা কোডটি পূরণ করুন।');
      return;
    }

    if (captchaInput.trim().toUpperCase() !== captchaExpected.trim().toUpperCase()) {
      setErrorMessage('ক্যাপচা কোড মেলেনি! অনুগ্রহ করে সঠিক কোডটি দিন।');
      return;
    }

    setIsLoading(true);

    try {
      const res = await loginAction({
        mobile: cleanMobile,
        password: password.trim(),
        captchaInput: captchaInput.trim(),
        captchaExpected: captchaExpected.trim(),
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Incorrect mobile no. and pass word');
        setIsLoading(false);
        return;
      }

      setSuccessMessage('লগইন সফল হয়েছে! ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে...');
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 700);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Incorrect mobile no. and pass word');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-6 sm:p-7 text-center relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 mb-3 shadow-inner">
            <ShieldCheck size={32} className="text-white drop-shadow" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">DEO Portal Login</h1>
          <p className="text-xs sm:text-sm text-blue-100 font-medium mt-1">
            Mukhyamantri Swasthya Bima Yojana
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 shadow-xs animate-in fade-in">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs sm:text-sm flex items-center gap-2.5 shadow-xs animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div>{successMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mobile Number Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 block">
                মোবাইল নম্বর (Mobile Number)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Phone size={17} />
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="১০ সংখ্যার মোবাইল নম্বর লিখুন"
                  disabled={isLoading}
                  autoComplete="tel"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 block">
                পাসওয়ার্ড (Password)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock size={17} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="পাসওয়ার্ড লিখুন"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  title={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Captcha Section */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-gray-700 block">
                ক্যাপচা কোড (Security Code)
              </label>
              <div className="flex items-center gap-3">
                <CaptchaBox onCodeChange={(code) => setCaptchaExpected(code)} />
                <div className="flex-1">
                  <input
                    type="text"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                    placeholder="কোড লিখুন"
                    maxLength={6}
                    disabled={isLoading}
                    autoComplete="off"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                পাশের ছবিতে দেখানো ৫ অক্ষরের কোডটি ঘরে সঠিকভাবে লিখুন।
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2 text-sm sm:text-base cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>যাচাই করা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>লগইন করুন (Login)</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Secure note */}
          <div className="pt-2 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-400">
              সুরক্ষিত ডেটা এন্ট্রি পোর্টাল • শুধুমাত্র অনুমোদিত DEO-দের জন্য
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
