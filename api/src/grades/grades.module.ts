import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({ controllers: [GradesController, ResultsController], providers: [GradesService, ResultsService] })
export class GradesModule {}
