'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
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
    if (!cleanMobile || cleanMobile.length < 10) {
      setErrorMessage('Incorrect mobile no. and pass word');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Incorrect mobile no. and pass word');
      return;
    }
    if (!captchaInput.trim() || captchaInput.trim().toUpperCase() !== captchaExpected.trim().toUpperCase()) {
      setErrorMessage('Incorrect Captcha');
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

      setSuccessMessage('Login successful! Redirecting...');
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Incorrect mobile no. and pass word');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5 overflow-hidden">
        {/* Simple Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-gray-900">DEO Login</h1>
          <p className="text-xs text-gray-500">Mukhyamantri Swasthya Bima Yojana</p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3.5 py-2.5 rounded-lg text-xs font-medium text-center animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3.5 py-2.5 rounded-lg text-xs font-medium text-center animate-in fade-in">
            {successMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Mobile Number
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 10-digit mobile number"
              disabled={isLoading}
              autoComplete="tel"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff6200] focus:border-[#ff6200] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-9 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff6200] focus:border-[#ff6200] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Captcha
            </label>
            <div className="flex items-center gap-2 w-full">
              <CaptchaBox onCodeChange={(code) => setCaptchaExpected(code)} />
              <input
                type="text"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                placeholder="Code"
                maxLength={5}
                disabled={isLoading}
                autoComplete="off"
                className="min-w-0 flex-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 text-sm font-semibold tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-[#ff6200] focus:border-[#ff6200] transition-colors"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#ff6200] hover:bg-[#ea580c] active:bg-[#c2410c] disabled:bg-[#fdba74] text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
            >
              {isLoading ? 'Verifying...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
