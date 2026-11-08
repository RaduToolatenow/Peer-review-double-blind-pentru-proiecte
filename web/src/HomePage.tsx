import { useState } from 'react';
import { logout, Role, User } from './api';

const ROLE_LABELS: Record<Role, string> = { STUDENT: 'student', PROFESSOR: 'profesor', ADMIN: 'admin' };

export function HomePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function handleLogout() {
    setError(null);
    setLeaving(true);
    try {
      await logout();
      onLogout();
    } catch (failure) {
      setError((failure as Error).message);
      setLeaving(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <p className="brand">Peer review</p>
        <button className="secondary" type="button" onClick={handleLogout} disabled={leaving}>
          Deconectare
        </button>
      </header>
      <main>
        {error && (
          <p className="error" role="alert">
            ! {error}
          </p>
        )}
        <h1>Bun venit, {user.fullName}</h1>
        <p>Rol: {ROLE_LABELS[user.role]}</p>
        <p className="muted">Temele vor apărea aici după ce sunt create.</p>
      </main>
    </div>
  );
}
