import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { LotteryType, PaymentMethod, UnsoldWinnerPolicy, RAFFLE_VALIDATION_RULES } from '@/lib/types';
import { createAuditLog } from '@/lib/database';
import {
  ArrowLeft, Image, DollarSign, Calendar, Hash, Ticket,
  CreditCard, AlertCircle, CheckCircle2, Upload, Info, Shield, Lock,
  Play, Rocket, ArrowRight, Loader2
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface CreateRaffleFormProps {
  onBack: () => void;
  onCreated: (raffleId: string) => void;
}

const CreateRaffleForm: React.FC<CreateRaffleFormProps> = ({ onBack, onCreated }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);

  // Plan limits
  const [maxTicketsPerRaffle, setMaxTicketsPerRaffle] = useState<number>(10000);
  const [planName, setPlanName] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('organizer_subscriptions')
      .select('*, plan:subscription_plans(name, max_tickets_per_raffle)')
      .eq('organizer_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.plan) {
          setMaxTicketsPerRaffle((data.plan as any).max_tickets_per_raffle);
          setPlanName((data.plan as any).name);
        }
      });
  }, [user]);

  // Created raffle state (for post-creation screen)
  const [createdRaffle, setCreatedRaffle] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pricePerTicket, setPricePerTicket] = useState('');
  const [totalTickets, setTotalTickets] = useState('');
  const [salesCloseDate, setSalesCloseDate] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('external');
  const [unsoldPolicy, setUnsoldPolicy] = useState<UnsoldWinnerPolicy>('desert');
  const [lotteryType, setLotteryType] = useState<string>('Mayor');
  const [lotteryDrawDate, setLotteryDrawDate] = useState('');
  const [lotteryDrawNumber, setLotteryDrawNumber] = useState('');

  const lotteryTypes: string[] = ['Mayor', 'Superior', 'Zodiaco', 'Especial', 'Gordo', 'Otro'];

  const unsoldPolicies: { value: UnsoldWinnerPolicy; label: string; desc: string }[] = [
    { value: 'desert', label: 'Desierto', desc: 'Se declara desierto el premio si el número ganador no fue vendido' },
    { value: 'redraw', label: 'Nuevo sorteo', desc: 'Se realiza un nuevo sorteo entre los boletos vendidos' },
    { value: 'absorb', label: 'Organizador absorbe', desc: 'El organizador absorbe el premio y lo gestiona externamente' },
    { value: 'extend', label: 'Extender venta', desc: 'Se extiende la venta hasta cubrir el número ganador' },
  ];

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    // Validation: lottery date must be defined (required for activation)
    if (!lotteryDrawDate) {
      toast({
        title: 'Fecha requerida',
        description: 'Se requiere la fecha oficial del sorteo de Lotería Nacional. Sin ella, no podrás activar el sorteo.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.from('raffles').insert({
        organizer_id: user.id,
        name,
        description,
        image_url: imageUrl || null,
        price_per_ticket: parseFloat(pricePerTicket),
        total_tickets: parseInt(totalTickets),
        sales_close_date: new Date(salesCloseDate).toISOString(),
        draw_date: new Date(drawDate).toISOString(),
        payment_method: paymentMethod,
        unsold_winner_policy: unsoldPolicy,
        status: 'draft',
        lottery_type: lotteryType,
        lottery_draw_date: lotteryDrawDate ? new Date(lotteryDrawDate).toISOString() : null,
        lottery_draw_number: lotteryDrawNumber || null,
        result_locked: false,
      }).select().single();

      if (error) {
        console.error('Error creating raffle:', error);
        toast({ title: 'Error al crear sorteo', description: error.message, variant: 'destructive' });
      } else if (data) {
        // NOTE: Tickets are NOT created here anymore.
        // The database trigger `enforce_raffle_state_machine` automatically calls
        // `generate_raffle_tickets()` when the raffle transitions from draft → active.
        // This ensures atomic ticket generation within the activation transaction.

        // Audit log
        await createAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: 'raffle_created',
          entityType: 'raffle',
          entityId: data.id,
          newValue: {
            name,
            pricePerTicket: parseFloat(pricePerTicket),
            totalTickets: parseInt(totalTickets),
            lotteryType,
            lotteryDrawDate,
            paymentMethod,
          },
        });

        toast({ title: 'Sorteo creado', description: `"${name}" se creó como borrador.` });
        
        // Show post-creation screen instead of navigating away
        setCreatedRaffle(data);
        setStep(5); // Step 5 = post-creation screen
      }
    } catch (err) {
      console.error('Exception creating raffle:', err);
      toast({ title: 'Error', description: 'No se pudo crear el sorteo', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleActivateNow = async () => {
    if (!createdRaffle || !user) return;
    setActivating(true);

    try {
      // Update status from draft to active
      // The DB trigger will automatically generate all ticket rows
      const { error } = await supabase
        .from('raffles')
        .update({ 
          status: 'active', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', createdRaffle.id);

      if (error) {
        console.error('Error activating raffle:', error);
        toast({ 
          title: 'Error al activar', 
          description: `No se pudo activar el sorteo: ${error.message}. Puedes intentarlo desde el panel del organizador.`, 
          variant: 'destructive' 
        });
        setActivating(false);
        return;
      }

      // Audit log
      await createAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: 'raffle_status_change',
        entityType: 'raffle',
        entityId: createdRaffle.id,
        oldValue: { status: 'draft' },
        newValue: { status: 'active' },
        details: { raffleName: createdRaffle.name, activatedFromCreation: true },
      });

      toast({ 
        title: 'Sorteo activado', 
        description: `"${createdRaffle.name}" está activo. Se generaron ${createdRaffle.total_tickets} boletos automáticamente. ¡Ya pueden comprar boletos!` 
      });
      onCreated(createdRaffle.id);
    } catch (err: any) {
      console.error('Exception activating raffle:', err);
      toast({ 
        title: 'Error al activar', 
        description: `Error inesperado: ${err?.message || 'desconocido'}. Puedes activarlo desde el panel.`, 
        variant: 'destructive' 
      });
    }
    setActivating(false);
  };

  const canProceedStep1 = name && pricePerTicket && totalTickets && parseInt(totalTickets) <= maxTicketsPerRaffle;
  const canProceedStep2 = salesCloseDate && drawDate;
  const canProceedStep3 = lotteryType && lotteryDrawDate;

  // ============================================================
  // STEP 5: POST-CREATION SCREEN
  // ============================================================
  if (step === 5 && createdRaffle) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
            {/* Success header */}
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-8 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-9 h-9 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Sorteo Creado Exitosamente</h2>
              <p className="text-emerald-100">"{createdRaffle.name}" está listo como borrador</p>
            </div>

            {/* Summary */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Nombre</div>
                  <div className="text-sm font-medium text-gray-900">{createdRaffle.name}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Precio/Boleto</div>
                  <div className="text-sm font-medium text-gray-900">${createdRaffle.price_per_ticket} MXN</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Total Boletos</div>
                  <div className="text-sm font-medium text-gray-900">{createdRaffle.total_tickets}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Ingreso Potencial</div>
                  <div className="text-sm font-medium text-emerald-600">
                    ${(createdRaffle.price_per_ticket * createdRaffle.total_tickets).toLocaleString('es-MX')} MXN
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4" /> ¿Qué sigue?
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0 mt-0.5">1</div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Activar el sorteo</p>
                      <p className="text-xs text-blue-700">Al activar, se generarán automáticamente los {createdRaffle.total_tickets} boletos y el sorteo estará disponible para la venta.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0 mt-0.5">2</div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Compartir con participantes</p>
                      <p className="text-xs text-blue-700">Los participantes podrán buscar y comprar boletos.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0 mt-0.5">3</div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Cerrar y declarar ganador</p>
                      <p className="text-xs text-blue-700">Cuando termine la venta, sigue el flujo: Cerrar → Validar → Bloquear → Declarar Ganador.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activation warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>Importante:</strong> Una vez activado, el precio y total de boletos no podrán modificarse. La activación es irreversible.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleActivateNow}
                  disabled={activating}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {activating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Activando y generando {createdRaffle.total_tickets} boletos...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-5 h-5" />
                      Activar Sorteo Ahora
                    </>
                  )}
                </button>

                <button
                  onClick={() => onCreated(createdRaffle.id)}
                  disabled={activating}
                  className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Ir al Panel (activar después)
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                También puedes activar el sorteo desde el Panel del Organizador en cualquier momento.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Crear Nuevo Sorteo</h1>
            <p className="text-gray-500 text-sm">Completa los pasos para configurar tu sorteo — Sorteos AMECREC</p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map(s => (
            <React.Fragment key={s}>
              <button
                onClick={() => s < step && setStep(s)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  s === step ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' :
                  s < step ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
              </button>
              {s < 4 && <div className={`flex-1 h-1 rounded-full ${s < step ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Información Básica</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del sorteo *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Auto BMW 2026"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Describe el premio y las condiciones del sorteo..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL de imagen o banner (opcional)</label>
              <div className="relative">
                <Image className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://ejemplo.com/imagen.jpg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio por boleto (MXN) *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={pricePerTicket}
                    onChange={e => setPricePerTicket(e.target.value)}
                    min="1"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="500.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total de boletos *</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={totalTickets}
                    onChange={e => setTotalTickets(e.target.value)}
                    min="10"
                    max={maxTicketsPerRaffle}
                    className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:border-transparent ${
                      totalTickets && parseInt(totalTickets) > maxTicketsPerRaffle
                        ? 'border-red-400 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="100"
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  {totalTickets ? (
                    <p className="text-xs text-gray-500">Números del 1 al {parseInt(totalTickets).toLocaleString('es-MX')}</p>
                  ) : <span />}
                  <p className={`text-xs font-medium ${totalTickets && parseInt(totalTickets) > maxTicketsPerRaffle ? 'text-red-600' : 'text-gray-400'}`}>
                    Máximo: {maxTicketsPerRaffle.toLocaleString('es-MX')} {planName ? `(Plan ${planName})` : ''}
                  </p>
                </div>
                {totalTickets && parseInt(totalTickets) > maxTicketsPerRaffle && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Tu plan {planName} permite máximo {maxTicketsPerRaffle.toLocaleString('es-MX')} boletos por sorteo. Actualiza tu plan para crear sorteos más grandes.
                  </div>
                )}
              </div>
            </div>

            {/* Immutability warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>Importante:</strong> El precio y total de boletos no podrán modificarse después de activar el sorteo. El total de boletos no podrá cambiar después de la primera venta.
                </p>
              </div>
            </div>

            {pricePerTicket && totalTickets && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-700 mb-1">
                  <Info className="w-4 h-4" />
                  <span className="text-sm font-medium">Resumen</span>
                </div>
                <p className="text-sm text-blue-600">
                  Ingreso potencial: <strong>${(parseFloat(pricePerTicket) * parseInt(totalTickets)).toLocaleString('es-MX')} MXN</strong> ({totalTickets} boletos x ${pricePerTicket})
                </p>
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente: Fechas y Pagos
            </button>
          </div>
        )}

        {/* Step 2: Dates & Payment */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Fechas y Método de Pago</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cierre de venta *</label>
                <input
                  type="datetime-local"
                  value={salesCloseDate}
                  onChange={e => setSalesCloseDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del sorteo *</label>
                <input
                  type="datetime-local"
                  value={drawDate}
                  onChange={e => setDrawDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Método de cobro</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('stripe')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'stripe' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard className={`w-6 h-6 mb-2 ${paymentMethod === 'stripe' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="font-medium text-sm">Stripe Connect</div>
                  <div className="text-xs text-gray-500 mt-0.5">Pagos automáticos con tarjeta</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('external')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'external' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DollarSign className={`w-6 h-6 mb-2 ${paymentMethod === 'external' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="font-medium text-sm">Pago Externo</div>
                  <div className="text-xs text-gray-500 mt-0.5">Transferencia, efectivo, etc.</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Si el número ganador no fue vendido</label>
              <div className="space-y-2">
                {unsoldPolicies.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setUnsoldPolicy(p.value)}
                    className={`w-full p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                      unsoldPolicy === p.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                      unsoldPolicy === p.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {unsoldPolicy === p.value && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{p.label}</div>
                      <div className="text-xs text-gray-500">{p.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Anterior
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Siguiente: Lotería Nacional
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Lottery Configuration */}
        {step === 3 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Vinculación con Lotería Nacional</h2>
            <p className="text-sm text-gray-500">Configura el sorteo oficial que determinará al ganador.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de sorteo *</label>
              <select
                value={lotteryType}
                onChange={e => setLotteryType(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {lotteryTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del sorteo oficial * <span className="text-red-500">(requerido para activación)</span></label>
              <input
                type="date"
                value={lotteryDrawDate}
                onChange={e => setLotteryDrawDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número/Identificador del sorteo</label>
              <input
                type="text"
                value={lotteryDrawNumber}
                onChange={e => setLotteryDrawNumber(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Sorteo Mayor No. 3921"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <strong>Importante:</strong> El ganador se determinará exclusivamente con base en el resultado oficial del sorteo de Lotería Nacional. Esta configuración no podrá modificarse después de activar el sorteo. Verifica que la fecha coincida con el sorteo real.
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Anterior
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canProceedStep3}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Siguiente: Confirmar
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Create */}
        {step === 4 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Confirmar y Crear Sorteo</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Nombre</div>
                  <div className="text-sm font-medium text-gray-900">{name}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Precio/Boleto</div>
                  <div className="text-sm font-medium text-gray-900">${pricePerTicket} MXN</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Total Boletos</div>
                  <div className="text-sm font-medium text-gray-900">{totalTickets} (1 - {totalTickets})</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Ingreso Potencial</div>
                  <div className="text-sm font-medium text-emerald-600">${(parseFloat(pricePerTicket || '0') * parseInt(totalTickets || '0')).toLocaleString('es-MX')} MXN</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Cierre de Venta</div>
                  <div className="text-sm font-medium text-gray-900">{salesCloseDate ? new Date(salesCloseDate).toLocaleString('es-MX') : '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Método de Pago</div>
                  <div className="text-sm font-medium text-gray-900">{paymentMethod === 'stripe' ? 'Stripe Connect' : 'Pago Externo'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Sorteo Lotería</div>
                  <div className="text-sm font-medium text-gray-900">{lotteryType} - {lotteryDrawNumber || 'Sin número'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Política No Vendido</div>
                  <div className="text-sm font-medium text-gray-900">{unsoldPolicies.find(p => p.value === unsoldPolicy)?.label}</div>
                </div>
              </div>

              {description && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Descripción</div>
                  <div className="text-sm text-gray-700">{description}</div>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                  El sorteo se creará como <strong>borrador</strong>. En el siguiente paso podrás activarlo inmediatamente o hacerlo después desde el panel. Al activar, se generarán automáticamente todos los boletos.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Anterior
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-green-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-200"
              >
                {loading ? 'Creando...' : 'Crear Sorteo'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateRaffleForm;



