# RomaDe API

NestJS + Supabase (PostgreSQL). Misma cuenta que Vercel: `corposolorzano@gmail.com`.

## Quick start

1. Copia `.env.example` a `.env`.

2. En [Supabase → Database settings](https://supabase.com/dashboard/project/_/settings/database) pega:

- `SUPABASE_URL` (`https://xxxx.supabase.co`)
- `SUPABASE_DB_PASSWORD` (Database password)

O la URI completa en `DATABASE_URL`.

3. Arranca:

```bash
npm install
npm run start:dev
```

API: `http://localhost:3100` (o el `PORT` de `.env`)

TypeORM crea las tablas `user`, `membership` y `admin` al arrancar (`synchronize: true`).

## Admin API (para el dashboard externo)

Login:

`POST /api/v1/admin/auth/login`

```json
{ "username": "admin", "password": "admin123" }
```

Respuesta: `{ "access_token": "...", "token_type": "Bearer", "expires_in": "12h", "admin": {...} }`

Usa `Authorization: Bearer <access_token>` en el resto.

| Method | Path | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/admin/me` | Admin actual |
| `GET` | `/api/v1/admin/dashboard` | Stats + recientes |
| `GET/PATCH` | `/api/v1/admin/users[/:id]` | Usuarios |
| `GET/POST/PATCH` | `/api/v1/admin/memberships...` | Membresías |
| `GET/POST/PATCH/DELETE` | `/api/v1/admin/admins[/:id]` | CRUD admins |

Admin por defecto (`.env`): `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Core endpoint (DashBooster)

`POST /api/v1/integrity/membership`

Called by `DashBooster.membershipCheck()` every 3–30s when `TokenClaimer.jwt()` is not empty.

Alias (mismo body/respuesta):

`POST /api/memberships`

**Request**

```json
{
  "jwt_token": "<Authorization de DoorDash tal cual>"
}
```

**Response (HTTP 200)**

```json
{
  "is_active": true,
  "expires_at": "2026-08-21T15:00:00.000Z"
}
```

Behavior:

- If the JWT is new: decode it, persist the user + JWT claims, create an active membership for **7 days**, return `is_active: true`.
- If the JWT already exists: return current membership status (`is_active` + `expires_at`).
- Cancelled or expired memberships return `is_active: false`.

## Admin / management endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/memberships` | List memberships |
| `GET` | `/api/v1/memberships/:id` | Get membership |
| `POST` | `/api/v1/memberships` | Create membership `{ "userId": "...", "days": 7 }` |
| `PATCH` | `/api/v1/memberships/:id/cancel` | Cancel anytime `{ "reason": "..." }` |
| `PATCH` | `/api/v1/memberships/:id/reactivate?days=7` | Reactivate |
| `GET` | `/api/v1/users` | List users |
| `GET` | `/api/v1/users/:id` | Get user |
| `PATCH` | `/api/v1/users/:id` | Update `firstName`, `lastName`, `phone`, `email`, `notes` |

## JWT storage

On first check, the token is split into header / payload / signature. Known claims (`sub`, `email`, `iss`, `aud`, `iat`, `exp`, `jti`, names, phone) are stored in dedicated columns; the full header and payload are also kept as JSONB.
