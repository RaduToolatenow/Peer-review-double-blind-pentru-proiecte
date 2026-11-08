import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import 'express-session';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT, PublicUser } from '../users/public-user';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

const ROLES_KEY = 'roles';

/** Limits a route to these roles. Use together with SessionGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.session.userId;
    if (!userId) {
      throw new UnauthorizedException('Autentifică-te pentru a continua.');
    }

    // Read on every request, so a changed role or a deleted account applies at once.
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
    if (!user) {
      throw new UnauthorizedException('Autentifică-te pentru a continua.');
    }
    request.user = user;

    const allowedRoles = this.reflector.get<Role[] | undefined>(ROLES_KEY, context.getHandler());
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Nu ai acces la această pagină.');
    }
    return true;
  }
}
