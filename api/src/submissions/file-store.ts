import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireEnv } from '../env';

/** Where cleaned submission files live (D-016). */
export interface FileStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export const FILE_STORE = Symbol('FILE_STORE');

/** A folder on disk, for development and tests. Render wipes its disk, so never in production. */
export class LocalFileStore implements FileStore {
  constructor(private readonly dir: string) {}

  async put(key: string, data: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.dir, key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.dir, key), { force: true });
  }
}

/** A private Supabase Storage bucket, through its REST API with the server key. */
export class SupabaseFileStore implements FileStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    // A new secret key (sb_secret_...) goes only in apikey; a legacy service_role JWT also as Bearer.
    const auth = this.serviceKey.startsWith('sb_') ? {} : { Authorization: `Bearer ${this.serviceKey}` };
    return { apikey: this.serviceKey, ...auth, ...extra };
  }

  private objectUrl(key: string): string {
    return `${this.url}/storage/v1/object/${this.bucket}/${encodeURIComponent(key)}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await fetch(this.objectUrl(key), {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      // The status only: the body may echo request details.
      throw new Error(`File store upload failed with status ${response.status}`);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await fetch(
      `${this.url}/storage/v1/object/authenticated/${this.bucket}/${encodeURIComponent(key)}`,
      { headers: this.headers() },
    );
    if (response.status === 400 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`File store download failed with status ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(this.objectUrl(key), { method: 'DELETE', headers: this.headers() });
    if (!response.ok && response.status !== 404 && response.status !== 400) {
      throw new Error(`File store delete failed with status ${response.status}`);
    }
  }
}

/** FILE_STORE=supabase in production (required there), local otherwise. */
export function createFileStore(): FileStore {
  const kind = process.env.FILE_STORE ?? 'local';
  if (process.env.NODE_ENV === 'production' && kind !== 'supabase') {
    throw new Error('FILE_STORE must be supabase in production. See .env.example.');
  }
  if (kind === 'supabase') {
    return new SupabaseFileStore(
      requireEnv('SUPABASE_URL').replace(/\/$/, ''),
      requireEnv('SUPABASE_SERVICE_KEY'),
      process.env.SUPABASE_BUCKET ?? 'submissions',
    );
  }
  return new LocalFileStore(process.env.FILE_STORE_DIR ?? join(__dirname, '../../../uploads'));
}
