import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { ErrorText } from '../Layout';

/** DS-pr-join-team: a student enters the code the professor handed out (D-012). */
export function JoinTeamPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ className: string; teamName: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function join(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      setJoined(await api.joinTeam(code));
      setCode('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="card centered" onSubmit={join} noValidate>
      <h1>Intră în echipa ta</h1>
      <p className="muted">Introdu codul primit de la profesor. Îl folosești o singură dată pentru fiecare clasă.</p>
      {joined && (
        <p role="status">
          Ai intrat în <strong>{joined.teamName}</strong>, clasa {joined.className}.
        </p>
      )}
      <div className="field">
        <label htmlFor="code">Codul echipei</label>
        <input
          id="code"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ex. K7P-4QX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      {error && <ErrorText message={error} />}
      <button className="primary" type="submit" disabled={sending}>
        Intră în echipă
      </button>
      <p className="muted after">Profesorul vede doar câte persoane au intrat în echipă, nu cine.</p>
      <p>
        <Link to="/">← Temele mele</Link>
      </p>
    </form>
  );
}
