import { useEffect } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { formatShort } from '../dates';
import { Loaded } from '../Layout';
import { useLoad } from '../useLoad';

/**
 * DS-pr-notifications: a student's notifications, newest first (D-024). Opening the page marks
 * them read; the "Nouă" badge still shows which were new on this visit.
 */
export function NotificationsPage() {
  const state = useLoad(() => api.notifications(), []);
  const unread = state.data?.unread ?? 0;

  useEffect(() => {
    if (unread > 0) void api.markNotificationsRead().catch(() => undefined);
  }, [unread]);

  return (
    <>
      <h1>Notificări</h1>
      <Loaded state={state}>
        {({ notifications }) =>
          notifications.length === 0 ? (
            <p className="muted">
              Nu ai notificări. Aici apar proiectele primite de evaluat și amintirile dinaintea termenelor; le primești
              și pe email.
            </p>
          ) : (
            <ol className="list">
              {notifications.map((n) => (
                <li className="item" key={n.id}>
                  <h2>{n.title}</h2>
                  <p>{n.text}</p>
                  {n.read ? (
                    <p className="muted">{formatShort(n.createdAt)}</p>
                  ) : (
                    <p>
                      <span className="badge accent">Nouă</span> <span className="muted">{formatShort(n.createdAt)}</span>
                    </p>
                  )}
                  <p>
                    {n.kind === 'DISPUTE_DECIDED' ? (
                      <Link to={`/rezultate/${n.assignmentId}`}>Vezi rezultatele</Link>
                    ) : (
                      <Link to="/">Vezi tema</Link>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )
        }
      </Loaded>
    </>
  );
}
