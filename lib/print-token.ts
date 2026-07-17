import QRCode from "qrcode";
import type { Ticket } from "./types";
import { fmtDate, fmtTime } from "./format";
import { useStore } from "./store";

/**
 * Prints a single gate-entry token slip optimized for 58mm thermal printers.
 */
export async function printToken(ticket: Ticket): Promise<void> {
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
  @page { size: 80mm 125mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px;
    border: none;
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
    color: #444;
    text-transform: uppercase;
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
    color: #555;
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
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #e8e8e8;
    padding: 3.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #555; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 700; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
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
  .note { text-align: center; font-size: 10px; color: #444; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8px;
    color: #666;
    margin-top: 10px;
    border-top: 1px solid #e5e5e5;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">GATE ENTRY TOKEN</div>
      <div class="val">G-${String(ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Gate Entry Pass</div>
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
  @page { size: 80mm 125mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px;
    border: none;
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
    color: #444;
    text-transform: uppercase;
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
    color: #555;
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
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #e8e8e8;
    padding: 3.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #555; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 700; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
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
  .note { text-align: center; font-size: 10px; color: #444; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8px;
    color: #666;
    margin-top: 10px;
    border-top: 1px solid #e5e5e5;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">BILLING PASS</div>
      <div class="val">B-${String(ticket.billingSerial ?? ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Billing Pass</div>
    <div class="divider"></div>
    <div class="rows">
      ${row("WORK ORDER NO", ticket.boe)}
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
  @page { size: 80mm 165mm; margin: 0mm; }
  .ticket {
    width: 72mm;
    margin: 0 auto;
    padding: 12px 8px;
    border: none;
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
    color: #444;
    text-transform: uppercase;
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
    color: #555;
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
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #e8e8e8;
    padding: 3.5px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
  .rows { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .k { color: #555; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .row .v { font-weight: 700; text-align: right; word-break: break-all; color: #000; font-size: 12px; }
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
  .note { text-align: center; font-size: 10px; color: #444; margin: 4px 0 0; line-height: 1.25; }
  .foot {
    text-align: center;
    font-size: 8px;
    color: #666;
    margin-top: 10px;
    border-top: 1px solid #e5e5e5;
    padding-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <p class="name">YARDFLOW MANAGER</p>
      ${settings?.terminalName ? `<div class="terminal-lbl">${escapeHtml(settings.terminalName)}</div>` : ""}
    </div>
    <div class="token-badge">
      <div class="lbl">LOADING TOKEN</div>
      <div class="val">L-${String(ticket.loadingSerial ?? ticket.serial).padStart(3, "0")}</div>
    </div>
    <div class="eyebrow">Loading Dispatch Pass</div>
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
