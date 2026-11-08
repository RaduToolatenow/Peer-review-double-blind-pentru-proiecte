import { FormEvent, useState } from 'react';
import { login, User } from './api';

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onLogin(await login(email, password));
    } catch (failure) {
      setError((failure as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="center">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <p className="brand">Peer review</p>
        <h1>Autentificare</h1>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
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
        {error && (
          <p className="error" role="alert">
            ! {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Se verifică…' : 'Intră în cont'}
        </button>
      </form>
    </main>
  );
}
