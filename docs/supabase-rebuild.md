# Supabase-rekonstruktion – A-koder

Senast uppdaterad: 2026-05-18
Status: live-verifierad efter restore

Det här dokumentet beskriver Supabase-projektet `A-koder` så att det kan flyttas, återskapas eller byggas om under annan användare/organisation utan att blandas ihop med privata projekt.

## Projektmetadata

| Fält | Värde |
|---|---|
| Namn | `A-koder` |
| Project ID / ref | `sqqbujdebygfbcpztmri` |
| Organization ID | `mlfjsnbeijeukembzvzb` |
| Region | `eu-west-2` |
| Status efter restore | Aktivt nog för schemafrågor |
| Postgres engine | `17` |
| Database version | `17.6.1.084` |
| API URL | `https://sqqbujdebygfbcpztmri.supabase.co` |
| DB host | `db.sqqbujdebygfbcpztmri.supabase.co` |
| Created at | `2026-03-28T15:21:34.763153Z` |

## Viktig slutsats om flytt

Supabase har stöd för att transfer:a projekt mellan organizations. Det är därför troligen bättre att använda project transfer om målet bara är att få bort jobbprojektet från ditt konto/privata utrymme.

Återbygg-dokumentationen är ändå värdefull som backup, och om projektet ska byggas rent i en ny användare.

## Live-verifierat databasschema

Supabase returnerade fyra tabeller i `public` efter restore:

- `public.a_codes`
- `public.tank_notifications`
- `public.app_settings`
- `public.notification_queue`

Alla fyra tabeller har `rls_enabled = true`.

Live-query mot `pg_policies` returnerade `[]`, alltså finns inga RLS policies just nu. Det innebär att vanlig anon/auth-klient i praktiken inte får läsa/skriva dessa tabeller direkt. Nuvarande design fungerar i stället via Edge Functions som använder `SUPABASE_SERVICE_ROLE_KEY`.

## Tabell: public.a_codes

Syfte: lagrar A-koder och status per tank/ref.

Live-verifierade kolumner:

| Kolumn | Typ | Nullable | Default | Kommentar |
|---|---|---:|---|---|
| `id` | `uuid` | nej | `gen_random_uuid()` | Primärnyckel |
| `tank` | `text` | nej |  | Tank/container |
| `ref` | `text` | ja |  | Färjeref/release ref |
| `a_kod` | `text` | ja |  | Hämtad A-kod |
| `status` | `text` | nej | `'pending'::text` | Check: `pending`, `active`, `used` |
| `used_at` | `timestamptz` | ja |  | Sätts när kod markeras som använd |
| `created_at` | `timestamptz` | nej | `now()` | Skapad |
| `updated_at` | `timestamptz` | nej | `now()` | Uppdaterad |

Primärnyckel: `id`.

Funktionerna visar även att det måste finnas en unik constraint/index för `onConflict: "tank,ref"`, annars skulle `sync-units` inte kunna upserta korrekt. Den kunde inte läsas via `pg_indexes` på grund av permission error i MCP-verktyget, men koden kräver den.

Rekommenderad DDL:

```sql
create table if not exists public.a_codes (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text,
  a_kod text,
  status text not null default 'pending' check (status in ('pending', 'active', 'used')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tank, ref)
);

alter table public.a_codes enable row level security;
```

## Tabell: public.tank_notifications

Syfte: användare kan klicka “notify me” på en pending tank/ref. När koden senare blir aktiv skapas köpost och watcher markeras notifierad.

Live-verifierade kolumner:

| Kolumn | Typ | Nullable | Default | Kommentar |
|---|---|---:|---|---|
| `id` | `uuid` | nej | `gen_random_uuid()` | Primärnyckel |
| `tank` | `text` | nej |  | Tank/container |
| `ref` | `text` | ja |  | Färjeref |
| `created_at` | `timestamptz` | nej | `now()` | Skapad |
| `email` | `text` | ja |  | Watcher-email |
| `notified_at` | `timestamptz` | ja |  | Sätts när notifiering köats |

Primärnyckel: `id`.

Funktionen `toggle-notify` letar befintlig rad på `tank + ref + email` och tar bort den om den finns, annars skapas den. `sync-units` letar watchers där `notified_at is null`.

Rekommenderad DDL:

