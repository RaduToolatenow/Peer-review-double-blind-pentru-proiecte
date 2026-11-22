import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { account, ApiError, login, User } from './api';
import { HeroFrame } from './Hero';

/** DS-pr-login. After login the page in `?next=` opens, such as an assignment link. */
export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnconfirmed(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const next = params.get('next');
      // Only paths inside the app, never another site.
      if (next?.startsWith('/') && !next.startsWith('//')) {
        window.history.replaceState(null, '', next);
      }
      onLogin(user);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) {
        setUnconfirmed(failure.message);
      } else {
        setError((failure as Error).message);
      }
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      setNotice((await account.resendVerification(email)).message);
      setUnconfirmed(null);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <HeroFrame>
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Autentificare</h1>
        <p className="muted">Intră cu emailul de la universitate.</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="prenume.nume@ulbsibiu.ro"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Parolă</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {unconfirmed && (
          <div className="notice" role="alert">
            <p>
              <strong>{unconfirmed}</strong>
            </p>
            <button className="secondary" type="button" onClick={() => void resend()}>
              Retrimite emailul de confirmare
            </button>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            ! {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Se verifică…' : 'Intră în cont'}
        </button>
        <p className="links">
          <Link to="/am-uitat-parola">Am uitat parola</Link> · <Link to="/inscriere">Creează cont</Link>
        </p>
      </form>
    </HeroFrame>
  );
}
