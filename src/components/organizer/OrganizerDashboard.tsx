import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Raffle, Ticket, AppView, RAFFLE_STATUS_LABELS, RAFFLE_STATUS_COLORS, RAFFLE_STATUS_TRANSITIONS, RaffleStatus, StripeConnectStatus, RefundRequest, RefundStats, RefundStatus, REFUND_STATUS_LABELS, REFUND_STATUS_COLORS, Dispute, DisputeStatus, DISPUTE_STATUS_LABELS, DISPUTE_STATUS_COLORS, DisputeMessage, DisputeStats, OrganizerSubscription } from '@/lib/types';
import { transitionRaffleStatus, declareWinner, validateRaffleTransition, createAuditLog } from '@/lib/database';
import { createConnectAccount, checkConnectStatus, handleConnectReturn } from '@/lib/stripe';
import { sendRaffleClosedNotification, sendWinnerDeclaredNotification } from '@/lib/notifications';
import { listRefundRequests, approveRefund, denyRefund, bulkRefundCancelledRaffle, getRefundStats } from '@/lib/refunds';
import { listDisputes, getDisputeDetail, addDisputeMessage, getDisputeStats } from '@/lib/disputes';
import PlanSelector from '@/components/organizer/PlanSelector';
import {
  Plus, Ticket as TicketIcon, DollarSign, TrendingUp, BarChart3,
  Eye, Edit, Trash2, Play, Pause, Trophy, Clock, CheckCircle2,
  AlertCircle, Users, Download, Search, Filter, MoreVertical,
  ChevronRight, Upload, X, Hash, Calendar, CreditCard, Ban,
  Lock, ShieldCheck, ArrowRight, FileText, Loader2, ExternalLink,
  RefreshCw, Wallet, Link2, Unlink, RotateCcw, AlertTriangle,
  ThumbsUp, ThumbsDown, MessageSquare, Zap, Scale, Send,
  ArrowUpRight, Paperclip, Image as ImageIcon, Crown
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';




interface OrganizerDashboardProps {
  onNavigate: (view: AppView, data?: any) => void;
}

const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({ onNavigate }) => {
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'raffles' | 'winner' | 'payments' | 'refunds' | 'disputes' | 'ext-payment-setup' | 'stripe' | 'reports' | 'plan'>('raffles');


  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRaffle, setSelectedRaffle] = useState<Raffle | null>(null);
  const [winnerNumber, setWinnerNumber] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [transitionErrors, setTransitionErrors] = useState<string[]>([]);
  
  // Stripe Connect state
  const [connectStatus, setConnectStatus] = useState<StripeConnectStatus>({
    connected: false,
    status: 'not_connected',
  });
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectChecking, setConnectChecking] = useState(true);

  // Refund management state
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [bankForm, setBankForm]               = useState({ bank_name: '', bank_account: '', bank_holder: '', payment_instructions: '' });
  const [bankSaving, setBankSaving]           = useState(false);
  const [bankSaved, setBankSaved]             = useState(false);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [paymentOrgNotes, setPaymentOrgNotes] = useState<Record<string, string>>({});
  const [refundStats, setRefundStats] = useState<RefundStats>({ total: 0, pending: 0, approved: 0, denied: 0, refunded: 0, failed: 0, total_amount_refunded: 0, total_amount_pending: 0 });
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [refundFilterStatus, setRefundFilterStatus] = useState<string>('all');
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null);
  const [showRefundReviewModal, setShowRefundReviewModal] = useState(false);
  const [selectedRefundRequest, setSelectedRefundRequest] = useState<RefundRequest | null>(null);
  const [refundReviewNotes, setRefundReviewNotes] = useState('');
  const [bulkRefundLoading, setBulkRefundLoading] = useState(false);

  // Dispute management state
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputeStats, setDisputeStats] = useState<DisputeStats>({ total: 0, open: 0, under_review: 0, resolved_participant: 0, resolved_organizer: 0, closed: 0 });
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputeFilter, setDisputeFilter] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [disputeMessages, setDisputeMessages] = useState<DisputeMessage[]>([]);
  const [showDisputeDetail, setShowDisputeDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newDisputeMessage, setNewDisputeMessage] = useState('');
  const [sendingDisputeMessage, setSendingDisputeMessage] = useState(false);
  const [disputeEvidenceText, setDisputeEvidenceText] = useState('');
  const [sendingEvidence, setSendingEvidence] = useState(false);


  useEffect(() => {
    if (user) {
      loadRaffles();
      loadConnectStatus();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'payments') {
      supabase
        .from('external_payment_requests')
        .select('*, profiles:participant_id(full_name, email), raffles:raffle_id(name)')
        .in('raffle_id', [])  // se llenará abajo
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .then(async () => {
          // Traer las rifas del organizador primero
          const { data: myRaffles } = await supabase
            .from('raffles').select('id').eq('organizer_id', user.id);
          if (!myRaffles?.length) { setPendingPayments([]); return; }
          const raffleIds = myRaffles.map((r: any) => r.id);
          const { data } = await supabase
            .from('external_payment_requests')
            .select('*, participant:participant_id(full_name, email), raffle:raffle_id(name, price_per_ticket)')
            .in('raffle_id', raffleIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
          setPendingPayments(data || []);
          setPendingPaymentsCount((data || []).length);
        });
    }
    if (user && activeTab === 'refunds') {
      loadRefundData();
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user && activeTab === 'disputes') {
      loadDisputeData();
    }
  }, [user, activeTab]);


  // Handle Connect return from Stripe
  useEffect(() => {
    const connectReturn = handleConnectReturn();
    if (connectReturn.isConnectReturn) {
      if (connectReturn.status === 'complete') {
        toast({ title: 'Stripe Connect', description: 'Proceso de onboarding completado. Verificando estado...' });
        setActiveTab('stripe');
        setTimeout(loadConnectStatus, 1000);
      } else if (connectReturn.status === 'refresh') {
        toast({ title: 'Stripe Connect', description: 'Necesitas completar el proceso de onboarding.', variant: 'destructive' });
        setActiveTab('stripe');
      }
    }
  }, []);

  const loadRaffles = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('raffles')
      .select('*')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setRaffles(data);
    setLoading(false);
  };

  const loadConnectStatus = async () => {
    setConnectChecking(true);
    const status = await checkConnectStatus();
    setConnectStatus(status);
    setConnectChecking(false);
  };

  const loadRefundData = async () => {
    setRefundsLoading(true);
    const [requestsResult, statsResult] = await Promise.all([
      listRefundRequests({ role: 'organizer' }),
      getRefundStats(),
    ]);
    if (requestsResult.requests) setRefundRequests(requestsResult.requests);
    setRefundStats(statsResult);
    setRefundsLoading(false);
  };

  const handleConnectOnboarding = async () => {
    setConnectLoading(true);
    const result = await createConnectAccount();

    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      setConnectLoading(false);
      return;
    }

    if (result.onboardingUrl) {
      window.location.href = result.onboardingUrl;
    }
    setConnectLoading(false);
  };

  const handleStatusTransition = async (raffle: Raffle, targetStatus: RaffleStatus) => {
    if (!user) return;

    // For draft → active, show confirmation
    if (raffle.status === 'draft' && targetStatus === 'active') {
      const confirmed = confirm(
        `¿Activar "${raffle.name}"?\n\n` +
        `Se generarán automáticamente ${raffle.total_tickets} boletos (del 1 al ${raffle.total_tickets}).\n` +
        `Precio por boleto: $${raffle.price_per_ticket} MXN\n` +
        `Ingreso potencial: $${(raffle.price_per_ticket * raffle.total_tickets).toLocaleString('es-MX')} MXN\n\n` +
        `IMPORTANTE: Una vez activado, el precio y total de boletos no podrán modificarse. Esta acción es irreversible.`
      );
      if (!confirmed) return;
    }

    const validation = validateRaffleTransition(raffle, targetStatus);
    if (!validation.valid) {
      setTransitionErrors(validation.errors);
      toast({ title: 'Transición no permitida', description: validation.errors.join('\n'), variant: 'destructive' });
      return;
    }

    // Show loading state
    toast({ title: 'Procesando...', description: `Cambiando estado a "${RAFFLE_STATUS_LABELS[targetStatus]}"...` });

    const result = await transitionRaffleStatus({
      raffle, targetStatus, userId: user.id, userEmail: user.email, userRole: user.role,
    });

    if (result.success) {
      // Reload raffles from DB to get fresh data (including any trigger-generated tickets)
      await loadRaffles();
      toast({ title: 'Estado actualizado', description: `El sorteo ahora está en estado: ${RAFFLE_STATUS_LABELS[targetStatus]}${targetStatus === 'active' ? `. Se generaron ${raffle.total_tickets} boletos automáticamente.` : ''}` });
      setTransitionErrors([]);

      if (targetStatus === 'closed') {
        sendRaffleClosedNotification(raffle.id);
        toast({ title: 'Notificaciones enviadas', description: 'Se notificará a todos los participantes que el sorteo ha cerrado.' });
      }
    } else {
      setTransitionErrors(result.errors);
      console.error('Transition errors:', result.errors);
      toast({ 
        title: 'Error en transición', 
        description: result.errors.join('\n') + '\n\nSi el problema persiste, verifica que la configuración del sorteo esté completa.', 
        variant: 'destructive' 
      });
    }
  };


  const loadTickets = async (raffle: Raffle) => {
    const { data } = await supabase
      .from('tickets')
      .select('*, participant:profiles(*)')
      .eq('raffle_id', raffle.id)
      .order('ticket_number');

    if (data) setTickets(data);
    setSelectedRaffle(raffle);
    setShowTicketsModal(true);
  };

  const markTicketPaid = async (ticket: Ticket) => {
    if (!user) return;
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'paid', marked_paid_by: user.id, marked_paid_at: new Date().toISOString() })
      .eq('id', ticket.id);

    if (!error) {
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: 'paid' } : t));
      await createAuditLog({
        userId: user.id, userEmail: user.email, action: 'ticket_marked_paid',
        entityType: 'ticket', entityId: ticket.id,
        details: { ticketNumber: ticket.ticket_number, raffleId: ticket.raffle_id },
      });
      toast({ title: 'Boleto marcado como pagado', description: `Boleto #${ticket.ticket_number}` });
    }
  };

  const handleDeclareWinner = async () => {
    if (!selectedRaffle || !winnerNumber || !user) return;
    const num = parseInt(winnerNumber);

    const result = await declareWinner({
      raffle: selectedRaffle, winningNumber: num, userId: user.id, userEmail: user.email,
      userRole: user.role, evidenceUrl: evidenceUrl || undefined,
    });

    if (result.success) {
      setRaffles(prev => prev.map(r => r.id === selectedRaffle.id ? {
        ...r, winning_number: num, status: 'winner_declared' as RaffleStatus, result_locked: true,
      } : r));
      toast({ title: 'Ganador declarado', description: `Número ganador: ${num} — Registrado con hash inmutable` });
      setShowWinnerModal(false);
      setWinnerNumber('');
      setEvidenceUrl('');

      sendWinnerDeclaredNotification({
        raffleId: selectedRaffle.id,
        winningNumber: num,
      });
      toast({ title: 'Notificaciones enviadas', description: 'Se notificará al ganador y a todos los participantes.' });
    } else {
      toast({ title: 'Error al declarar ganador', description: result.errors.join('\n'), variant: 'destructive' });
    }
  };

  // ============================================================
  // REFUND MANAGEMENT HANDLERS
  // ============================================================

  const openRefundReview = (req: RefundRequest) => {
    setSelectedRefundRequest(req);
    setRefundReviewNotes('');
    setShowRefundReviewModal(true);
  };

  const handleApproveRefund = async () => {
    if (!selectedRefundRequest) return;
    setProcessingRefundId(selectedRefundRequest.id);

    const result = await approveRefund({
      refundRequestId: selectedRefundRequest.id,
      organizerNotes: refundReviewNotes || undefined,
    });

    if (result.success) {
      toast({
        title: 'Reembolso aprobado',
        description: `Boleto #${selectedRefundRequest.ticket_number} — $${selectedRefundRequest.amount} MXN reembolsado${result.stripeRefundId ? '. Ref: ' + result.stripeRefundId : ''}`,
      });
      setShowRefundReviewModal(false);
      loadRefundData();
      loadRaffles(); // Refresh raffle counts
    } else {
      toast({ title: 'Error al procesar reembolso', description: result.error || 'Error desconocido', variant: 'destructive' });
    }
    setProcessingRefundId(null);
  };

  const handleDenyRefund = async () => {
    if (!selectedRefundRequest) return;
    setProcessingRefundId(selectedRefundRequest.id);

    const result = await denyRefund({
      refundRequestId: selectedRefundRequest.id,
      organizerNotes: refundReviewNotes || 'Solicitud rechazada por el organizador',
    });

    if (result.success) {
      toast({ title: 'Solicitud rechazada', description: `Boleto #${selectedRefundRequest.ticket_number} — Solicitud rechazada` });
      setShowRefundReviewModal(false);
      loadRefundData();
    } else {
      toast({ title: 'Error', description: result.error || 'Error desconocido', variant: 'destructive' });
    }
    setProcessingRefundId(null);
  };

  const handleBulkRefund = async (raffle: Raffle) => {
    if (!confirm(`¿Estás seguro de procesar reembolsos masivos para "${raffle.name}"? Esta acción reembolsará todos los boletos vendidos.`)) return;
    setBulkRefundLoading(true);

    const result = await bulkRefundCancelledRaffle(raffle.id);

    if (result.success) {
      toast({
        title: 'Reembolsos masivos procesados',
        description: `${result.processed} de ${result.total} boletos reembolsados${result.failed ? ` (${result.failed} fallidos)` : ''}`,
      });
      loadRefundData();
      loadRaffles();
    } else {
      toast({ title: 'Error en reembolsos masivos', description: result.error || 'Error desconocido', variant: 'destructive' });
    }
    setBulkRefundLoading(false);

  };

  // ============================================================
  // DISPUTE MANAGEMENT HANDLERS
  // ============================================================

  const loadDisputeData = async () => {
    setDisputesLoading(true);
    const [disputesResult, statsResult] = await Promise.all([
      listDisputes(),
      getDisputeStats(),
    ]);
    if (disputesResult.disputes) setDisputes(disputesResult.disputes);
    setDisputeStats(statsResult);
    setDisputesLoading(false);
  };

  const openDisputeDetail = async (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setShowDisputeDetail(true);
    setDetailLoading(true);
    setNewDisputeMessage('');
    setDisputeEvidenceText('');
    const result = await getDisputeDetail(dispute.id);
    if (result.dispute) setSelectedDispute(result.dispute);
    setDisputeMessages(result.messages);
    setDetailLoading(false);
  };

  const handleSendDisputeMessage = async () => {
    if (!selectedDispute || !newDisputeMessage.trim()) return;
    setSendingDisputeMessage(true);
    const result = await addDisputeMessage({
      disputeId: selectedDispute.id,
      message: newDisputeMessage.trim(),
    });
    if (result.success) {
      setNewDisputeMessage('');
      const detail = await getDisputeDetail(selectedDispute.id);
      setDisputeMessages(detail.messages);
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo enviar el mensaje', variant: 'destructive' });
    }
    setSendingDisputeMessage(false);
  };

  const handleSendEvidence = async () => {
    if (!selectedDispute || !disputeEvidenceText.trim()) return;
    setSendingEvidence(true);
    const result = await addDisputeMessage({
      disputeId: selectedDispute.id,
      message: `[EVIDENCIA/PERSPECTIVA DEL ORGANIZADOR]\n\n${disputeEvidenceText.trim()}`,
    });
    if (result.success) {
      setDisputeEvidenceText('');
      toast({ title: 'Evidencia enviada', description: 'Tu perspectiva ha sido registrada en la disputa.' });
      const detail = await getDisputeDetail(selectedDispute.id);
      setDisputeMessages(detail.messages);
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo enviar la evidencia', variant: 'destructive' });
    }
    setSendingEvidence(false);
  };

  const getMessageRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-50 border-red-200';
      case 'organizer': return 'bg-amber-50 border-amber-200';
      case 'participant': return 'bg-blue-50 border-blue-200';
      case 'system': return 'bg-gray-50 border-gray-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getMessageRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'organizer': return 'bg-amber-100 text-amber-700';
      case 'participant': return 'bg-blue-100 text-blue-700';
      case 'system': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'status_change': return <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />;
      case 'force_refund': return <DollarSign className="w-3.5 h-3.5 text-emerald-500" />;
      case 'admin_action': return <Scale className="w-3.5 h-3.5 text-red-500" />;
      case 'evidence': return <FileText className="w-3.5 h-3.5 text-amber-500" />;
      case 'system': return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
      default: return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  const getAvailableTransitions = (raffle: Raffle): { status: RaffleStatus; label: string; icon: React.ReactNode; color: string }[] => {
    const allowed = RAFFLE_STATUS_TRANSITIONS[raffle.status] || [];
    return allowed.map(status => {
      switch (status) {
        case 'active': return { status, label: 'Activar', icon: <Play className="w-3.5 h-3.5" />, color: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' };
        case 'closed': return { status, label: 'Cerrar Venta', icon: <Pause className="w-3.5 h-3.5" />, color: 'text-amber-700 bg-amber-50 hover:bg-amber-100' };
        case 'validated': return { status, label: 'Validar', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-blue-700 bg-blue-50 hover:bg-blue-100' };
        case 'locked': return { status, label: 'Bloquear', icon: <Lock className="w-3.5 h-3.5" />, color: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100' };
        case 'cancelled': return { status, label: 'Cancelar', icon: <Ban className="w-3.5 h-3.5" />, color: 'text-red-700 bg-red-50 hover:bg-red-100' };
        default: return { status, label: status, icon: <ArrowRight className="w-3.5 h-3.5" />, color: 'text-gray-700 bg-gray-50' };
      }
    });
  };

  const totalRevenue = raffles.reduce((sum, r) => sum + (r.revenue || 0), 0);
  const totalTicketsSold = raffles.reduce((sum, r) => sum + (r.tickets_sold || 0), 0);
  const activeRaffles = raffles.filter(r => r.status === 'active').length;
  const filteredRaffles = filterStatus === 'all' ? raffles : raffles.filter(r => r.status === filterStatus);
  const filteredRefunds = refundFilterStatus === 'all' ? refundRequests : refundRequests.filter(r => r.status === refundFilterStatus);
  const cancelledRafflesWithTickets = raffles.filter(r => r.status === 'cancelled' && r.tickets_sold > 0);
  const activeDisputeCount = disputeStats.open + disputeStats.under_review;
  const filteredDisputes = disputeFilter === 'all' ? disputes : disputes.filter(d => d.status === disputeFilter);

  const exportCSV = (raffle: Raffle) => {
    const csvContent = tickets.map(t => `${t.ticket_number},${t.status},${(t as any).participant?.full_name || ''},${(t as any).participant?.email || ''}`).join('\n');
    const blob = new Blob([`Numero,Estado,Participante,Email\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${raffle.name.replace(/\s+/g, '_')}_boletos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel del Organizador</h1>
            <p className="text-gray-500 mt-1">Gestiona tus sorteos y ventas — Sorteos AMECREC</p>
          </div>
          <button
            onClick={() => onNavigate('organizer-create-raffle')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> Nuevo Sorteo
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Sorteos Activos', value: activeRaffles.toString(), icon: <TicketIcon className="w-5 h-5" />, color: 'from-blue-500 to-blue-600' },
            { label: 'Boletos Vendidos', value: totalTicketsSold.toLocaleString(), icon: <BarChart3 className="w-5 h-5" />, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Ingresos Totales', value: `$${totalRevenue.toLocaleString()}`, icon: <DollarSign className="w-5 h-5" />, color: 'from-purple-500 to-purple-600' },
            { label: 'Reembolsos Pend.', value: refundStats.pending.toString(), icon: <RotateCcw className="w-5 h-5" />, color: refundStats.pending > 0 ? 'from-orange-500 to-red-500' : 'from-gray-400 to-gray-500' },
            { label: 'Disputas Activas', value: activeDisputeCount.toString(), icon: <Scale className="w-5 h-5" />, color: activeDisputeCount > 0 ? 'from-rose-500 to-pink-600' : 'from-gray-400 to-gray-500' },
            { label: 'Stripe Connect', value: connectStatus.connected ? 'Activo' : 'No conectado', icon: <CreditCard className="w-5 h-5" />, color: connectStatus.connected ? 'from-indigo-500 to-indigo-600' : 'from-gray-400 to-gray-500' },
          ].map((m, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${m.color} rounded-xl flex items-center justify-center text-white`}>
                  {m.icon}
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{m.value}</div>
              <div className="text-sm text-gray-500">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {[
            { id: 'raffles', label: 'Mis Sorteos', icon: <TicketIcon className="w-4 h-4" /> },
            { id: 'plan', label: 'Mi Plan', icon: <Crown className="w-4 h-4" /> },
            { id: 'payments', label: `Pagos Ext.${pendingPaymentsCount > 0 ? ` (${pendingPaymentsCount})` : ''}`, icon: <Wallet className="w-4 h-4" /> },
            { id: 'refunds', label: `Reembolsos ${refundStats.pending > 0 ? `(${refundStats.pending})` : ''}`, icon: <RotateCcw className="w-4 h-4" /> },
            { id: 'disputes', label: `Disputas ${activeDisputeCount > 0 ? `(${activeDisputeCount})` : ''}`, icon: <Scale className="w-4 h-4" /> },
            { id: 'winner', label: 'Ganadores', icon: <Trophy className="w-4 h-4" /> },
            { id: 'ext-payment-setup', label: 'Pago Externo', icon: <Wallet className="w-4 h-4" /> },
            { id: 'stripe', label: 'Stripe Connect', icon: <CreditCard className="w-4 h-4" /> },
            { id: 'reports', label: 'Reportes', icon: <BarChart3 className="w-4 h-4" /> },

          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon} {t.label}
              {t.id === 'refunds' && refundStats.pending > 0 && (
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              )}
              {t.id === 'disputes' && activeDisputeCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
              {t.id === 'stripe' && connectStatus.connected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>


        {/* ============================================================ */}
        {/* RAFFLES TAB */}
        {/* ============================================================ */}
        {activeTab === 'raffles' && (
          <div>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['all', 'draft', 'active', 'closed', 'validated', 'locked', 'winner_declared', 'cancelled'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s === 'all' ? 'Todos' : RAFFLE_STATUS_LABELS[s as RaffleStatus] || s}
                </button>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-blue-700 text-xs font-medium">
                <ShieldCheck className="w-4 h-4" />
                Flujo de estados:
                <span className="flex items-center gap-1">
                  Borrador <ArrowRight className="w-3 h-3" /> Activa <ArrowRight className="w-3 h-3" /> Cerrada <ArrowRight className="w-3 h-3" /> Validada <ArrowRight className="w-3 h-3" /> Bloqueada <ArrowRight className="w-3 h-3" /> Con Ganador
                </span>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-500">Cargando sorteos...</div>
            ) : filteredRaffles.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <TicketIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No tienes sorteos aún</h3>
                <p className="text-gray-500 mb-6">Crea tu primer sorteo para comenzar a vender boletos</p>
                <button onClick={() => onNavigate('organizer-create-raffle')} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                  Crear Primer Sorteo
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredRaffles.map(raffle => {
                  const transitions = getAvailableTransitions(raffle);
                  const isDraft = raffle.status === 'draft';
                  return (
                    <div key={raffle.id} className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${isDraft ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'}`}>
                      {/* Draft banner */}
                      {isDraft && (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-bold text-amber-800">Sorteo en borrador</p>
                              <p className="text-xs text-amber-700">Actívalo para generar los boletos y comenzar a vender.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleStatusTransition(raffle, 'active')}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all shadow-md shadow-emerald-200 whitespace-nowrap"
                          >
                            <Play className="w-4 h-4" /> Activar Ahora
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-32 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {raffle.image_url ? (
                            <img src={raffle.image_url} alt={raffle.name} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <Trophy className="w-8 h-8 text-blue-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-bold text-gray-900">{raffle.name}</h3>
                              <p className="text-sm text-gray-500 line-clamp-1">{raffle.description || 'Sin descripción'}</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${RAFFLE_STATUS_COLORS[raffle.status]}`}>
                              {RAFFLE_STATUS_LABELS[raffle.status]}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />${raffle.price_per_ticket}/boleto</span>
                            <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{raffle.tickets_sold}/{raffle.total_tickets} vendidos</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(raffle.draw_date).toLocaleDateString('es-MX')}</span>
                            <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />{raffle.payment_method === 'stripe' ? 'Stripe' : 'Externo'}</span>
                          </div>
                          {!isDraft && (
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>{raffle.tickets_sold} vendidos</span>
                                <span>{Math.round((raffle.tickets_sold / raffle.total_tickets) * 100)}%</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, (raffle.tickets_sold / raffle.total_tickets) * 100)}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                        {!isDraft && (
                          <button onClick={() => loadTickets(raffle)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            <Eye className="w-3.5 h-3.5" /> Ver Boletos
                          </button>
                        )}
                        {/* Closing Flow button - available for active, closed, validated, locked, winner_declared */}
                        {['active', 'closed', 'validated', 'locked', 'winner_declared'].includes(raffle.status) && (
                          <button
                            onClick={() => onNavigate('organizer-closing-flow', { raffle })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors shadow-sm"
                          >
                            <Trophy className="w-3.5 h-3.5" /> Cierre y Sorteo
                          </button>
                        )}
                        {/* Show transition buttons (but not the "Activar" for draft since we have the banner) */}
                        {transitions.filter(t => !(isDraft && t.status === 'active')).map(t => (
                          <button key={t.status} onClick={() => handleStatusTransition(raffle, t.status)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${t.color}`}>
                            {t.icon} {t.label}
                          </button>
                        ))}
                        {raffle.status === 'winner_declared' && raffle.winning_number && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg">
                            <Trophy className="w-3.5 h-3.5" /> Ganador: #{raffle.winning_number}
                            <Lock className="w-3 h-3 text-purple-500" />
                          </span>
                        )}
                        {raffle.status === 'cancelled' && raffle.tickets_sold > 0 && (
                          <button
                            onClick={() => handleBulkRefund(raffle)}
                            disabled={bulkRefundLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
                          >
                            {bulkRefundLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Reembolso Masivo
                          </button>
                        )}
                        {raffle.result_locked && (
                          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded">
                            <Lock className="w-3 h-3" /> Resultado bloqueado
                          </span>
                        )}
                      </div>

                    </div>
                  );
                })}

              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* REFUNDS TAB */}
        {/* ============================================================ */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Pagos Externos Pendientes</h3>
              <span className="text-sm text-gray-500">{pendingPayments.length} solicitud(es)</span>
            </div>

            {pendingPayments.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-500">No hay pagos externos pendientes de confirmar.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingPayments.map((req: any) => (
                  <div key={req.id} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="font-semibold text-gray-900">{req.participant?.full_name || 'Participante'}</div>
                        <div className="text-sm text-gray-500">{req.participant?.email}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Sorteo: {req.raffle?.name}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-lg text-gray-900">${req.amount_total?.toLocaleString('es-MX')} MXN</div>
                        <div className="text-xs text-gray-500">{req.ticket_numbers?.length} boleto(s)</div>
                        <div className="text-xs text-gray-400">
                          {new Date(req.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {req.ticket_numbers?.map((n: number) => (
                        <span key={n} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono font-semibold">#{n}</span>
                      ))}
                    </div>

                    {req.payment_reference && (
                      <div className="bg-gray-50 rounded-lg p-2.5 mb-3 text-sm">
                        <span className="font-medium text-gray-700">Referencia: </span>
                        <span className="text-gray-600 font-mono">{req.payment_reference}</span>
                      </div>
                    )}
                    {req.participant_notes && (
                      <div className="bg-gray-50 rounded-lg p-2.5 mb-3 text-sm text-gray-600 italic">
                        "{req.participant_notes}"
                      </div>
                    )}

                    <div className="mb-3">
                      <textarea
                        placeholder="Notas para el participante (opcional)"
                        value={paymentOrgNotes[req.id] || ''}
                        onChange={e => setPaymentOrgNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        disabled={processingPayment === req.id}
                        onClick={async () => {
                          setProcessingPayment(req.id);
                          const { data } = await supabase.rpc('confirm_external_payment', {
                            p_request_id: req.id,
                            p_organizer_id: user!.id,
                            p_notes: paymentOrgNotes[req.id] || null,
                          });
                          const result = data as any;
                          if (result?.success) {
                            toast({ title: '✅ Pago confirmado', description: `${req.ticket_numbers?.length} boleto(s) marcados como vendidos.` });
                            setPendingPayments(prev => prev.filter(p => p.id !== req.id));
                            setPendingPaymentsCount(prev => Math.max(0, prev - 1));
                            // Email al participante
                            supabase.functions.invoke('send-notifications', {
                              body: { action: 'external-payment-confirmed', request_id: req.id, organizer_notes: paymentOrgNotes[req.id] || null },
                            }).catch(() => {});
                          } else {
                            toast({ title: 'Error', description: result?.error || 'No se pudo confirmar', variant: 'destructive' });
                          }
                          setProcessingPayment(null);
                        }}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {processingPayment === req.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</> : '✅ Confirmar pago'}
                      </button>
                      <button
                        disabled={processingPayment === req.id}
                        onClick={async () => {
                          if (!confirm('¿Rechazar esta solicitud? Los boletos quedarán disponibles nuevamente.')) return;
                          setProcessingPayment(req.id);
                          const { data } = await supabase.rpc('reject_external_payment', {
                            p_request_id: req.id,
                            p_organizer_id: user!.id,
                            p_notes: paymentOrgNotes[req.id] || null,
                          });
                          const result = data as any;
                          if (result?.success) {
                            toast({ title: 'Solicitud rechazada', description: 'Los boletos fueron liberados.' });
                            setPendingPayments(prev => prev.filter(p => p.id !== req.id));
                            setPendingPaymentsCount(prev => Math.max(0, prev - 1));
                            // Email al participante
                            supabase.functions.invoke('send-notifications', {
                              body: { action: 'external-payment-rejected', request_id: req.id, organizer_notes: paymentOrgNotes[req.id] || null },
                            }).catch(() => {});
                          } else {
                            toast({ title: 'Error', description: result?.error || 'No se pudo rechazar', variant: 'destructive' });
                          }
                          setProcessingPayment(null);
                        }}
                        className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        ✕ Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'refunds' && (
          <div>
            {/* Refund Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-xs text-gray-500">Pendientes</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{refundStats.pending}</div>
                <div className="text-xs text-gray-500">${refundStats.total_amount_pending.toLocaleString()} MXN</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-xs text-gray-500">Reembolsados</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">{refundStats.refunded}</div>
                <div className="text-xs text-gray-500">${refundStats.total_amount_refunded.toLocaleString()} MXN</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <X className="w-4 h-4 text-red-600" />
                  </div>
                  <span className="text-xs text-gray-500">Rechazados</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{refundStats.denied}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-gray-600" />
                  </div>
                  <span className="text-xs text-gray-500">Total</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{refundStats.total}</div>
              </div>
            </div>

            {/* Bulk refund banner for cancelled raffles */}
            {cancelledRafflesWithTickets.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-orange-800 mb-1">Sorteos cancelados con boletos vendidos</h4>
                    <p className="text-xs text-orange-700 mb-3">Los siguientes sorteos cancelados tienen boletos que requieren reembolso:</p>
                    <div className="space-y-2">
                      {cancelledRafflesWithTickets.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-orange-200">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{r.name}</p>
                            <p className="text-xs text-gray-500">{r.tickets_sold} boletos vendidos — ${r.revenue.toLocaleString()} MXN</p>
                          </div>
                          <button
                            onClick={() => handleBulkRefund(r)}
                            disabled={bulkRefundLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                          >
                            {bulkRefundLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            Reembolso Masivo
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['all', 'pending', 'refunded', 'denied', 'processing', 'failed'].map(s => (
                <button
                  key={s}
                  onClick={() => setRefundFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    refundFilterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s === 'all' ? 'Todos' : REFUND_STATUS_LABELS[s as RefundStatus] || s}
                  {s === 'pending' && refundStats.pending > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded-full text-[10px]">{refundStats.pending}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Refund requests list */}
            {refundsLoading ? (
              <div className="text-center py-12 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Cargando solicitudes de reembolso...
              </div>
            ) : filteredRefunds.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <RotateCcw className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin solicitudes de reembolso</h3>
                <p className="text-gray-500">Las solicitudes de reembolso de tus participantes aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRefunds.map(req => (
                  <div key={req.id} className={`bg-white rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    req.status === 'pending' ? 'border-amber-200' : 'border-gray-200'
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                        req.status === 'refunded' ? 'bg-emerald-100 text-emerald-700' :
                        req.status === 'denied' ? 'bg-red-100 text-red-700' :
                        req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        #{req.ticket_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-gray-900">{req.raffle_name || 'Sorteo'}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REFUND_STATUS_COLORS[req.status as RefundStatus]}`}>
                            {REFUND_STATUS_LABELS[req.status as RefundStatus]}
                          </span>
                          {req.stripe_payment_id && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded">
                              <CreditCard className="w-2.5 h-2.5" /> Stripe
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 mb-2">
                          <div><span className="text-gray-400">Participante:</span> {req.participant_name}</div>
                          <div><span className="text-gray-400">Email:</span> {req.participant_email}</div>
                          <div><span className="text-gray-400">Monto:</span> <strong className="text-gray-900">${req.amount} {req.currency}</strong></div>
                          <div><span className="text-gray-400">Fecha:</span> {new Date(req.created_at).toLocaleDateString('es-MX')}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 mb-2">
                          <p className="text-xs text-gray-700"><strong>Motivo:</strong> {req.reason}</p>
                        </div>
                        {req.organizer_notes && (
                          <p className="text-xs text-gray-500"><strong>Tu respuesta:</strong> {req.organizer_notes}</p>
                        )}
                        {req.stripe_refund_id && (
                          <p className="text-xs text-emerald-600 font-mono mt-1">Ref. Stripe: {req.stripe_refund_id}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {req.status === 'pending' && (
                          <>
                            <button
                              onClick={() => openRefundReview(req)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> Revisar
                            </button>
                          </>
                        )}
                        {req.status === 'refunded' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        {req.status === 'denied' && <X className="w-5 h-5 text-red-500" />}
                        {req.status === 'failed' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Refresh button */}
            <div className="mt-4 text-center">
              <button
                onClick={loadRefundData}
                disabled={refundsLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 mx-auto"
              >
                <RefreshCw className={`w-4 h-4 ${refundsLoading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* WINNERS TAB */}
        {/* ============================================================ */}
        {activeTab === 'winner' && (
          <div className="space-y-4">
            {raffles.filter(r => r.status === 'winner_declared').length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ganadores declarados</h3>
                <p className="text-gray-500">Los ganadores aparecerán aquí cuando declares los resultados</p>
                <p className="text-xs text-gray-400 mt-2">Flujo: Cerrada → Validada → Bloqueada → Declarar Ganador</p>
              </div>
            ) : (
              raffles.filter(r => r.status === 'winner_declared').map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center">
                      <Trophy className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900">{r.name}</h3>
                      <p className="text-sm text-gray-500">Número ganador: <strong className="text-purple-600">#{r.winning_number}</strong></p>
                      <p className="text-xs text-gray-400">Declarado: {r.winner_declared_at ? new Date(r.winner_declared_at).toLocaleString('es-MX') : '-'}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                      <Lock className="w-3 h-3" /> Inmutable
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* STRIPE CONNECT TAB */}
        {/* ============================================================ */}
        {activeTab === 'ext-payment-setup' && (
          <div className="max-w-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Configuración de Pago Externo</h3>
            <p className="text-sm text-gray-500 mb-6">Estos datos se mostrarán a tus participantes cuando soliciten un boleto con pago externo (transferencia/depósito).</p>

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco / Institución *</label>
                <input type="text" value={bankForm.bank_name}
                  onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="Ej: BBVA, Banamex, Banorte, OXXO Pay..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de tarjeta o CLABE *</label>
                <input type="text" value={bankForm.bank_account}
                  onChange={e => setBankForm(f => ({ ...f, bank_account: e.target.value }))}
                  placeholder="Ej: 4152 3141 5926 5358 o CLABE 18 dígitos"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del titular *</label>
                <input type="text" value={bankForm.bank_holder}
                  onChange={e => setBankForm(f => ({ ...f, bank_holder: e.target.value }))}
                  placeholder="Nombre tal como aparece en la tarjeta"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones adicionales <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={bankForm.payment_instructions}
                  onChange={e => setBankForm(f => ({ ...f, payment_instructions: e.target.value }))}
                  placeholder="Ej: Enviar comprobante por WhatsApp al 614-XXX-XXXX después de realizar el depósito."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {bankSaved && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Datos guardados correctamente.
                </div>
              )}

              <button
                disabled={bankSaving || !bankForm.bank_name || !bankForm.bank_account || !bankForm.bank_holder}
                onClick={async () => {
                  setBankSaving(true); setBankSaved(false);
                  const { error } = await supabase.from('profiles').update({
                    bank_name:            bankForm.bank_name,
                    bank_account:         bankForm.bank_account,
                    bank_holder:          bankForm.bank_holder,
                    payment_instructions: bankForm.payment_instructions || null,
                  }).eq('id', user!.id);
                  if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
                  else { setBankSaved(true); setTimeout(() => setBankSaved(false), 4000); }
                  setBankSaving(false);
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {bankSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar datos bancarios'}
              </button>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>⚠️ Importante:</strong> Estos datos son visibles para los participantes que intenten comprar con pago externo. Asegúrate de que sean correctos antes de activar un sorteo.
            </div>
          </div>
        )}

        {activeTab === 'stripe' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.893 5.575C4.746 22.75 7.462 24 11.5 24c2.628 0 4.758-.652 6.293-1.872 1.636-1.305 2.449-3.233 2.449-5.535.032-4.366-2.676-5.768-6.266-7.443z" fill="white"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Stripe Connect</h2>
                    <p className="text-white/80 text-sm">Recibe pagos directamente en tu cuenta bancaria</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {connectChecking ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
                    <p className="text-gray-500">Verificando estado de Stripe Connect...</p>
                  </div>
                ) : connectStatus.connected ? (
                  <div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        <div>
                          <h3 className="font-bold text-emerald-800">Cuenta Connect Activa</h3>
                          <p className="text-sm text-emerald-700">Tu cuenta de Stripe está conectada y lista para recibir pagos.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">Cargos habilitados</p>
                        <p className={`font-bold ${connectStatus.charges_enabled ? 'text-emerald-600' : 'text-red-600'}`}>
                          {connectStatus.charges_enabled ? 'Sí' : 'No'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">Pagos habilitados</p>
                        <p className={`font-bold ${connectStatus.payouts_enabled ? 'text-emerald-600' : 'text-red-600'}`}>
                          {connectStatus.payouts_enabled ? 'Sí' : 'No'}
                        </p>
                      </div>
                    </div>
                    <button onClick={loadConnectStatus} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                      <RefreshCw className="w-4 h-4" /> Actualizar estado
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Conecta tu cuenta de Stripe</h3>
                    <p className="text-gray-500 text-sm mb-6">Para recibir pagos con tarjeta directamente en tu cuenta bancaria.</p>
                    <button
                      onClick={handleConnectOnboarding}
                      disabled={connectLoading}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                    >
                      {connectLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Creando cuenta...</> : <><Link2 className="w-5 h-5" /> Conectar con Stripe</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* REPORTS TAB */}
        {/* ============================================================ */}
        {activeTab === 'reports' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Exportar Reportes</h3>
            <div className="space-y-3">
              {raffles.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.tickets_sold} boletos vendidos — Estado: {RAFFLE_STATUS_LABELS[r.status]}</div>
                  </div>
                  <button
                    onClick={async () => {
                      const { data } = await supabase.from('tickets').select('*, participant:profiles(*)').eq('raffle_id', r.id).order('ticket_number');
                      if (data) { setTickets(data); setSelectedRaffle(r); exportCSV(r); }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ============================================================ */}
        {/* DISPUTES TAB */}
        {/* ============================================================ */}
        {activeTab === 'disputes' && (
          <div>
            {/* Dispute Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center"><AlertCircle className="w-4 h-4 text-rose-600" /></div>
                  <span className="text-xs text-gray-500">Abiertas</span>
                </div>
                <div className="text-2xl font-bold text-rose-600">{disputeStats.open}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><Clock className="w-4 h-4 text-amber-600" /></div>
                  <span className="text-xs text-gray-500">En Revisión</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{disputeStats.under_review}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
                  <span className="text-xs text-gray-500">Resueltas (a favor tuyo)</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">{disputeStats.resolved_organizer}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Scale className="w-4 h-4 text-blue-600" /></div>
                  <span className="text-xs text-gray-500">Resueltas (participante)</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">{disputeStats.resolved_participant}</div>
              </div>
            </div>

            {/* Info banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800 mb-1">Disputas contra tus sorteos</h4>
                  <p className="text-xs text-amber-700">Cuando un participante escala un reembolso rechazado, un administrador de la plataforma revisará el caso. Puedes agregar tu perspectiva y evidencia para defender tu posición antes de que se tome una decisión.</p>
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['all', 'open', 'under_review', 'resolved_participant', 'resolved_organizer', 'closed'].map(s => (
                <button key={s} onClick={() => setDisputeFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${disputeFilter === s ? 'bg-rose-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                  {s === 'all' ? 'Todas' : DISPUTE_STATUS_LABELS[s as DisputeStatus] || s}
                </button>
              ))}
            </div>

            {/* Disputes list */}
            {disputesLoading ? (
              <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando disputas...</div>
            ) : filteredDisputes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin disputas</h3>
                <p className="text-gray-500">No hay disputas contra tus sorteos. Las disputas aparecen cuando un participante escala un reembolso rechazado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDisputes.map(d => (
                  <div key={d.id} className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow cursor-pointer ${d.status === 'open' || d.status === 'under_review' ? 'border-rose-200' : 'border-gray-200'}`} onClick={() => openDisputeDetail(d)}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${d.status === 'open' ? 'bg-rose-100 text-rose-700' : d.status === 'under_review' ? 'bg-amber-100 text-amber-700' : d.status === 'resolved_organizer' ? 'bg-emerald-100 text-emerald-700' : d.status === 'resolved_participant' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        #{d.ticket_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-gray-900">{d.raffle_name || 'Sorteo'}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[d.status as DisputeStatus]}`}>{DISPUTE_STATUS_LABELS[d.status as DisputeStatus]}</span>
                          {d.force_refund && <span className="px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 rounded">Reembolso forzado</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-600 mb-2">
                          <div><span className="text-gray-400">Participante:</span> {d.participant_name}</div>
                          <div><span className="text-gray-400">Monto:</span> <strong className="text-gray-900">${d.amount} {d.currency}</strong></div>
                          <div><span className="text-gray-400">Fecha:</span> {new Date(d.created_at).toLocaleDateString('es-MX')}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-700 line-clamp-2"><strong>Motivo:</strong> {d.reason}</p>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Ver Detalle
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Refresh */}
            <div className="mt-4 text-center">
              <button onClick={loadDisputeData} disabled={disputesLoading} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 mx-auto">
                <RefreshCw className={`w-4 h-4 ${disputesLoading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* PLAN TAB */}
        {/* ============================================================ */}
        {activeTab === 'plan' && (
          <PlanSelector />
        )}


        {/* ============================================================ */}
        {/* WINNER DECLARATION MODAL */}
        {/* ============================================================ */}
        {showWinnerModal && selectedRaffle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Declarar Ganador</h3>
                <button onClick={() => setShowWinnerModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-4">Sorteo: <strong>{selectedRaffle.name}</strong><br />Rango: 1 - {selectedRaffle.total_tickets}</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Número ganador</label>
                <input type="number" value={winnerNumber} onChange={e => setWinnerNumber(e.target.value)} min="1" max={selectedRaffle.total_tickets} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl font-bold text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Ej: 42" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de evidencia (opcional)</label>
                <input type="url" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="https://..." />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2"><Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" /><p className="text-xs text-amber-800"><strong>Acción irreversible.</strong> El resultado se registrará con hash criptográfico.</p></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowWinnerModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button onClick={handleDeclareWinner} disabled={!winnerNumber || selectedRaffle.status !== 'locked'} className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 disabled:opacity-50">Confirmar Ganador</button>
              </div>
            </div>
          </div>
        )}

        {/* TICKETS MODAL */}
        {showTicketsModal && selectedRaffle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-bold text-gray-900">Boletos — {selectedRaffle.name}</h3>
                <button onClick={() => setShowTicketsModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {tickets.map(t => (
                    <div key={t.id} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-bold cursor-pointer transition-all ${t.status === 'paid' ? 'bg-emerald-500 text-white' : t.status === 'sold' ? 'bg-blue-500 text-white' : t.status === 'reserved' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      onClick={() => { if (t.status === 'sold' && selectedRaffle.payment_method === 'external') markTicketPaid(t); }}>
                      {t.ticket_number}
                      {t.payment_method === 'stripe' && t.status === 'paid' && <CreditCard className="w-2.5 h-2.5 mt-0.5 opacity-70" />}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gray-100" /><span className="text-xs text-gray-500">Disponible</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-400" /><span className="text-xs text-gray-500">Reservado</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500" /><span className="text-xs text-gray-500">Vendido</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-500" /><span className="text-xs text-gray-500">Pagado</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REFUND REVIEW MODAL */}
        {showRefundReviewModal && selectedRefundRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowRefundReviewModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Revisar Solicitud de Reembolso</h3>
                <button onClick={() => setShowRefundReviewModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500 text-xs">Participante</span><p className="font-medium text-gray-900">{selectedRefundRequest.participant_name}</p></div>
                  <div><span className="text-gray-500 text-xs">Sorteo</span><p className="font-medium text-gray-900">{selectedRefundRequest.raffle_name}</p></div>
                  <div><span className="text-gray-500 text-xs">Boleto</span><p className="font-bold text-gray-900 text-lg">#{selectedRefundRequest.ticket_number}</p></div>
                  <div><span className="text-gray-500 text-xs">Monto</span><p className="font-bold text-orange-600 text-lg">${selectedRefundRequest.amount} {selectedRefundRequest.currency}</p></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <h4 className="text-xs font-bold text-amber-800 mb-1">Motivo:</h4>
                <p className="text-sm text-amber-900">{selectedRefundRequest.reason}</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas del organizador</label>
                <textarea value={refundReviewNotes} onChange={e => setRefundReviewNotes(e.target.value)} placeholder="Agrega una nota..." rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" maxLength={500} />
              </div>
              <div className="flex gap-3">
                <button onClick={handleDenyRefund} disabled={processingRefundId === selectedRefundRequest.id} className="flex-1 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2">
                  {processingRefundId === selectedRefundRequest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ThumbsDown className="w-4 h-4" /> Rechazar</>}
                </button>
                <button onClick={handleApproveRefund} disabled={processingRefundId === selectedRefundRequest.id} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {processingRefundId === selectedRefundRequest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ThumbsUp className="w-4 h-4" /> Aprobar</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DISPUTE DETAIL MODAL */}
        {/* ============================================================ */}
        {showDisputeDetail && selectedDispute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDisputeDetail(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-rose-50 to-amber-50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Scale className="w-5 h-5 text-rose-600" />
                    <h3 className="text-lg font-bold text-gray-900">Disputa — Boleto #{selectedDispute.ticket_number}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[selectedDispute.status as DisputeStatus]}`}>{DISPUTE_STATUS_LABELS[selectedDispute.status as DisputeStatus]}</span>
                    <span className="text-xs text-gray-500">{selectedDispute.raffle_name} — ${selectedDispute.amount} {selectedDispute.currency}</span>
                  </div>
                </div>
                <button onClick={() => setShowDisputeDetail(false)} className="p-1.5 hover:bg-white/80 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>

              {/* Dispute info */}
              <div className="p-4 border-b bg-gray-50">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-gray-400">Participante</span><p className="font-medium text-gray-900">{selectedDispute.participant_name}</p></div>
                  <div><span className="text-gray-400">Monto</span><p className="font-bold text-rose-600">${selectedDispute.amount} {selectedDispute.currency}</p></div>
                  <div><span className="text-gray-400">Fecha</span><p className="font-medium text-gray-900">{new Date(selectedDispute.created_at).toLocaleDateString('es-MX')}</p></div>
                  <div><span className="text-gray-400">Estado</span><p className="font-medium text-gray-900">{DISPUTE_STATUS_LABELS[selectedDispute.status as DisputeStatus]}</p></div>
                </div>
                <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-700"><strong>Motivo de la disputa:</strong> {selectedDispute.reason}</p>
                </div>
                {selectedDispute.admin_notes && (
                  <div className="mt-2 bg-red-50 rounded-lg p-3 border border-red-200">
                    <p className="text-xs text-red-800"><strong>Notas del admin:</strong> {selectedDispute.admin_notes}</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '340px' }}>
                {detailLoading ? (
                  <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" /><p className="text-sm text-gray-500">Cargando línea de tiempo...</p></div>
                ) : disputeMessages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400"><MessageSquare className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">Sin mensajes aún</p></div>
                ) : (
                  disputeMessages.map(msg => (
                    <div key={msg.id} className={`rounded-xl border p-3 ${getMessageRoleColor(msg.sender_role)}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {getMessageTypeIcon(msg.message_type)}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getMessageRoleBadge(msg.sender_role)}`}>
                          {msg.sender_role === 'admin' ? 'Administrador' : msg.sender_role === 'organizer' ? 'Tú (Organizador)' : msg.sender_role === 'participant' ? 'Participante' : 'Sistema'}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-auto">{new Date(msg.created_at).toLocaleString('es-MX')}</span>
                      </div>
                      <p className="text-xs text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Response section - only for active disputes */}
              {(selectedDispute.status === 'open' || selectedDispute.status === 'under_review') && (
                <div className="border-t p-4 bg-gray-50 space-y-3">
                  {/* Evidence section */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1.5">
                      <FileText className="w-3.5 h-3.5" /> Agregar evidencia / perspectiva del organizador
                    </label>
                    <div className="flex gap-2">
                      <textarea value={disputeEvidenceText} onChange={e => setDisputeEvidenceText(e.target.value)} placeholder="Explica tu posición, aporta evidencia de por qué el reembolso fue rechazado..." rows={2}
                        className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none bg-white" maxLength={2000} />
                      <button onClick={handleSendEvidence} disabled={sendingEvidence || !disputeEvidenceText.trim()}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5 self-end">
                        {sendingEvidence ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Paperclip className="w-3.5 h-3.5" /> Enviar Evidencia</>}
                      </button>
                    </div>
                  </div>
                  {/* Message */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Enviar mensaje
                    </label>
                    <div className="flex gap-2">
                      <input type="text" value={newDisputeMessage} onChange={e => setNewDisputeMessage(e.target.value)} placeholder="Escribe un mensaje..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendDisputeMessage(); } }} maxLength={1000} />
                      <button onClick={handleSendDisputeMessage} disabled={sendingDisputeMessage || !newDisputeMessage.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                        {sendingDisputeMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Enviar</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolved notice */}
              {(selectedDispute.status === 'resolved_participant' || selectedDispute.status === 'resolved_organizer' || selectedDispute.status === 'closed') && (
                <div className={`border-t p-4 ${selectedDispute.status === 'resolved_organizer' ? 'bg-emerald-50' : selectedDispute.status === 'resolved_participant' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-5 h-5 ${selectedDispute.status === 'resolved_organizer' ? 'text-emerald-600' : selectedDispute.status === 'resolved_participant' ? 'text-blue-600' : 'text-gray-600'}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-900">Disputa resuelta</p>
                      <p className="text-xs text-gray-600">
                        {selectedDispute.status === 'resolved_organizer' ? 'Resuelta a tu favor. La decisión original de rechazar el reembolso fue mantenida.' :
                         selectedDispute.status === 'resolved_participant' ? 'Resuelta a favor del participante. El administrador puede haber forzado un reembolso.' :
                         'Esta disputa ha sido cerrada.'}
                      </p>
                      {selectedDispute.resolution_summary && <p className="text-xs text-gray-500 mt-1"><strong>Resumen:</strong> {selectedDispute.resolution_summary}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizerDashboard;
