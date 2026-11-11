import { Role } from '../generated/prisma/enums';

/** The only user fields that may leave the server. */
export const PUBLIC_USER_SELECT = { id: true, email: true, fullName: true, role: true } as const;

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