```sql
create table if not exists public.tank_notifications (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text,
  created_at timestamptz not null default now(),
  email text,
  notified_at timestamptz,
  unique (tank, ref, email)
);

alter table public.tank_notifications enable row level security;
```

## Tabell: public.app_settings

Syfte: lagrar accesskoder som Edge Functions läser med service role.

Live-verifierade kolumner:

| Kolumn | Typ | Nullable | Default | Kommentar |
|---|---|---:|---|---|
| `key` | `text` | nej |  | Primärnyckel |
| `value` | `text` | nej |  | Hemligt värde/accesskod |
| `updated_at` | `timestamptz` | nej | `now()` | Uppdaterad |

Primärnyckel: `key`.

Kända keys från Edge Functions:

- `app_access_code`
- `archive_access_code`

Rekommenderad DDL:

```sql
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
```

Exempeldata, byt värden:

```sql
insert into public.app_settings (key, value)
values
  ('app_access_code', 'BYT_MIG'),
  ('archive_access_code', 'BYT_MIG')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
```

## Tabell: public.notification_queue

Syfte: köar mailnotiser som kan hämtas av Power Automate/Dropbox-flöde.

Live-verifierade kolumner:

| Kolumn | Typ | Nullable | Default | Kommentar |
|---|---|---:|---|---|
| `id` | `uuid` | nej | `gen_random_uuid()` | Primärnyckel |
| `tank` | `text` | nej |  | Tank/container |
| `ref` | `text` | nej |  | Färjeref |
| `a_kod` | `text` | ja |  | A-kod |
| `email` | `text` | nej |  | Mottagare |
| `sent_at` | `timestamptz` | ja |  | Sätts när skickad, men nuvarande funktion hämtar bara oskickade |
| `created_at` | `timestamptz` | nej | `now()` | Skapad |

Primärnyckel: `id`.

Funktionen `sync-units` använder `upsert(... onConflict: "tank,ref,email")`, så det bör finnas unik constraint/index på `tank, ref, email`.

Rekommenderad DDL:

```sql
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text not null,
  a_kod text,
  email text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tank, ref, email)
);

alter table public.notification_queue enable row level security;
```

## RLS-status

Live-verifierat:

```text
RLS: enabled på alla public-tabeller
Policies: inga policies hittades
```

Det är rimligt för nuvarande design eftersom alla publika operationer går via Edge Functions med service role.

Vill man skapa policies senare bör man inte öppna direkt access till `app_settings`, eftersom den innehåller accesskoder. Om frontend ska läsa `a_codes` direkt behövs separata read policies, men nuvarande säkrare modell är att bara exponera via `get-units`.

## Edge Functions

Alla functions är deployade med `verify_jwt: false`.

Det är kompatibelt med nuvarande flöde, men säkerheten beror då på egen accesskod/token i function body.

| Function | Version | verify_jwt | Syfte |
|---|---:|---:|---|
| `verify-access` | 3 | false | Verifierar vanlig app-accesskod |
| `verify-archive` | 4 | false | Verifierar arkiv-accesskod |
| `get-units` | 3 | false | Hämtar A-kodslistan efter app-accesskod |
| `mark-used` | 3 | false | Markerar A-kod som använd |
| `toggle-notify` | 5 | false | Slår på/av notify watcher |
| `sync-units` | 7 | false | Syncar resultat från automation/GitHub in i DB |
| `get-notification-queue` | 1 | false | Hämtar oskickade notification_queue-rader |

## Secrets / miljövariabler

Edge Functions använder:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SYNC_UNITS_TOKEN
```

`SYNC_UNITS_TOKEN` måste sättas som secret i nytt projekt och även användas i automationen som postar till `sync-units` och `get-notification-queue`.

## API-kontrakt

### POST /functions/v1/verify-access

Request:

```json
{ "code": "..." }
```

Response:

```json
{ "ok": true }
```

Läser `app_settings` där `key = 'app_access_code'`.

### POST /functions/v1/verify-archive

Request:

```json
{ "code": "..." }
```

Response:

```json
{ "ok": true }
```

Läser `app_settings` där `key = 'archive_access_code'`.

### POST /functions/v1/get-units

Request:

```json
{ "code": "..." }
```

Returnerar:

```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "tank": "DHIU...",
      "ref": "...",
      "a_kod": "...",
      "status": "active",
      "used_at": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### POST /functions/v1/mark-used

