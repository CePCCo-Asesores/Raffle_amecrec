# Lottero — Sistema de Rifas Digitales

Plataforma de rifas digitales con soporte para pago externo, notificaciones, reembolsos y sistema de disputas.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Pagos | Pago externo (Stripe listo para activar) |
| Emails | Resend (opcional) |

---

## Estructura del proyecto

```
Raffle_amecrec/
├── src/
│   ├── components/
│   │   ├── admin/           # Dashboard administrador
│   │   ├── auth/            # Login / Registro
│   │   ├── landing/         # Página principal
│   │   ├── organizer/       # Dashboard organizador + flujo de cierre
│   │   ├── participant/     # Dashboard participante + explorador
│   │   ├── settings/        # Preferencias de notificación
│   │   └── shared/          # Navbar, layouts
│   ├── contexts/
│   │   ├── AppContext.tsx    # Navegación y estado global
│   │   └── AuthContext.tsx  # Autenticación
│   ├── lib/
│   │   ├── supabase.ts      # Cliente Supabase (usa .env)
│   │   ├── types.ts         # Tipos TypeScript
│   │   ├── database.ts      # RPCs y lógica de negocio
│   │   ├── logger.ts        # Logger condicional (solo activo en desarrollo)
│   │   ├── stripe.ts        # Pagos (modo externo activo)
│   │   ├── notifications.ts # Notificaciones
│   │   ├── refunds.ts       # Reembolsos
│   │   └── disputes.ts      # Disputas
│   └── pages/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_core_tables.sql          # Tablas base, triggers
│   │   ├── 002_rls_policies.sql         # Row Level Security
│   │   ├── 003_rpc_functions.sql        # Funciones atómicas (compra, cierre, sorteo)
│   │   ├── 004_security_hardening.sql   # Validación auth.uid(), rate limiting en BD
│   │   ├── 005_refund_counter_fix.sql   # Fix contadores al aprobar reembolso
│   │   ├── 006_get_payment_detail.sql   # Columnas bancarias + RPC get_payment_detail
│   │   └── 007_ticket_start_number.sql  # Soporte 0-based/1-based + fix finalize_draw
│   └── functions/
│       ├── send-notifications/
│       ├── process-refund/
│       ├── resolve-disputes/
│       └── stripe-connect/
├── .env.example
└── .gitignore
```

---

## Setup rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
cp .env.example .env
# Editar .env con tus keys de Supabase

# 3. Ejecutar migraciones SQL en Supabase (en orden):
supabase db push
# O manualmente en el SQL Editor en orden del 001 al 007

# 4. Desplegar Edge Functions
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy send-notifications
supabase functions deploy process-refund
supabase functions deploy resolve-disputes
supabase functions deploy stripe-connect

# 5. Correr en desarrollo
npm run dev
```

---

## Deploy Vercel

Conectar repo en vercel.com y agregar variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Variables de entorno en Supabase Edge Functions

En **Supabase → Project Settings → Edge Functions → Secrets** configurar:

| Variable | Valor |
|---|---|
| `ALLOWED_ORIGIN` | `https://sorteosamecrec.vercel.app` |

Restringe las solicitudes CORS al dominio de producción. En desarrollo se permite `*` por defecto.

---

## Migraciones — historial de cambios

| Migración | Descripción |
|---|---|
| `001` | Tablas base: profiles, raffles, tickets, transactions, audit_log, financial_ledger, etc. |
| `002` | Políticas RLS para todos los roles (admin, organizador, participante) |
| `003` | RPCs atómicas: reserve_tickets, atomic_purchase_tickets, close_raffle, finalize_draw, etc. |
| `004` | Hardening: validación de auth.uid() en RPCs, RLS más estricto, rate limiting en BD |
| `005` | Fix: decremento correcto de contadores al aprobar reembolso |
| `006` | Columnas bancarias en profiles (bank_name, bank_account, bank_holder) + RPC get_payment_detail |
| `007` | Columna ticket_start_number en raffles (0=Zodiaco/00-99, 1=Mayor/1-N) + finalize_draw corregido |

---

## Numeración de boletos

El sistema soporta dos convenciones controladas por `ticket_start_number` en la tabla `raffles`:

| Tipo de sorteo | `ticket_start_number` | Rango visible |
|---|---|---|
| Mayor, Superior, Gordo, Especial, Magno | `1` | 00001 – N |
| Zodiaco / sorteo personalizado base-0 | `0` | 00 – N-1 |

El número ganador se valida tanto en frontend como en la RPC `finalize_draw` usando este valor.
