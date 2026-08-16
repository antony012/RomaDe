import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Membership } from '../../memberships/entities/membership.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'jwt_token', type: 'text', unique: true })
  jwtToken: string;

  @Column({ name: 'jwt_header', type: 'jsonb', nullable: true })
  jwtHeader: Record<string, unknown> | null;

  @Column({ name: 'jwt_payload', type: 'jsonb', nullable: true })
  jwtPayload: Record<string, unknown> | null;

  @Column({ name: 'jwt_signature', type: 'text', nullable: true })
  jwtSignature: string | null;

  @Column({ name: 'sub', type: 'varchar', length: 512, nullable: true })
  sub: string | null;

  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ name: 'iss', type: 'varchar', length: 512, nullable: true })
  iss: string | null;

  @Column({ name: 'aud', type: 'varchar', length: 512, nullable: true })
  aud: string | null;

  @Column({ name: 'iat', type: 'bigint', nullable: true })
  iat: string | null;

  @Column({ name: 'exp', type: 'bigint', nullable: true })
  exp: string | null;

  @Column({ name: 'jti', type: 'varchar', length: 512, nullable: true })
  jti: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 120, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 120, nullable: true })
  lastName: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Membership, (membership) => membership.user)
  memberships: Membership[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
