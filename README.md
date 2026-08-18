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

## Arquitectura APK ↔ RomaDe

El JWT capturado por `TokenClaimer` es la identidad en todos los endpoints.

```
AuthTokenProcessor / AttestationInterceptor
        │ TokenClaimer.setJwt()
        ▼
TokenClaimer.sJwt
        ├── membershipCheck()  POST /api/v1/integrity/membership
        ├── claim()            POST /api/v1/integrity/claim
        ├── backendSeedCoords  GET  /api/v1/integrity/zone-seeds  (header Authorization)
        ├── reportDashCreated  POST /api/v1/integrity/dash-event
        └── RemoteVerify       POST /api/v1/integrity/remote-verify
```

Si el token se renueva, se actualiza el mismo usuario por `sub` (no se crea un duplicado).

## Endpoints DashBooster / TokenClaimer / RemoteVerify

### Membership — `DashBooster.membershipCheck()`

`POST /api/v1/integrity/membership`

Alias: `POST /api/memberships`

```json
{
  "jwt_token": "<JWT de sesión, con o sin Bearer>",
  "first_name": "Juan",
  "last_name": "Pérez",
  "email": "juan@example.com",
  "dasher_id": "12345678",
  "phone_number": "+1..."
}
```

```json
{ "is_active": true, "expires_at": "2026-08-21T15:00:00.000Z" }
```

- JWT nuevo: decodifica claims, crea usuario + membresía **pendiente de pago** (`is_active: false`).
- Si la APK manda `first_name` / `last_name` / `email` (del login `/v3/dasher/me`), se guardan en el usuario del panel.
- JWT o `sub` ya conocido: actualiza el perfil y devuelve el estado actual.
- El admin habilita con `PATCH /api/v1/admin/memberships/:id/verify-payment`.
- Membresía cancelada o vencida: `is_active: false`.

### Claim — `TokenClaimer.claim()`

`POST /api/v1/integrity/claim`

```json
{ "jwt_token": "<JWT>" }
```

```json
{ "session_id": "<uuid>", "integrity_token": "" }
```

`integrity_token` vacío = la APK usa Play Integrity de Google.

### Zone seeds — `DashBooster.backendSeedCoords()`

`GET /api/v1/integrity/zone-seeds`

Header: `Authorization: <jwt>` (el mismo valor de `TokenClaimer.jwt()`).

```json
{ "zones": [{ "lat": "40.4233142", "lng": "-104.7091322" }] }
```

### Dash event — `DashBooster.reportDashCreated()`

`POST /api/v1/integrity/dash-event`

```json
{
  "jwt_token": "<JWT>",
  "event": "created",
  "dash_id": "...",
  "dasher_id": "...",
  "vehicle_id": "...",
  "zone_id": "...",
  "zone_name": "...",
  "scheduled_start_time": "...",
  "scheduled_end_time": "..."
}
```

```json
{ "ok": true }
```

### Remote verify — `RemoteVerify.doPost()`

`POST /api/v1/integrity/remote-verify`

Mismos campos que manda la APK: `jwt_token`, `email`, `dasher_id`, `first_name`, `last_name`, `phone_number`, `status`, `applicant_id`, `applicant_unique_link`, `inquiry_id`, `persona_session_token`, `device_id`, `template_id`.

Respuesta: `{ "link": "https://.../api/v1/integrity/verify/<id>" }`.

## Admin / management endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/memberships` | List memberships |
| `GET` | `/api/v1/memberships/:id` | Get membership |
| `POST` | `/api/v1/memberships` | Create membership `{ "userId": "...", "days": 7 }` |
| `PATCH` | `/api/v1/admin/memberships/:id/cancel` | Cancel anytime `{ "reason": "..." }` |
| `PATCH` | `/api/v1/admin/memberships/:id/verify-payment?days=7` | Verify payment and activate pending |
| `PATCH` | `/api/v1/admin/memberships/:id/reactivate?days=7` | Reactivate cancelled/expired |
| `GET` | `/api/v1/users` | List users |
| `GET` | `/api/v1/users/:id` | Get user |
| `PATCH` | `/api/v1/users/:id` | Update `firstName`, `lastName`, `phone`, `email`, `notes` |

## JWT storage

On first check, the token is split into header / payload / signature. Known claims (`sub`, `email`, `iss`, `aud`, `iat`, `exp`, `jti`, names, phone) are stored in dedicated columns; the full header and payload are also kept as JSONB. A later token with the same `sub` updates that row instead of creating another user.
