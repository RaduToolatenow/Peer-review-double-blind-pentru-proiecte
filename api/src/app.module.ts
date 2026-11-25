import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller';
import { AllocationModule } from './allocation/allocation.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { GradesModule } from './grades/grades.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mailer';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RubricsModule } from './rubrics/rubrics.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule, UsersModule, AssignmentsModule, RubricsModule, ClassesModule, SubmissionsModule, AllocationModule, ReviewsModule, GradesModule, NotificationsModule, JobsModule],
  controllers: [HealthController, AdminController],
})
export class AppModule {}
