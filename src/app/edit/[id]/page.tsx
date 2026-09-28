import { getSubmission, getKnownDioNames } from "@/app/actions/submissions";
import SubmissionForm from "@/components/submission-form";
import { notFound } from "next/navigation";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function EditRecordPage(props: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await props.params;
  const [submission, knownDioNames] = await Promise.all([
    getSubmission(resolvedParams.id),
    getKnownDioNames()
  ]);

  if (!submission) {
    notFound();
  }

  if (new Date() > submission.editUntil) {
    return (
      <div className="text-center py-20 animate-in fade-in">
        <h1 className="text-3xl font-extrabold text-rose-600">Edit Time Expired</h1>
        <p className="text-slate-600 mt-4 max-w-md mx-auto">
          This record can no longer be edited because the 30-minute edit window has passed.
        </p>
        <Link
          href="/old"
          className="inline-flex items-center gap-1.5 mt-6 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800"
        >
          <ArrowLeft size={14} /> Back to Records
        </Link>
      </div>
    );
  }

  // Format data for the form
  const initialData = {
    date: submission.date,
    name: submission.name,
    mobile: submission.mobile || '',
    recordType: submission.recordType as 'ENTRY' | 'VERIFY',
    items: submission.items.map((item: any) => ({
      gpName: item.gpName,
      shift: item.shift as 'DAY' | 'NIGHT',
      amount: item.amount,
      problemAmount: item.problemAmount,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Submission</h1>
          <p className="text-xs text-gray-500 mt-0.5">Modify record details.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1 rounded-md border border-amber-200 w-fit">
            Editable until {submission.editUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
          <Link
            href="/old"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </Link>
        </div>
      </div>
      
      <SubmissionForm 
        initialData={initialData} 
        isEditing={true} 
        editId={submission.id} 
        knownDioNames={knownDioNames} 
      />
    </div>
  );
}
