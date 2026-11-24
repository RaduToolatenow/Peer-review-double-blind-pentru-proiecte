export type Role = 'STUDENT' | 'PROFESSOR' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export type RubricStatus = 'draft' | 'active' | 'archived';
export type Scope = 'ALL' | 'SELECTED';
export type Phase = 'submission' | 'review' | 'disputes' | 'closed';

export interface LevelInput {
  score: number;
  descriptor: string;
}

export interface CriterionInput {
  title: string;
  weight: number;
  levels: LevelInput[];
}

export interface Rubric {
  id: string;
  title: string;
  status: RubricStatus;
  createdAt: string;
  lockedAt: string | null;
  archivedAt: string | null;
  criteria: StoredCriterion[];
}

export interface StoredCriterion {
  id: string;
  title: string;
  weight: number;
  position: number;
  levels: (LevelInput & { id: string })[];
}

export interface RubricSummary {
  id: string;
  title: string;
  status: RubricStatus;
  criteriaCount: number;
  createdAt: string;
}

export interface Deadlines {
  submissionDeadline: string;
  reviewDeadline: string;
  disputeDeadline: string;
}

export interface AssignmentSummary extends Deadlines {
  id: string;
  title: string;
  description: string | null;
  k: number;
  appliesTo: Scope;
  classId: string;
  className: string;
  rubricId: string;
  rubricTitle: string;
  rubricArchived: boolean;
  evaluatedTeamCount: number;
  reviewsSubmitted: number;
  reviewsExpected: number;
  phase: Phase;
}

export interface AssignmentDetail extends AssignmentSummary {
  rubric: Rubric;
  archivableFrom: string;
  joinUrl: string;
  teams: {
    id: string;
    name: string;
    memberNames: string;
    evaluated: boolean;
    submitted: boolean;
    reviewsReceived: number;
    link: string | null;
    description: string | null;
    fileUrl: string | null;
  }[];
}

export interface Submission {
  id: string;
  link: string;
  description: string | null;
  fileType: 'pdf' | 'docx';
  fileUrl: string;
  submittedAt: string;
  updatedAt: string;
}

export interface MyAssignment extends Deadlines {
  id: string;
  title: string;
  description: string | null;
  className: string;
  /** null for a reviewer only: joined through the assignment link, or in a team not evaluated (D-022, Q-011). */
  teamName: string | null;
  phase: Phase;
  submission: Submission | null;
  withdrawn: boolean;
  canWithdraw: boolean;
  /** My reviews for this assignment, numbered; never the team (D-023). */
  reviews: { id: string; number: number; status: ReviewStatus }[];
}

export type ReviewStatus = 'ALLOCATED' | 'SUBMITTED';

/** A notification as the server tells it; never a team or a colleague (D-024). */
export interface AppNotification {
  id: string;
  kind: 'REVIEWS_ALLOCATED' | 'REVIEW_REMINDER' | 'SUBMISSION_REMINDER';
  assignmentId: string;
  title: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface ScoreInput {
  criterionId: string;
  levelId: string;
  feedback: string;
}

/** One review as its reviewer sees it: the submission and the rubric, never the team (D-023). */
export interface MyReview {
  id: string;
  number: number;
  assignmentTitle: string;
  reviewDeadline: string;
  status: ReviewStatus;
  submittedAt: string | null;
  canSend: boolean;
  submission: Submission;
  criteria: StoredCriterion[];
  scores: ScoreInput[];
}

export interface ClassSummary {
  id: string;
  name: string;
  teamCount: number;
  assignmentCount: number;
}

export interface Team {
  id: string;
  name: string;
  memberNames: string;
  joinCode: string;
  joinedCount: number;
}

export interface ClassDetail {
  id: string;
  name: string;
  assignmentCount: number;
  teams: Team[];
}

export interface Professor {
  id: string;
  fullName: string;
  email: string;
  draftCount: number;
  activeCount: number;
}

export interface SendRubricInput extends Deadlines {
  classId: string;
  title: string;
  k: number;
  appliesTo: Scope;
  teamIds: string[];
}

const NETWORK_ERROR = 'Nu am putut contacta serverul. Încearcă din nou.';

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, init);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

