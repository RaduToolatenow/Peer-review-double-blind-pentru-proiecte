import { Module } from '@nestjs/common';
import { createFileStore, FILE_STORE } from './file-store';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService, { provide: FILE_STORE, useFactory: createFileStore }],
})
export class SubmissionsModule {}
