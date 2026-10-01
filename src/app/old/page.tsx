import { getSubmissions } from "@/app/actions/submissions";
import Link from "next/link";
import { Search, ChevronDown, Edit2, ArrowLeft, PlusCircle, CheckCircle, ShieldCheck, Lock, Home } from "lucide-react";
import DeleteButton from "@/components/delete-button";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OldRecordsPage(props: {
  searchParams?: Promise<{ name?: string; date?: string; mobile?: string; recordType?: string; updated?: string }> | { name?: string; date?: string; mobile?: string; recordType?: string; updated?: string };
}) {
  const [resolvedParams, sessionUser] = await Promise.all([
    props?.searchParams ? await props.searchParams : {},
    getSession(),
  ]);

  // Default name and mobile to session user, but allow search overrides
  const name = typeof resolvedParams?.name === 'string' ? resolvedParams.name.trim() : (sessionUser?.name || '');
  const mobile = typeof resolvedParams?.mobile === 'string' ? resolvedParams.mobile.trim() : (sessionUser?.mobile || '');
  const date = typeof resolvedParams?.date === 'string' ? resolvedParams.date.trim() : '';
  const recordType = typeof resolvedParams?.recordType === 'string' ? resolvedParams.recordType : '';
  const isUpdated = Boolean(resolvedParams?.updated);

  // Filter is active if user is logged in or parameters are provided
  const hasFilter = Boolean(name || mobile || date);

  const submissions = hasFilter 
    ? await getSubmissions({ name, mobile, date, recordType }) 
    : [];

  return (
    <div className="space-y-6">
      
      {/* Update Notification Banner */}
      {isUpdated && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm font-semibold flex items-center gap-2.5 shadow-xs animate-in fade-in">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>DEO Record updated successfully!</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>Edit & View Records</span>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
              <ShieldCheck size={13} /> Protected
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Search records by DEO name, mobile number, or date to view and edit.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href="/new"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-[#ff6200] hover:bg-[#ea580c] text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-xs transition-colors"
          >
            <PlusCircle size={14} /> New Entry
          </Link>
          <Link
            href="/"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs">
        <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5 items-end">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">DEO Name</label>
            </div>
            <input 
              name="name" 
              type="text" 
              autoComplete="off"
              defaultValue={name}
              placeholder="Enter DEO name..."
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-[#ff6200] transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Mobile No.</label>
            </div>
            <input 
              name="mobile" 
              type="tel" 
              maxLength={10}
              autoComplete="off"
              defaultValue={mobile}
              placeholder="Enter 10-digit mobile..."
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-[#ff6200] transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Date</label>
            <input 
              name="date" 
              type="date" 
              defaultValue={date}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-[#ff6200] transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Record Type</label>
            <select 
              name="recordType" 
              defaultValue={recordType || 'All'}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-[#ff6200] transition-colors"
            >
              <option value="All">All (Entry & Verified)</option>
              <option value="ENTRY">Entry Only</option>
              <option value="VERIFY">Verified Only</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-[#ff6200] hover:bg-[#ea580c] text-white font-semibold py-2 px-3.5 rounded-lg text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
              <Search size={16} /> Search
            </button>
            {hasFilter && (
              <Link href="/old" className="px-3 py-2 rounded-lg border border-gray-300 font-semibold text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center justify-center">
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Results Section */}
      <div className="space-y-3">
        {!hasFilter ? (
          <div className="bg-white p-6 sm:p-14 rounded-xl border border-gray-200 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#ff6200] mx-auto flex items-center justify-center mb-3">
              <Search size={22} />
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              Search to View Records
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              For privacy and security, reports are hidden. Please enter your DEO Name, Mobile Number, or select a Date above and click Search.
            </p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-white p-6 sm:p-14 rounded-xl border border-gray-200 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 mx-auto flex items-center justify-center mb-3">
              <Search size={22} />
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              No Records Found
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              No matching submissions found for your search criteria. Please check your DEO name, mobile number, or date and try again.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 font-medium">
              <span>Found <strong>{submissions.length}</strong> matching {submissions.length === 1 ? 'record' : 'records'}</span>
            </div>
            {submissions.map((sub) => {
            const day = Number(sub.day) || 0;
            const night = Number(sub.night) || 0;
            const total = Number(sub.total) || (day + night);
            const reject = Number(sub.reject) || 0;
            const gpParts = sub.gpName ? sub.gpName.split('+').map((g: string) => g.trim()).filter(Boolean) : [];

            return (
              <details key={sub.id} open className="group bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                <summary className="p-3.5 sm:p-5 cursor-pointer list-none flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center justify-between hover:bg-gray-50/70 transition-colors">
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 items-start sm:items-center">
                    <div>
                      <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</p>
                      <p className="font-bold text-gray-900 text-xs sm:text-sm mt-0.5">{sub.displayDate}</p>
                    </div>
                    <div>
                      <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">DEO Name</p>
                      <p className="font-bold text-gray-900 text-xs sm:text-sm mt-0.5 truncate">{sub.name}</p>
                      {sub.mobile && <p className="text-[11px] text-gray-500 font-medium">{sub.mobile}</p>}
                    </div>
                    <div>
                      <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold mt-0.5 ${sub.recordType === 'ENTRY' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {sub.recordType === 'ENTRY' ? 'ENTRY' : 'VERIFIED'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">Total / Reject</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-bold text-gray-900 text-sm sm:text-base">{total.toLocaleString('en-IN')}</span>
                        {reject > 0 && (
                          <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded">
                            Rej: {reject}
                          </span>
                        )}
                        {(sub.workFromHomeQty !== undefined && sub.workFromHomeQty > 0) && (
                          <span className="text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded">
                            WFH: {sub.workFromHomeQty}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 justify-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    {typeof sub.remainingMinutes === 'number' && (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md flex items-center gap-1 shrink-0">
                        ⏱️ {sub.remainingMinutes}m left
                      </span>
                    )}
                    <Link 
                      href={`/edit/${sub.id}`} 
                      className="bg-[#ff6200] hover:bg-[#ea580c] text-white px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs"
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

                  {(sub.workFromHomeGp || (sub.workFromHomeQty !== undefined && sub.workFromHomeQty > 0)) && (
                    <div className="mb-3 p-3 rounded-lg bg-orange-50/70 border border-orange-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-orange-950 font-semibold">
                        <Home size={14} className="text-[#ff6200]" />
                        <span>Work From Home GP:</span>
                        <span className="font-bold text-gray-900">{sub.workFromHomeGp || 'NO ARRIVAL'}</span>
                      </div>
                      <div className="text-orange-800">
                        <span>Quantity: </span>
                        <strong className="text-orange-950 font-bold text-sm">{(sub.workFromHomeQty || 0).toLocaleString('en-IN')}</strong>
                      </div>
                    </div>
                  )}

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
          })}
          </>
        )}
      </div>
    </div>
  );
}
