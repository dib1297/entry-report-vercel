import Link from "next/link";
import { PlusCircle, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-16 space-y-6">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Select an Option</h1>
        <p className="text-sm text-gray-500">Choose whether to create a new submission or view old records.</p>
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
            <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">NEW</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">New Entry / Verification</p>
          </div>
        </Link>

        {/* OLD CARD */}
        <Link 
          href="/old" 
          className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-xs hover:border-gray-900 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-4 group cursor-pointer"
        >
          <div className="w-20 h-20 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-colors">
            <Search size={44} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 group-hover:text-gray-900 transition-colors">OLD</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">Search & View Old Records</p>
          </div>
        </Link>
      </div>
    </div>
  );
}


