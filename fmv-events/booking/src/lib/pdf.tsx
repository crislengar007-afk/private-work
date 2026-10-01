import 'server-only';
import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatCAD, formatPercentBp } from './money';
import { formatDateTime, formatShortDate } from './time';
import type { DocBusiness, DocLine, DocPolicy, InvoiceDoc, QuoteDoc } from './documents';

const rose = '#8e4f57';
const ink = '#2b2527';
const soft = '#5a5054';
const line = '#e7dcd3';

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: ink, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  brand: { fontFamily: 'Times-Roman', fontSize: 22, color: rose },
  small: { fontSize: 9, color: soft },
  title: { fontFamily: 'Times-Roman', fontSize: 18, marginBottom: 4 },
  section: { marginTop: 14 },
  label: { fontSize: 8, color: soft, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, paddingVertical: 5 },
  th: { fontSize: 8, color: soft, textTransform: 'uppercase' },
  cDesc: { flex: 1 },
  cQty: { width: 50, textAlign: 'right' },
  cUnit: { width: 80, textAlign: 'right' },
  cTotal: { width: 80, textAlign: 'right' },
  totals: { marginTop: 8, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  box: { borderWidth: 1, borderColor: line, borderRadius: 6, padding: 10, marginTop: 14 },
  payRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  policy: { marginBottom: 6 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: soft, textAlign: 'center' },
});

