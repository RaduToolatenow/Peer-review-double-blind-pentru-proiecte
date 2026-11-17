import { Link } from 'react-router';
import { User } from './api';

/** DS-pr-home: the student's start page. */
export function HomePage({ user }: { user: User }) {
  return (
    <>
      <h1>Bun venit, {user.fullName}</h1>
      <p>
        <Link to="/echipa">Intră în echipa ta cu codul primit de la profesor</Link>
      </p>
      <p className="muted">Grilele pe care le ai de completat vor apărea aici.</p>
    </>
  );
}
