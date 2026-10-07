import React from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { Payment } from '../../types/index.js';
import { Modal } from '../common/Modal.js';
import { formatDate, formatDateTime, formatINR } from '../../lib/format.js';
import { useAppConfig } from '../../context/ConfigContext.js';

const CYCLE_LABELS: Record<string, string> = { monthly: 'Monthly', annual: 'Annual (12 months)' };

// While printing, only the invoice copy rendered into <body> is shown.
const PRINT_CSS = `
#pf-invoice-print { display: none; }
@media print {
  body { background: #fff !important; }
  body > *:not(#pf-invoice-print) { display: none !important; }
  #pf-invoice-print { display: block !important; color: #0f172a; background: #fff; font-family: Inter, system-ui, sans-serif; padding: 24px; }
  #pf-invoice-print table { width: 100%; border-collapse: collapse; }
  #pf-invoice-print th, #pf-invoice-print td { text-align: left; padding: 8px 0; border-bottom: 1px solid #cbd5e1; font-size: 13px; vertical-align: top; }
  #pf-invoice-print th { width: 40%; color: #475569; font-weight: 600; }
  @page { margin: 16mm; }
}
`;

const InvoiceDetails: React.FC<{ payment: Payment; gymName: string; forPrint?: boolean }> = ({ payment, gymName, forPrint = false }) => {
  const rows: [string, React.ReactNode][] = [
    ['Invoice number', payment.invoice_number],
    ['Payment date', formatDateTime(payment.created_at)],
    ['Billed to', `${payment.user_name} (${payment.user_email})`],
    ['Plan', payment.plan_name],
    ['Billing cycle', CYCLE_LABELS[payment.billing_cycle] ?? payment.billing_cycle],
    ['Membership period', `${formatDate(payment.period_start)} – ${formatDate(payment.period_end)}`],
    ['Payment reference', payment.razorpay_payment_id || '—'],
    ['Status', payment.status === 'paid' ? 'Paid' : 'Refunded']
  ];
  const cell = forPrint ? '' : 'py-2.5 border-b border-slate-800/60 text-sm';
  return (
    <div>
      <div className={forPrint ? '' : 'flex items-start justify-between gap-4 mb-4'}>
        <div>
          <p className={forPrint ? '' : 'font-black text-slate-100 font-[\'Outfit\'] text-lg'} style={forPrint ? { fontSize: 22, fontWeight: 800, margin: 0 } : undefined}>
            {gymName}
          </p>
          <p className={forPrint ? '' : 'text-xs text-slate-400'} style={forPrint ? { margin: '4px 0 16px', color: '#475569' } : undefined}>
            Payment receipt
          </p>
        </div>
      </div>
      <table className={forPrint ? '' : 'w-full'}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className={forPrint ? '' : `${cell} text-left text-slate-400 font-semibold w-2/5 pr-3 align-top`}>
                {label}
              </th>
              <td className={forPrint ? '' : `${cell} text-slate-200 break-words`}>{value}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className={forPrint ? '' : 'pt-4 text-left text-slate-300 font-bold'}>
              Amount paid
            </th>
            <td className={forPrint ? '' : 'pt-4 text-xl font-black text-slate-100 font-mono'} style={forPrint ? { fontSize: 18, fontWeight: 800 } : undefined}>
              {formatINR(payment.amount_inr)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const InvoiceModal: React.FC<{ payment: Payment | null; onClose: () => void }> = ({ payment, onClose }) => {
  const { config } = useAppConfig();
  if (!payment) return null;

  return (
    <>
      <Modal isOpen onClose={onClose} title={`Invoice ${payment.invoice_number}`} maxWidth="lg">
        <InvoiceDetails payment={payment} gymName={config.gym.name} />
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} className="neu-btn px-5 py-2.5 rounded-xl text-sm font-bold">
            Close
          </button>
          <button type="button" onClick={() => window.print()} className="neu-btn-lime px-5 py-2.5 rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
          </button>
        </div>
      </Modal>
      {createPortal(
        <div id="pf-invoice-print" aria-hidden="true">
          <style>{PRINT_CSS}</style>
          <InvoiceDetails payment={payment} gymName={config.gym.name} forPrint />
        </div>,
        document.body
      )}
    </>
  );
};
