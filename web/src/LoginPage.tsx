import { FormEvent, useState } from 'react';
import { login, User } from './api';
import { Brand } from './Brand';

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
    <main className="login">
      <section className="hero">
        <Brand />
        <h1>
          Evaluare între colegi,
          <br />
          <span className="gradient-text">anonimă în ambele sensuri.</span>
        </h1>
        <p className="lead">
          Profesorul definește grila, aplicația împarte proiectele, iar fiecare notă vine cu feedback pe criterii.
        </p>
        <ul className="points">
          <li>Nu vezi al cui e proiectul, iar autorul nu vede cine l-a evaluat.</li>
          <li>Numele autorului dispare automat din fișierele PDF și DOCX.</li>
          <li>Termenele de predare și de evaluare sunt verificate de server.</li>
        </ul>
      </section>
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
