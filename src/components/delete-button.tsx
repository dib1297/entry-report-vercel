'use client';

import { useState, useTransition } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteSubmission } from '@/app/actions/submissions';
import { useRouter } from 'next/navigation';

export default function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    startTransition(async () => {
      await deleteSubmission(id);
      router.refresh();
      setIsConfirming(false);
    });
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-1.5 animate-in fade-in">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs disabled:opacity-60"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
        </button>
        <button
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg font-semibold text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1"
      title="Delete submission"
    >
      <Trash2 size={13} /> Delete
    </button>
  );
}
