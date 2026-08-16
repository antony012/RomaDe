import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('remote_verify_requests')
export class RemoteVerifyRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'jwt_token', type: 'text', nullable: true })
  jwtToken: string | null;

  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ name: 'dasher_id', type: 'varchar', length: 120, nullable: true })
  dasherId: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 120, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 120, nullable: true })
  lastName: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 40, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'status', type: 'varchar', length: 80, nullable: true })
  status: string | null;

  @Column({ name: 'applicant_id', type: 'varchar', length: 120, nullable: true })
  applicantId: string | null;

  @Column({ name: 'applicant_unique_link', type: 'text', nullable: true })
  applicantUniqueLink: string | null;

  @Column({ name: 'inquiry_id', type: 'varchar', length: 120, nullable: true })
  inquiryId: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 120, nullable: true })
  deviceId: string | null;

  @Column({ name: 'template_id', type: 'varchar', length: 120, nullable: true })
  templateId: string | null;

  @Column({ name: 'link', type: 'text' })
  link: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
