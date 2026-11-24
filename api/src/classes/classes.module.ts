import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({ imports: [AllocationModule], controllers: [ClassesController], providers: [ClassesService] })
export class ClassesModule {}
