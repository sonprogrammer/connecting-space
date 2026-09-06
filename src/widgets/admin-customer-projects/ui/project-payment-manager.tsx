"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { PaymentKind, PaymentRow, PaymentReceiptRow } from "@/entities/payment";
import { Button } from "@/shared/ui/button";
import {
  adminProjectPaymentQueryKeys,
  createPayment,
  createPaymentReceipt,
  deletePayment,
  deletePaymentReceipt,
  fetchProjectPayments,
  paymentErrorMessage,
  updatePayment,
} from "../model/admin-project-payment-queries";
import {
  amountErrorMessage,
  emptyPaymentForm,
  emptyReceiptForm,
  formatPaymentAmount,
  formatPaymentDate,
  paymentKindLabels,
  paymentStatusLabels,
  parsePositiveInteger,
  type PaymentFormState,
  type ReceiptFormState,
} from "../model/admin-project-payment-state";

type Props = { projectId: string };

function SummaryCards({ summary }: { summary: { expectedRevenue: number; confirmedRevenue: number; receivedTotal: number; outstanding: number } }) {
  const cards = [
    ["예정 매출", summary.expectedRevenue],
    ["확정 매출", summary.confirmedRevenue],
    ["입금 완료", summary.receivedTotal],
    ["미수금", summary.outstanding],
  ] as const;
  return <div className="grid gap-2 sm:grid-cols-4">{cards.map(([label, amount]) => <div key={label} className="rounded-lg border border-[#e5e9e2] bg-[#fbfcfa] p-3"><p className="text-xs text-[#617068]">{label}</p><p className="mt-1 text-base font-semibold">{formatPaymentAmount(amount)}</p></div>)}</div>;
}

