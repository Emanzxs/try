// ── NORECO I ElectService — Supabase Configuration ──────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(
  'https://qwlhjstscnxrlzjriqgl.supabase.co',
  'sb_publishable_s5EVPcnFOG9urr6s3tRBzQ_vIZBrfCk'
);

/**
 * Upload a file to Supabase Storage
 * @param {File}   file    - The file object to upload
 * @param {string} folder  - Folder path inside the bucket e.g. 'reports/REQ-2026-1234'
 * @returns {string}       - Public URL of the uploaded file
 */
export async function uploadFile(file, folder) {
  const ext      = file.name.split('.').pop();
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from('applications')
    .upload(filename, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage
    .from('applications')
    .getPublicUrl(filename);

  return data.publicUrl;
}