'use client';

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (confirm('আপনি কি নিশ্চিত যে আপনি লগআউট করতে চান?')) {
      setLoading(true);
      await logoutAction();
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 text-xs font-semibold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
      title="লগআউট করুন"
    >
      <LogOut size={14} className={loading ? 'animate-spin' : ''} />
      <span>{loading ? 'লগআউট হচ্ছে...' : 'লগআউট (Logout)'}</span>
    </button>
  );
}
