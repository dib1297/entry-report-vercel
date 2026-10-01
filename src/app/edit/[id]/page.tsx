import { getSubmission, getKnownDeoNames } from "@/app/actions/submissions";
import SubmissionForm from "@/components/submission-form";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canonicalGp } from "@/lib/utils";

export default async function EditRecordPage(props: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await props.params;
  const [submission, knownDeoNames, sessionUser] = await Promise.all([
    getSubmission(resolvedParams.id),
    getKnownDeoNames(),
    getSession(),
  ]);

  if (!submission) {
    notFound();
  }

  if ((submission as any).expired) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center font-bold text-xl">
            ⏱️
          </div>
          <h2 className="text-lg font-bold text-gray-900">৩০ মিনিট সময় পার হয়ে গেছে</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            রিপোর্ট জমা দেওয়ার ৩০ মিনিট পার হয়ে যাওয়ায় এটি আর এডিট বা পরিবর্তন করা যাবে না। 
            (Reports can only be edited within 30 minutes of submission).
          </p>
          <div className="pt-2">
            <Link
              href="/old"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff6200] hover:bg-[#ea580c] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <ArrowLeft size={14} /> Back to Edit Section
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Format data for the form
  const initialData = {
    date: submission.date,
    name: submission.name,
    mobile: submission.mobile || '',
    recordType: submission.recordType as 'ENTRY' | 'VERIFY',
    workFromHomeGp: (submission as any).workFromHomeGp || '',
    workFromHomeQty: typeof (submission as any).workFromHomeQty === 'number' ? (submission as any).workFromHomeQty : undefined,
    items: submission.items && submission.items.length > 0
      ? submission.items.map((item: any) => ({
          gpName: canonicalGp(item.gpName),
          shift: item.shift as 'DAY' | 'NIGHT',
          amount: item.amount,
          problemAmount: item.problemAmount,
        }))
      : [{ gpName: '', shift: 'DAY' as const, amount: 0, problemAmount: 0 }],
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Submission</h1>
          <p className="text-xs text-gray-500 mt-0.5">Modify record details within 30 minutes.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center text-xs font-semibold text-orange-700 bg-orange-50 px-3 py-1 rounded-md border border-orange-200 w-fit">
            {submission.recordType === 'ENTRY' ? 'Entry Record' : 'Verified Record'} • {submission.displayDate}
          </span>
          {typeof (submission as any).remainingMinutes === 'number' && (
            <span className="inline-flex items-center text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 w-fit">
              ⏱️ {(submission as any).remainingMinutes}m left
            </span>
          )}
          <Link
            href={`/old?name=${encodeURIComponent(submission.name)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Records
          </Link>
        </div>
      </div>
      
      <SubmissionForm 
        initialData={initialData} 
        isEditing={true} 
        editId={submission.id} 
        knownDeoNames={knownDeoNames} 
        currentUser={sessionUser}
      />
    </div>
  );
}
