import Link from "next/link";
import { PlusCircle, Edit, CheckCircle, X } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home(props: { searchParams?: Promise<{ success?: string }> | { success?: string } }) {
  const resolvedParams = props.searchParams ? await props.searchParams : {};
  const isSuccess = resolvedParams?.success === '1';

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-16 space-y-6">
      {isSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="text-emerald-600 shrink-0" size={18} />
            <span>Report successfully submitted & saved to Google Sheet!</span>
          </div>
          <Link href="/" className="text-emerald-500 hover:text-emerald-800 p-1 rounded-md transition-colors" title="Close">
            <X size={16} />
          </Link>
        </div>
      )}

      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Mukhyamantri Swasthya Bima Yojana Report</h1>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* NEW CARD */}
        <Link 
          href="/new" 
          className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-xs hover:border-blue-600 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-4 group cursor-pointer"
        >
          <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <PlusCircle size={44} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">DEO'S ENTRY</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">M M S B Y</p>
          </div>
        </Link>

        {/* OLD CARD */}
        <Link 
          href="/old" 
          className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-xs hover:border-gray-900 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-4 group cursor-pointer"
        >
          <div className="w-20 h-20 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-colors">
            <Edit size={44} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 group-hover:text-gray-900 transition-colors">EDIT SECTION</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">Within 30 Mins</p>
          </div>
        </Link>
      </div>
    </div>
  );
}


