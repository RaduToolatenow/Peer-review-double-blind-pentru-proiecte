import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JoinController } from './join.controller';

@Module({ imports: [AllocationModule], controllers: [AuthController, JoinController], providers: [AuthService, AccountService], exports: [AccountService] })
export class AuthModule {}
