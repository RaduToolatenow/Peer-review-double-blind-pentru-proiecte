import { ReactNode, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { logout, User } from './api';

/** DS-pr-menu: the professor and admin menu (D-015). NavLink marks the current page with aria-current. */
export function Layout({ user, onLogout }: { user: User; onLogout: () => void }) {
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

  const staff = user.role !== 'STUDENT';
  return (
    <div className="page">
      <header className="header">
        <p className="brand">Peer review</p>
        <button className="secondary" type="button" onClick={handleLogout} disabled={leaving}>
          Deconectare
        </button>
      </header>
      {staff && (
        <nav className="nav" aria-label="Meniu">
          <NavLink to="/grile-active">Grile active</NavLink>
          <NavLink to="/schite">Schițe de grile</NavLink>
          <NavLink to="/clase">Clase profesor</NavLink>
          {user.role === 'ADMIN' && <NavLink to="/profesori">Profesori</NavLink>}
        </nav>
      )}
      <main>
        {error && <ErrorText message={error} />}
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <p className="error" role="alert">
      ! {message}
    </p>
  );
}

export function Loading() {
  return <p role="status">Se încarcă…</p>;
}

/** Shows loading or the error, otherwise the content once the data is there. */
export function Loaded<T>({
  state,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean };
  children: (data: T) => ReactNode;
}) {
  if (state.error && !state.data) return <ErrorText message={state.error} />;
  if (state.loading && !state.data) return <Loading />;
  return <>{state.data !== null && children(state.data)}</>;
}
