import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { account } from '../api';
import { CenteredFrame, HeroFrame } from '../Hero';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

/** Runs a form action and keeps its error and busy state. */
function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

/** DS-pr-register, with or without an assignment link (/inscriere/:code). */
export function RegisterPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const assignment = useLoad(async () => (code ? account.joinInfo(code) : null), [code]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, run } = useAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await account.register(email, password, code);
      navigate('/verifica-emailul', { state: { email: email.trim().toLowerCase() } });
    });
  }

  return (
    <HeroFrame>
      <form className="card" onSubmit={submit} noValidate>
        {code && assignment.error && <ErrorText message={assignment.error} />}
        {assignment.data && (
          <p>
            <span className="badge accent">Tema: {assignment.data.assignmentTitle}</span>
          </p>
        )}
        <h1>Creează cont</h1>
        <p className="muted">
          {code
            ? 'Cu linkul temei devii evaluator la ea, după ce îți confirmi emailul.'
            : 'Cu emailul de la universitate. Profesorul îți dă linkul temei sau codul echipei.'}
        </p>
        <div className="field">
          <label htmlFor="email">Emailul de la universitate</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="prenume.nume@ulbsibiu.ro"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Parolă</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordHint id="password-hint" />
        </div>
        <p className="muted">Nu îți cerem numele: nimeni nu vede cine evaluează.</p>
        {error && <ErrorText message={error} />}
        <button className="primary" type="submit" disabled={busy || (Boolean(code) && !assignment.data)}>
          Creează contul
        </button>
        <p className="links">
          Ai deja cont?{' '}
          <Link to={code ? `/autentificare?next=${encodeURIComponent(`/inscriere/${code}`)}` : '/autentificare'}>
            Intră în cont
          </Link>
        </p>
      </form>
    </HeroFrame>
  );
}

/** DS-pr-check-email: shown after sign-up. */
export function CheckEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? '';
  const [notice, setNotice] = useState<string | null>(null);
  const { error, busy, run } = useAction();

  return (
    <CenteredFrame>
      <div className="card">
        <h1>Verifică-ți emailul</h1>
        <p>
          Ți-am trimis un email{email && (
            <>
              {' '}la <strong>{email}</strong>
            </>
          )}
          . Deschide linkul din el ca să-ți confirmi contul; e valabil 24 de ore.
        </p>
        <p className="muted">
          Nu l-ai primit? Uită-te și în folderul <strong>Spam</strong> sau Junk, apoi poți cere altul.
        </p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && <ErrorText message={error} />}
        <div className="actions">
          {email && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => void run(async () => setNotice((await account.resendVerification(email)).message))}
            >
              Retrimite emailul
            </button>
          )}
          <Link className="button-link secondary" to="/autentificare">
            Înapoi la autentificare
          </Link>
        </div>
      </div>
    </CenteredFrame>
  );
}

/** DS-pr-verify: opens the link from the confirmation email. */
export function VerifyPage() {
  const { token = '' } = useParams();
  const [result, setResult] = useState<{ ok: boolean; message: string; assignmentTitle?: string | null } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Once only: a token works once, and React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    account
      .verify(token)
      .then((r) => setResult({ ok: true, message: r.message, assignmentTitle: r.assignmentTitle }))
      .catch((failure: Error) => setResult({ ok: false, message: failure.message }));
  }, [token]);

  return (
    <CenteredFrame>
      {!result && <p role="status">Se confirmă contul…</p>}
      {result?.ok && (
        <div className="card">
          <p>
            <span className="badge success">Confirmat</span>
          </p>
          <h1>Contul este confirmat</h1>
          {result.assignmentTitle && (
            <p>
              Ești evaluator la tema <strong>{result.assignmentTitle}</strong>.
            </p>
          )}
          <p>Acum te poți autentifica.</p>
          <Link className="button-link primary" to="/autentificare">
            Intră în cont
          </Link>
        </div>
      )}
      {result && !result.ok && <NewLinkCard />}
    </CenteredFrame>
  );
}