Request:

```json
{ "code": "...", "id": "uuid" }
```

Effekt:

```sql
update public.a_codes
set status = 'used', used_at = now(), updated_at = now()
where id = :id;
```

### POST /functions/v1/toggle-notify

Request:

```json
{
  "code": "...",
  "tank": "DHIU...",
  "ref": "...",
  "email": "person@example.com"
}
```

Effekt:

- normaliserar `email` till lowercase
- om watcher redan finns för `tank/ref/email`: delete
- annars insert i `tank_notifications`

Response vid på:

```json
{ "ok": true, "enabled": true, "tank": "...", "ref": "...", "email": "..." }
```

Response vid av:

```json
{ "ok": true, "enabled": false, "tank": "...", "ref": "...", "email": "..." }
```

### POST /functions/v1/sync-units

Request:

```json
{
  "token": "SYNC_UNITS_TOKEN",
  "items": [
    {
      "tank": "DHIU2150157",
      "ref": "74412050/3",
      "success": true,
      "status": "Klar",
      "aKod": "154456"
    }
  ]
}
```

Normalisering:

- default `status = pending`
- om `success === true && aKod`: `status = active`
- om `status === 'Klar' && aKod`: `status = active`
- mappar `aKod` till DB-kolumn `a_kod`
- filtrerar bort rader utan `tank` eller `ref`

DB-effekt:

```sql
upsert into public.a_codes on conflict (tank, ref)
```

Notifieringslogik:

- filtrerar upsertade rows där `status = active` och `a_kod` finns
- letar watchers i `tank_notifications` med samma `tank/ref` och `notified_at is null`
- upsertar till `notification_queue` på `(tank, ref, email)`
- sätter `tank_notifications.notified_at = now()`

### POST /functions/v1/get-notification-queue

Request:

```json
{ "token": "SYNC_UNITS_TOKEN" }
```

Returnerar alla oskickade:

```sql
select id, tank, ref, a_kod, email, created_at
from public.notification_queue
where sent_at is null
order by created_at asc;
```

OBS: nuvarande function hämtar queue men markerar inte `sent_at`. Om Power Automate ska undvika dubletter behöver antingen en extra function skapas, eller så ska flödet ha annan dedupe.

## Komplett rebuild SQL

```sql
create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.a_codes (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text,
  a_kod text,
  status text not null default 'pending' check (status in ('pending', 'active', 'used')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tank, ref)
);

create table if not exists public.tank_notifications (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text,
  created_at timestamptz not null default now(),
  email text,
  notified_at timestamptz,
  unique (tank, ref, email)
);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  tank text not null,
  ref text not null,
  a_kod text,
  email text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tank, ref, email)
);

alter table public.app_settings enable row level security;
alter table public.a_codes enable row level security;
alter table public.tank_notifications enable row level security;
alter table public.notification_queue enable row level security;
```

## Återbyggnadsordning

1. Skapa nytt Supabase-projekt i rätt organization.
2. Kör SQL ovan.
3. Lägg in `app_access_code` och `archive_access_code` i `app_settings`.
4. Sätt function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_UNITS_TOKEN`
5. Deploya Edge Functions med samma namn och `verify_jwt = false` för kompatibilitet.
6. Uppdatera frontend/automation med ny Supabase URL.
7. Uppdatera GitHub Actions/Power Automate med ny `SYNC_UNITS_TOKEN` och endpoint.
8. Testa:
   - verify-access
   - get-units
   - sync-units med pending item
   - sync-units med active item och watcher
   - get-notification-queue
   - mark-used

## Kända begränsningar i dokumentationen

- `pg_indexes`, `list_extensions` och vissa katalogfrågor blockerades av MCP-permission, så index/constraints är delvis verifierade via Edge Function-krav och `list_tables`, inte full `pg_dump`.
- Row counts från `list_tables` visade `0` på alla fyra public-tabeller vid kontrolltillfället.
- Edge Function-kod finns läsbar via Supabase API, men är inte duplicerad fullständigt i detta dokument för läsbarhet. Den bör exporteras separat om projektet ska arkiveras helt.

## Rekommendation

Om målet är att frigöra plats och hålla jobbet separerat: använd Supabase Project Transfer till en jobb-organization om möjligt.

Om målet är att skapa en ren kopia: använd rebuild SQL + Edge Functions + secrets ovan.
