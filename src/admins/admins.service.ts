import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Admin } from './entities/admin.entity';

export type SafeAdmin = Omit<Admin, 'passwordHash'>;

@Injectable()
export class AdminsService implements OnModuleInit {
  constructor(
    @InjectRepository(Admin)
    private readonly adminsRepository: Repository<Admin>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  private async ensureDefaultAdmin() {
    const username = this.configService.get<string>('ADMIN_USERNAME', 'admin');
    const password = this.configService.get<string>('ADMIN_PASSWORD', 'admin123');
    const displayName = this.configService.get<string>(
      'ADMIN_DISPLAY_NAME',
      'Administrator',
    );

    const existing = await this.adminsRepository.findOne({ where: { username } });
    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = this.adminsRepository.create({
      username,
      passwordHash,
      displayName,
      isActive: true,
    });
    await this.adminsRepository.save(admin);
  }

  sanitize(admin: Admin): SafeAdmin {
    const { passwordHash: _passwordHash, ...rest } = admin;
    return rest;
  }

  async findActiveById(id: string): Promise<Admin | null> {
    return this.adminsRepository.findOne({
      where: { id, isActive: true },
    });
  }

  async findByUsername(username: string): Promise<Admin | null> {
    return this.adminsRepository.findOne({ where: { username } });
  }

  async findOne(id: string): Promise<SafeAdmin> {
    const admin = await this.adminsRepository.findOne({ where: { id } });
    if (!admin) {
      throw new NotFoundException(`Admin ${id} not found`);
    }
    return this.sanitize(admin);
  }

  async validateCredentials(username: string, password: string): Promise<Admin> {
    const admin = await this.findByUsername(username);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return admin;
  }

  async create(dto: CreateAdminDto): Promise<SafeAdmin> {
    const existing = await this.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const admin = this.adminsRepository.create({
      username: dto.username,
      passwordHash,
      displayName: dto.displayName ?? null,
      isActive: true,
    });

    const saved = await this.adminsRepository.save(admin);
    return this.sanitize(saved);
  }

  async findAll(): Promise<SafeAdmin[]> {
    const admins = await this.adminsRepository.find({
      order: { createdAt: 'DESC' },
    });
    return admins.map((admin) => this.sanitize(admin));
  }

  async update(id: string, dto: UpdateAdminDto): Promise<SafeAdmin> {
    const admin = await this.adminsRepository.findOne({ where: { id } });
    if (!admin) {
      throw new NotFoundException(`Admin ${id} not found`);
    }

    if (dto.displayName !== undefined) {
      admin.displayName = dto.displayName;
    }
    if (dto.isActive !== undefined) {
      admin.isActive = dto.isActive;
    }
    if (dto.password) {
      admin.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const saved = await this.adminsRepository.save(admin);
    return this.sanitize(saved);
  }

  async remove(id: string): Promise<SafeAdmin> {
    return this.update(id, { isActive: false });
  }
}
