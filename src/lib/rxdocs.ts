/* Hard-copy prescription scan upload to Supabase Storage (Phase C, §7).
 *
 * The Prescriptions.tsx ScanViewer currently stores resized data-URLs in the
 * local prescription record. This helper uploads a scan to the `rx-docs`
 * storage bucket (migration 0010) and returns the public path so the
 * prescription's `scan` field can be swapped from a data-URL to a storage path.
 *
 * Upload is opportunistic: if the backend isn't configured or the upload fails,
 * the existing data-URL is retained (the app stays usable offline).
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "rx-docs";
const MAX_BYTES = 512 * 1024;               // cap at ~500KB — 480px resize keeps us under this

/** Client-side image resize → JPEG data-URL so hard-copy scans stay small enough for local storage.
 *  Reused by Prescriptions (Rx hard-copy) and Customers (insurance card). */
export function resizeToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode")); };
    img.src = url;
  });
}

/** Convert a data-URL to a Blob. Returns null on parse failure. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return null;
  const [, mime, b64] = m;
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Upload a scan for a prescription. Returns the storage path on success,
 *  or null on failure (caller keeps the local data-URL). */
export async function uploadRxScan(
  rxId: string,
  dataUrl: string,
  patientName: string,
  client: SupabaseClient = supabase,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob || blob.size > MAX_BYTES) return null;

  /* sanitize patient name into a safe filename segment */
  const safe = patientName.replace(/[^a-z0-9]/gi, "_").slice(0, 32) || "patient";
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const dest = `orgs/local/${safe}/${rxId}_${Date.now()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(dest, blob, {
    cacheControl: "3600",
    upsert: false,
  });

  return error ? null : dest;
}

/** Resolve a scan reference to a usable URL. Storage paths resolve to a public
 *  signed GET; data-URLs pass through unchanged. */
export function resolveScanUrl(scan: string | undefined, client: SupabaseClient = supabase): string | undefined {
  if (!scan) return undefined;
  if (scan.startsWith("data:")) return scan;              // local data-URL
  if (!isSupabaseConfigured) return scan;                 // offline — return path as-is
  const { data } = client.storage.from(BUCKET).getPublicUrl(scan);
  return data?.publicUrl;
}

/** Delete a previously-uploaded scan. Used when the hard-copy is replaced. */
export async function deleteRxScan(path: string, client: SupabaseClient = supabase): Promise<boolean> {
  if (!isSupabaseConfigured || path.startsWith("data:")) return true;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  return !error;
}
