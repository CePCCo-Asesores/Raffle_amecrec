import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Raffle, AppView, RAFFLE_STATUS_LABELS, RAFFLE_STATUS_COLORS, RaffleStatus } from '@/lib/types';
import {
  getClosingSummary, ClosingSummary,
  closeRaffleAtomic, validateRaffleAtomic,
  lockRaffleAtomic, finalizeDrawAtomic,
  fetchAuditLogs, fetchResultLogs,
} from '@/lib/database';
import { sendRaffleClosedNotification, sendWinnerDeclaredNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Lock, Trophy, AlertCircle,
  Loader2, ShieldCheck, Hash, Calendar, DollarSign, Users, X,
  XCircle, Clock, FileText, Eye, RefreshCw, Ban, Pause, Play,
  Shield, Sparkles, PartyPopper, Copy, ExternalLink, Download,
  AlertTriangle, Info
} from 'lucide-react';

// ============================================================
// STEP DEFINITIONS
// ============================================================

type FlowStep = 'summary' | 'close' | 'validate' | 'lock' | 'draw' | 'result';

const STEPS: { id: FlowStep; label: string; icon: React.ReactNode; statusRequired?: RaffleStatus; statusAfter?: RaffleStatus }[] = [
  { id: 'summary', label: 'Resumen', icon: <Eye className="w-4 h-4" /> },
  { id: 'close', label: 'Cerrar Ventas', icon: <Pause className="w-4 h-4" />, statusRequired: 'active', statusAfter: 'closed' },
  { id: 'validate', label: 'Validar Pagos', icon: <CheckCircle2 className="w-4 h-4" />, statusRequired: 'closed', statusAfter: 'validated' },
  { id: 'lock', label: 'Bloquear', icon: <Lock className="w-4 h-4" />, statusRequired: 'validated', statusAfter: 'locked' },
  { id: 'draw', label: 'Sorteo', icon: <Trophy className="w-4 h-4" />, statusRequired: 'locked', statusAfter: 'winner_declared' },
  { id: 'result', label: 'Resultado', icon: <Sparkles className="w-4 h-4" /> },
];

// ============================================================
// COMPONENT
// ============================================================

interface RaffleClosingFlowProps {
  raffle: Raffle;
  onBack: () => void;
  onNavigate: (view: AppView, data?: any) => void;
}

