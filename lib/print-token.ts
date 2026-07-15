import QRCode from "qrcode";
import type { Ticket } from "./types";
import { fmtDate, fmtTime } from "./format";

/**
 * Prints a single gate-entry token slip optimized for 58mm thermal printers.
 */
export async function printToken(ticket: Ticket): Promise<void> {
  const entry = new Date(ticket.entryTime);
  const row = (k: string, v: string) =>
    `<div class="row"><span class="k">${k}</span><span class="v">${escapeHtml(
      v,
    )}</span></div>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>YARDFLOW Token #${ticket.serial}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 9px;
  }
  @page { size: 58mm auto; margin: 0mm; }
  .ticket {
    width: 52mm;
    margin: 0;
    padding: 6px 4px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 28px; height: 28px; margin: 0 auto 4px;
    background: #0f172a; color: #fff; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 11px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 11px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 8px; color: #64748b; margin: 1px 0 0; }
  .token-badge {
    text-align: center;
    margin: 8px 0 4px;
  }
  .token-badge span {
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .1em;
    color: #475569; margin: 6px 0 4px; text-transform: uppercase;
  }
  .divider { border-top: 1px dashed #94a3b8; margin: 8px 0; }
  .rows { font-size: 9px; }
  .row { display: flex; justify-content: space-between; padding: 2.5px 0; }
  .row .k { color: #64748b; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; }
  .valid {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .05em;
    color: #0f172a; margin: 6px 0 4px;
  }
  .note { text-align: center; font-size: 8px; color: #64748b; margin: 3px 0 0; line-height: 1.2; }
  .foot {
    text-align: center; font-size: 7px; color: #94a3b8; margin-top: 8px;
    border-top: 1px solid #e2e8f0; padding-top: 6px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <div class="logo">YF</div>
      <p class="name">YARDFLOW MANAGER</p>
      <p class="sub">Logistics Terminal A-1</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: #${String(ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">GATE ENTRY TOKEN</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("BOE NO", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("CARGO", ticket.cargo)}
      ${row("ENTRY TIME", fmtTime(entry))}
      ${row("ENTRY DATE", fmtDate(entry))}
    </div>
    <div class="divider"></div>
    <p class="valid">VALID FOR TODAY ONLY</p>
    <p class="note">Present this slip at Billing, Loading and Exit gates.</p>
    <div class="foot">Product by Cubiqlab Technologies</div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 120);
    };
    window.onafterprint = function () {
      if (window.frameElement) window.frameElement.remove();
    };
  </script>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Safety net
  setTimeout(() => {
    if (document.body.contains(iframe)) iframe.remove();
  }, 60000);
}

/**
 * Prints a billing approval slip optimized for 58mm thermal printers.
 */
export async function printBillingToken(ticket: Ticket): Promise<void> {
  const entry = new Date(ticket.entryTime);
  const isPaid = ticket.paymentStatus === "Paid";
  const row = (k: string, v: string) =>
    `<div class="row"><span class="k">${k}</span><span class="v">${escapeHtml(
      v,
    )}</span></div>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>YARDFLOW Billing Slip #${ticket.serial}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 9px;
  }
  @page { size: 58mm auto; margin: 0mm; }
  .ticket {
    width: 52mm;
    margin: 0;
    padding: 6px 4px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 28px; height: 28px; margin: 0 auto 4px;
    background: #0f172a; color: #fff; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 11px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 11px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 8px; color: #64748b; margin: 1px 0 0; }
  .token-badge {
    text-align: center;
    margin: 8px 0 4px;
  }
  .token-badge span {
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .1em;
    color: #475569; margin: 6px 0 4px; text-transform: uppercase;
  }
  .divider { border-top: 1px dashed #94a3b8; margin: 8px 0; }
  .rows { font-size: 9px; }
  .row { display: flex; justify-content: space-between; padding: 2.5px 0; }
  .row .k { color: #64748b; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; }
  
  .payment-status-badge {
    text-align: center;
    margin: 10px 0 4px;
  }
  .payment-status-badge span {
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    padding: 4px 12px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    display: inline-block;
    text-transform: uppercase;
  }
  .payment-status-badge.paid span {
    background: #10b981;
  }
  .payment-status-badge.unpaid span {
    background: #ef4444;
  }

  .valid {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .05em;
    color: #0f172a; margin: 6px 0 4px;
  }
  .note { text-align: center; font-size: 8px; color: #64748b; margin: 3px 0 0; line-height: 1.2; }
  .foot {
    text-align: center; font-size: 7px; color: #94a3b8; margin-top: 8px;
    border-top: 1px solid #e2e8f0; padding-top: 6px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <div class="logo">YF</div>
      <p class="name">YARDFLOW MANAGER</p>
      <p class="sub">Logistics Terminal A-1</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: #${String(ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">GATE BILLING PASS</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("BOE NO", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("CARGO", ticket.cargo)}
      ${row("INVOICE NO", ticket.invoice || "N/A")}
      ${row("BILLING TIME", fmtTime(new Date()))}
      ${row("BILLING DATE", fmtDate(new Date()))}
    </div>
    <div class="divider"></div>
    
    <div class="payment-status-badge ${isPaid ? "paid" : "unpaid"}">
      <span>${isPaid ? "PAID" : "NOT PAID"}</span>
    </div>
    
    <p class="valid">VALID FOR TODAY ONLY</p>
    <p class="note">Present this slip at Loading and Exit gates.</p>
    <div class="foot">Product by Cubiqlab Technologies</div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 120);
    };
    window.onafterprint = function () {
      if (window.frameElement) window.frameElement.remove();
    };
  </script>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Safety net
  setTimeout(() => {
    if (document.body.contains(iframe)) iframe.remove();
  }, 60000);
}

/**
 * Prints a loading dispatch pass/bill optimized for 58mm thermal printers.
 */
export async function printLoadingToken(ticket: Ticket): Promise<void> {
  const loadingTime = ticket.loadingEnd ? new Date(ticket.loadingEnd) : new Date();
  
  // Generate QR code representing the vehicle ID, sized to fit 58mm layout
  const qr = await QRCode.toDataURL(ticket.vehicle, {
    width: 180,
    margin: 0,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  const row = (k: string, v: string) =>
    `<div class="row"><span class="k">${k}</span><span class="v">${escapeHtml(
      v,
    )}</span></div>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>YARDFLOW Loading Pass #${ticket.serial}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 9px;
  }
  @page { size: 58mm auto; margin: 0mm; }
  .ticket {
    width: 52mm;
    margin: 0;
    padding: 6px 4px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 28px; height: 28px; margin: 0 auto 4px;
    background: #0f172a; color: #fff; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 11px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 11px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 8px; color: #64748b; margin: 1px 0 0; }
  .token-badge {
    text-align: center;
    margin: 8px 0 4px;
  }
  .token-badge span {
    background: #10b981;
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .1em;
    color: #475569; margin: 6px 0 4px; text-transform: uppercase;
  }
  .divider { border-top: 1px dashed #94a3b8; margin: 8px 0; }
  .rows { font-size: 9px; }
  .row { display: flex; justify-content: space-between; padding: 2.5px 0; }
  .row .k { color: #64748b; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; }
  
  .qr-code-section {
    text-align: center;
    margin: 8px 0 4px;
  }
  .qr-code-section img {
    width: 96px;
    height: 96px;
    display: inline-block;
  }

  .valid {
    text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .05em;
    color: #0f172a; margin: 6px 0 4px;
  }
  .note { text-align: center; font-size: 8px; color: #64748b; margin: 3px 0 0; line-height: 1.2; }
  .foot {
    text-align: center; font-size: 7px; color: #94a3b8; margin-top: 8px;
    border-top: 1px solid #e2e8f0; padding-top: 6px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <div class="logo">YF</div>
      <p class="name">YARDFLOW MANAGER</p>
      <p class="sub">Logistics Terminal A-1</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: #${String(ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">LOADING DISPATCH PASS</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("BOE / WORK ORDER", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("CARGO", ticket.cargo)}
      ${row("BAY ASSIGNED", ticket.bay)}
      ${row("INVOICE NO", ticket.invoice || "N/A")}
      ${row("COMPLETED TIME", fmtTime(loadingTime))}
      ${row("COMPLETED DATE", fmtDate(loadingTime))}
    </div>
    <div class="divider"></div>
    
    <div class="qr-code-section">
      <img src="${qr}" alt="Scan pass at exit" />
    </div>
    
    <p class="valid">VALID FOR TODAY ONLY</p>
    <p class="note">Present this slip and scan the QR at the Exit Gate.</p>
    <div class="foot">Product by Cubiqlab Technologies</div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 120);
    };
    window.onafterprint = function () {
      if (window.frameElement) window.frameElement.remove();
    };
  </script>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Safety net
  setTimeout(() => {
    if (document.body.contains(iframe)) iframe.remove();
  }, 60000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
