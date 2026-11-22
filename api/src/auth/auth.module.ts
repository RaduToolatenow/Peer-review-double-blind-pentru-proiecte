import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JoinController } from './join.controller';

@Module({ controllers: [AuthController, JoinController], providers: [AuthService, AccountService] })
export class AuthModule {}
