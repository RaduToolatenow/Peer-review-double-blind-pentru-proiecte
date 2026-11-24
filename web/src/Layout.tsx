import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { api, logout, User } from './api';
import { Brand } from './Brand';

/**
 * DS-pr-menu: the professor and admin menu (D-015), and the student's, with the unread
 * notifications (D-024). NavLink marks the current page with aria-current.
 */
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
  const unread = useUnread(!staff);
  return (
    <div className="page">
      <header className="header">
        <Brand />
        {staff && (
          <nav className="nav" aria-label="Meniu">
            <NavLink to="/grile-active">Grile active</NavLink>
            <NavLink to="/schite">Schițe de grile</NavLink>
            <NavLink to="/clase">Clase profesor</NavLink>
            {user.role === 'ADMIN' && <NavLink to="/profesori">Profesori</NavLink>}
          </nav>
        )}
        {!staff && (
          <nav className="nav" aria-label="Meniu">
            <NavLink to="/" end>
              Temele mele
            </NavLink>
            <NavLink to="/notificari">{unread > 0 ? `Notificări (${unread})` : 'Notificări'}</NavLink>
          </nav>
        )}
        <button className="secondary" type="button" onClick={handleLogout} disabled={leaving}>
          Deconectare
        </button>
      </header>
      <main>
        {error && <ErrorText message={error} />}
        <Outlet />
      </main>
    </div>
  );
}

/** A student's unread notifications, counted again on every page change. A failure shows no count. */
function useUnread(enabled: boolean): number {
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    api
      .notifications()
      .then((data) => current && setUnread(data.unread))
      .catch(() => current && setUnread(0));
    return () => {
      current = false;
    };
  }, [enabled, pathname]);
  return unread;
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
