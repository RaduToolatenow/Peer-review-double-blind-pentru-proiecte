import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PublicUser } from '../users/public-user';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { AuthenticatedRequest, SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: Request): Promise<PublicUser> {
    const user = await this.authService.validateCredentials(body.email, body.password);
    // A new session id at login stops an attacker from reusing an id set before login.
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    request.session.userId = user.id;
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      request.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    response.clearCookie('sid');
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest): PublicUser {
    return request.user;
  }
}
