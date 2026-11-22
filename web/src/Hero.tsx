import { ReactNode } from 'react';
import { Brand } from './Brand';

/** The two-column frame of the login and sign-up pages (DS-pr-login, DS-pr-register). */
export function HeroFrame({ children }: { children: ReactNode }) {
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
      {children}
    </main>
  );
}

/** The centred frame of the other account pages (DS-pr-check-email, DS-pr-verify, ...). */
export function CenteredFrame({ children }: { children: ReactNode }) {
  return (
    <main className="center">
      <div className="stack">
        <Brand />
        {children}
      </div>
    </main>
  );
}
