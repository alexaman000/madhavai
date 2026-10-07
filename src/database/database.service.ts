import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

export interface OtpRecord {
  id: string;
  email: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified: boolean;
  created_at: string;
  last_sent_at: string;
  consumed_at: string | null;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private supabase: SupabaseClient | null = null;

  // In-memory fallback storage when Supabase URL/Key is not connected
  private inMemoryUsers: Map<string, UserRecord> = new Map();
  private inMemoryOtps: OtpRecord[] = [];

  onModuleInit() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-supabase-project')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.logger.log(`⚡ Connected to Supabase PostgreSQL at: ${supabaseUrl}`);
      } catch (err: any) {
        this.logger.warn(`Failed to connect to Supabase: ${err.message}. Using fallback storage.`);
      }
    } else {
      this.logger.log(`ℹ️ Supabase credentials not set or placeholder. Running in-memory database mode.`);
    }
  }

  // ==================== USER OPERATIONS ====================

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase().trim();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error finding user by email: ${error.message}`);
      }
      if (data) return data as UserRecord;
    }

    return this.inMemoryUsers.get(normalized) || null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error finding user by id: ${error.message}`);
      }
      if (data) return data as UserRecord;
    }

    for (const u of this.inMemoryUsers.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  async createUser(email: string, name?: string): Promise<UserRecord> {
    const normalized = email.toLowerCase().trim();
    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: normalized,
      name: name || normalized.split('@')[0] || 'Arjun',
      is_verified: true,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .insert([newUser])
        .select()
        .single();

      if (error) {
        this.logger.error(`Supabase createUser error: ${error.message}`);
      } else if (data) {
        return data as UserRecord;
      }
    }

    this.inMemoryUsers.set(normalized, newUser);
    return newUser;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('users')
        .update({ last_login_at: now, updated_at: now })
        .eq('id', id);
    }
    for (const [key, user] of this.inMemoryUsers.entries()) {
      if (user.id === id) {
        user.last_login_at = now;
        user.updated_at = now;
        this.inMemoryUsers.set(key, user);
      }
    }
  }

  // ==================== OTP OPERATIONS ====================

  async findLatestOtpForEmail(email: string): Promise<OtpRecord | null> {
    const normalized = email.toLowerCase().trim();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('otp_verifications')
        .select('*')
        .eq('email', normalized)
        .eq('verified', false)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error fetching OTP for email: ${error.message}`);
      }
      if (data) return data as OtpRecord;
    }

    const matches = this.inMemoryOtps
      .filter((o) => o.email === normalized && !o.verified && !o.consumed_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return matches.length > 0 ? matches[0] : null;
  }

  async createOtpRecord(email: string, otpHash: string, expiresAt: Date): Promise<OtpRecord> {
    const normalized = email.toLowerCase().trim();
    const now = new Date().toISOString();
    const record: OtpRecord = {
      id: `otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: normalized,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      verified: false,
      created_at: now,
      last_sent_at: now,
      consumed_at: null,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('otp_verifications')
        .insert([record])
        .select()
        .single();

      if (error) {
        this.logger.error(`Supabase createOtpRecord error: ${error.message}`);
      } else if (data) {
        return data as OtpRecord;
      }
    }

    this.inMemoryOtps.push(record);
    return record;
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    let newAttempts = 1;
    if (this.supabase) {
      const current = await this.supabase
        .from('otp_verifications')
        .select('attempts')
        .eq('id', id)
        .single();

      if (current.data) {
        newAttempts = (current.data.attempts || 0) + 1;
        await this.supabase
          .from('otp_verifications')
          .update({ attempts: newAttempts })
          .eq('id', id);
      }
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.attempts += 1;
        newAttempts = found.attempts;
      }
    }
    return newAttempts;
  }

  async markOtpConsumed(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('otp_verifications')
        .update({ verified: true, consumed_at: now })
        .eq('id', id);
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.verified = true;
        found.consumed_at = now;
      }
    }
  }

  async markOtpInvalidated(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('otp_verifications')
        .update({ consumed_at: now })
        .eq('id', id);
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.consumed_at = now;
      }
    }
  }
}
