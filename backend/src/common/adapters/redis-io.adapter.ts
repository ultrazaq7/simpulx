// ============================================================
// Redis IoAdapter for Socket.IO — enables horizontal scaling
// Uses ioredis (already installed) for pub/sub across PM2 instances
// ============================================================
import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }

  async connectToRedis(configService: ConfigService): Promise<void> {
    const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = configService.get<string>('REDIS_PASSWORD', '');

    const redisOpts: any = { host: redisHost, port: redisPort };
    if (redisPassword) redisOpts.password = redisPassword;

    const pubClient = new Redis(redisOpts);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }
}