const RaffleClosingFlow: React.FC<RaffleClosingFlowProps> = ({ raffle: initialRaffle, onBack, onNavigate }) => {
  const { user } = useAuth();
  const [raffle, setRaffle] = useState<Raffle>(initialRaffle);
  const [currentStep, setCurrentStep] = useState<FlowStep>('summary');
  const [summary, setSummary] = useState<ClosingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draw step state
  const [winningNumber, setWinningNumber] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [drawResult, setDrawResult] = useState<any>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);

  // ============================================================
  // LOAD DATA
  // ============================================================

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getClosingSummary(raffle.id);
    if (result.success && result.data) {
      setSummary(result.data);
      // Auto-detect current step based on raffle status
      autoDetectStep(result.data.status as RaffleStatus);
    } else {
      setError(result.error || 'Error al cargar resumen');
    }
    setLoading(false);
  }, [raffle.id]);

  const refreshRaffle = async () => {
    const { data } = await supabase.from('raffles').select('*').eq('id', raffle.id).single();
    if (data) setRaffle(data);
  };

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const autoDetectStep = (status: RaffleStatus) => {
    switch (status) {
      case 'active': setCurrentStep('summary'); break;
      case 'closed': setCurrentStep('validate'); break;
      case 'validated': setCurrentStep('lock'); break;
      case 'locked': setCurrentStep('draw'); break;
      case 'winner_declared': setCurrentStep('result'); break;
      default: setCurrentStep('summary'); break;
    }
  };

  // ============================================================
  // STEP ACTIONS
  // ============================================================

  const handleCloseRaffle = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    const result = await closeRaffleAtomic(raffle.id, user.id);
    if (result.success) {
      toast({ title: 'Rifa cerrada', description: 'Se han liberado todas las reservaciones pendientes. No se aceptan nuevas compras.' });
      sendRaffleClosedNotification(raffle.id);
      await refreshRaffle();
      await loadSummary();
      setCurrentStep('validate');
    } else {
      setError(result.error || 'Error al cerrar la rifa');
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleValidateRaffle = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    const result = await validateRaffleAtomic(raffle.id, user.id);
    if (result.success) {
      toast({ title: 'Rifa validada', description: `Pagos verificados. ${result.summary?.unpaid_tickets || 0} boletos sin confirmar pago.` });
      await refreshRaffle();
      await loadSummary();
      setCurrentStep('lock');
    } else {
      setError(result.error || 'Error al validar la rifa');
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleLockRaffle = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    const result = await lockRaffleAtomic(raffle.id, user.id);
    if (result.success) {
      toast({ title: 'Rifa bloqueada', description: 'La rifa ha sido bloqueada. Ya no se pueden hacer modificaciones. Procede al sorteo.' });
      await refreshRaffle();
      await loadSummary();
      setCurrentStep('draw');
    } else {
      setError(result.error || 'Error al bloquear la rifa');
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleFinalizeDraw = async () => {
    if (!user || !winningNumber) return;
    const num = parseInt(winningNumber);
    if (isNaN(num) || num < 1 || num > raffle.total_tickets) {
      setError(`El numero debe estar entre 1 y ${raffle.total_tickets}`);
      return;
    }

    setActionLoading(true);
    setError(null);

    const result = await finalizeDrawAtomic({
      raffleId: raffle.id,
      userId: user.id,
      winningNumber: num,
      evidenceUrl: evidenceUrl || undefined,
    });

    if (result.success) {
      setDrawResult(result.result);
      toast({ title: 'Sorteo finalizado', description: `Numero ganador: #${num} — Resultado registrado con hash inmutable.` });
      sendWinnerDeclaredNotification({ raffleId: raffle.id, winningNumber: num });
      await refreshRaffle();
      await loadSummary();
      setCurrentStep('result');
    } else {
      setError(result.error || 'Error al finalizar sorteo');
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  // ============================================================
  // HELPERS
  // ============================================================

  const getStepStatus = (step: FlowStep): 'completed' | 'current' | 'pending' | 'disabled' => {
    if (!summary) return 'disabled';
    const status = summary.status as RaffleStatus;
    const stepIndex = STEPS.findIndex(s => s.id === step);
    const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

    // Special: result step
    if (step === 'result') {
      return status === 'winner_declared' ? 'completed' : 'disabled';
    }
    if (step === 'summary') return 'completed';

    // Check if this step's action has already been performed
    const stepDef = STEPS[stepIndex];
    if (stepDef.statusAfter) {
      const statusOrder: RaffleStatus[] = ['draft', 'active', 'closed', 'validated', 'locked', 'winner_declared'];
      const currentIdx = statusOrder.indexOf(status);
      const afterIdx = statusOrder.indexOf(stepDef.statusAfter);
      if (currentIdx >= afterIdx) return 'completed';
    }

    if (step === currentStep) return 'current';
    if (stepIndex > currentStepIndex) return 'pending';
    return 'disabled';
  };

  const unsoldPolicyLabel = (policy: string) => {
    switch (policy) {
      case 'desert': return 'Desierto (no hay ganador si el boleto no fue vendido)';
      case 'redraw': return 'Re-sorteo (se selecciona otro numero)';
      case 'absorb': return 'Absorber (el organizador absorbe el boleto)';
      case 'extend': return 'Extender (se extiende el plazo de venta)';
      default: return policy;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Cargando datos del sorteo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Cierre y Sorteo</h1>
            <p className="text-gray-500 text-sm">{raffle.name}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${RAFFLE_STATUS_COLORS[raffle.status]}`}>
            {RAFFLE_STATUS_LABELS[raffle.status]}
          </span>
        </div>

        {/* Step Progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => {
              const status = getStepStatus(step.id);
              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => {
                      if (status === 'completed' || status === 'current') setCurrentStep(step.id);
                    }}
                    disabled={status === 'disabled' || status === 'pending'}
                    className={`flex flex-col items-center gap-2 transition-all ${
                      status === 'completed' ? 'cursor-pointer' :
                      status === 'current' ? 'cursor-default' :
                      'cursor-not-allowed opacity-40'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      status === 'completed' ? 'bg-emerald-500 text-white' :
                      status === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : step.icon}
                    </div>
                    <span className={`text-xs font-medium ${
                      status === 'completed' ? 'text-emerald-700' :
                      status === 'current' ? 'text-blue-700' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded ${
                      getStepStatus(STEPS[i + 1].id) === 'completed' || getStepStatus(step.id) === 'completed' && getStepStatus(STEPS[i + 1].id) !== 'disabled'
                        ? 'bg-emerald-300' : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded"><X className="w-4 h-4 text-red-500" /></button>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: SUMMARY */}
        {/* ============================================================ */}
        {currentStep === 'summary' && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" /> Resumen de la Rifa
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="text-xs text-blue-600 font-medium mb-1">Total Boletos</div>
                  <div className="text-2xl font-bold text-blue-900">{summary.total_tickets}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4">
                  <div className="text-xs text-emerald-600 font-medium mb-1">Vendidos</div>
                  <div className="text-2xl font-bold text-emerald-900">{summary.total_sold}</div>
                  <div className="text-xs text-emerald-600">{Math.round((summary.total_sold / summary.total_tickets) * 100)}%</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <div className="text-xs text-purple-600 font-medium mb-1">Ingresos</div>
                  <div className="text-2xl font-bold text-purple-900">${summary.revenue?.toLocaleString()}</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4">
                  <div className="text-xs text-amber-600 font-medium mb-1">Disponibles</div>
                  <div className="text-2xl font-bold text-amber-900">{summary.available_tickets}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Detalles del Sorteo</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Precio/boleto</span><span className="font-medium">${summary.price_per_ticket}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Fecha sorteo</span><span className="font-medium">{summary.draw_date ? new Date(summary.draw_date).toLocaleDateString('es-MX') : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Tipo loteria</span><span className="font-medium">{summary.lottery_type || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">No. sorteo loteria</span><span className="font-medium">{summary.lottery_draw_number || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Fecha loteria</span><span className="font-medium">{summary.lottery_draw_date ? new Date(summary.lottery_draw_date).toLocaleDateString('es-MX') : '-'}</span></div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Estado de Boletos</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Pagados</span><span className="font-medium text-emerald-700">{summary.paid_tickets}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Vendidos (sin confirmar pago)</span><span className="font-medium text-blue-700">{summary.sold_tickets}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Disponibles</span><span className="font-medium text-gray-700">{summary.available_tickets}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Reservados</span><span className="font-medium text-amber-700">{summary.reserved_tickets}</span></div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Politica boleto no vendido</span>
                      <span className="font-medium text-xs">{unsoldPolicyLabel(summary.unsold_policy)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{summary.total_sold} de {summary.total_tickets} vendidos</span>
                  <span>{Math.round((summary.total_sold / summary.total_tickets) * 100)}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, (summary.total_sold / summary.total_tickets) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-blue-800 mb-1">Flujo de cierre y sorteo</h4>
                  <p className="text-xs text-blue-700">
                    El proceso sigue un flujo irreversible para garantizar la transparencia:
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-blue-700 font-medium flex-wrap">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">1. Cerrar Ventas</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">2. Validar Pagos</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">3. Bloquear</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">4. Sorteo</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">5. Resultado</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action */}
            {summary.status === 'active' && (
              <div className="flex justify-end">
                <button
                  onClick={() => setCurrentStep('close')}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-bold hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg"
                >
                  Comenzar Cierre <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: CLOSE */}
        {/* ============================================================ */}
        {currentStep === 'close' && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Pause className="w-5 h-5 text-amber-600" /> Paso 1: Cerrar Ventas
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Al cerrar la rifa se detienen todas las ventas de boletos. Las reservaciones pendientes se liberan automaticamente.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-800">Accion irreversible</h4>
                    <p className="text-xs text-amber-700 mt-1">Una vez cerrada, la rifa no puede volver a estado "Activa". Asegurate de que todos los participantes hayan tenido oportunidad de comprar.</p>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-amber-200">
                        <span className="text-amber-600">Boletos vendidos</span>
                        <p className="font-bold text-gray-900 text-lg">{summary.total_sold}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-amber-200">
                        <span className="text-amber-600">Reservaciones</span>
                        <p className="font-bold text-gray-900 text-lg">{summary.reserved_tickets}</p>
                        <span className="text-[10px] text-amber-500">Se liberaran</span>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-amber-200">
                        <span className="text-amber-600">Ingresos</span>
                        <p className="font-bold text-gray-900 text-lg">${summary.revenue?.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setCurrentStep('summary')} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Volver
                </button>
                <button
                  onClick={handleCloseRaffle}
                  disabled={actionLoading || summary.status !== 'active'}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-bold hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {actionLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Cerrando...</> : <><Pause className="w-4 h-4" /> Cerrar Ventas</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: VALIDATE */}
        {/* ============================================================ */}
        {currentStep === 'validate' && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" /> Paso 2: Validar Pagos
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Verifica que todos los boletos vendidos tengan su pago confirmado antes de proceder al sorteo.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-emerald-900">{summary.paid_tickets}</div>
                  <div className="text-xs text-emerald-600">Pagados</div>
                </div>
                <div className={`rounded-xl p-4 text-center ${summary.sold_tickets > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <AlertCircle className={`w-6 h-6 mx-auto mb-2 ${summary.sold_tickets > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                  <div className={`text-2xl font-bold ${summary.sold_tickets > 0 ? 'text-amber-900' : 'text-gray-400'}`}>{summary.sold_tickets}</div>
                  <div className={`text-xs ${summary.sold_tickets > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Sin confirmar pago</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <Users className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">{summary.available_tickets}</div>
                  <div className="text-xs text-gray-500">No vendidos</div>
                </div>
              </div>

              {summary.sold_tickets > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-800">Hay {summary.sold_tickets} boletos sin confirmar pago</h4>
                      <p className="text-xs text-amber-700 mt-1">
                        Puedes continuar con la validacion. Los boletos vendidos sin pago confirmado seran considerados segun la politica de la rifa.
                        Puedes marcar pagos manualmente desde el panel de boletos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {summary.sold_tickets === 0 && summary.paid_tickets > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-800">Todos los boletos vendidos tienen pago confirmado.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setCurrentStep('summary')} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Volver
                </button>
                <button
                  onClick={handleValidateRaffle}
                  disabled={actionLoading || summary.status !== 'closed'}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-bold hover:from-blue-600 hover:to-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {actionLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Validando...</> : <><CheckCircle2 className="w-4 h-4" /> Validar y Continuar</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: LOCK */}
        {/* ============================================================ */}
        {currentStep === 'lock' && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" /> Paso 3: Bloquear Rifa
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Bloquear la rifa congela todos los datos. Despues de este paso no se pueden hacer modificaciones de ningun tipo.
              </p>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-800 mb-2">Al bloquear la rifa:</h4>
                    <ul className="text-xs text-indigo-700 space-y-1.5">
                      <li className="flex items-center gap-2"><Lock className="w-3 h-3" /> No se pueden modificar datos de la rifa</li>
                      <li className="flex items-center gap-2"><Lock className="w-3 h-3" /> No se pueden agregar ni quitar boletos</li>
                      <li className="flex items-center gap-2"><Lock className="w-3 h-3" /> No se pueden procesar reembolsos</li>
                      <li className="flex items-center gap-2"><Lock className="w-3 h-3" /> El estado financiero queda congelado</li>
                      <li className="flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> Se registra quien bloqueo y cuando</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Resumen antes de bloquear</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-gray-400 text-xs">Boletos vendidos</span><p className="font-bold text-gray-900">{summary.total_sold}</p></div>
                  <div><span className="text-gray-400 text-xs">Pagados</span><p className="font-bold text-emerald-700">{summary.paid_tickets}</p></div>
                  <div><span className="text-gray-400 text-xs">Ingresos</span><p className="font-bold text-purple-700">${summary.revenue?.toLocaleString()}</p></div>
                  <div><span className="text-gray-400 text-xs">No vendidos</span><p className="font-bold text-gray-500">{summary.available_tickets}</p></div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setCurrentStep('validate')} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Volver
                </button>
                <button
                  onClick={handleLockRaffle}
                  disabled={actionLoading || summary.status !== 'validated'}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {actionLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Bloqueando...</> : <><Lock className="w-4 h-4" /> Bloquear Rifa</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: DRAW */}
        {/* ============================================================ */}
        {currentStep === 'draw' && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" /> Paso 4: Realizar Sorteo
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Ingresa el numero ganador del sorteo oficial de la Loteria Nacional.
                El resultado se registrara con un hash criptografico inmutable.
              </p>

              {summary.lottery_type && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
                  <h4 className="text-xs font-bold text-purple-700 uppercase mb-2">Datos del Sorteo Oficial</h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-purple-500 text-xs">Tipo</span><p className="font-bold text-purple-900">{summary.lottery_type}</p></div>
                    <div><span className="text-purple-500 text-xs">No. Sorteo</span><p className="font-bold text-purple-900">{summary.lottery_draw_number || '-'}</p></div>
                    <div><span className="text-purple-500 text-xs">Fecha</span><p className="font-bold text-purple-900">{summary.lottery_draw_date ? new Date(summary.lottery_draw_date).toLocaleDateString('es-MX') : '-'}</p></div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">Numero Ganador</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    value={winningNumber}
                    onChange={e => { setWinningNumber(e.target.value); setConfirmDraw(false); }}
                    min="1"
                    max={raffle.total_tickets}
                    className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 rounded-xl text-3xl font-bold text-center focus:ring-4 focus:ring-purple-200 focus:border-purple-500 transition-all"
                    placeholder={`1 - ${raffle.total_tickets}`}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Rango valido: 1 a {raffle.total_tickets}</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">URL de Evidencia (opcional)</label>
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={e => setEvidenceUrl(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="https://loteria-nacional.gob.mx/resultado/..."
                />
                <p className="text-xs text-gray-400 mt-1">Link al resultado oficial de la Loteria Nacional</p>
              </div>

              {/* Confirmation */}
              {winningNumber && !confirmDraw && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-800">Confirma el numero ganador</h4>
                      <p className="text-xs text-amber-700 mt-1">
                        Esta accion es <strong>IRREVERSIBLE</strong>. El resultado se registrara con hash criptografico y no podra ser modificado.
                      </p>
                      <button
                        onClick={() => setConfirmDraw(true)}
                        className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors"
                      >
                        Confirmo que el numero #{winningNumber} es correcto
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {confirmDraw && winningNumber && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-800">Numero #{winningNumber} confirmado. Listo para finalizar.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setCurrentStep('lock')} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Volver
                </button>
                <button
                  onClick={handleFinalizeDraw}
                  disabled={actionLoading || !confirmDraw || !winningNumber || summary.status !== 'locked'}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {actionLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Finalizando...</> : <><Trophy className="w-4 h-4" /> Finalizar Sorteo</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP: RESULT */}
        {/* ============================================================ */}
        {currentStep === 'result' && summary && (
          <div className="space-y-6">
            {/* Winner Card */}
            <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 rounded-2xl p-8 text-white text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-8 w-20 h-20 border-2 border-white rounded-full" />
                <div className="absolute bottom-8 right-12 w-32 h-32 border-2 border-white rounded-full" />
                <div className="absolute top-12 right-20 w-12 h-12 border-2 border-white rounded-full" />
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Sorteo Finalizado</h2>
                <p className="text-white/80 text-sm mb-6">{summary.raffle_name}</p>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 inline-block mb-6">
                  <div className="text-xs text-white/60 uppercase tracking-wider mb-1">Numero Ganador</div>
                  <div className="text-6xl font-black">#{summary.winning_number}</div>
                </div>

                {summary.winner_name ? (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 max-w-md mx-auto">
                    <div className="text-xs text-white/60 uppercase tracking-wider mb-2">Ganador</div>
                    <div className="text-xl font-bold">{summary.winner_name}</div>
                    <div className="text-sm text-white/70">{summary.winner_email}</div>
                  </div>
                ) : (
                  <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl p-4 max-w-md mx-auto border border-amber-400/30">
                    <div className="text-xs text-amber-200 uppercase tracking-wider mb-1">Boleto No Vendido</div>
                    <div className="text-sm text-amber-100">
                      El numero ganador no fue vendido. Politica aplicable: <strong>{unsoldPolicyLabel(summary.unsold_policy)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Result Details */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" /> Certificado de Resultado
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Datos del Sorteo</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Rifa</span><span className="font-medium">{summary.raffle_name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Numero ganador</span><span className="font-bold text-purple-700">#{summary.winning_number}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Boletos vendidos</span><span className="font-medium">{summary.total_sold} / {summary.total_tickets}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ingresos totales</span><span className="font-medium">${summary.revenue?.toLocaleString()} MXN</span></div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Verificacion</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Tipo loteria</span><span className="font-medium">{summary.lottery_type || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">No. sorteo</span><span className="font-medium">{summary.lottery_draw_number || '-'}</span></div>
                    {summary.result_hash && (
                      <div>
                        <span className="text-gray-500 text-xs">Hash de resultado</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-[10px] bg-gray-200 px-2 py-1 rounded font-mono break-all">{summary.result_hash}</code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(summary.result_hash || '');
                              toast({ title: 'Hash copiado', description: 'Hash de resultado copiado al portapapeles.' });
                            }}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Copy className="w-3 h-3 text-gray-500" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                <span className="font-medium">Resultado inmutable — registrado con hash criptografico en la base de datos</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="flex-1 py-3 bg-white border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Volver al Panel
              </button>
              <button
                onClick={() => loadSummary()}
                className="py-3 px-6 bg-gray-100 rounded-xl font-medium text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Actualizar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RaffleClosingFlow;
