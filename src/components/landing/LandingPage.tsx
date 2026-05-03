import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Trophy, Shield, Zap, Users, CreditCard, BarChart3, Clock, Globe, Bell,
  CheckCircle2, ArrowRight, Star, Lock, Smartphone, TrendingUp,
  Ticket, Award, Eye, FileText, Database, ShieldCheck, BookOpen, AlertTriangle
} from 'lucide-react';

interface LandingPageProps {
  onOpenAuth: (tab: 'login' | 'register') => void;
  onExplore: () => void;
}

interface PlanDB {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  max_active_raffles: number;
  max_tickets_per_raffle: number;
  features: string[];
  is_active: boolean;
}

const DEFAULT_PLANS = [
  {
    name: 'Básico', price: '$299', period: '/mes', desc: 'Ideal para empezar',
    features: ['3 sorteos activos', 'Hasta 500 boletos por sorteo', 'Soporte por email', 'Reportes básicos', 'Método de pago externo'],
    cta: 'Comenzar', popular: false,
  },
  {
    name: 'Profesional', price: '$599', period: '/mes', desc: 'Para organizadores serios',
    features: ['10 sorteos activos', 'Hasta 2,000 boletos por sorteo', 'Soporte prioritario', 'Reportes avanzados', 'Stripe Connect'],
    cta: 'Elegir Profesional', popular: true,
  },
  {
    name: 'Empresarial', price: '$999', period: '/mes', desc: 'Sin límites',
    features: ['Sorteos ilimitados', 'Hasta 10,000 boletos', 'Soporte 24/7', 'Reportes premium', 'API de acceso'],
    cta: 'Contactar Ventas', popular: false,
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onExplore }) => {
  const [dbPlans, setDbPlans] = useState<PlanDB[]>([]);

  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true })
      .then(({ data }) => { if (data && data.length > 0) setDbPlans(data); });
  }, []);

  // Construir planes: desde DB si existen, si no usar defaults
  const plans = dbPlans.length > 0
    ? dbPlans.map((p, i) => ({
        name: p.name,
        price: `$${Math.round(p.price_monthly).toLocaleString('es-MX')}`,
        period: '/mes',
        desc: p.description || '',
        features: Array.isArray(p.features) ? p.features : [],
        cta: i === 0 ? 'Comenzar' : i === dbPlans.length - 1 ? 'Contactar Ventas' : `Elegir ${p.name}`,
        popular: i === Math.floor(dbPlans.length / 2), // el del medio es popular
      }))
    : DEFAULT_PLANS;

  const features = [
    { icon: <Ticket className="w-6 h-6" />, title: 'Sorteos Ilimitados', desc: 'Crea y gestiona múltiples sorteos simultáneos con total control sobre cada uno.' },
    { icon: <Shield className="w-6 h-6" />, title: 'Seguridad Total', desc: 'Compra atómica de boletos, bloqueo FOR UPDATE y protección contra duplicados.' },
    { icon: <CreditCard className="w-6 h-6" />, title: 'Pagos Flexibles', desc: 'Stripe Connect integrado o gestiona cobros externos. Tú decides cómo cobrar.' },
    { icon: <Trophy className="w-6 h-6" />, title: 'Lotería Nacional', desc: 'Vincula tus sorteos a sorteos oficiales de Lotería Nacional para total transparencia.' },
    { icon: <BarChart3 className="w-6 h-6" />, title: 'Reportes Avanzados', desc: 'Dashboard completo con métricas de ventas, ingresos y participación en tiempo real.' },
    { icon: <Users className="w-6 h-6" />, title: 'Multi-usuario', desc: 'Roles diferenciados: administrador, organizador y participante con permisos RLS.' },
    { icon: <Lock className="w-6 h-6" />, title: 'Resultados Inmutables', desc: 'Registro con hash criptográfico y log de auditoría. Los resultados no se pueden alterar.' },
    { icon: <Globe className="w-6 h-6" />, title: 'Links Públicos', desc: 'Comparte sorteos con links públicos. Los participantes ven disponibilidad sin registrarse.' },
    { icon: <Database className="w-6 h-6" />, title: 'Ledger Financiero', desc: 'Registro contable formal de cada transacción: ventas, comisiones, ingresos y reembolsos.' },
    { icon: <FileText className="w-6 h-6" />, title: 'Exportación', desc: 'Exporta reportes en CSV y PDF para llevar control detallado de tus sorteos.' },
    { icon: <ShieldCheck className="w-6 h-6" />, title: 'Anti-Automatización', desc: 'Rate limiting y límites por usuario para prevenir compras masivas por script.' },
    { icon: <BookOpen className="w-6 h-6" />, title: 'Auditoría Completa', desc: 'Registro de cada cambio en sorteos, precios, resultados y comisiones con trazabilidad.' },
  ];

  const stats = [
    { value: '2,500+', label: 'Sorteos Creados' },
    { value: '150K+', label: 'Boletos Vendidos' },
    { value: '98.5%', label: 'Satisfacción' },
    { value: '$12M+', label: 'En Premios' },
  ];

  const securityFeatures = [
    { icon: <Lock className="w-5 h-5" />, title: 'Compra Atómica', desc: 'Transacciones con bloqueo FOR UPDATE que previenen doble venta' },
    { icon: <ShieldCheck className="w-5 h-5" />, title: 'RLS Multi-Tenant', desc: 'Políticas de seguridad por fila en base de datos para cada rol' },
    { icon: <Database className="w-5 h-5" />, title: 'Ledger Inmutable', desc: 'Registro contable que nunca se recalcula dinámicamente' },
    { icon: <AlertTriangle className="w-5 h-5" />, title: 'Rate Limiting', desc: 'Protección contra automatización maliciosa y compras masivas' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-indigo-900 to-purple-900">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-400 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-blue-100 font-medium">Plataforma #1 de Sorteos Digitales en México</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Gestiona Sorteos Digitales con{' '}
                <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                  Confianza Total
                </span>
              </h1>
              <p className="text-lg text-blue-200 mb-8 max-w-xl leading-relaxed">
                Crea, administra y vende boletos de sorteos digitales vinculados a sorteos oficiales de Lotería Nacional. 
                Integridad transaccional, seguridad multi-tenant y control total en cada sorteo.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-8 py-3.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 rounded-xl font-bold text-lg hover:from-yellow-300 hover:to-orange-400 transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2"
                >
                  Comenzar Ahora <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={onExplore}
                  className="px-8 py-3.5 bg-white/10 backdrop-blur-sm border border-white/30 text-white rounded-xl font-semibold text-lg hover:bg-white/20 transition-all"
                >
                  Explorar Sorteos
                </button>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="hidden lg:block relative">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-white/50 text-xs ml-2">Panel del Organizador — Sorteos AMECREC</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Boletos Vendidos', value: '847', color: 'from-blue-500 to-cyan-500' },
                    { label: 'Ingresos', value: '$42,350', color: 'from-emerald-500 to-green-500' },
                    { label: 'Sorteos Activos', value: '5', color: 'from-purple-500 to-pink-500' },
                  ].map((stat, i) => (
                    <div key={i} className={`bg-gradient-to-br ${stat.color} rounded-xl p-3`}>
                      <div className="text-white/70 text-xs">{stat.label}</div>
                      <div className="text-white text-xl font-bold">{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-white/80 text-sm font-medium mb-3">Boletos — Sorteo Auto 2026</div>
                  <div className="grid grid-cols-10 gap-1.5">
                    {Array.from({ length: 40 }, (_, i) => {
                      const sold = [1,3,5,7,8,12,15,18,22,25,28,30,33,35,38].includes(i + 1);
                      const reserved = [2,10,20].includes(i + 1);
                      return (
                        <div
                          key={i}
                          className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-bold ${
                            sold ? 'bg-blue-500/60 text-white' : reserved ? 'bg-yellow-500/60 text-white' : 'bg-white/10 text-white/50'
                          }`}
                        >
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-white/10" /><span className="text-white/50 text-[10px]">Disponible</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500/60" /><span className="text-white/50 text-[10px]">Vendido</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-yellow-500/60" /><span className="text-white/50 text-[10px]">Reservado</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-16 border-t border-white/10">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-extrabold text-white mb-1">{stat.value}</div>
                <div className="text-blue-300 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 bg-gradient-to-r from-gray-900 to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">Seguridad de Grado Empresarial</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Blindaje Transaccional Completo</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">Cada operación está protegida con las mejores prácticas de seguridad</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {securityFeatures.map((f, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">¿Cómo Funciona?</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Tres simples pasos para organizar tu sorteo digital con total transparencia</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Crea tu Sorteo', desc: 'Configura nombre, precio, cantidad de boletos y vincula a un sorteo oficial de Lotería Nacional.', icon: <FileText className="w-8 h-8" /> },
              { step: '02', title: 'Vende Boletos', desc: 'Comparte el link de tu sorteo. Los participantes eligen sus números y pagan de forma segura.', icon: <Ticket className="w-8 h-8" /> },
              { step: '03', title: 'Declara Ganador', desc: 'Cierra, valida, bloquea e ingresa el resultado oficial. El sistema registra todo con hash inmutable.', icon: <Trophy className="w-8 h-8" /> },
            ].map((item, i) => (
              <div key={i} className="relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow group">
                <div className="text-6xl font-extrabold text-gray-100 absolute top-4 right-6 group-hover:text-blue-50 transition-colors">{item.step}</div>
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-5">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* State Flow Diagram */}
          <div className="mt-12 bg-white rounded-2xl p-8 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">Flujo de Estados del Sorteo</h3>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              {[
                { label: 'Borrador', color: 'bg-gray-200 text-gray-700' },
                { label: 'Activa', color: 'bg-emerald-100 text-emerald-700' },
                { label: 'Cerrada', color: 'bg-amber-100 text-amber-700' },
                { label: 'Validada', color: 'bg-blue-100 text-blue-700' },
                { label: 'Bloqueada', color: 'bg-indigo-100 text-indigo-700' },
                { label: 'Con Ganador', color: 'bg-purple-100 text-purple-700' },
              ].map((s, i) => (
                <React.Fragment key={i}>
                  <span className={`px-3 py-1.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                  {i < 5 && <ArrowRight className="w-4 h-4 text-gray-400" />}
                </React.Fragment>
              ))}
            </div>
            <p className="text-center text-xs text-gray-500 mt-3">Cada transición es irreversible y queda registrada en el log de auditoría</p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Todo lo que Necesitas</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Funcionalidades profesionales para gestionar sorteos de cualquier tamaño</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div key={i} className="p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group bg-white">
                <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Planes y Precios</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Elige el plan que mejor se adapte a tus necesidades. Sin contratos a largo plazo.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-8 ${
                  plan.popular
                    ? 'bg-gradient-to-b from-blue-900 to-indigo-900 text-white shadow-2xl shadow-blue-900/30 scale-105 border-2 border-blue-400'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                    MÁS POPULAR
                  </div>
                )}
                <h3 className={`text-xl font-bold mb-1 ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-blue-200' : 'text-gray-500'}`}>{plan.desc}</p>
                <div className="mb-6">
                  <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                  <span className={`text-sm ${plan.popular ? 'text-blue-200' : 'text-gray-500'}`}>{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${plan.popular ? 'text-blue-300' : 'text-emerald-500'}`} />
                      <span className={`text-sm ${plan.popular ? 'text-blue-100' : 'text-gray-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onOpenAuth('register')}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    plan.popular
                      ? 'bg-white text-blue-900 hover:bg-blue-50 shadow-lg'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            Todos los planes incluyen comisión fija por boleto vendido (registrada en ledger contable). Sin comisión en pagos externos.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-3xl p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400 rounded-full blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">¿Listo para Organizar tu Primer Sorteo?</h2>
              <p className="text-blue-200 text-lg mb-8 max-w-xl mx-auto">
                Únete a miles de organizadores que confían en Sorteos AMECREC para gestionar sus sorteos digitales con seguridad total.
              </p>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-10 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 rounded-xl font-bold text-lg hover:from-yellow-300 hover:to-orange-400 transition-all shadow-lg"
              >
                Crear Cuenta Gratis
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-bold text-white block leading-tight">Sorteos AMECREC</span>
                  <span className="text-[9px] text-gray-500 tracking-wider">PLATAFORMA DE RIFAS</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed">Plataforma líder en gestión de sorteos digitales vinculados a Lotería Nacional con seguridad de grado empresarial.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Plataforma</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={onExplore} className="hover:text-white transition-colors">Explorar Sorteos</button></li>
                <li><button onClick={() => onOpenAuth('register')} className="hover:text-white transition-colors">Crear Cuenta</button></li>
                <li><button className="hover:text-white transition-colors">Precios</button></li>
                <li><button className="hover:text-white transition-colors">API</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Soporte</h4>
              <ul className="space-y-2 text-sm">
                <li><button className="hover:text-white transition-colors">Centro de Ayuda</button></li>
                <li><button className="hover:text-white transition-colors">Documentación</button></li>
                <li><button className="hover:text-white transition-colors">Contacto</button></li>
                <li><button className="hover:text-white transition-colors">Estado del Sistema</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><button className="hover:text-white transition-colors">Términos de Servicio</button></li>
                <li><button className="hover:text-white transition-colors">Privacidad</button></li>
                <li><button className="hover:text-white transition-colors">Cookies</button></li>
                <li><button className="hover:text-white transition-colors">Aviso Legal</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm">&copy; 2026 Sorteos AMECREC. Todos los derechos reservados.</p>
            <div className="flex gap-4">
              <button className="w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </button>
              <button className="w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
