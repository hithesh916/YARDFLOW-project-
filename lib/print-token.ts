import QRCode from "qrcode";
import type { Ticket } from "./types";
import { fmtDate, fmtTime } from "./format";
import { useStore } from "./store";

/**
 * Prints a single gate-entry token slip optimized for 80mm (3-inch) thermal receipt printers.
 */
export function writePrintDocument(html: string, targetWindow?: Window): void {
  if (targetWindow) {
    const doc = targetWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    targetWindow.focus();
    return;
  }

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

export async function printToken(ticket: Ticket, targetWindow?: Window): Promise<void> {
  const entry = new Date(ticket.entryTime);
  const settings = useStore.getState().settings;
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
    font-size: 13px;
    line-height: 1.35;
  }
  @page { size: 80mm auto; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px 36px;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 8px;
  }
  .name {
    font-weight: 850;
    font-size: 17px;
    margin: 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .terminal-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .address-lbl {
    font-size: 9px;
    color: #000;
    margin-top: 2px;
    max-width: 68mm;
    word-wrap: break-word;
    white-space: pre-line;
  }
  .gst-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    margin-top: 2px;
  }
  .token-badge {
    border: 2px solid #000;
    border-radius: 6px;
    padding: 6px 10px;
    text-align: center;
    margin: 8px 0;
    background: #fff;
  }
  .token-badge .lbl {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #000;
    text-transform: uppercase;
    margin-bottom: 1px;
  }
  .token-badge .val {
    font-size: 20px;
    font-weight: 900;
    color: #000;
  }
  .eyebrow {
    text-align: center;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #000;
    color: #fff;
    padding: 4.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #000; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 800; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
  .valid {
    text-align: center;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border: 1px dashed #000;
    padding: 5px;
    border-radius: 4px;
    margin: 8px 0 4px;
    text-transform: uppercase;
  }
  .note { text-align: center; font-size: 10px; color: #000; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8.5px;
    color: #000;
    margin-top: 12px;
    border-top: 1px dashed #000;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      ${settings?.logoUrl ? `<img src="${settings.logoUrl}" alt="Company Logo" style="max-height: 40px; margin-bottom: 5px; object-fit: contain;" />` : ""}
      <p class="name">${settings?.companyName ? escapeHtml(settings.companyName) : "YARDFLOW MANAGER"}</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
      ${settings?.companyAddress ? `<div class="address-lbl">${escapeHtml(settings.companyAddress)}</div>` : ""}
      ${settings?.companyGst ? `<div class="gst-lbl">GST: ${escapeHtml(settings.companyGst)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">GATE ENTRY TOKEN</div>
      <div class="val">G-${String(ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Gate Entry Pass</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("VEHICLE", ticket.vehicle)}
      ${row("BOE", ticket.boe)}
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

  writePrintDocument(html, targetWindow);
}

/**
 * Prints a billing approval slip optimized for 80mm (3-inch) thermal receipt printers.
 */
export async function printBillingToken(ticket: Ticket, targetWindow?: Window): Promise<void> {
  const entry = new Date(ticket.entryTime);
  const settings = useStore.getState().settings;
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
    font-size: 13px;
    line-height: 1.35;
  }
  @page { size: 80mm auto; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px 36px;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 8px;
  }
  .name {
    font-weight: 850;
    font-size: 17px;
    margin: 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .terminal-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .address-lbl {
    font-size: 9px;
    color: #000;
    margin-top: 2px;
    max-width: 68mm;
    word-wrap: break-word;
    white-space: pre-line;
  }
  .gst-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    margin-top: 2px;
  }
  .token-badge {
    border: 2px solid #000;
    border-radius: 6px;
    padding: 6px 10px;
    text-align: center;
    margin: 8px 0;
    background: #fff;
  }
  .token-badge .lbl {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #000;
    text-transform: uppercase;
    margin-bottom: 1px;
  }
  .token-badge .val {
    font-size: 20px;
    font-weight: 900;
    color: #000;
  }
  .eyebrow {
    text-align: center;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #000;
    color: #fff;
    padding: 4.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #000; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 800; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
  .payment-status-badge {
    text-align: center;
    margin: 10px 0 6px;
  }
  .payment-status-badge span {
    color: #000;
    font-size: 20px;
    font-weight: 900;
    padding: 6px 18px;
    border: 2.5px solid #000;
    border-radius: 5px;
    letter-spacing: 0.04em;
    display: inline-block;
    text-transform: uppercase;
  }
  .valid {
    text-align: center;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border: 1px dashed #000;
    padding: 5px;
    border-radius: 4px;
    margin: 8px 0 4px;
    text-transform: uppercase;
  }
  .note { text-align: center; font-size: 10px; color: #000; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8.5px;
    color: #000;
    margin-top: 12px;
    border-top: 1px dashed #000;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      ${settings?.logoUrl ? `<img src="${settings.logoUrl}" alt="Company Logo" style="max-height: 40px; margin-bottom: 5px; object-fit: contain;" />` : ""}
      <p class="name">${settings?.companyName ? escapeHtml(settings.companyName) : "YARDFLOW MANAGER"}</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
      ${settings?.companyAddress ? `<div class="address-lbl">${escapeHtml(settings.companyAddress)}</div>` : ""}
      ${settings?.companyGst ? `<div class="gst-lbl">GST: ${escapeHtml(settings.companyGst)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">BILLING PASS</div>
      <div class="val">B-${String(ticket.billingSerial ?? ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Billing Pass</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("BOE", ticket.boe)}
      ${row("CHA / AGENT", ticket.agent)}
      ${row("INVOICE NO", ticket.invoice || "N/A")}
      ${row("BILLING TIME", fmtTime(new Date()))}
      ${row("BILLING DATE", fmtDate(new Date()))}
    </div>
    <div class="divider"></div>
    
    <div class="payment-status-badge">
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

  writePrintDocument(html, targetWindow);
}

/**
 * Prints a loading dispatch pass/bill optimized for 80mm (3-inch) thermal receipt printers.
 */
export async function printLoadingToken(ticket: Ticket, targetWindow?: Window): Promise<void> {
  const loadingTime = ticket.loadingEnd ? new Date(ticket.loadingEnd) : new Date();
  const settings = useStore.getState().settings;
  
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
    font-size: 13px;
    line-height: 1.35;
  }
  @page { size: 80mm auto; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px 36px;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 8px;
  }
  .name {
    font-weight: 850;
    font-size: 17px;
    margin: 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .terminal-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .address-lbl {
    font-size: 9px;
    color: #000;
    margin-top: 2px;
    max-width: 68mm;
    word-wrap: break-word;
    white-space: pre-line;
  }
  .gst-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #000;
    margin-top: 2px;
  }
  .token-badge {
    border: 2px solid #000;
    border-radius: 6px;
    padding: 6px 10px;
    text-align: center;
    margin: 8px 0;
    background: #fff;
  }
  .token-badge .lbl {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #000;
    text-transform: uppercase;
    margin-bottom: 1px;
  }
  .token-badge .val {
    font-size: 20px;
    font-weight: 900;
    color: #000;
  }
  .eyebrow {
    text-align: center;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #000;
    color: #fff;
    padding: 4.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #000; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 800; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
  .qr-code-section {
    display: flex;
    justify-content: center;
    margin: 8px 0;
  }
  .qr-code-section img {
    width: 90px;
    height: 90px;
    border: 1px solid #000;
    padding: 2px;
  }
  .valid {
    text-align: center;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border: 1px dashed #000;
    padding: 5px;
    border-radius: 4px;
    margin: 8px 0 4px;
    text-transform: uppercase;
  }
  .note { text-align: center; font-size: 10px; color: #000; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8.5px;
    color: #000;
    margin-top: 12px;
    border-top: 1px dashed #000;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      ${settings?.logoUrl ? `<img src="${settings.logoUrl}" alt="Company Logo" style="max-height: 40px; margin-bottom: 5px; object-fit: contain;" />` : ""}
      <p class="name">${settings?.companyName ? escapeHtml(settings.companyName) : "YARDFLOW MANAGER"}</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
      ${settings?.companyAddress ? `<div class="address-lbl">${escapeHtml(settings.companyAddress)}</div>` : ""}
      ${settings?.companyGst ? `<div class="gst-lbl">GST: ${escapeHtml(settings.companyGst)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">LOADING TOKEN</div>
      <div class="val">L-${String(ticket.loadingSerial ?? ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Loading Dispatch Pass</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("WORK ORDER NO", ticket.workOrder || "N/A")}
      ${row("BILLING TOKEN NO", ticket.manualBillingToken || (ticket.billingSerial ? `B-${String(ticket.billingSerial).padStart(3, "0")}` : `B-${String(ticket.serial).padStart(3, "0")}`))}
      ${row("GATE TOKEN NO", ticket.createdSource === "billing" ? "N/A" : (ticket.manualGateToken || `G-${String(ticket.serial).padStart(3, "0")}`))}
      ${row("VEHICLE NO", ticket.createdSource === "billing" ? "N/A" : ticket.vehicle)}
      ${row("REMARKS", ticket.loadingRemarks || "—")}
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

  writePrintDocument(html, targetWindow);
}

export async function printLoadingTokens(tickets: Ticket[], targetWindow?: Window): Promise<void> {
  if (!tickets || tickets.length === 0) return;
  const settings = useStore.getState().settings;
  const row = (k: string, v: string) =>
    `<div class="row"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>`;

  const ticketHtmls: string[] = [];

  for (const ticket of tickets) {
    const loadingTime = ticket.loadingEnd ? new Date(ticket.loadingEnd) : new Date();
    const qr = await QRCode.toDataURL(ticket.vehicle, {
      width: 240,
      margin: 0,
      color: { dark: "#000000", light: "#ffffff" },
    });

    ticketHtmls.push(`
      <div class="ticket">
        <div class="brand">
          <p class="name">${settings?.companyName ? escapeHtml(settings.companyName) : "YARDFLOW MANAGER"}</p>
          ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
          ${settings?.companyAddress ? `<div class="address-lbl">${escapeHtml(settings.companyAddress)}</div>` : ""}
          ${settings?.companyGst ? `<div class="gst-lbl">GST: ${escapeHtml(settings.companyGst)}</div>` : ""}
        </div>
        <div class="token-badge">
          <div class="lbl">LOADING TOKEN</div>
          <div class="val">L-${String(ticket.loadingSerial ?? ticket.serial).padStart(3, "0")}</div>
        </div>
        <div class="eyebrow">Loading Dispatch Pass</div>
        <div class="divider"></div>
        <div class="rows">
          ${row("WORK ORDER NO", ticket.workOrder || "N/A")}
          ${row("BILLING TOKEN NO", ticket.manualBillingToken || (ticket.billingSerial ? `B-${String(ticket.billingSerial).padStart(3, "0")}` : `B-${String(ticket.serial).padStart(3, "0")}`))}
          ${row("GATE TOKEN NO", ticket.manualGateToken || `G-${String(ticket.serial).padStart(3, "0")}`)}
          ${row("VEHICLE NO", ticket.createdSource === "billing" ? "N/A" : ticket.vehicle)}
          ${row("REMARKS", ticket.loadingRemarks || "—")}
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
      <div class="page-break"></div>
    `);
  }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>YARDFLOW Loading Passes</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 13px;
    line-height: 1.35;
  }
  @page { size: 80mm auto; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px 36px;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .brand { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 8px; }
  .name { font-weight: 850; font-size: 17px; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
  .terminal-lbl { font-size: 9px; font-weight: 700; color: #000; text-transform: uppercase; margin-top: 2px; }
  .address-lbl { font-size: 9px; color: #000; margin-top: 2px; max-width: 68mm; word-wrap: break-word; white-space: pre-line; }
  .gst-lbl { font-size: 9px; font-weight: 700; color: #000; margin-top: 2px; }
  .token-badge { border: 2px solid #000; border-radius: 6px; padding: 6px 10px; text-align: center; margin: 8px 0; background: #fff; }
  .token-badge .lbl { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: #000; text-transform: uppercase; margin-bottom: 1px; }
  .token-badge .val { font-size: 20px; font-weight: 900; color: #000; }
  .eyebrow { text-align: center; font-size: 10px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; background: #000; color: #fff; padding: 4.5px; border-radius: 4px; margin-bottom: 8px; }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #000; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 800; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
  .qr-code-section { display: flex; justify-content: center; margin: 8px 0; }
  .qr-code-section img { width: 90px; height: 90px; border: 1px solid #000; padding: 2px; }
  .valid { text-align: center; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; border: 1px dashed #000; padding: 5px; border-radius: 4px; margin: 8px 0 4px; text-transform: uppercase; }
  .note { text-align: center; font-size: 10px; color: #000; margin: 4px 0 0; line-height: 1.25; }
  .foot { text-align: center; font-size: 8.5px; color: #000; margin-top: 12px; border-top: 1px dashed #000; padding-top: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .page-break { page-break-after: always; break-after: always; }
</style>
</head>
<body>
  ${ticketHtmls.join("\n")}
</body>
</html>`;

  writePrintDocument(html, targetWindow);
}

/**
 * Prints a combined loading pass for multiple tickets (single BOE) as one bill.
 */
export async function printCombinedLoadingToken(tickets: Ticket[], targetWindow?: Window): Promise<void> {
  if (!tickets || tickets.length === 0) return;

  const settings = useStore.getState().settings;

  // Aggregate data for header
  const commonBoe = tickets[0].boe || "";
  const agents = Array.from(new Set(tickets.map((t) => (t.agent || t.billingAgent || "Unassigned").trim()).filter(Boolean)));
  const gateTokens = Array.from(new Set(tickets.map((t) => t.manualGateToken || `G-${String(t.serial).padStart(3, "0")}`)));
  const billingTokens = Array.from(new Set(tickets.map((t) => t.manualBillingToken || (t.status === "awaiting_billing" ? "B-PENDING" : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`))));

  const combinedPayload = JSON.stringify({
    type: "yardflow_combined_loading",
    boe: commonBoe,
    agents,
    gateTokens,
    billingTokens,
    tickets: tickets.map((t) => ({
      vehicle: t.vehicle,
      gateToken: t.manualGateToken || `G-${String(t.serial).padStart(3, "0")}`,
      billingToken: t.manualBillingToken || (t.status === "awaiting_billing" ? "B-PENDING" : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`),
      invoice: t.invoice || "N/A",
      completedTime: t.loadingEnd ? fmtTime(new Date(t.loadingEnd)) : fmtTime(new Date()),
      completedDate: t.loadingEnd ? fmtDate(new Date(t.loadingEnd)) : fmtDate(new Date()),
    })),
  });

  const combinedQr = await QRCode.toDataURL(combinedPayload, {
    width: 240,
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const rowsHtml = tickets
    .map((t) => {
      const g = t.createdSource === "billing" ? "N/A" : (t.manualGateToken || `G-${String(t.serial).padStart(3, "0")}`);
      const b = t.manualBillingToken || (t.status === "awaiting_billing" ? "B-PENDING" : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`);
      const invoice = t.invoice || "N/A";
      const completedTime = t.loadingEnd ? fmtTime(new Date(t.loadingEnd)) : fmtTime(new Date());
      const completedDate = t.loadingEnd ? fmtDate(new Date(t.loadingEnd)) : fmtDate(new Date());
      const agentName = t.loadingAgent || t.billingAgent || t.agent || "Unassigned";

      return `
      <div class="ticket-row">
        <div class="info">
          <div class="veh">${escapeHtml(t.vehicle)}</div>
          <div class="fields">
            <div><span class="lbl">WORK ORDER NO</span><span class="val">${escapeHtml(t.workOrder || "N/A")}</span></div>
            <div><span class="lbl">BILLING TOKEN NO</span><span class="val">${escapeHtml(b)}</span></div>
            <div><span class="lbl">GATE TOKEN NO</span><span class="val">${escapeHtml(g)}</span></div>
            <div><span class="lbl">VEHICLE NO</span><span class="val">${escapeHtml(t.createdSource === "billing" ? "N/A" : t.vehicle)}</span></div>
            <div><span class="lbl">REMARKS</span><span class="val">${escapeHtml(t.loadingRemarks || "—")}</span></div>
            <div><span class="lbl">COMPLETED TIME</span><span class="val">${escapeHtml(completedTime)}</span></div>
            <div><span class="lbl">COMPLETED DATE</span><span class="val">${escapeHtml(completedDate)}</span></div>
          </div>
        </div>
      </div>`;
    })
    .join("\\n");

  const agentsHtml = agents.map((a) => `<div class="agent-item">${escapeHtml(a)}</div>`).join("\\n");
  const gateHtml = gateTokens.map((g) => `<span class="token">${escapeHtml(g)}</span>`).join(" ");
  const billingHtml = billingTokens.map((b) => `<span class="token">${escapeHtml(b)}</span>`).join(" ");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>YARDFLOW Combined Loading Pass</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial}
  @page{size:80mm auto;margin:0}
  .ticket{width:72mm;margin:0 auto;padding:12px 8px 24px}
  .brand{text-align:center;margin-bottom:6px}
  .name{font-weight:850;font-size:16px;margin:0}
  .boe{font-size:11px;color:#333;margin-top:4px}
  .eyebrow{font-size:11px;font-weight:800;background:#000;color:#fff;padding:6px;border-radius:4px;text-align:center;margin:8px 0}
  .summary{font-size:11px;margin:6px 0 10px}
  .summary .label{font-weight:700;margin-right:6px}
  .tokens-row{margin-top:6px}
  .token{display:inline-block;background:#f3f4f6;padding:4px 8px;border-radius:6px;margin-right:6px;font-weight:700}
  .agents{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .rows{display:flex;flex-direction:column;gap:10px;margin-top:8px}
  .ticket-row{display:flex;gap:8px;padding:8px;border:1px dashed #000;border-radius:6px;align-items:flex-start}
  .qr img{width:72px;height:72px;border:1px solid #000;padding:3px}
  .info{flex:1}
  .veh{font-weight:900;font-size:13px;margin-bottom:6px}
  .fields{display:flex;flex-direction:column;gap:4px}
  .fields .lbl{display:inline-block;width:120px;font-weight:700;font-size:11px;color:#111}
  .fields .val{display:inline-block;font-weight:800;font-size:11px;color:#111;margin-left:6px}
  .foot{text-align:center;font-size:9px;margin-top:10px;color:#333}
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">${settings?.companyName ? escapeHtml(settings.companyName) : "YARDFLOW MANAGER"}</p>
      ${commonBoe ? `<div class="boe">WORK ORDER NO: ${escapeHtml(commonBoe)}</div>` : ""}
    </div>
    <div class="eyebrow">COMBINED LOADING PASS</div>
    <div class="qr-top"><img src="${combinedQr}" alt="Combined QR" /></div>
    <div class="summary">
      <div><span class="label">CHA / AGENTS:</span><span class="agents">${agentsHtml}</span></div>
      <div class="tokens-row"><span class="label">GATE TOKEN NO(s):</span>${gateHtml}</div>
      <div class="tokens-row"><span class="label">BILLING TOKEN NO(s):</span>${billingHtml}</div>
    </div>

    <div class="rows">
      ${rowsHtml}
    </div>

    <div class="foot">Present this slip and scan QR at Exit. Product by Cubiqlab Technologies</div>
  </div>
  <script>window.onload=function(){setTimeout(()=>{window.focus();window.print()},120)};window.onafterprint=function(){if(window.frameElement)window.frameElement.remove()};</script>
</body>
</html>`;

  writePrintDocument(html, targetWindow);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
