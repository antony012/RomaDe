import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('dash_events')
export class DashEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'jwt_token', type: 'text', nullable: true })
  jwtToken: string | null;

  @Column({ name: 'event', type: 'varchar', length: 80, nullable: true })
  event: string | null;

  @Column({ name: 'dash_id', type: 'varchar', length: 120, nullable: true })
  dashId: string | null;

  @Column({ name: 'dasher_id', type: 'varchar', length: 120, nullable: true })
  dasherId: string | null;

  @Column({ name: 'vehicle_id', type: 'varchar', length: 120, nullable: true })
  vehicleId: string | null;

  @Column({ name: 'zone_id', type: 'varchar', length: 120, nullable: true })
  zoneId: string | null;

  @Column({ name: 'zone_name', type: 'varchar', length: 255, nullable: true })
  zoneName: string | null;

  @Column({ name: 'scheduled_start_time', type: 'varchar', length: 80, nullable: true })
  scheduledStartTime: string | null;

  @Column({ name: 'scheduled_end_time', type: 'varchar', length: 80, nullable: true })
  scheduledEndTime: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
