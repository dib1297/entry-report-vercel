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
          <span className="inline-flex items-center text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200 w-fit">
            {submission.recordType === 'ENTRY' ? 'Entry Record' : 'Verified Record'} • {submission.displayDate}
          </span>
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
        knownDioNames={knownDioNames} 
      />
    </div>
  );
}
