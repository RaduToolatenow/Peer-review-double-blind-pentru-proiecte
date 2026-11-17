import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { RubricsController } from './rubrics.controller';
import { RubricsService } from './rubrics.service';

@Module({ imports: [AssignmentsModule], controllers: [RubricsController], providers: [RubricsService] })
export class RubricsModule {}
