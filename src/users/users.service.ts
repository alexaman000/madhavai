import { Injectable } from '@nestjs/common';
import { DatabaseService, UserRecord } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.findUserByEmail(email);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.db.findUserById(id);
  }

  async createUser(email: string, name?: string): Promise<UserRecord> {
    return this.db.createUser(email, name);
  }

  async updateLastLogin(id: string): Promise<void> {
    return this.db.updateUserLastLogin(id);
  }
}
