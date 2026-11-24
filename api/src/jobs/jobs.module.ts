import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsService } from './jobs.service';

@Module({ imports: [AllocationModule, NotificationsModule], providers: [JobsService] })
export class JobsModule {}
