import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { JobsService } from './jobs.service';

@Module({ imports: [AllocationModule], providers: [JobsService] })
export class JobsModule {}
