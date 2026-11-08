export type Role = 'STUDENT' | 'PROFESSOR' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

const NETWORK_ERROR = 'Nu am putut contacta serverul. Încearcă din nou.';

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, init);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

/** Returns the signed-in user, or null when there is no session. */
export async function fetchCurrentUser(): Promise<User | null> {
  const response = await call('/auth/me');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(NETWORK_ERROR);
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<User> {
  const response = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
    throw new Error(typeof message === 'string' ? message : NETWORK_ERROR);
  }
  return response.json();
}

export async function logout(): Promise<void> {
  const response = await call('/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) {
    throw new Error(NETWORK_ERROR);
  }
}