function NewLinkCard() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const { error, busy, run } = useAction();

  return (
    <form
      className="card"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => setNotice((await account.resendVerification(email)).message));
      }}
    >
      <p>
        <span className="badge warning">Link expirat</span>
      </p>
      <h1>Linkul nu mai este valid</h1>
      <p className="muted">A fost deja folosit sau au trecut mai mult de 24 de ore. Cere un email nou.</p>
      <div className="field">
        <label htmlFor="resend-email">Emailul de la universitate</label>
        <input id="resend-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorText message={error} />}
      <button className="primary" type="submit" disabled={busy}>
        Trimite alt link
      </button>
    </form>
  );
}

/** DS-pr-forgot */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const { error, busy, run } = useAction();

  return (
    <CenteredFrame>
      <form
        className="card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => setNotice((await account.forgotPassword(email)).message));
        }}
      >
        <h1>Am uitat parola</h1>
        <p className="muted">Îți trimitem un link pentru o parolă nouă, valabil o oră.</p>
        <div className="field">
          <label htmlFor="email">Emailul de la universitate</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && <ErrorText message={error} />}
        <button className="primary" type="submit" disabled={busy}>
          Trimite linkul
        </button>
        <p className="links">
          <Link to="/autentificare">Înapoi la autentificare</Link>
        </p>
      </form>
    </CenteredFrame>
  );
}

/** DS-pr-reset: opens the link from the password reset email. */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const { error, busy, run } = useAction();

  if (done) {
    return (
      <CenteredFrame>
        <div className="card">
          <p>
            <span className="badge success">Parolă schimbată</span>
          </p>
          <h1>{done}</h1>
          <Link className="button-link primary" to="/autentificare">
            Intră în cont
          </Link>
        </div>
      </CenteredFrame>
    );
  }

  return (
    <CenteredFrame>
      <form
        className="card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setMismatch(password !== repeat);
          if (password !== repeat) return;
          void run(async () => setDone((await account.resetPassword(token, password)).message));
        }}
      >
        <h1>Parolă nouă</h1>
        <p className="muted">După schimbare, contul se deconectează de pe toate dispozitivele.</p>
        <div className="field">
          <label htmlFor="new-password">Parola nouă</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-describedby="new-password-hint"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordHint id="new-password-hint" />
        </div>
        <div className="field">
          <label htmlFor="repeat-password">Repetă parola</label>
          <input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </div>
        {mismatch && <ErrorText message="Parolele nu sunt la fel." />}
        {error && <ErrorText message={error} />}
        <button className="primary" type="submit" disabled={busy}>
          Schimbă parola
        </button>
      </form>
    </CenteredFrame>
  );
}

/** A signed-in student opening an assignment link becomes a reviewer with one button. */
export function JoinAssignmentPage() {
  const { code = '' } = useParams();
  const state = useLoad(() => account.joinInfo(code), [code]);
  const [joined, setJoined] = useState<string | null>(null);
  const { error, busy, run } = useAction();

  return (
    <div className="card centered">
      <Loaded state={state}>
        {(info) => (
          <>
            <p>
              <span className="badge accent">Tema: {info.assignmentTitle}</span>
            </p>
            <h1>{joined ? 'Ești evaluator la această temă' : 'Devino evaluator'}</h1>
            <p className="muted">Clasa: {info.className}. Proiectele de evaluat îți sunt alocate de aplicație.</p>
            {error && <ErrorText message={error} />}
            {joined ? (
              <Link className="button-link primary" to="/">
                Mergi la Temele mele
              </Link>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void run(async () => setJoined((await account.join(code)).assignmentTitle))}
              >
                Devino evaluator
              </button>
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}

/** D-030: the server's rule for a new password, shown before it is sent. */
function PasswordHint({ id }: { id: string }) {
  return (
    <span className="muted" id={id}>
      Minim 10 caractere; nu o parolă des folosită și nu numele din adresa ta.
    </span>
  );
}
