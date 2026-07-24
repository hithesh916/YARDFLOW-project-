"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, ClipboardCheck, Printer, Ban, ChevronDown, ChevronUp, ReceiptText, Truck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/pill";
import { activeVisitsForBoe, filterBySearch, useStore } from "@/lib/store";
import { fmtTime, fmtDate, pad, getLocalDateString } from "@/lib/format";
import { printLoadingToken, printLoadingTokens } from "@/lib/print-token";
import type { Ticket } from "@/lib/types";
import { QrCode } from "@/components/qr-code";
import { motion, AnimatePresence } from "motion/react";

export default function LoadingPage() {
  const tickets = useStore((s) => s.tickets);
  const search = useStore((s) => s.search);
  const ticketAction = useStore((s) => s.ticketAction);
  const settings = useStore((s) => s.settings);
  const tz = settings?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);

  // Only vehicles that have completed billing are eligible for loading. Unbilled
  // (awaiting_billing) tickets are intentionally excluded — loading one would let a
  // vehicle reach the exit unpaid, and the server now rejects it with a 409 anyway.
  const loadingQueue = filterBySearch(tickets, search).filter(
    (t) => t.status === "awaiting_loading",
  );
  const activeGateTickets = tickets.filter(
    (t) => t.status === "awaiting_loading",
  );

  const [boe, setBoe] = useState("");
  const [workOrder, setWorkOrder] = useState("");
  const [agent, setAgent] = useState("");
  const [remarks, setRemarks] = useState("");
  const [gateToken, setGateToken] = useState("");
  const [billingToken, setBillingToken] = useState("");
  const [showBillingDropdown, setShowBillingDropdown] = useState(false);
  const [showGateDropdown, setShowGateDropdown] = useState(false);
  const [activeSearch, setActiveSearch] = useState<{ field: "boe" | "gateToken" | "billingToken"; value: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Ticket | null>(null);
  const [matchedTicket, setMatchedTicket] = useState<Ticket | null>(null);
  const [loadedExpanded, setLoadedExpanded] = useState(false);

  // New multi-select state
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);

  const toggleSelectTicket = (id: string) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const prevSelectedIdsRef = useRef<string[]>([]);
  const prevActiveSearchRef = useRef<{ field: string; value: string } | null>(null);
  const workOrderRef = useRef(workOrder);
  useEffect(() => { workOrderRef.current = workOrder; }, [workOrder]);

  // Synchronize inputs with selectedTicketIds selection
  useEffect(() => {
    if (activeSearch !== null) return;

    // Guard: Only run when the selected ticket IDs actually change
    const prevIds = prevSelectedIdsRef.current;
    const hasChanged =
      selectedTicketIds.length !== prevIds.length ||
      selectedTicketIds.some((id, idx) => id !== prevIds[idx]);

    if (!hasChanged) {
      return;
    }
    prevSelectedIdsRef.current = selectedTicketIds;

    if (selectedTicketIds.length === 0) {
      setBoe("");
      // Keep manual workOrder if typed, don't clear
      setAgent("");
      setRemarks("");
      setGateToken("");
      setBillingToken("");
      setMatchedTicket(null);
      return;
    }

    if (selectedTicketIds.length === 1) {
      const matched = tickets.find((t) => t.id === selectedTicketIds[0]);
      if (matched) {
        setBoe(matched.boe);
        // Only override workOrder from ticket if user hasn't already typed one
        if (matched.workOrder && !workOrderRef.current.trim()) {
          setWorkOrder(matched.workOrder);
        }
        setAgent(matched.billingAgent || matched.agent);
        setRemarks(matched.loadingRemarks || "");
        const gToken = matched.createdSource === "billing" ? "N/A" : `G-${String(matched.serial).padStart(3, "0")}`;
        const bToken = matched.status === "awaiting_billing" ? "" : `B-${String(matched.billingSerial ?? matched.serial).padStart(3, "0")}`;
        
        setGateToken(gToken);
        setBillingToken(bToken);
        setMatchedTicket(matched);
      }
    } else {
      // Multiple selected
      const selectedTickets = tickets.filter((t) => selectedTicketIds.includes(t.id));
      const boes = selectedTickets.map((t) => t.boe).join(", ");
      const workOrders = selectedTickets.map((t) => t.workOrder || "").filter(Boolean).join(", ");
      const gateTokens = selectedTickets
        .map((t) => t.createdSource === "billing" ? "N/A" : `G-${String(t.serial).padStart(3, "0")}`)
        .join(", ");
      const billingTokens = selectedTickets
        .map((t) => t.status === "awaiting_billing" ? "PENDING" : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`)
        .join(", ");
      
      setBoe(boes);
      // Only prefill workOrder from tickets if user hasn't typed one
      if (workOrders && !workOrderRef.current.trim()) {
        setWorkOrder(workOrders);
      }
      setGateToken(gateTokens);
      setBillingToken(billingTokens);
      
      // Prefill Agent with all selected ticket agents, joining multiple agent names if needed
      const selectedAgents = Array.from(
        new Set(
          selectedTickets
            .map((t) => t.billingAgent || t.agent)
            .filter(Boolean),
        ),
      );
      setAgent(selectedAgents.join(", ") || "");
      setRemarks("");
      setMatchedTicket(null);
    }
  }, [selectedTicketIds, tickets, activeSearch]);

  // Auto-populate form fields if any typed search field matches a ticket in the queue
  useEffect(() => {
    if (!activeSearch) {
      prevActiveSearchRef.current = null;
      return;
    }

    // Guard: Only run when the active search field or value actually changes
    const prevSearch = prevActiveSearchRef.current;
    if (
      prevSearch &&
      prevSearch.field === activeSearch.field &&
      prevSearch.value === activeSearch.value
    ) {
      return;
    }
    prevActiveSearchRef.current = activeSearch;

    const { field, value } = activeSearch;
    const cleanValue = value.trim().toUpperCase();

    if (!cleanValue) {
      setBoe("");
      // Keep manual workOrder if typed, don't clear
      setAgent("");
      setRemarks("");
      setGateToken("");
      setBillingToken("");
      setMatchedTicket(null);
      setSelectedTicketIds([]);
      return;
    }

    let matched: Ticket | undefined = undefined;

    if (field === "boe") {
      // Day-scoped: only today's active vehicles for this BOE (never a prior-day leftover).
      const matches = activeVisitsForBoe(tickets, cleanValue, tz, {
        statuses: ["awaiting_loading", "awaiting_billing"],
      });
      const preferredMatches = matches.filter((t) => t.status === "awaiting_loading");
      const resolvedMatches = preferredMatches.length > 0 ? preferredMatches : matches;
      if (resolvedMatches.length > 0) {
        setSelectedTicketIds(resolvedMatches.map((t) => t.id));
        matched = resolvedMatches[0];
      } else {
        setSelectedTicketIds([]);
      }
    } else if (field === "gateToken") {
      const match = cleanValue.match(/^(?:G-)?(0*[1-9]\d*)$/);
      if (match) {
        const serial = parseInt(match[1], 10);
        matched = tickets.find(
          (t) =>
            t.serial === serial &&
            (t.status === "awaiting_loading" || t.status === "awaiting_billing")
        );
      }
    } else if (field === "billingToken") {
      const match = cleanValue.match(/^(?:B-)?(0*[1-9]\d*)$/);
      if (match) {
        const serial = parseInt(match[1], 10);
        matched = tickets.find(
          (t) => (t.billingSerial ?? t.serial) === serial && t.status === "awaiting_loading"
        );
      }
    }

    if (matched) {
      if (field !== "boe") setBoe(matched.boe);
      // Only prefill workOrder from ticket if user hasn't typed one
      if (matched.workOrder && !workOrderRef.current.trim()) {
        setWorkOrder(matched.workOrder);
      }
      setAgent(matched.billingAgent || matched.agent);
      setRemarks(matched.loadingRemarks || "");
      if (field !== "gateToken") {
        setGateToken(matched.createdSource === "billing" ? "N/A" : `G-${String(matched.serial).padStart(3, "0")}`);
      }
      if (field !== "billingToken") {
        setBillingToken(matched.status === "awaiting_billing" ? "" : `B-${String(matched.billingSerial ?? matched.serial).padStart(3, "0")}`);
      }
      setMatchedTicket(matched);
      setSelectedTicketIds([matched.id]);
    } else {
      setMatchedTicket(null);
    }
  }, [activeSearch, tickets]);

  // Click outside listener to close dropdowns
  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".billing-dropdown-container")) {
        setShowBillingDropdown(false);
      }
      if (!target.closest(".gate-dropdown-container")) {
        setShowGateDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  const recentDone = [...tickets]
    .filter((t) =>
      // Scope by the LOADING timestamp (not entryTime) so a vehicle loaded after midnight
      // still shows in today's completed list.
      t.loadingEnd &&
      getLocalDateString(t.loadingEnd, tz) === todayStr
    )
    .sort((a, b) => (b.loadingEnd ?? "").localeCompare(a.loadingEnd ?? ""));

  const upcoming = loadingQueue.filter((t) => !selectedTicketIds.includes(t.id)).slice(0, 3);

  function selectFromQueue(t: Ticket) {
    setSelectedTicketIds([t.id]);
    setActiveSearch(null);
    toast.success(`Loaded details for ${t.vehicle} (BOE: ${t.boe})`);
  }

  function handleConfirmClick() {
    confirm();
  }

  async function confirm() {
    // Guard against Enter-key / double-click re-entry while a submit is already in
    // flight — otherwise a second run acts on stale state and can double-process.
    if (busy) return;

    // Validate required fields
    if (!workOrder.trim()) {
      toast.error("Work Order No is required.");
      return;
    }
    if (selectedTicketIds.length === 0 && !boe.trim()) {
      toast.error("Select a token or enter BOE to display.");
      return;
    }

    const targetsToProcess: Ticket[] = [];
    if (selectedTicketIds.length > 0) {
      targetsToProcess.push(...tickets.filter((t) => selectedTicketIds.includes(t.id)));
    } else {
      // If no explicit selection, pick today's billed vehicle(s) matching the BOE
      // (day-scoped so a prior-day same-BOE ticket is never swept into the batch).
      targetsToProcess.push(
        ...activeVisitsForBoe(tickets, boe, tz, { statuses: ["awaiting_loading"] }),
      );
    }

    if (targetsToProcess.length === 0) {
      toast.error("No active vehicle found to approve.");
      return;
    }

    setBusy(true);
    try {
      let successCount = 0;
      let lastProcessedTicket: Ticket | null = null;

      const printTickets: Ticket[] = [];
      for (const target of targetsToProcess) {
        const gTokenVal = target.createdSource === "billing" ? "N/A" : `G-${String(target.serial).padStart(3, "0")}`;
        const bTokenVal = `B-${String(target.billingSerial ?? target.serial).padStart(3, "0")}`;

        const ok = await ticketAction(target.id, "complete-loading", {
          boe: target.boe,
          workOrder: workOrder.trim(),
          agent: agent.trim() || target.billingAgent || target.agent,
          remarks: remarks.trim() || target.loadingRemarks || "",
          gateToken: gTokenVal,
          billingToken: bTokenVal,
        });

        if (ok) {
          successCount++;
          const freshTicket = useStore.getState().tickets.find((t) => t.id === target.id);
          const printTicket = freshTicket || {
            ...target,
            workOrder: workOrder.trim(),
            loadingEnd: new Date().toISOString(),
            loadingAgent: agent.trim() || target.billingAgent || target.agent,
            loadingRemarks: remarks.trim(),
            manualGateToken: gTokenVal,
            manualBillingToken: bTokenVal || null,
          };
          lastProcessedTicket = printTicket;
          printTickets.push(printTicket);
        }
      }

      // Print each pass to its own iframe. A single print failure must not abort the
      // rest of the batch (and, via the finally below, must not wedge the button).
      for (let i = 0; i < printTickets.length; i++) {
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        try {
          await printLoadingToken(printTickets[i]);
        } catch (e) {
          console.error("Loading pass print failed:", e);
          toast.error(`Could not print pass for ${printTickets[i].vehicle}.`);
        }
      }

      if (successCount > 0) {
        setBoe("");
        // Do NOT clear workOrder — user should re-use it for the next vehicle
        setAgent("");
        setRemarks("");
        setGateToken("");
        setBillingToken("");
        setMatchedTicket(null);
        setSelectedTicketIds([]);
        setActiveSearch(null);
        toast.success(`Successfully processed and printed ${successCount} pass(es)`);
        if (lastProcessedTicket) {
          setLastLoaded(lastProcessedTicket);
        }
      } else {
        toast.error("Failed to process approval.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    const targetsToSkip = tickets.filter((t) => selectedTicketIds.includes(t.id));
    if (targetsToSkip.length === 0 && matchedTicket) {
      targetsToSkip.push(matchedTicket);
    }
    
    if (targetsToSkip.length === 0 || busy) return;
    
    setBusy(true);
    let successCount = 0;
    
    for (const target of targetsToSkip) {
      const ok = await ticketAction(target.id, "skip-loading");
      if (ok) successCount++;
    }
    
    if (successCount > 0) {
      setBoe("");
      // Do NOT clear workOrder — keep it for next vehicle
      setAgent("");
      setRemarks("");
      setGateToken("");
      setBillingToken("");
      setMatchedTicket(null);
      setSelectedTicketIds([]);
      setActiveSearch(null);
      toast.success(`Skipped and re-queued ${successCount} vehicle(s)`);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left Column: Form */}
        <Panel className="p-8">
          <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
            <ClipboardCheck className="text-blue-600" size={20} />
            Loading Pass Approval
          </h2>

          <div className="mb-5">
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Work Order No *
            </label>
            <input
              value={workOrder}
              onChange={(e) => setWorkOrder(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmClick()}
              placeholder="Enter Work Order No"
              className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-xl font-bold uppercase placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative billing-dropdown-container">
              <label className="mb-2 flex items-center justify-between text-[13px] font-bold text-slate-700">
                <span>Billing Token No</span>
                <button
                  type="button"
                  onClick={() => setShowBillingDropdown(!showBillingDropdown)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                >
                  {showBillingDropdown ? "▲ Hide List" : "▼ Select Billing"}
                </button>
              </label>
              <div className="relative">
                <input
                  value={billingToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBillingToken(val);
                    setActiveSearch({ field: "billingToken", value: val });
                  }}
                  placeholder="B-001"
                  className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowBillingDropdown(!showBillingDropdown)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {showBillingDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">Select Multiple Billing Passes</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allBillingIds = tickets.filter((t) => t.status === "awaiting_loading").map((t) => t.id);
                        setSelectedTicketIds((prev) => {
                          const hasAll = allBillingIds.every((id) => prev.includes(id));
                          if (hasAll) {
                            return prev.filter((id) => !allBillingIds.includes(id));
                          } else {
                            return Array.from(new Set([...prev, ...allBillingIds]));
                          }
                        });
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Toggle All
                    </button>
                  </div>
                  {tickets
                    .filter((t) => t.status === "awaiting_loading")
                    .map((t) => {
                      const bNum = `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`;
                      const isChecked = selectedTicketIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleSelectTicket(t.id)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectTicket(t.id);
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="flex-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-extrabold">
                              {bNum}
                              {t.boeVisit ? (
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                                  Trip {t.boeVisit}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[150px]">
                              {t.boe} · {t.vehicle}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  {tickets.filter((t) => t.status === "awaiting_loading").length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-3">No active billing passes waiting.</p>
                  )}
                </div>
              )}
            </div>

            <div className="relative gate-dropdown-container">
              <label className="mb-2 flex items-center justify-between text-[13px] font-bold text-slate-700">
                <span>Gate Token No</span>
                <button
                  type="button"
                  onClick={() => setShowGateDropdown(!showGateDropdown)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                >
                  {showGateDropdown ? "▲ Hide List" : "▼ Select Gate"}
                </button>
              </label>
              <div className="relative">
                <input
                  value={gateToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGateToken(val);
                    setActiveSearch({ field: "gateToken", value: val });
                  }}
                  placeholder="G-001"
                  className="w-full rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowGateDropdown(!showGateDropdown)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {showGateDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">Select Multiple Gate Passes</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allGateIds = activeGateTickets.map((t) => t.id);
                        setSelectedTicketIds((prev) => {
                          const hasAll = allGateIds.every((id) => prev.includes(id));
                          if (hasAll) {
                            return prev.filter((id) => !allGateIds.includes(id));
                          } else {
                            return Array.from(new Set([...prev, ...allGateIds]));
                          }
                        });
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Toggle All
                    </button>
                  </div>
                  {activeGateTickets
                    .map((t) => {
                      const gNum = t.createdSource === "billing" ? "N/A" : `G-${String(t.serial).padStart(3, "0")}`;
                      const isChecked = selectedTicketIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleSelectTicket(t.id)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectTicket(t.id);
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="flex-1 flex items-center justify-between">
                            <span className="font-extrabold">{gNum}</span>
                            <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[150px]">
                              {t.vehicle} · {t.boe}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  {activeGateTickets.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-3">No active gate passes waiting.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                BOE (display only)
              </label>
              <input
                value={boe}
                readOnly
                placeholder="Auto fill from selected token"
                className="w-full rounded-lg border border-input bg-transparent px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                CHA / Agent Name
              </label>
              <input
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="Agent name..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-[13px] font-bold text-slate-700">
              Date & Time (Auto Generated)
            </label>
            <input
              value={`${fmtDate(new Date())} ${fmtTime(new Date().toISOString())}`}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-transparent px-3.5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
            />
          </div>

          <label className="mb-2 block text-[13px] font-bold text-slate-700">
            Loading Remarks (Optional)
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Loading bays status, carrier notes..."
            className="mb-5 min-h-24 w-full resize-y rounded-lg border border-input bg-slate-50 dark:bg-black px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              onClick={handleSkip}
              disabled={(selectedTicketIds.length === 0 && !matchedTicket) || busy}
              className="flex items-center gap-2 rounded-lg border border-destructive bg-transparent px-5 py-3 text-sm font-extrabold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
            >
              <Ban size={15} /> Skip/Requeue
            </button>
            <button
              onClick={handleConfirmClick}
              disabled={(selectedTicketIds.length === 0 && !boe.trim()) || busy}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground cursor-pointer active:scale-[0.99] transition-all"
            >
              {busy ? "Processing…" : "PROCESS & PRINT TOKEN"}
            </button>
          </div>

          {/* Batch Selection Details Card */}
          {selectedTicketIds.length > 1 && (
            <div className="mb-6 rounded-xl border border-blue-150 bg-blue-50/10 p-5 dark:border-blue-900/30 dark:bg-blue-950/5">
              <h3 className="mb-3 text-[11px] font-extrabold tracking-wider text-blue-600 dark:text-blue-400 uppercase flex items-center justify-between border-b border-blue-100 dark:border-blue-900 pb-2">
                <span className="flex items-center gap-1.5"><Truck size={14} /> Batch Processing ({selectedTicketIds.length} Vehicles)</span>
                <button
                  type="button"
                  onClick={() => setSelectedTicketIds([])}
                  className="text-[10px] font-bold text-red-655 hover:text-red-755 cursor-pointer"
                >
                  Clear All Selection
                </button>
              </h3>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {tickets
                  .filter((t) => selectedTicketIds.includes(t.id))
                  .map((t) => {
                    const gNum = t.createdSource === "billing" ? "N/A" : `G-${String(t.serial).padStart(3, "0")}`;
                    const bNum = t.status === "awaiting_billing" ? "B-PENDING" : `B-${String(t.billingSerial ?? t.serial).padStart(3, "0")}`;
                    return (
                      <div key={t.id} className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200 block">{t.vehicle}</span>
                          <span className="text-[10px] text-slate-400">WO: {t.boe} · {t.agent}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-extrabold text-slate-600 block">{gNum} · {bNum}</span>
                          <button
                            type="button"
                            onClick={() => toggleSelectTicket(t.id)}
                            className="text-[9px] font-bold text-red-500 hover:text-red-700 mt-0.5 block ml-auto cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Checked-In Entry & Billing Details Grid */}
          {matchedTicket && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Entry Gate Data Set */}
              <div className="rounded-xl border border-blue-150 bg-blue-50/10 p-5 dark:border-blue-900/30 dark:bg-blue-950/5">
                <h3 className="mb-3 text-[11px] font-extrabold tracking-wider text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1.5 border-b border-blue-100 dark:border-blue-950 pb-2">
                  <Truck size={14} className="shrink-0" /> 1. Entry Gate Data Set
                </h3>
                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">Vehicle Number</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.vehicle}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">Work Order No</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.boe}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">CHA / Agent</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.agent}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">Cargo Details</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.cargo || "General Cargo"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">Assigned Slot/Bay</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.bay || "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                    <span className="text-slate-400 font-medium">Check-In Time</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {fmtDate(new Date(matchedTicket.entryTime))} {fmtTime(matchedTicket.entryTime)}
                    </span>
                  </div>
                  {matchedTicket.remarks && (
                    <div className="mt-1">
                      <span className="text-slate-400 font-medium block mb-0.5">Entry Remarks</span>
                      <span className="text-slate-600 dark:text-slate-400 italic block leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-2 rounded">&ldquo;{matchedTicket.remarks}&rdquo;</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Billing Approval Data Set */}
              <div className={`rounded-xl border p-5 ${
                matchedTicket.status === "awaiting_billing"
                  ? "border-amber-150 bg-amber-50/10 dark:border-amber-900/30 dark:bg-amber-950/5"
                  : "border-emerald-150 bg-emerald-50/10 dark:border-emerald-900/30 dark:bg-emerald-950/5"
              }`}>
                <h3 className={`mb-3 text-[11px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 border-b pb-2 ${
                  matchedTicket.status === "awaiting_billing"
                    ? "text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-950"
                    : "text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-950"
                }`}>
                  <ReceiptText size={14} className="shrink-0" /> 2. Billing Approval Data Set
                </h3>
                
                {matchedTicket.status === "awaiting_billing" ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-xs h-full">
                    <span className="inline-block text-[14px] font-black tracking-wider px-3 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 uppercase mb-3 animate-pulse">
                      BILLING PENDING
                    </span>
                    <p className="text-slate-400 max-w-[200px] leading-relaxed">
                      This vehicle has not been processed at the Billing Desk yet. Charges are currently uncollected.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 text-xs">
                    <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                      <span className="text-slate-400 font-medium">Invoice Number</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.invoice || "N/A"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                      <span className="text-slate-400 font-medium">Payment Status</span>
                      <span className={`font-extrabold ${matchedTicket.paymentStatus === "Paid" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {matchedTicket.paymentStatus || "Not Paid"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                      <span className="text-slate-400 font-medium">Billing Agent</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">{matchedTicket.billingAgent || matchedTicket.agent || "N/A"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100/50 pb-1.5 dark:border-slate-800/30">
                      <span className="text-slate-400 font-medium">Billing Time</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {matchedTicket.billingTime ? `${fmtDate(new Date(matchedTicket.billingTime))} ${fmtTime(matchedTicket.billingTime)}` : "—"}
                      </span>
                    </div>
                    {matchedTicket.billingRemarks && (
                      <div className="mt-1">
                        <span className="text-slate-400 font-medium block mb-0.5">Billing Remarks</span>
                        <span className="text-slate-600 dark:text-slate-400 italic block leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-2 rounded">&ldquo;{matchedTicket.billingRemarks}&rdquo;</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* Right Column: Preview */}
        <div className="flex flex-col gap-5">
          <Panel className="bg-slate-50 p-6">
            <p className="mb-4 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
              LIVE LOADING PASS PREVIEW
            </p>
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              {(boe || lastLoaded) && (
                <div className="mb-3 font-black text-lg tracking-[0.05em] text-slate-800 uppercase">
                  TOKEN NO: L-{String((lastLoaded && !boe) ? (lastLoaded.loadingSerial ?? lastLoaded.serial) : "NEW").padStart(3, "0")}
                </div>
              )}
              <p className="font-extrabold leading-tight text-slate-900 uppercase">
                {settings?.companyName ? settings.companyName : "YARDFLOW MANAGER"}
              </p>
              {settings?.terminalName && (
                <p className="mt-0.5 text-[10px] text-slate-500 uppercase font-bold">
                  {settings.terminalName}
                </p>
              )}
              {settings?.companyAddress && (
                <p className="mt-1 text-[9px] text-slate-400 whitespace-pre-line">
                  {settings.companyAddress}
                </p>
              )}
              {settings?.companyContact && (
                <p className="mt-0.5 text-[9px] text-slate-400">
                  Contact: {settings.companyContact}
                </p>
              )}
              {settings?.companyGst && (
                <p className="mb-4 mt-0.5 text-[9px] text-slate-400 font-bold">
                  GST: {settings.companyGst}
                </p>
              )}
              {!settings?.companyGst && <div className="mb-4" />}
              <div className="my-3 border-t border-dashed border-slate-200" />
              <div className="mb-4 flex flex-col gap-1.5 text-left text-xs">
                <TokenRow k="WORK ORDER NO:" v={boe || lastLoaded?.boe || "—"} />
                <TokenRow
                  k="VEHICLE NO:"
                  v={
                    (matchedTicket?.createdSource === "billing" || lastLoaded?.createdSource === "billing")
                      ? "N/A"
                      : (matchedTicket?.vehicle || lastLoaded?.vehicle || "—")
                  }
                />
                <TokenRow k="CHA / AGENT:" v={agent || lastLoaded?.loadingAgent || lastLoaded?.agent || "—"} />
                <TokenRow
                  k="GATE TOKEN NO:"
                  v={
                    (matchedTicket?.createdSource === "billing" || lastLoaded?.createdSource === "billing")
                      ? "N/A"
                      : (gateToken || (lastLoaded?.manualGateToken || (lastLoaded ? `G-${String(lastLoaded.serial).padStart(3, "0")}` : "—")))
                  }
                />
                <TokenRow k="BILLING TOKEN:" v={billingToken || (lastLoaded?.manualBillingToken || (lastLoaded ? `B-${String((lastLoaded.billingSerial ?? lastLoaded.serial)).padStart(3, "0")}` : "—"))} />
                <TokenRow
                  k="LOADING TIME:"
                  v={boe ? fmtTime(new Date().toISOString()) : (lastLoaded?.loadingEnd ? fmtTime(lastLoaded.loadingEnd) : "—")}
                />
              </div>
              
              {/* Scannable QR Code for Exit Gate Scan */}
              {(matchedTicket || lastLoaded) && (
                <div className="mt-4 flex flex-col items-center justify-center border-t border-slate-100 pt-4">
                  {/* Encode the ticket id — that's what the printed pass encodes and
                      what the exit scanner looks up. Encoding the vehicle here made the
                      preview disagree with the real pass. */}
                  <QrCode value={matchedTicket?.id || lastLoaded?.id || ""} size={112} className="border border-slate-200 p-1" />
                  <p className="mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    Exit Gate Scan Code
                  </p>
                </div>
              )}

              <p className="mt-4 text-[10px] font-extrabold tracking-[0.05em] text-slate-400">
                VALID FOR TODAY ONLY
              </p>
            </div>
            <button
              onClick={() => {
                if (boe.trim()) {
                  handleConfirmClick();
                } else if (lastLoaded) {
                  printLoadingToken(lastLoaded);
                }
              }}
              disabled={!boe.trim() && !lastLoaded}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
            >
              <Printer size={16} /> {boe.trim() ? "Approve & Print Pass" : "Reprint Last Pass"}
            </button>
          </Panel>
        </div>
      </div>

      {/* Recently Loaded - Full Landscape Row */}
      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-[13px] font-bold text-slate-700 dark:text-slate-200">
            <ClipboardCheck size={16} className="text-slate-500" />
            RECENTLY LOADED
          </span>
          <button
            onClick={() => setLoadedExpanded(!loadedExpanded)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer active:scale-95 transition-all"
          >
            {loadedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        <motion.div layout>
          <AnimatePresence initial={false}>
            {recentDone.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-slate-400 py-4 text-center"
              >
                Nothing loaded yet.
              </motion.p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {(loadedExpanded ? recentDone : recentDone.slice(0, 5)).map((t) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3 text-xs transition-colors hover:border-slate-350 shadow-sm"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-extrabold text-[12px] text-slate-800 dark:text-slate-100">{t.boe}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">SN L-{String(t.loadingSerial ?? t.serial).padStart(3, "0")}</span>
                      <span className="text-[9px] text-slate-400 font-medium truncate max-w-[120px]">{t.loadingAgent || t.agent}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] font-extrabold text-slate-500">
                        {t.loadingEnd ? fmtTime(t.loadingEnd) : ""}
                      </span>
                      <button
                        onClick={() => printLoadingToken(t)}
                        className="flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                      >
                        <Printer size={9} /> PRINT
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function TokenRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between font-bold">
      <span className="text-slate-400">{k}</span>
      <span className="text-slate-800">{v}</span>
    </div>
  );
}
