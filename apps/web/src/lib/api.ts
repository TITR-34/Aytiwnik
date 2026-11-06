import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Xəta baş verdi');
  return json as T;
}

/** Shrinks a photo to max 1600px JPEG so uploads stay small. Returns raw base64 (no prefix). */
export async function compressImage(file: File): Promise<{ mime: 'image/jpeg'; data: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: url.split(',')[1], preview: url };
}
