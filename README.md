# RifaMax AMECREC — Sistema de Rifas Digitales

Plataforma de rifas benéficas para AMECREC A.C. con soporte para pago externo, notificaciones, reembolsos y sistema de disputas.

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
│   │   ├── stripe.ts        # Pagos (modo externo activo)
│   │   ├── notifications.ts # Notificaciones
│   │   ├── refunds.ts       # Reembolsos
│   │   └── disputes.ts      # Disputas
│   └── pages/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_core_tables.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_rpc_functions.sql
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

# 3. Ejecutar migraciones SQL en Supabase SQL Editor (en orden):
#    supabase/migrations/001_core_tables.sql
#    supabase/migrations/002_rls_policies.sql
#    supabase/migrations/003_rpc_functions.sql

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

## Deploy Vercel

Conectar repo en vercel.com y agregar variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
