import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Trophy, Shield, Zap, Users, CreditCard, BarChart3, Clock, Globe, Bell,
  CheckCircle2, ArrowRight, Star, Lock, Smartphone, TrendingUp,
  Ticket, Award, Eye, FileText, Database, ShieldCheck, BookOpen, AlertTriangle,
  X, Mail, Phone, MessageCircle
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
  const [modal, setModal] = useState<'contact'|'terms'|'privacy'|'cookies'|'legal'|null>(null);

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
              <p className="text-sm leading-relaxed">Plataforma de gestión de sorteos digitales vinculados a Lotería Nacional con seguridad de grado empresarial.</p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Plataforma</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={onExplore} className="hover:text-white transition-colors">Explorar Sorteos</button></li>
                <li><button onClick={() => onOpenAuth('register')} className="hover:text-white transition-colors">Crear Cuenta</button></li>
                <li><button onClick={() => onOpenAuth('login')} className="hover:text-white transition-colors">Iniciar Sesión</button></li>
                <li>
                  <a href="#precios" onClick={e => { e.preventDefault(); document.getElementById('precios')?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="hover:text-white transition-colors">Precios</a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Soporte</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => setModal('contact')} className="hover:text-white transition-colors">Contacto</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => setModal('terms')}   className="hover:text-white transition-colors">Términos de Servicio</button></li>
                <li><button onClick={() => setModal('privacy')} className="hover:text-white transition-colors">Aviso de Privacidad</button></li>
                <li><button onClick={() => setModal('cookies')} className="hover:text-white transition-colors">Política de Cookies</button></li>
                <li><button onClick={() => setModal('legal')}   className="hover:text-white transition-colors">Aviso Legal</button></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm">&copy; {new Date().getFullYear()} Sorteos AMECREC · AMECREC A.C. · Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>

      {/* ── Modales ────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === 'contact' && 'Contacto'}
                {modal === 'terms'   && 'Términos de Servicio'}
                {modal === 'privacy' && 'Aviso de Privacidad'}
                {modal === 'cookies' && 'Política de Cookies'}
                {modal === 'legal'   && 'Aviso Legal'}
              </h2>
              <button onClick={() => setModal(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5">

              {/* ── CONTACTO ── */}
              {modal === 'contact' && (
                <div className="space-y-4">
                  <p className="text-gray-600 text-sm">¿Tienes dudas o necesitas ayuda? Contáctanos por cualquiera de estos medios.</p>
                  <div className="space-y-3">
                    <a href="mailto:contacto@alianzaindigo.org"
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group">
                      <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200">
                        <Mail className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">Correo electrónico</div>
                        <div className="text-xs text-gray-500">contacto@alianzaindigo.org</div>
                      </div>
                    </a>
                    <a href="https://wa.me/526572396866" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all group">
                      <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">WhatsApp</div>
                        <div className="text-xs text-gray-500">+52 657 239 6866 · Lun–Vie 9–18 h</div>
                      </div>
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 pt-2">Tiempo de respuesta habitual: menos de 24 horas hábiles.</p>
                </div>
              )}

              {/* ── TÉRMINOS ── */}
              {modal === 'terms' && (
                <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
                  <p className="text-xs text-gray-400">Última actualización: enero 2026</p>
                  <h3 className="font-bold text-gray-800">1. Objeto y aceptación</h3>
                  <p>El uso de la plataforma Sorteos AMECREC implica la aceptación plena de estos Términos de Servicio. Si no los acepta, no utilice el servicio.</p>
                  <h3 className="font-bold text-gray-800">2. Descripción del servicio</h3>
                  <p>Sorteos AMECREC es una plataforma digital que permite a organizadores crear y gestionar sorteos vinculados a sorteos oficiales de Lotería Nacional, y a participantes adquirir boletos de manera segura.</p>
                  <h3 className="font-bold text-gray-800">3. Registro y cuentas</h3>
                  <p>Para acceder como organizador o participante es necesario crear una cuenta con información veraz. El usuario es responsable de la confidencialidad de sus credenciales.</p>
                  <h3 className="font-bold text-gray-800">4. Obligaciones del organizador</h3>
                  <p>El organizador garantiza que los sorteos que publique cumplen con la normativa aplicable en México (SEGOB, SAT) y que los premios ofrecidos existen y serán entregados al ganador verificado.</p>
                  <h3 className="font-bold text-gray-800">5. Pagos y comisiones</h3>
                  <p>Los pagos se procesan mediante Stripe Connect o método externo según elección del organizador. AMECREC A.C. retiene una comisión fija por boleto vendido, registrada en el ledger contable de la plataforma.</p>
                  <h3 className="font-bold text-gray-800">6. Reembolsos</h3>
                  <p>Los reembolsos aplican únicamente cuando el sorteo es cancelado por el organizador antes de la fecha de sorteo. Los boletos adquiridos en sorteos activos no son reembolsables salvo decisión expresa del organizador.</p>
                  <h3 className="font-bold text-gray-800">7. Limitación de responsabilidad</h3>
                  <p>AMECREC A.C. actúa como plataforma tecnológica. La responsabilidad sobre el cumplimiento del premio corresponde exclusivamente al organizador.</p>
                  <h3 className="font-bold text-gray-800">8. Jurisdicción</h3>
                  <p>Estos términos se rigen por las leyes de México. Para cualquier controversia las partes se someten a los tribunales competentes de Chihuahua, México.</p>
                </div>
              )}

              {/* ── PRIVACIDAD ── */}
              {modal === 'privacy' && (
                <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
                  <p className="text-xs text-gray-400">Última actualización: enero 2026 · Conforme a la LFPDPPP</p>
                  <h3 className="font-bold text-gray-800">Responsable del tratamiento</h3>
                  <p>AMECREC A.C., con domicilio en Chihuahua, Chihuahua, México. Contacto de privacidad: contacto@alianzaindigo.org</p>
                  <h3 className="font-bold text-gray-800">Datos que recopilamos</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Nombre completo y correo electrónico (registro)</li>
                    <li>Datos de pago procesados por Stripe (no almacenados en nuestros servidores)</li>
                    <li>Números de boletos adquiridos y transacciones</li>
                    <li>Dirección IP y datos de navegación (analítica)</li>
                  </ul>
                  <h3 className="font-bold text-gray-800">Finalidades</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Gestión de cuentas y autenticación</li>
                    <li>Procesamiento de compras y reembolsos</li>
                    <li>Envío de notificaciones relacionadas con sorteos</li>
                    <li>Cumplimiento de obligaciones fiscales y legales</li>
                  </ul>
                  <h3 className="font-bold text-gray-800">Derechos ARCO</h3>
                  <p>Puede ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición enviando un correo a contacto@alianzaindigo.org con identificación oficial.</p>
                  <h3 className="font-bold text-gray-800">Transferencias</h3>
                  <p>Sus datos no se venden ni transfieren a terceros, excepto a Stripe Inc. para el procesamiento de pagos y a las autoridades competentes cuando la ley lo requiera.</p>
                </div>
              )}

              {/* ── COOKIES ── */}
              {modal === 'cookies' && (
                <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
                  <p className="text-xs text-gray-400">Última actualización: enero 2026</p>
                  <h3 className="font-bold text-gray-800">¿Qué son las cookies?</h3>
                  <p>Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita nuestra plataforma.</p>
                  <h3 className="font-bold text-gray-800">Cookies que utilizamos</h3>
                  <div className="space-y-2">
                    {[
                      { name: 'Sesión (Supabase)', purpose: 'Mantener su sesión iniciada', type: 'Necesaria' },
                      { name: 'Preferencias', purpose: 'Recordar idioma y configuración', type: 'Funcional' },
                    ].map(c => (
                      <div key={c.name} className="bg-gray-50 rounded-lg p-3 text-xs">
                        <div className="font-medium text-gray-800">{c.name} <span className="text-blue-600">· {c.type}</span></div>
                        <div className="text-gray-500">{c.purpose}</div>
                      </div>
                    ))}
                  </div>
                  <h3 className="font-bold text-gray-800">Control de cookies</h3>
                  <p>Puede desactivar las cookies desde la configuración de su navegador, aunque esto puede afectar la funcionalidad de la plataforma. Las cookies de sesión son necesarias para el funcionamiento del servicio.</p>
                </div>
              )}

              {/* ── AVISO LEGAL ── */}
              {modal === 'legal' && (
                <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
                  <h3 className="font-bold text-gray-800">Titular</h3>
                  <p>AMECREC A.C. — Asociación Civil constituida conforme a las leyes de los Estados Unidos Mexicanos, con domicilio en Chihuahua, Chihuahua.</p>
                  <h3 className="font-bold text-gray-800">Actividad regulada</h3>
                  <p>Los sorteos vinculados a Lotería Nacional operan bajo la normativa de la Secretaría de Gobernación (SEGOB). AMECREC A.C. actúa exclusivamente como plataforma tecnológica intermediaria; la organización de cada sorteo es responsabilidad del organizador registrado.</p>
                  <h3 className="font-bold text-gray-800">Propiedad intelectual</h3>
                  <p>Todos los elementos de la plataforma (diseño, código, marcas, logotipos) son propiedad de AMECREC A.C. o de sus licenciantes. Queda prohibida su reproducción sin autorización expresa por escrito.</p>
                  <h3 className="font-bold text-gray-800">Exclusión de garantías</h3>
                  <p>La plataforma se ofrece "tal cual". AMECREC A.C. no garantiza la disponibilidad ininterrumpida del servicio ni se responsabiliza por pérdidas derivadas de fallas técnicas ajenas a su control.</p>
                  <h3 className="font-bold text-gray-800">Contacto legal</h3>
                  <p>contacto@alianzaindigo.org</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LandingPage;
