import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { SubscriptionPlan, OrganizerSubscription } from '@/lib/types';
import { createAuditLog } from '@/lib/database';
import {
  CheckCircle2, Crown, Zap, Star, Loader2, AlertCircle,
  ArrowRight, Shield, RefreshCw, Calendar, CreditCard,
  Ticket, BarChart3, X, Info, Sparkles, Check, ChevronRight
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const PlanSelector: React.FC = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<OrganizerSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch available plans
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });

      if (plansError) {
        console.error('Error fetching plans:', plansError);
      } else if (plansData) {
        setPlans(plansData);
      }

      // Fetch current subscription
      const { data: subData, error: subError } = await supabase
        .from('organizer_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('organizer_id', user.id)
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) {
        console.error('Error fetching subscription:', subError);
      } else if (subData) {
        setCurrentSubscription(subData);
        setSelectedPlanId(subData.plan_id);
      }
    } catch (err) {
      console.error('Error loading plan data:', err);
    }
    setLoading(false);
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    // If already on this plan, do nothing
    if (currentSubscription?.plan_id === plan.id && currentSubscription?.status === 'active') {
      toast({ title: 'Plan actual', description: 'Ya estás suscrito a este plan.' });
      return;
    }
    setConfirmPlan(plan);
    setShowConfirmModal(true);
  };

  const handleConfirmSubscription = async () => {
    if (!confirmPlan || !user) return;
    setSubscribing(true);

    try {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      if (currentSubscription) {
        // Update existing subscription
        const { error } = await supabase
          .from('organizer_subscriptions')
          .update({
            plan_id: confirmPlan.id,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          })
          .eq('id', currentSubscription.id);

        if (error) {
          console.error('Error updating subscription:', error);
          toast({ title: 'Error', description: `No se pudo actualizar el plan: ${error.message}`, variant: 'destructive' });
          setSubscribing(false);
          return;
        }

        await createAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: 'subscription_changed',
          entityType: 'organizer_subscription',
          entityId: currentSubscription.id,
          oldValue: { plan_id: currentSubscription.plan_id, plan_name: currentSubscription.plan?.name },
          newValue: { plan_id: confirmPlan.id, plan_name: confirmPlan.name },
          details: { price: confirmPlan.price_monthly },
        });

        toast({
          title: 'Plan actualizado',
          description: `Tu plan ha sido cambiado a "${confirmPlan.name}". Los nuevos límites aplican de inmediato.`,
        });
      } else {
        // Create new subscription
        const { data, error } = await supabase
          .from('organizer_subscriptions')
          .insert({
            organizer_id: user.id,
            plan_id: confirmPlan.id,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating subscription:', error);
          toast({ title: 'Error', description: `No se pudo crear la suscripción: ${error.message}`, variant: 'destructive' });
          setSubscribing(false);
          return;
        }

        await createAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: 'subscription_created',
          entityType: 'organizer_subscription',
          entityId: data?.id,
          newValue: { plan_id: confirmPlan.id, plan_name: confirmPlan.name },
          details: { price: confirmPlan.price_monthly },
        });

        toast({
          title: 'Suscripción activada',
          description: `Te has suscrito al plan "${confirmPlan.name}". ¡Ya puedes crear sorteos con los límites de tu plan!`,
        });
      }

      setShowConfirmModal(false);
      setConfirmPlan(null);
      await loadData();
    } catch (err: any) {
      console.error('Subscription error:', err);
      toast({ title: 'Error', description: `Error inesperado: ${err?.message || 'desconocido'}`, variant: 'destructive' });
    }
    setSubscribing(false);
  };

  const handleCancelSubscription = async () => {
    if (!currentSubscription || !user) return;

    const confirmed = confirm(
      '¿Estás seguro de cancelar tu suscripción?\n\n' +
      'Tu plan actual seguirá activo hasta el final del período de facturación. ' +
      'Después de eso, no podrás crear nuevos sorteos hasta que selecciones un plan.'
    );
    if (!confirmed) return;

    setSubscribing(true);
    try {
      const { error } = await supabase
        .from('organizer_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', currentSubscription.id);

      if (error) {
        toast({ title: 'Error', description: `No se pudo cancelar: ${error.message}`, variant: 'destructive' });
      } else {
        await createAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: 'subscription_cancelled',
          entityType: 'organizer_subscription',
          entityId: currentSubscription.id,
          oldValue: { plan_id: currentSubscription.plan_id, status: 'active' },
          newValue: { status: 'cancelled' },
        });

        toast({
          title: 'Suscripción cancelada',
          description: 'Tu plan ha sido cancelado. Los sorteos activos no se verán afectados.',
        });
        await loadData();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Error desconocido', variant: 'destructive' });
    }
    setSubscribing(false);
  };

  const getPlanIcon = (index: number) => {
    switch (index) {
      case 0: return <Zap className="w-6 h-6" />;
      case 1: return <Star className="w-6 h-6" />;
      case 2: return <Crown className="w-6 h-6" />;
      default: return <Sparkles className="w-6 h-6" />;
    }
  };

  const getPlanGradient = (index: number) => {
    switch (index) {
      case 0: return 'from-gray-500 to-gray-600';
      case 1: return 'from-blue-600 to-indigo-600';
      case 2: return 'from-amber-500 to-orange-600';
      default: return 'from-purple-500 to-pink-600';
    }
  };

  const getPlanBorder = (index: number, isCurrentPlan: boolean) => {
    if (isCurrentPlan) return 'border-emerald-400 ring-2 ring-emerald-200';
    switch (index) {
      case 1: return 'border-blue-300';
      case 2: return 'border-amber-300';
      default: return 'border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-gray-500">Cargando planes disponibles...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Current Plan Banner */}
      {currentSubscription && currentSubscription.status === 'active' && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-900">
                  Plan Actual: {currentSubscription.plan?.name || 'Plan Activo'}
                </h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Suscripción activa — ${currentSubscription.plan?.price_monthly?.toFixed(2) || '0.00'} MXN/mes
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-emerald-600">
                  {currentSubscription.current_period_start && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Desde: {new Date(currentSubscription.current_period_start).toLocaleDateString('es-MX')}
                    </span>
                  )}
                  {currentSubscription.current_period_end && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Próxima renovación: {new Date(currentSubscription.current_period_end).toLocaleDateString('es-MX')}
                    </span>
                  )}
                  {currentSubscription.plan && (
                    <>
                      <span className="flex items-center gap-1">
                        <Ticket className="w-3.5 h-3.5" />
                        {currentSubscription.plan.max_active_raffles >= 999 ? 'Sorteos ilimitados' : `${currentSubscription.plan.max_active_raffles} sorteos activos`}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Hasta {currentSubscription.plan.max_tickets_per_raffle.toLocaleString()} boletos/sorteo
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleCancelSubscription}
              disabled={subscribing}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              Cancelar plan
            </button>
          </div>
        </div>
      )}

      {/* No Plan Banner */}
      {!currentSubscription && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-900">Sin plan activo</h3>
              <p className="text-sm text-amber-700 mt-0.5">
                Selecciona un plan para desbloquear todas las funcionalidades y comenzar a crear sorteos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      {plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay planes disponibles</h3>
          <p className="text-gray-500 text-sm">Los planes de suscripción aún no han sido configurados por el administrador.</p>
          <button
            onClick={loadData}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 mx-auto"
          >
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, index) => {
            const isCurrentPlan = currentSubscription?.plan_id === plan.id && currentSubscription?.status === 'active';
            const isPopular = index === 1; // Middle plan is "popular"
            const gradient = getPlanGradient(index);
            const borderClass = getPlanBorder(index, isCurrentPlan);

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 overflow-hidden transition-all hover:shadow-lg ${borderClass} ${
                  isPopular && !isCurrentPlan ? 'scale-[1.02]' : ''
                }`}
              >
                {/* Popular badge */}
                {isPopular && !isCurrentPlan && (
                  <div className="absolute -top-0 left-0 right-0">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold text-center py-1.5">
                      MAS POPULAR
                    </div>
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrentPlan && (
                  <div className="absolute -top-0 left-0 right-0">
                    <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold text-center py-1.5 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> TU PLAN ACTUAL
                    </div>
                  </div>
                )}

                <div className={`p-6 ${isPopular || isCurrentPlan ? 'pt-10' : ''}`}>
                  {/* Plan icon & name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-white`}>
                      {getPlanIcon(index)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      {plan.description && (
                        <p className="text-xs text-gray-500">{plan.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-gray-900">
                        ${plan.price_monthly.toFixed(0)}
                      </span>
                      <span className="text-sm text-gray-500">/mes</span>
                    </div>
                    {plan.price_monthly > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        ${(plan.price_monthly * 12).toLocaleString('es-MX')} MXN/año
                      </p>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Ticket className="w-4 h-4 text-gray-400" />
                        Sorteos activos
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        {plan.max_active_raffles >= 999 ? 'Ilimitados' : plan.max_active_raffles}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <BarChart3 className="w-4 h-4 text-gray-400" />
                        Boletos por sorteo
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        {plan.max_tickets_per_raffle.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Features */}
                  {plan.features && (plan.features as string[]).length > 0 && (
                    <ul className="space-y-2 mb-6">
                      {(plan.features as string[]).map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Action button */}
                  {isCurrentPlan ? (
                    <div className="w-full py-3 bg-emerald-50 text-emerald-700 rounded-xl font-semibold text-center text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Plan activo
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={subscribing}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                        isPopular
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {currentSubscription ? (
                        <>
                          {plan.price_monthly > (currentSubscription.plan?.price_monthly || 0) ? 'Mejorar Plan' : 'Cambiar Plan'}
                          <ChevronRight className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          Seleccionar Plan <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info section */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-blue-900 mb-2">Información sobre los planes</h4>
            <ul className="space-y-1.5 text-xs text-blue-700">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                Todos los planes incluyen comisión fija por boleto vendido (registrada en ledger contable).
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                Los cambios de plan aplican de inmediato. Los nuevos límites se reflejan al crear sorteos.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                Los sorteos activos no se ven afectados al cambiar o cancelar tu plan.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                Puedes cancelar tu suscripción en cualquier momento sin penalización.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Refresh */}
      <div className="mt-4 text-center">
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 mx-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar planes
        </button>
      </div>

      {/* ============================================================ */}
      {/* CONFIRMATION MODAL */}
      {/* ============================================================ */}
      {showConfirmModal && confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`bg-gradient-to-r ${getPlanGradient(plans.indexOf(confirmPlan))} p-6 text-center`}>
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                {getPlanIcon(plans.indexOf(confirmPlan))}
              </div>
              <h3 className="text-xl font-bold text-white">
                {currentSubscription ? 'Cambiar Plan' : 'Confirmar Suscripción'}
              </h3>
              <p className="text-white/80 text-sm mt-1">Plan {confirmPlan.name}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Plan details */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Plan</span>
                    <p className="font-bold text-gray-900">{confirmPlan.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Precio mensual</span>
                    <p className="font-bold text-gray-900">${confirmPlan.price_monthly.toFixed(2)} MXN</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Sorteos activos</span>
                    <p className="font-bold text-gray-900">
                      {confirmPlan.max_active_raffles >= 999 ? 'Ilimitados' : confirmPlan.max_active_raffles}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Boletos por sorteo</span>
                    <p className="font-bold text-gray-900">{confirmPlan.max_tickets_per_raffle.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Change notice */}
              {currentSubscription && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      <strong>Cambio de plan:</strong> Tu plan actual ({currentSubscription.plan?.name}) será reemplazado por {confirmPlan.name}. 
                      Los nuevos límites aplican de inmediato. Los sorteos activos no se verán afectados.
                    </p>
                  </div>
                </div>
              )}

              {/* Features */}
              {confirmPlan.features && (confirmPlan.features as string[]).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-2">Incluye:</h4>
                  <ul className="space-y-1.5">
                    {(confirmPlan.features as string[]).slice(0, 5).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowConfirmModal(false); setConfirmPlan(null); }}
                  disabled={subscribing}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmSubscription}
                  disabled={subscribing}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {subscribing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {currentSubscription ? 'Cambiar Plan' : 'Suscribirme'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSelector;
