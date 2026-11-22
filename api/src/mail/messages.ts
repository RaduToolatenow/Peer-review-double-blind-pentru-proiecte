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