function PaymentForm({
  initial,
  editing,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: PaymentFormState;
  editing: boolean;
  saving: boolean;
  onCancel?: () => void;
  onSubmit: (form: PaymentFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  return <form aria-busy={saving} className="grid gap-3 rounded-lg border border-[#e5e9e2] bg-[#fbfcfa] p-4" onSubmit={async (event) => { event.preventDefault(); const message = amountErrorMessage(form.amount); if (message) { setError(message); return; } setError(undefined); await onSubmit(form); }}>
    <div className="grid gap-3 sm:grid-cols-4">
      <label className="grid gap-1 text-sm font-medium">구분<select aria-label="결제 구분" value={form.kind} disabled={saving} onChange={(event) => setForm({ ...form, kind: event.target.value as PaymentKind })} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 font-normal"><option value="deposit">계약금</option><option value="balance">잔금</option><option value="extra">추가 비용</option></select></label>
      <label className="grid gap-1 text-sm font-medium">금액<input aria-label="결제 금액" aria-invalid={Boolean(error)} required inputMode="numeric" value={form.amount} disabled={saving} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 font-normal" placeholder="원" /></label>
      <label className="grid gap-1 text-sm font-medium">입금 예정일<input aria-label="입금 예정일" type="date" value={form.dueDate} disabled={saving} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 font-normal" /></label>
      <label className="grid gap-1 text-sm font-medium">메모<input aria-label="결제 메모" value={form.memo} disabled={saving} onChange={(event) => setForm({ ...form, memo: event.target.value })} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 font-normal" /></label>
    </div>
    {error ? <p role="alert" className="text-sm text-[#912018]">{error}</p> : null}
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={saving}>{saving ? "저장 중…" : editing ? "결제 수정" : "결제 예정 추가"}</Button>{onCancel ? <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>취소</Button> : null}</div>
  </form>;
}

function ReceiptForm({ paymentId, saving, onSubmit }: { paymentId: string; saving: boolean; onSubmit: (paymentId: string, form: ReceiptFormState) => Promise<boolean> }) {
  const [form, setForm] = useState(emptyReceiptForm);
  const [error, setError] = useState<string>();
  return <form aria-busy={saving} className="mt-3 grid gap-2 rounded-md bg-white p-3" onSubmit={async (event) => { event.preventDefault(); const message = amountErrorMessage(form.amount); if (message) { setError(message); return; } setError(undefined); if (await onSubmit(paymentId, form)) setForm(emptyReceiptForm()); }}>
    <div className="grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium">입금액<input aria-label="입금액" aria-invalid={Boolean(error)} inputMode="numeric" value={form.amount} disabled={saving} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="h-8 rounded-md border border-[#d8d1c6] px-2" /></label><label className="grid gap-1 text-xs font-medium">입금일<input aria-label="입금일" type="date" value={form.receivedAt} disabled={saving} onChange={(event) => setForm({ ...form, receivedAt: event.target.value })} className="h-8 rounded-md border border-[#d8d1c6] px-2" /></label><label className="grid gap-1 text-xs font-medium">메모<input aria-label="입금 메모" value={form.memo} disabled={saving} onChange={(event) => setForm({ ...form, memo: event.target.value })} className="h-8 rounded-md border border-[#d8d1c6] px-2" /></label></div>
    {error ? <p role="alert" className="text-xs text-[#912018]">{error}</p> : null}<Button type="submit" size="xs" disabled={saving}>입금 등록</Button>
  </form>;
}

function PaymentRowView({ payment, receipts, saving, onEdit, onDelete, onReceipt, onDeleteReceipt }: { payment: PaymentRow & { receivedAmount: number; outstandingAmount: number }; receipts: PaymentReceiptRow[]; saving: boolean; onEdit: () => void; onDelete: () => void; onReceipt: (paymentId: string, form: ReceiptFormState) => Promise<boolean>; onDeleteReceipt: (id: string) => void }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  return <article className="rounded-lg border border-[#e5e9e2] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{paymentKindLabels[payment.kind]}</h4><span className="rounded-full bg-[#edf7f0] px-2 py-0.5 text-xs text-[#23583f]">{paymentStatusLabels[payment.status]}</span></div><p className="mt-1 text-sm text-[#617068]">예정 {formatPaymentAmount(payment.amount)} · {formatPaymentDate(payment.due_date)}</p>{payment.memo ? <p className="mt-1 text-xs text-[#617068]">{payment.memo}</p> : null}</div><div className="flex gap-1"><Button type="button" variant="outline" size="xs" onClick={onEdit} disabled={saving}>수정</Button><Button type="button" variant="destructive" size="xs" onClick={onDelete} disabled={saving}>삭제</Button></div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div>입금 완료 <strong>{formatPaymentAmount(payment.receivedAmount)}</strong></div><div>미수금 <strong>{formatPaymentAmount(payment.outstandingAmount)}</strong></div><div className="sm:text-right"><Button type="button" variant="outline" size="xs" onClick={() => setReceiptOpen(!receiptOpen)}>{receiptOpen ? "입금 접기" : "입금 관리"}</Button></div></div>{receipts.length > 0 ? <ul className="mt-3 space-y-1 border-t border-[#edf0ea] pt-2 text-xs text-[#617068]">{receipts.map((receipt) => <li key={receipt.id} className="flex items-center justify-between gap-2"><span>{formatPaymentDate(receipt.received_at)} · {formatPaymentAmount(receipt.amount)}{receipt.memo ? ` · ${receipt.memo}` : ""}</span><Button type="button" variant="ghost" size="xs" onClick={() => onDeleteReceipt(receipt.id)} disabled={saving}>삭제</Button></li>)}</ul> : null}{receiptOpen ? <ReceiptForm paymentId={payment.id} saving={saving} onSubmit={onReceipt} /> : null}</article>;
}

export function ProjectPaymentManager({ projectId }: Props) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: adminProjectPaymentQueryKeys.detail(projectId), queryFn: () => fetchProjectPayments(projectId), enabled: Boolean(projectId) });
  const [editingId, setEditingId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [newForm, setNewForm] = useState(emptyPaymentForm);
  const refresh = async (message: string) => { await queryClient.invalidateQueries({ queryKey: adminProjectPaymentQueryKeys.detail(projectId) }); setNotice(message); };
  const run = async (action: () => Promise<unknown>, message: string) => { setSaving(true); setError(undefined); setNotice(undefined); try { await action(); await refresh(message); return true; } catch (cause) { setError(paymentErrorMessage(cause)); return false; } finally { setSaving(false); } };
  if (query.isPending) return <section className="mt-7 border-t border-[#e8ebe5] pt-6"><h3 className="text-lg font-semibold">결제·입금 관리</h3><p className="mt-3 text-sm text-[#617068]">결제 정보를 불러오는 중…</p></section>;
  if (query.isError) return <section className="mt-7 border-t border-[#e8ebe5] pt-6"><h3 className="text-lg font-semibold">결제·입금 관리</h3><div role="alert" className="mt-3 rounded-md bg-[#fff8e8] p-3 text-sm text-[#7a4b00]">{paymentErrorMessage(query.error)}<Button type="button" variant="outline" size="xs" className="ml-3" onClick={() => void query.refetch()}>다시 시도</Button></div></section>;
  const data = query.data;
  return <section className="mt-7 border-t border-[#e8ebe5] pt-6" aria-labelledby="project-payment-heading"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="project-payment-heading" className="text-lg font-semibold">결제·입금 관리</h3><p className="mt-1 text-sm text-[#617068]">계약금, 잔금, 추가 비용과 입금 내역을 관리합니다.</p></div></div>{notice ? <p role="status" className="mt-3 rounded-md bg-[#edf7f0] p-3 text-sm text-[#23583f]">{notice}</p> : null}{error ? <p role="alert" className="mt-3 rounded-md bg-[#fff1f0] p-3 text-sm text-[#912018]">{error}</p> : null}<div className="mt-4"><SummaryCards summary={data.summary} /></div><div className="mt-5"><PaymentForm key={formKey} initial={newForm} editing={false} saving={saving} onSubmit={async (form) => { const input = { kind: form.kind, amount: parsePositiveInteger(form.amount)!, ...(form.dueDate ? { dueDate: form.dueDate } : {}), ...(form.memo.trim() ? { memo: form.memo.trim() } : {}) }; const succeeded = await run(() => createPayment(projectId, input), "결제 예정이 추가되었습니다."); if (succeeded) { setNewForm(emptyPaymentForm()); setFormKey((key) => key + 1); } return succeeded; }} /></div><div className="mt-5 space-y-3">{data.payments.length === 0 ? <p className="rounded-lg border border-dashed border-[#d8d1c6] p-6 text-center text-sm text-[#617068]">등록된 결제 예정이 없습니다.</p> : data.payments.map((payment) => editingId === payment.id ? <PaymentForm key={payment.id} initial={{ kind: payment.kind, amount: String(payment.amount), dueDate: payment.due_date?.slice(0, 10) ?? "", memo: payment.memo ?? "" }} editing saving={saving} onCancel={() => setEditingId(undefined)} onSubmit={async (form) => { const succeeded = await run(() => updatePayment(payment.id, { kind: form.kind, amount: parsePositiveInteger(form.amount)!, dueDate: form.dueDate, memo: form.memo.trim() }), "결제 정보가 수정되었습니다."); if (succeeded) setEditingId(undefined); return succeeded; }} /> : <PaymentRowView key={payment.id} payment={payment} receipts={data.receipts.filter((receipt) => receipt.payment_id === payment.id)} saving={saving} onEdit={() => setEditingId(payment.id)} onDelete={() => { if (window.confirm("이 결제 예정과 입금 연결을 삭제할까요?")) void run(() => deletePayment(payment.id), "결제 예정이 삭제되었습니다."); }} onReceipt={(paymentId, form) => run(() => createPaymentReceipt(paymentId, { amount: parsePositiveInteger(form.amount)!, ...(form.receivedAt ? { receivedAt: new Date(`${form.receivedAt}T00:00:00.000Z`).toISOString() } : {}), ...(form.memo.trim() ? { memo: form.memo.trim() } : {}) }), "입금이 등록되었습니다.")} onDeleteReceipt={(receiptId) => { if (window.confirm("이 입금 내역을 삭제할까요?")) void run(() => deletePaymentReceipt(receiptId), "입금 내역이 삭제되었습니다."); }} />)}</div></section>;
}