function stripMd(md: string): string {
  return md.replace(/\*\*|__|\*|_|`|#+\s?/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function BusinessHeader({ b, right }: { b: DocBusiness; right: React.ReactNode }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>{b.name}</Text>
        <Text style={s.small}>{b.address}</Text>
        {b.phone ? <Text style={s.small}>{b.phone}</Text> : null}
        {b.email ? <Text style={s.small}>{b.email}</Text> : null}
        {b.tax_enabled && b.hst_number ? <Text style={s.small}>HST # {b.hst_number}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

function Lines({ lines }: { lines: DocLine[] }) {
  return (
    <View style={s.section}>
      <View style={s.row}>
        <Text style={[s.cDesc, s.th]}>Description</Text>
        <Text style={[s.cQty, s.th]}>Qty</Text>
        <Text style={[s.cUnit, s.th]}>Unit</Text>
        <Text style={[s.cTotal, s.th]}>Amount</Text>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={s.row} wrap={false}>
          <Text style={s.cDesc}>{l.description}</Text>
          <Text style={s.cQty}>{l.qty}</Text>
          <Text style={s.cUnit}>{formatCAD(l.unit_price_cents)}</Text>
          <Text style={s.cTotal}>{formatCAD(l.line_total_cents)}</Text>
        </View>
      ))}
    </View>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.totalRow}>
      <Text style={bold ? s.grand : undefined}>{label}</Text>
      <Text style={bold ? s.grand : undefined}>{value}</Text>
    </View>
  );
}

function Policies({ policies }: { policies: DocPolicy[] }) {
  if (!policies.length) return null;
  return (
    <View style={s.section}>
      <Text style={s.label}>Policies</Text>
      {policies.map((p) => (
        <View key={p.key} style={s.policy} wrap={false}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>
            {p.title} <Text style={s.small}>(v{p.version})</Text>
          </Text>
          <Text>{stripMd(p.body_md)}</Text>
        </View>
      ))}
    </View>
  );
}

function QuotePdf({ q }: { q: QuoteDoc }) {
  return (
    <Document title={`Quote ${q.number}`} author={q.business.name}>
      <Page size="LETTER" style={s.page}>
        <BusinessHeader
          b={q.business}
          right={
            <>
              <Text style={s.title}>Quote</Text>
              <Text>{q.number}</Text>
              <Text style={s.small}>Issued {formatShortDate(q.created_at)}</Text>
              {q.valid_until ? <Text style={s.small}>Valid until {formatShortDate(q.valid_until)}</Text> : null}
            </>
          }
        />
        <View style={{ flexDirection: 'row', gap: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Prepared for</Text>
            <Text>{q.client.full_name}</Text>
            <Text style={s.small}>{q.client.email}</Text>
            {q.client.phone ? <Text style={s.small}>{q.client.phone}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Event</Text>
            <Text>{q.event.type} · {q.event.dateLabel}</Text>
            <Text style={s.small}>{q.event.timeLabel}</Text>
            {q.event.venue ? <Text style={s.small}>{q.event.venue}</Text> : null}
          </View>
        </View>
        <Lines lines={q.lines} />
        <View style={s.totals}>
          <TotalRow label="Subtotal" value={formatCAD(q.subtotal_cents)} />
          {q.discount_cents > 0 ? <TotalRow label="Discount" value={`−${formatCAD(q.discount_cents)}`} /> : null}
          {q.tax_rate_bp > 0 ? <TotalRow label={`HST (${formatPercentBp(q.tax_rate_bp)})`} value={formatCAD(q.tax_cents)} /> : null}
          <TotalRow label="Total (CAD)" value={formatCAD(q.total_cents)} bold />
          <TotalRow label={`Deposit to confirm (${q.deposit_pct}%)`} value={formatCAD(q.deposit_cents)} />
          <TotalRow label="Balance" value={formatCAD(q.total_cents - q.deposit_cents)} />
        </View>
        {q.notes_md ? (
          <View style={s.section}>
            <Text style={s.label}>Notes</Text>
            <Text>{stripMd(q.notes_md)}</Text>
          </View>
        ) : null}
        <View style={s.box}>
          <Text>Review and accept this quote online: {q.url}</Text>
          <Text style={s.small}>Your date is held for a limited time after you accept, until the deposit is received by Interac e-Transfer.</Text>
        </View>
        {q.accepted_at ? (
          <Text style={[s.small, { marginTop: 8 }]}>Accepted by {q.accepted_name} on {formatDateTime(q.accepted_at)}</Text>
        ) : null}
        <Policies policies={q.policies} />
        <Text style={s.footer} fixed>{q.business.name} · Fredericton, New Brunswick · All amounts in CAD</Text>
      </Page>
    </Document>
  );
}

function InvoicePdf({ inv, qr }: { inv: InvoiceDoc; qr: string }) {
  const balanceDue = Math.max(inv.amount_cents - inv.paid_cents, 0);
  return (
    <Document title={`Invoice ${inv.number}`} author={inv.business.name}>
      <Page size="LETTER" style={s.page}>
        <BusinessHeader
          b={inv.business}
          right={
            <>
              <Text style={s.title}>{inv.title}</Text>
              <Text>{inv.number}</Text>
              <Text style={s.small}>Issued {formatShortDate(inv.created_at)}</Text>
              <Text style={s.small}>Status: {inv.status}</Text>
            </>
          }
        />
        <View style={{ flexDirection: 'row', gap: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Bill to</Text>
            <Text>{inv.client.full_name}</Text>
            <Text style={s.small}>{inv.client.email}</Text>
            {inv.client.phone ? <Text style={s.small}>{inv.client.phone}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>For</Text>
            <Text>{inv.eventLabel}</Text>
            {inv.venue ? <Text style={s.small}>{inv.venue}</Text> : null}
            {inv.quote?.number ? <Text style={s.small}>Quote {inv.quote.number} · total {formatCAD(inv.quote.total_cents)}</Text> : null}
          </View>
        </View>
        {inv.quote ? <Lines lines={inv.quote.lines} /> : null}
        <View style={s.totals}>
          {inv.quote ? <TotalRow label="Event total" value={formatCAD(inv.quote.total_cents)} /> : null}
          {inv.mini ? <TotalRow label="Session price" value={formatCAD(inv.mini.total_cents)} /> : null}
          <TotalRow label={`This invoice (${inv.invoice_kind})`} value={formatCAD(inv.amount_cents)} bold />
          {inv.tax_cents > 0 ? <TotalRow label="Includes HST" value={formatCAD(inv.tax_cents)} /> : null}
          {inv.paid_cents > 0 ? <TotalRow label="Paid" value={`−${formatCAD(inv.paid_cents)}`} /> : null}
          <TotalRow label="Amount due" value={formatCAD(balanceDue)} bold />
          <TotalRow label="Due" value={inv.dueLabel} />
        </View>
        <View style={s.box}>
          <View style={s.payRow}>
            <Image src={qr} style={{ width: 96, height: 96 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Pay by Interac e-Transfer</Text>
              {inv.business.etransfer_email ? <Text>Send to: {inv.business.etransfer_email}</Text> : null}
              <Text>Amount: {formatCAD(balanceDue)}</Text>
              <Text>Message / reference: {inv.reference}</Text>
              {inv.business.etransfer_autodeposit ? <Text style={s.small}>Autodeposit is on: no security question needed.</Text> : null}
              <Text style={[s.small, { marginTop: 4 }]}>Scan the code or open {inv.pay_url} for copy buttons and your deadline.</Text>
            </View>
          </View>
        </View>
        {inv.quote ? <Policies policies={inv.quote.policies} /> : null}
        <Text style={s.footer} fixed>{inv.business.name} · Fredericton, New Brunswick · All amounts in CAD</Text>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(q: QuoteDoc): Promise<Buffer> {
  return renderToBuffer(<QuotePdf q={q} />);
}

export async function renderInvoicePdf(inv: InvoiceDoc): Promise<Buffer> {
  const qr = await QRCode.toDataURL(inv.pay_url, { margin: 1, width: 300, color: { dark: '#2b2527', light: '#ffffff' } });
  return renderToBuffer(<InvoicePdf inv={inv} qr={qr} />);
}

export function invoiceQrDataUrl(payUrl: string): Promise<string> {
  return QRCode.toDataURL(payUrl, { margin: 1, width: 300, color: { dark: '#2b2527', light: '#ffffff' } });
}
