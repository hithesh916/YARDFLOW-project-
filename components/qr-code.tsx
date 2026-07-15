"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** Renders a real, scannable QR code to a canvas from `value`. */
export function QrCode({
  value,
  size = 112,
  className,
  dark = "#0f172a",
  light = "#ffffff",
}: {
  value: string;
  size?: number;
  className?: string;
  dark?: string;
  light?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !value) return;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      color: { dark, light },
    }).catch(() => {});
  }, [value, size, dark, light]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={cn("rounded", className)}
      style={{ width: size, height: size }}
    />
  );
}
