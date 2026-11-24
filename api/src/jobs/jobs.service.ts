import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import { AllocationService } from '../allocation/allocation.service';
import { requireEnv } from '../env';
import { NotificationsService } from '../notifications/notifications.service';

const ALLOCATE_DUE = 'allocate-due';

/**
 * Scheduled jobs with pg-boss (D-001, D-021). One job runs every minute and handles every
 * assignment whose phase is due, then the notifications (D-024), so a changed deadline or a
 * restart needs no rescheduling.
 * pg-boss is ESM-only and is loaded with import() only when jobs start; tests set JOBS=off.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private boss: PgBoss | null = null;

  constructor(
    private readonly allocation: AllocationService,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.JOBS === 'off') return;
    const { PgBoss } = await import('pg-boss');
    // Two connections at most keep the Supabase session pooler free for the app (D-009).
    const boss = new PgBoss({ connectionString: requireEnv('DATABASE_URL'), max: 2 });
    boss.on('error', (error: Error) => this.logger.error(`pg-boss: ${error.message}`));
    await boss.start();
    await boss.createQueue(ALLOCATE_DUE);
    await boss.schedule(ALLOCATE_DUE, '* * * * *');
    await boss.work(ALLOCATE_DUE, async () => {
      await this.allocation.allocateDue();
      // D-024: after allocation, so a fresh allocation is notified in the same run.
      await this.notifications.recordDue();
      await this.notifications.sendPending();
    });
    this.boss = boss;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop();
  }
}
