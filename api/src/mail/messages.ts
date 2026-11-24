import { Email } from './mailer';

const SIGNATURE = '\n\nPeer review · evaluare între colegi\nDacă nu tu ai cerut acest email, îl poți ignora.';

export function confirmEmail(to: string, link: string): Email {
  return {
    to,
    subject: 'Confirmă-ți contul Peer review',
    text: `Bună,\n\nCa să-ți activezi contul, deschide linkul de mai jos în cel mult 24 de ore:\n\n${link}${SIGNATURE}`,
  };
}

export function accountExistsEmail(to: string, link: string): Email {
  return {
    to,
    subject: 'Ai deja un cont Peer review',
    text: `Bună,\n\nAi deja un cont confirmat cu această adresă. Dacă nu-ți mai amintești parola, o poți schimba aici:\n\n${link}${SIGNATURE}`,
  };
}

export function resetPasswordEmail(to: string, link: string): Email {
  return {
    to,
    subject: 'Schimbă parola contului Peer review',
    text: `Bună,\n\nCa să-ți alegi o parolă nouă, deschide linkul de mai jos în cel mult o oră:\n\n${link}${SIGNATURE}`,
  };
}

const display = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const reviews = (n: number) => (n === 1 ? '1 proiect' : `${n} proiecte`);
const unsent = (n: number) => (n === 1 ? '1 evaluare netrimisă' : `${n} evaluări netrimise`);

/** What a notification needs to be told; counts are taken when it is shown (D-024). */
export interface NotificationContext {
  kind: 'REVIEWS_ALLOCATED' | 'REVIEW_REMINDER' | 'SUBMISSION_REMINDER';
  assignmentTitle: string;
  submissionDeadline: Date;
  reviewDeadline: Date;
  reviewCount: number;
  unsentCount: number;
}

/** The title and text of a notification, the same in the app and in the email. Never a team or a name (D-014). */
export function notificationMessage(n: NotificationContext): { title: string; text: string } {
  const title = `„${n.assignmentTitle}”`;
  switch (n.kind) {
    case 'REVIEWS_ALLOCATED':
      return {
        title: 'Ai proiecte de evaluat',
        text: `La ${title} ai primit ${reviews(n.reviewCount)} de evaluat, până pe ${display.format(n.reviewDeadline)}.`,
      };
    case 'REVIEW_REMINDER':
      return {
        title: 'Mai ai evaluări de trimis',
        text: `Termenul de evaluare la ${title} e pe ${display.format(n.reviewDeadline)}. Mai ai ${unsent(n.unsentCount)}.`,
      };
    case 'SUBMISSION_REMINDER':
      return {
        title: 'Predarea se închide mâine',
        text: `Echipa ta nu a predat încă la ${title}. Termenul de predare e pe ${display.format(n.submissionDeadline)}.`,
      };
  }
}

export function notificationEmail(to: string, message: { title: string; text: string }, link: string): Email {
  return {
    to,
    subject: message.title,
    text: `Bună,\n\n${message.text}\n\nVezi tema: ${link}\n\nPeer review · evaluare între colegi\nPrimești acest email pentru că ești student la această temă.`,
  };
}
