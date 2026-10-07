import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealthStatus() {
    return {
      status: 'ok',
      service: 'Madhav.ai Backend',
      message: 'Backend is running',
    };
  }
}
