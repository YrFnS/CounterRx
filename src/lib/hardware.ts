/**
 * Phase E — Hardware (browser-native) via Web Serial.
 *
 * Pure ESC/POS builders live at module top so they are unit-testable without a
 * real serial device. The I/O functions are feature-flagged: when org setting
 * `hardwareEnabled` is false they no-op / throw a typed "disabled" error instead
 * of touching any serial port. Web Serial types are declared locally because no
 * @types/w3c-web-serial is installed (ponytail: avoid an extra dep for 3 shapes).
 */

export class HardwareError extends Error {
  constructor(message: string, public code: "disabled" | "unavailable" | "no-port" | "io" = "io") {
    super(message);
    this.name = "HardwareError";
  }
}

/* ------------------------------------------------------------------ */
/*  Minimal Web Serial typings (no @types/w3c-web-serial dependency)    */
/* ------------------------------------------------------------------ */
interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
  bufferSize?: number;
}
interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
}
interface Serial {
  requestPort(): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}
declare global {
  interface Navigator {
    serial?: Serial;
  }
}

/* ------------------------------------------------------------------ */
/*  Pure ESC/POS builders — byte arrays only, no side effects          */
/* ------------------------------------------------------------------ */

const ESC = 0x1b;
const GS = 0x1d;

/** ESC/POS text line ending in LF (0x0a). */
export function line(text: string): Uint8Array {
  const out = encode(text);
  const buf = new Uint8Array(out.length + 1);
  buf.set(out);
  buf[out.length] = 0x0a;
  return buf;
}

/** Center / right / left text alignment. */
export function align(mode: "left" | "center" | "right"): Uint8Array {
  const a = mode === "center" ? 1 : mode === "right" ? 2 : 0;
  return new Uint8Array([ESC, 0x61, a]);
}

/** Bold on/off (ESC E). */
export function bold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

/** Double-height + double-width text (ESC !). */
export function size(large: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x21, large ? 0x11 : 0x00]);
}

/** Cut paper (full cut). */
export function cut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x00]);
}

/** Feed `n` lines. */
export function feed(n = 1): Uint8Array {
  return new Uint8Array([ESC, 0x64, n]);
}

/** Cash-drawer kick: ESC p 0 0x00 0x00 (pulse pin-2, ~50ms). */
export function cashDrawerKick(): Uint8Array {
  return new Uint8Array([ESC, 0x70, 0x00, 0x00, 0x00]);
}

/** Barcode (CODE128) + human-readable text label. */
export function barcode128(data: string): Uint8Array {
  const payload = `{B${data}`; // CODE128 mode B
  const bytes = encode(payload);
  const len = bytes.length;
  const header = new Uint8Array([GS, 0x6b, 0x49, len]); // GS k, CODE128, length
  const out = new Uint8Array(header.length + len);
  out.set(header);
  out.set(bytes, header.length);
  return out;
}

export interface LabelInput {
  title?: string;
  barcode: string;
  subtitle?: string;
}

/** A label = optional title + scannable barcode + optional subtitle. */
export function label(input: LabelInput): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(align("center"));
  if (input.title) {
    parts.push(bold(true));
    parts.push(size(false));
    parts.push(line(input.title));
    parts.push(bold(false));
  }
  parts.push(barcode128(input.barcode));
  parts.push(line(input.barcode)); // human-readable value under the bars
  if (input.subtitle) parts.push(line(input.subtitle));
  parts.push(align("left"));
  parts.push(feed(1));
  return concat(parts);
}

/** Build full receipt byte stream from settings + lines. */
export interface ReceiptInput {
  header: string[];          // store name, branch, address, phone, license
  lines: string[];           // body lines (items / totals already formatted)
  footer?: string;           // footer message
  cutPaper?: boolean;
}

export function buildReceipt(input: ReceiptInput): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(align("center"));
  for (const h of input.header) {
    parts.push(size(true));
    parts.push(bold(true));
    parts.push(line(h));
  }
  parts.push(size(false));
  parts.push(bold(false));
  parts.push(align("left"));
  parts.push(line("--------------------------------"));
  for (const l of input.lines) parts.push(line(l));
  if (input.footer) {
    parts.push(line("--------------------------------"));
    parts.push(align("center"));
    parts.push(line(input.footer));
    parts.push(align("left"));
  }
  parts.push(feed(3));
  if (input.cutPaper !== false) parts.push(cut());
  return concat(parts);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Flagged I/O layer — all serial access goes through here            */
/* ------------------------------------------------------------------ */

let connectedPort: SerialPort | null = null;

function serialAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.serial;
}

function assertEnabled(enabled: boolean): void {
  if (!enabled) throw new HardwareError("Hardware is disabled in organization settings", "disabled");
}

async function getPort(enabled: boolean): Promise<SerialPort> {
  assertEnabled(enabled);
  if (!serialAvailable()) throw new HardwareError("Web Serial is not available in this browser", "unavailable");
  if (!connectedPort) {
    connectedPort = await navigator.serial!.requestPort();
    if (!connectedPort) throw new HardwareError("No serial device was selected", "no-port");
  }
  if (!connectedPort.readable) await connectedPort.open({ baudRate: 9600 });
  return connectedPort;
}

async function writeBytes(bytes: Uint8Array, enabled: boolean): Promise<void> {
  const port = await getPort(enabled);
  if (!port.writable) throw new HardwareError("Serial port has no writable stream", "io");
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } catch (e) {
    throw new HardwareError(`Serial write failed: ${(e as Error).message}`, "io");
  } finally {
    writer.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Connect (and cache) the chosen serial port. Throws if disabled/unavailable. */
export async function connectPrinter(enabled: boolean): Promise<void> {
  await getPort(enabled);
}

/** Print a receipt. No-ops safely only when flag is off (throws a disabled error). */
export async function printReceipt(input: ReceiptInput, enabled: boolean): Promise<void> {
  await writeBytes(buildReceipt(input), enabled);
}

/** Pulse the connected cash drawer. */
export async function kickDrawer(enabled: boolean): Promise<void> {
  await writeBytes(cashDrawerKick(), enabled);
}

/** Print a barcode label. */
export async function printLabel(input: LabelInput, enabled: boolean): Promise<void> {
  await writeBytes(label(input), enabled);
}
