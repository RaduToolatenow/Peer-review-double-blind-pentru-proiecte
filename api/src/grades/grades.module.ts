import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  controllers: [GradesController, ResultsController, DisputesController],
  providers: [GradesService, ResultsService, DisputesService],
})
export class GradesModule {}
