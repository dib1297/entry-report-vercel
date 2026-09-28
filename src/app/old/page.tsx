import { getSubmissions } from "@/app/actions/submissions";
import Link from "next/link";
import { Search, ChevronDown, Edit2, ArrowLeft, PlusCircle, CheckCircle } from "lucide-react";
import DeleteButton from "@/components/delete-button";

export const dynamic = "force-dynamic";

export default async function OldRecordsPage(props: {
  searchParams?: Promise<{ name?: string; date?: string; recordType?: string; updated?: string }> | { name?: string; date?: string; recordType?: string; updated?: string };
}) {
  const resolvedParams = props?.searchParams ? await props.searchParams : {};
  const name = typeof resolvedParams?.name === 'string' ? resolvedParams.name.trim() : '';
  const date = typeof resolvedParams?.date === 'string' ? resolvedParams.date.trim() : '';
  const recordType = typeof resolvedParams?.recordType === 'string' ? resolvedParams.recordType : '';
  const isUpdated = Boolean(resolvedParams?.updated);

  const hasFilter = Boolean(
    name || 
    date || 
    (recordType && recordType !== 'All')
  );

  const submissions = await getSubmissions({ name, date, recordType });

  return (
    <div className="space-y-6">
      
      {/* Update Notification Banner */}
      {isUpdated && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm font-semibold flex items-center gap-2.5 shadow-xs animate-in fade-in">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>Record updated successfully in Google Sheet!</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit & View Records</h1>
          <p className="text-xs text-gray-500 mt-0.5">Search, review, edit, or delete existing submissions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-xs transition-colors"
          >
            <PlusCircle size={14} /> New Entry
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <form className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">DIO Name</label>
            <input 
              name="name" 
              type="text" 
              defaultValue={name}
              placeholder="Search by DIO name..."
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Date</label>
            <input 
              name="date" 
              type="date" 
              defaultValue={date}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Record Type</label>
            <select 
              name="recordType" 
              defaultValue={recordType || 'All'}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors"
            >
              <option value="All">All Types (Entry & Verified)</option>
              <option value="ENTRY">Entry Only</option>
              <option value="VERIFY">Verified Only</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5">
              <Search size={16} /> Filter
            </button>
            {hasFilter && (
              <Link href="/old" className="px-3.5 py-2 rounded-lg border border-gray-300 font-semibold text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center justify-center">
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Results Section */}
      <div className="space-y-3">
        {submissions.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-gray-200 text-center shadow-xs">
            <Search className="mx-auto h-10 w-10 text-rose-300 mb-3" />
            <h3 className="text-base font-semibold text-gray-800">
              {hasFilter ? 'No Records Found' : 'No Submissions Yet'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {hasFilter ? 'No matching submissions found for your filter criteria.' : 'Create a new submission from the home page or click New Entry above.'}
            </p>
          </div>
        ) : (
          submissions.map((sub) => {
            const day = Number(sub.day) || 0;
            const night = Number(sub.night) || 0;
            const total = Number(sub.total) || (day + night);
            const reject = Number(sub.reject) || 0;
            const gpParts = sub.gpName ? sub.gpName.split('+').map((g: string) => g.trim()).filter(Boolean) : [];

            return (
              <details key={sub.id} open className="group bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                <summary className="p-4 sm:p-5 cursor-pointer list-none flex flex-col sm:flex-row gap-4 sm:items-center justify-between hover:bg-gray-50/70 transition-colors">
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</p>
                      <p className="font-bold text-gray-900 text-sm mt-0.5">{sub.displayDate}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">DIO Name</p>
                      <p className="font-bold text-gray-900 text-sm mt-0.5">{sub.name}</p>
                      {sub.mobile && <p className="text-xs text-gray-500 font-medium">{sub.mobile}</p>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-0.5 ${sub.recordType === 'ENTRY' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {sub.recordType === 'ENTRY' ? 'ENTRY' : 'VERIFIED'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total / Reject</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-gray-900 text-base">{total.toLocaleString('en-IN')}</span>
                        {reject > 0 && (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                            Rej: {reject}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Link 
                      href={`/edit/${sub.id}`} 
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <Edit2 size={13} /> Edit
                    </Link>
                    <DeleteButton id={sub.id} />
                    <div className="text-gray-400 group-open:rotate-180 transition-transform ml-1">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </summary>

                <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50">
                  <div className="mb-3 flex flex-wrap justify-between items-center text-xs text-gray-500 gap-2">
                    <div className="flex items-center gap-3">
                      <span>Day: <strong className="text-gray-800">{day}</strong></span>
                      <span>Night: <strong className="text-gray-800">{night}</strong></span>
                      <span>Total: <strong className="text-gray-800">{total}</strong></span>
                      {reject > 0 && <span>Reject: <strong className="text-rose-600">{reject}</strong></span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-500">Sheet:</span>
                      <span className="font-semibold text-gray-700">{sub.recordType === 'ENTRY' ? 'Entry' : 'Verified'} (Row {sub.rowIndex})</span>
                    </div>
                  </div>

                  <h4 className="font-bold text-gray-700 mb-2 uppercase tracking-wider text-xs">GP Breakdown</h4>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sub.items.map((item: any, idx: number) => (
                      <div key={idx} className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-bold text-gray-900 text-sm">{item.gpName || '—'}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.shift === 'DAY' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                            {item.shift}
                          </span>
                        </div>
                        <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 text-xs">
                          <div>
                            <span className="text-gray-500">Amount: </span>
                            <span className="font-bold text-gray-900">{item.amount}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Reject: </span>
                            <span className="font-bold text-rose-600">{item.problemAmount}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
