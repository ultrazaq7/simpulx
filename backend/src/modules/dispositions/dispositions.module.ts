// ============================================================
// Dispositions Module
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispositionsController } from './dispositions.controller';
import { DispositionsService } from './dispositions.service';
import { Disposition } from '../../common/entities/disposition.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Disposition])],
  controllers: [DispositionsController],
  providers: [DispositionsService],
  exports: [DispositionsService],
})
export class DispositionsModule {}