/** Throws the server's Romanian message when there is one. */
/** An error from the API, with its HTTP status so a page can react to it (403: unconfirmed). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function failure(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return new ApiError(typeof message === 'string' ? message : NETWORK_ERROR, response.status);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await call(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

/** Returns the signed-in user, or null when there is no session. */
export async function fetchCurrentUser(): Promise<User | null> {
  const response = await call('/auth/me');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(NETWORK_ERROR);
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<User> {
  const response = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  return response.json();
}

export async function logout(): Promise<void> {
  const response = await call('/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) {
    throw new Error(NETWORK_ERROR);
  }
}

/** Uploads a team's link, description and file (D-016); multipart, so not through request(). */
export async function submitProject(assignmentId: string, link: string, description: string, file: File): Promise<MyAssignment> {
  const form = new FormData();
  form.append('link', link);
  form.append('description', description);
  form.append('file', file);
  const response = await call(`/my/assignments/${assignmentId}/submission`, { method: 'PUT', body: form });
  if (!response.ok) {
    throw await failure(response);
  }
  return response.json();
}

export const account = {
  register: (email: string, password: string, joinCode?: string) =>
    request<{ message: string }>('POST', '/auth/register', { email, password, joinCode }),
  verify: (token: string) => request<{ message: string; assignmentTitle: string | null }>('POST', '/auth/verify', { token }),
  resendVerification: (email: string) => request<{ message: string }>('POST', '/auth/resend-verification', { email }),
  forgotPassword: (email: string) => request<{ message: string }>('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('POST', '/auth/reset-password', { token, password }),
  joinInfo: (code: string) => request<{ assignmentTitle: string; className: string }>('GET', `/join/${code}`),
  join: (code: string) => request<{ assignmentTitle: string }>('POST', `/join/${code}`),
};

export const api = {
  myAssignments: () => request<MyAssignment[]>('GET', '/my/assignments'),
  withdraw: (assignmentId: string) => request<{ withdrawn: true }>('POST', `/my/assignments/${assignmentId}/withdraw`),
  review: (id: string) => request<MyReview>('GET', `/my/reviews/${id}`),
  sendReview: (id: string, scores: ScoreInput[]) => request<MyReview>('POST', `/my/reviews/${id}`, { scores }),
  notifications: () => request<{ unread: number; notifications: AppNotification[] }>('GET', '/my/notifications'),
  markNotificationsRead: () => request<void>('POST', '/my/notifications/read'),
  drafts: () => request<RubricSummary[]>('GET', '/rubrics'),
  rubric: (id: string) => request<Rubric>('GET', `/rubrics/${id}`),
  createRubric: (title: string, criteria: CriterionInput[]) => request<Rubric>('POST', '/rubrics', { title, criteria }),
  saveRubric: (id: string, title: string, criteria: CriterionInput[]) =>
    request<Rubric>('PUT', `/rubrics/${id}`, { title, criteria }),
  deleteRubric: (id: string) => request<void>('DELETE', `/rubrics/${id}`),
  copyRubric: (id: string) => request<Rubric>('POST', `/rubrics/${id}/copy`),
  archiveRubric: (id: string) => request<Rubric>('POST', `/rubrics/${id}/archive`),
  sendRubric: (id: string, input: SendRubricInput) => request<AssignmentDetail>('POST', `/rubrics/${id}/send`, input),

  assignments: (archived: boolean) => request<AssignmentSummary[]>('GET', `/assignments${archived ? '?archived=true' : ''}`),
  assignment: (id: string) => request<AssignmentDetail>('GET', `/assignments/${id}`),
  updateAssignment: (id: string, changes: Partial<Deadlines>) =>
    request<AssignmentDetail>('PATCH', `/assignments/${id}`, changes),

  classes: () => request<ClassSummary[]>('GET', '/classes'),
  klass: (id: string) => request<ClassDetail>('GET', `/classes/${id}`),
  createClass: (name: string) => request<ClassDetail>('POST', '/classes', { name }),
  renameClass: (id: string, name: string) => request<ClassDetail>('PATCH', `/classes/${id}`, { name }),
  deleteClass: (id: string) => request<void>('DELETE', `/classes/${id}`),
  addTeam: (classId: string, name: string, memberNames: string) =>
    request<Team>('POST', `/classes/${classId}/teams`, { name, memberNames }),
  updateTeam: (id: string, name: string, memberNames: string) =>
    request<Team>('PATCH', `/teams/${id}`, { name, memberNames }),
  deleteTeam: (id: string) => request<void>('DELETE', `/teams/${id}`),
  newTeamCode: (id: string) => request<Team>('POST', `/teams/${id}/code`),
  joinTeam: (code: string) => request<{ className: string; teamName: string }>('POST', '/teams/join', { code }),

  professors: () => request<Professor[]>('GET', '/admin/professors'),
  professorRubrics: (id: string) => request<RubricSummary[]>('GET', `/admin/professors/${id}/rubrics`),
  adminRubric: (id: string) => request<Rubric>('GET', `/admin/rubrics/${id}`),
  users: () => request<{ staff: User[]; studentCount: number }>('GET', '/users'),
};
