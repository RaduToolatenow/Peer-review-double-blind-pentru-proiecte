import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PublicUser } from '../users/public-user';
import { EmailDto, RegisterDto, ResetPasswordDto, TokenDto } from './account.dto';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { AuthenticatedRequest, SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accounts: AccountService,
  ) {}

  @Post('register')
  @HttpCode(202)
  register(@Body() body: RegisterDto, @Req() request: Request) {
    return this.accounts.register(body.email, body.password, body.joinCode, request.ip ?? '');
  }

  @Post('verify')
  @HttpCode(200)
  verify(@Body() body: TokenDto) {
    return this.accounts.verify(body.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(@Body() body: EmailDto, @Req() request: Request) {
    return this.accounts.resendVerification(body.email, request.ip ?? '');
  }

  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() body: EmailDto, @Req() request: Request) {
    return this.accounts.forgotPassword(body.email, request.ip ?? '');
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.accounts.resetPassword(body.token, body.password);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: Request): Promise<PublicUser> {
    const user = await this.authService.validateCredentials(body.email, body.password, request.ip ?? '');
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
