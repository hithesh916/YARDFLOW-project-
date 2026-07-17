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
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 14px;
  }
  @page { size: 80mm 125mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 10px 6px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 36px; height: 36px; margin: 0 auto 6px;
    background: #000; color: #fff; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 16px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 11px; color: #000; margin: 2px 0 0; }
  .token-badge {
    text-align: center;
    margin: 10px 0 6px;
  }
  .token-badge span {
    color: #000;
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .1em;
    color: #000; margin: 8px 0 6px; text-transform: uppercase;
  }
  .divider { border-top: 1.5px dashed #000; margin: 10px 0; }
  .rows { font-size: 14px; }
  .row { display: flex; justify-content: space-between; padding: 3.5px 0; }
  .row .k { color: #000; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; color: #000; }
  .valid {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .05em;
    color: #000; margin: 8px 0 6px;
  }
  .note { text-align: center; font-size: 11px; color: #000; margin: 4px 0 0; line-height: 1.3; }
  .foot {
    text-align: center; font-size: 10px; color: #000; margin-top: 10px;
    border-top: 1px solid #000; padding-top: 8px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: G-${String(ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">GATE ENTRY TOKEN</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("WORK ORDER NO", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("ENTRY TIME", fmtTime(entry))}
      ${row("ENTRY DATE", fmtDate(entry))}
    </div>
    <div class="divider"></div>
    <p class="valid">VALID FOR TODAY ONLY</p>
    <p class="note">Present this slip at Billing.</p>
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
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 14px;
  }
  @page { size: 80mm 125mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 10px 6px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 36px; height: 36px; margin: 0 auto 6px;
    background: #000; color: #fff; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 16px; margin: 0; text-transform: uppercase; }
  .sub { display: none; }
  .token-badge {
    text-align: center;
    margin: 10px 0 6px;
  }
  .token-badge span {
    color: #000;
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .1em;
    color: #000; margin: 8px 0 6px; text-transform: uppercase;
  }
  .divider { border-top: 1.5px dashed #000; margin: 10px 0; }
  .rows { font-size: 14px; }
  .row { display: flex; justify-content: space-between; padding: 3.5px 0; }
  .row .k { color: #000; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; color: #000; }
  
  .payment-status-badge {
    text-align: center;
    margin: 15px 0 8px;
  }
  .payment-status-badge span {
    color: #000;
    font-size: 28px;
    font-weight: 900;
    padding: 8px 24px;
    border: 3.5px solid #000;
    border-radius: 6px;
    letter-spacing: 0.04em;
    display: inline-block;
    text-transform: uppercase;
  }
  .payment-status-badge.paid span {
    background: transparent;
  }
  .payment-status-badge.unpaid span {
    background: transparent;
  }

  .valid {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .05em;
    color: #000; margin: 8px 0 6px;
  }
  .note { text-align: center; font-size: 11px; color: #000; margin: 4px 0 0; line-height: 1.3; }
  .foot {
    text-align: center; font-size: 10px; color: #000; margin-top: 10px;
    border-top: 1px solid #000; padding-top: 8px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: B-${String(ticket.billingSerial ?? ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">BILLING PASS</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("WORK ORDER NO", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("INVOICE NO", ticket.invoice || "N/A")}
      ${row("BILLING TIME", fmtTime(new Date()))}
      ${row("BILLING DATE", fmtDate(new Date()))}
    </div>
    <div class="divider"></div>
    
    <div class="payment-status-badge ${isPaid ? "paid" : "unpaid"}">
      <span>${isPaid ? "PAID" : "NOT PAID"}</span>
    </div>
    
    <p class="valid">VALID FOR TODAY ONLY</p>
    <p class="note">Present this slip at Loading.</p>
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
 * Prints a loading dispatch pass/bill optimized for 80mm thermal printers.
 */
export async function printLoadingToken(ticket: Ticket): Promise<void> {
  const loadingTime = ticket.loadingEnd ? new Date(ticket.loadingEnd) : new Date();
  
  // Generate QR code representing the vehicle ID, sized to fit 72mm layout
  const qr = await QRCode.toDataURL(ticket.vehicle, {
    width: 240,
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
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
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 14px;
  }
  @page { size: 80mm 165mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 10px 6px;
    border: none;
  }
  .brand { text-align: center; }
  .logo {
    width: 36px; height: 36px; margin: 0 auto 6px;
    background: #000; color: #fff; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; letter-spacing: .04em;
  }
  .name { font-weight: 800; font-size: 16px; margin: 0; text-transform: uppercase; }
  .sub { display: none; }
  .token-badge {
    text-align: center;
    margin: 10px 0 6px;
  }
  .token-badge span {
    color: #000;
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 0.02em;
    display: inline-block;
  }
  .eyebrow {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .1em;
    color: #000; margin: 8px 0 6px; text-transform: uppercase;
  }
  .divider { border-top: 1.5px dashed #000; margin: 10px 0; }
  .rows { font-size: 14px; }
  .row { display: flex; justify-content: space-between; padding: 3.5px 0; }
  .row .k { color: #000; }
  .row .v { font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; word-break: break-all; color: #000; }
  
  .qr-code-section {
    text-align: center;
    margin: 12px 0 6px;
  }
  .qr-code-section img {
    width: 140px;
    height: 140px;
    display: inline-block;
  }

  .valid {
    text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .05em;
    color: #000; margin: 8px 0 6px;
  }
  .note { text-align: center; font-size: 11px; color: #000; margin: 4px 0 0; line-height: 1.3; }
  .foot {
    text-align: center; font-size: 10px; color: #000; margin-top: 10px;
    border-top: 1px solid #000; padding-top: 8px; letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
    </div>
    <div class="token-badge">
      <span>TOKEN NO: L-${String(ticket.loadingSerial ?? ticket.serial).padStart(3, "0")}</span>
    </div>
    <div class="eyebrow">LOADING DISPATCH PASS</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("WORK ORDER NO", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("GATE TOKEN NO", ticket.manualGateToken || `G-${String(ticket.serial).padStart(3, "0")}`)}
      ${row("BILLING TOKEN NO", ticket.manualBillingToken || `B-${String(ticket.billingSerial ?? ticket.serial).padStart(3, "0")}`)}
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
