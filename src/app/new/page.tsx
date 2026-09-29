import SubmissionForm from "@/components/submission-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getKnownDeoNames } from "@/app/actions/submissions";

export const dynamic = "force-dynamic";

export default async function NewRecordPage() {
  const knownDeoNames = await getKnownDeoNames();

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Submission</h1>
          <p className="text-xs text-gray-500 mt-0.5">Submit new data entry or verification record for today.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
      <SubmissionForm knownDeoNames={knownDeoNames} />
    </div>
  );
}
