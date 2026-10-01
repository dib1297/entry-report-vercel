'use client';

import { useState, useTransition } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Loader2, ArrowLeft, CheckCircle, Eye, Check, Lock, Home } from 'lucide-react';
import { createSubmission, updateSubmission } from '@/app/actions/submissions';
import { useRouter } from 'next/navigation';
import { cn, GP_LIST, WFH_GP_LIST, canonicalGp } from '@/lib/utils';

const formSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  name: z.string().min(1, 'DEO Name is required').trim(),
  mobile: z.string().optional().refine(val => !val || /^[0-9]{10}$/.test(val), { message: 'Must be a valid 10-digit mobile number' }),
  recordType: z.enum(['ENTRY', 'VERIFY']),
  workFromHomeGp: z.string().optional(),
  workFromHomeQty: z.number().min(0, 'Quantity must be 0 or more').optional(),
  items: z.array(z.object({
    gpName: z.string().min(1, 'GP is required'),
    shift: z.enum(['DAY', 'NIGHT']),
    amount: z.number().min(0, 'Must be positive'),
    problemAmount: z.number().min(0, 'Must be positive'),
  })).min(1, 'At least one GP entry is required')
});

type FormValues = z.infer<typeof formSchema>;

export default function SubmissionForm({ 
  initialData, 
  isEditing = false, 
  editId,
  knownDeoNames = [],
  currentUser = null
}: { 
  initialData?: FormValues, 
  isEditing?: boolean, 
  editId?: string,
  knownDeoNames?: string[],
  currentUser?: { mobile: string; name: string } | null
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [previewData, setPreviewData] = useState<FormValues | null>(null);
  
  const defaultDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const effectiveInitialName = currentUser?.name || initialData?.name || '';
  const effectiveInitialMobile = currentUser?.mobile || initialData?.mobile || '';

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      ...initialData,
      name: isEditing ? initialData.name : (currentUser?.name || initialData.name),
      mobile: isEditing ? (initialData.mobile || currentUser?.mobile || '') : (currentUser?.mobile || initialData.mobile),
      workFromHomeGp: initialData.workFromHomeGp || '',
      workFromHomeQty: typeof initialData.workFromHomeQty === 'number' && !isNaN(initialData.workFromHomeQty) ? initialData.workFromHomeQty : undefined,
      items: initialData.items && initialData.items.length > 0 
        ? initialData.items.map(it => ({ ...it, gpName: canonicalGp(it.gpName) })) 
        : [{ gpName: '', shift: 'DAY', amount: 0, problemAmount: 0 }],
    } : {
      date: defaultDate,
      name: effectiveInitialName,
      mobile: effectiveInitialMobile,
      recordType: 'ENTRY',
      workFromHomeGp: '',
      workFromHomeQty: undefined,
      items: [{ gpName: '', shift: 'DAY', amount: 0, problemAmount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const recordType = watch('recordType');
  const watchItems = watch('items');
  const amountLabel = recordType === 'ENTRY' ? 'Entry' : 'Verified';

  // Step 1: Validate form and move to Preview step
  const handleProceedToPreview = (data: FormValues) => {
    setErrorMsg('');
    setPreviewData(data);
    setStep('preview');
  };

  // Step 2: Final Confirm Submit to database
  const handleFinalConfirm = () => {
    if (!previewData) return;
    setErrorMsg('');
    
    startTransition(async () => {
      try {
        const res = isEditing && editId 
          ? await updateSubmission(editId, previewData)
          : await createSubmission(previewData);
          
        if (res.success) {
          router.push(isEditing ? `/old?updated=1&name=${encodeURIComponent(previewData.name)}` : '/?success=1');
          router.refresh();
        } else if ('error' in res) {
          setErrorMsg((res as any).error || 'Failed to submit data');
          setStep('form');
        } else {
          setErrorMsg('Failed to submit data');
          setStep('form');
        }
      } catch (err) {
        setErrorMsg('An unexpected error occurred.');
        setStep('form');
      }
    });
  };

  // ================= PREVIEW / CONFIRMATION STEP =================
  if (step === 'preview' && previewData) {
    const totalAmount = previewData.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalProblem = previewData.items.reduce((sum, item) => sum + (Number(item.problemAmount) || 0), 0);

    return (
      <div className="bg-white p-4 sm:p-8 rounded-xl border border-gray-200 shadow-xs max-w-2xl mx-auto space-y-5 sm:space-y-6">
        
        {/* Header */}
        <div className="border-b border-gray-200 pb-3.5 sm:pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Confirm Submission</h2>
            <p className="text-xs text-gray-500 mt-0.5">Please check all information before submitting.</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
            Review Step
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 text-rose-700 p-4 rounded-lg text-sm font-medium border border-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Sequential Details List: Name -> Date -> Record Type */}
        <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200 bg-white text-sm">
          
          {/* 1. DEO Name */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-white">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">DEO Name</span>
            <span className="font-bold text-gray-900 text-base">{previewData.name}</span>
          </div>

          {/* 2. Mobile Number */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-white">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Mobile Number</span>
            <span className="font-semibold text-gray-900">{previewData.mobile}</span>
          </div>

          {/* 3. Date */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-white">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Date</span>
            <span className="font-semibold text-gray-900">{previewData.date.split('-').reverse().join('-')}</span>
          </div>

          {/* 4. Record Type */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-white">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Record Type</span>
            <span className={`w-fit px-3 py-1 rounded text-xs font-bold ${previewData.recordType === 'ENTRY' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
              {previewData.recordType === 'ENTRY' ? 'ENTRY' : 'VERIFIED'}
            </span>
          </div>

        </div>

        {/* 4. GP Records Breakdown: GP Name -> Shift -> Amount -> Problem Amount */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Gram Panchayat Records ({previewData.items.length})
          </h3>

          {previewData.items.map((item, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2.5 text-sm">
              {previewData.items.length > 1 && (
                <div className="border-b border-gray-200 pb-1.5 mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">GP #{idx + 1}</span>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">GP Name:</span>
                <span className="font-bold text-gray-900">{item.gpName}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Shift:</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.shift === 'DAY' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                  {item.shift === 'DAY' ? '☀ Day' : '☾ Night'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">{amountLabel}:</span>
                <span className="font-bold text-gray-900 text-base">{item.amount.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Reject:</span>
                <span className="font-bold text-rose-600 text-base">{item.problemAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Work From Home Details in Preview */}
        {(previewData.workFromHomeGp || (previewData.workFromHomeQty !== undefined && previewData.workFromHomeQty > 0)) && (
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 space-y-2 text-sm">
            <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Home size={14} className="text-blue-600" /> Work From Home Details
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-200/60 text-blue-900">WFH</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-600 font-medium">Work F Home GP:</span>
              <span className="font-bold text-gray-900">{previewData.workFromHomeGp || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Work F Home Qty:</span>
              <span className="font-bold text-blue-700 text-base">{Number(previewData.workFromHomeQty || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* Totals Summary */}
        <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 text-sm space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Total {amountLabel}:</span>
            <span className="font-bold text-gray-900 text-lg">{totalAmount.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Total Reject:</span>
            <span className="font-bold text-rose-600 text-lg">{totalProblem.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Action Buttons: Back / Edit AND Confirm Submit */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setStep('form')}
            disabled={isPending}
            className="flex-1 bg-white hover:bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-lg border border-gray-300 transition-colors flex justify-center items-center gap-2 text-sm disabled:opacity-60"
          >
            <ArrowLeft size={16} /> Back to Edit
          </button>
          
          <button
            type="button"
            onClick={handleFinalConfirm}
            disabled={isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-xs transition-colors flex justify-center items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <><Loader2 className="animate-spin" size={18} /> Submitting & Updating...</>
            ) : (
              <><CheckCircle size={18} /> {isEditing ? 'Confirm & Save Changes' : 'Confirm & Submit Record'}</>
            )}
          </button>
        </div>

      </div>
    );
  }

  // ================= FORM ENTRY STEP =================
  return (
    <form onSubmit={handleSubmit(handleProceedToPreview)} className="bg-white p-4 sm:p-8 rounded-xl border border-gray-200 shadow-xs max-w-4xl mx-auto space-y-5 sm:space-y-6">
      
      {errorMsg && (
        <div className="bg-rose-50 text-rose-700 p-4 rounded-lg text-sm font-medium border border-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Top Section */}
      <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Date</label>
          <input 
            type="date" 
            {...register('date')}
            className={cn(
              "w-full px-3.5 py-2.5 rounded-lg border bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors", 
              errors.date ? "border-rose-400" : "border-gray-300"
            )}
          />
          {errors.date && <p className="text-rose-600 text-xs font-medium">{errors.date.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">DEO NAME</label>
            {currentUser && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Lock size={10} /> Fixed
              </span>
            )}
          </div>
          <input 
            type="text" 
            readOnly={!!currentUser}
            list={currentUser ? undefined : "known-deos-list"}
            autoComplete="off"
            placeholder="DEO name"
            {...register('name')}
            className={cn(
              "w-full px-3.5 py-2.5 rounded-lg border text-sm transition-colors", 
              currentUser 
                ? "bg-gray-100 text-gray-700 font-semibold cursor-not-allowed border-gray-300 select-none shadow-inner" 
                : "bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600",
              errors.name ? "border-rose-400" : "border-gray-300"
            )}
          />
          {!currentUser && knownDeoNames.length > 0 && (
            <datalist id="known-deos-list">
              {knownDeoNames.map(deo => (
                <option key={deo} value={deo} />
              ))}
            </datalist>
          )}
          {errors.name && <p className="text-rose-600 text-xs font-medium">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Mobile Number</label>
            {currentUser && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Lock size={10} /> Fixed
              </span>
            )}
          </div>
          <input 
            type="tel" 
            readOnly={!!currentUser}
            maxLength={10}
            placeholder="10-digit mobile"
            {...register('mobile', {
              onChange: (e) => {
                if (!currentUser) {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                }
              }
            })}
            className={cn(
              "w-full px-3.5 py-2.5 rounded-lg border text-sm transition-colors", 
              currentUser 
                ? "bg-gray-100 text-gray-700 font-semibold cursor-not-allowed border-gray-300 select-none shadow-inner" 
                : "bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600",
              errors.mobile ? "border-rose-400" : "border-gray-300"
            )}
          />
          {errors.mobile && <p className="text-rose-600 text-xs font-medium">{errors.mobile.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 block">Record Type</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="cursor-pointer">
            <input type="radio" value="ENTRY" {...register('recordType')} className="peer sr-only" />
            <div className="py-2.5 text-center rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-all hover:bg-gray-50">
              Entry
            </div>
          </label>
          <label className="cursor-pointer">
            <input type="radio" value="VERIFY" {...register('recordType')} className="peer sr-only" />
            <div className="py-2.5 text-center rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-700 transition-all hover:bg-gray-50">
              Verified
            </div>
          </label>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* GP Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">Gram Panchayat Records</h3>
          {errors.items?.root && <p className="text-rose-600 text-xs font-medium">{errors.items.root.message}</p>}
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="p-4 sm:p-5 rounded-xl border border-gray-200 bg-gray-50/60 space-y-4 relative">
            
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                GP #{index + 1}
              </span>
              {fields.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => remove(index)}
                  className="text-gray-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 flex items-center gap-1 text-xs font-medium"
                  title="Remove this GP"
                >
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">GP Name</label>
                <select 
                  {...register(`items.${index}.gpName`)}
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-lg border bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors", 
                    errors.items?.[index]?.gpName ? "border-rose-400" : "border-gray-300"
                  )}
                >
                  <option value="">-- Select Gram Panchayat --</option>
                  {(() => {
                    const currentGp = watchItems?.[index]?.gpName;
                    const allGps = [...GP_LIST];
                    if (currentGp && !allGps.includes(currentGp)) {
                      allGps.push(currentGp);
                    }
                    return allGps.map(gp => {
                      const isSelectedElsewhere = watchItems?.some((it, i) => i !== index && it?.gpName === gp);
                      return (
                        <option key={gp} value={gp} disabled={isSelectedElsewhere}>
                          {gp} {isSelectedElsewhere ? '(Already selected)' : ''}
                        </option>
                      );
                    });
                  })()}
                </select>
                {errors.items?.[index]?.gpName && <p className="text-rose-600 text-xs font-medium">{errors.items?.[index]?.gpName?.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Shift</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer">
                    <input type="radio" value="DAY" {...register(`items.${index}.shift`)} className="peer sr-only" />
                    <div className="py-2.5 text-center rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-800 transition-all hover:bg-gray-50">
                      ☀ Day
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" value="NIGHT" {...register(`items.${index}.shift`)} className="peer sr-only" />
                    <div className="py-2.5 text-center rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-800 transition-all hover:bg-gray-50">
                      ☾ Night
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">{amountLabel}</label>
                <input 
                  type="number" 
                  step="any"
                  min="0"
                  placeholder="0.00"
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select();
                  }}
                  {...register(`items.${index}.amount`, { valueAsNumber: true })}
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-lg border bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors", 
                    errors.items?.[index]?.amount ? "border-rose-400" : "border-gray-300"
                  )}
                />
                {errors.items?.[index]?.amount && <p className="text-rose-600 text-xs font-medium">{errors.items?.[index]?.amount?.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Reject</label>
                <input 
                  type="number" 
                  step="any"
                  min="0"
                  placeholder="0.00"
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select();
                  }}
                  {...register(`items.${index}.problemAmount`, { valueAsNumber: true })}
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-lg border bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors", 
                    errors.items?.[index]?.problemAmount ? "border-rose-400" : "border-gray-300"
                  )}
                />
                {errors.items?.[index]?.problemAmount && <p className="text-rose-600 text-xs font-medium">{errors.items?.[index]?.problemAmount?.message}</p>}
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append({ gpName: '', shift: 'DAY', amount: 0, problemAmount: 0 })}
          className="inline-flex items-center gap-1.5 text-blue-600 font-semibold text-sm hover:text-blue-700 transition-colors py-2 px-3 rounded-lg border border-dashed border-blue-300 hover:bg-blue-50"
        >
          <Plus size={16} /> Add Another GP
        </button>
      </div>

      <hr className="border-gray-200" />

      {/* Work From Home Section */}
      <div className="p-4 sm:p-5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Home size={15} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">Work From Home</h3>
              <p className="text-[11px] text-gray-500">Optional: Select GP (or NO ARRIVAL) and enter quantity</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded">
            WFH
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              Work F Home GP
            </label>
            <select
              {...register('workFromHomeGp')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors"
            >
              <option value="">-- Select WFH GP / Status --</option>
              {WFH_GP_LIST.map((gp) => (
                <option key={gp} value={gp}>
                  {gp}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              Work F Home Qty
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              {...register('workFromHomeQty', {
                setValueAs: (v) => (v === '' || v === null || isNaN(Number(v)) ? undefined : Number(v))
              })}
              className={cn(
                "w-full px-3.5 py-2.5 rounded-lg border bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-colors",
                errors.workFromHomeQty ? "border-rose-400" : "border-gray-300"
              )}
            />
            {errors.workFromHomeQty && (
              <p className="text-rose-600 text-xs font-medium">{errors.workFromHomeQty.message}</p>
            )}
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Submit / Review Button */}
      <div className="pt-2">
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-6 rounded-lg shadow-xs transition-colors flex justify-center items-center gap-2 text-base cursor-pointer"
        >
          <Eye size={18} /> {isEditing ? 'Review & Update Record' : 'Review & Submit Record'}
        </button>
      </div>
    </form>
  );
}
