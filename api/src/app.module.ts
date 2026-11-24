import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller';
import { AllocationModule } from './allocation/allocation.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mailer';
import { PrismaModule } from './prisma/prisma.module';
import { RubricsModule } from './rubrics/rubrics.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule, UsersModule, AssignmentsModule, RubricsModule, ClassesModule, SubmissionsModule, AllocationModule, JobsModule],
  controllers: [HealthController, AdminController],
})
export class AppModule {}
