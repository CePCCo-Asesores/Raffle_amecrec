import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Ticket, Raffle, Notification, AppView, RefundRequest, RefundStatus, REFUND_STATUS_LABELS, REFUND_STATUS_COLORS, Dispute, DisputeStatus, DISPUTE_STATUS_LABELS, DISPUTE_STATUS_COLORS, DisputeMessage } from '@/lib/types';
import { requestRefund, listRefundRequests } from '@/lib/refunds';
import { createDispute, listDisputes, getDisputeDetail, addDisputeMessage } from '@/lib/disputes';
import {
  Ticket as TicketIcon, Trophy, Bell, Clock, DollarSign,
  CheckCircle2, AlertCircle, Calendar, Hash, Eye, Search,
  ChevronRight, Star, History, Lock, ShieldCheck, RotateCcw,
  X, Loader2, MessageSquare, CreditCard, AlertTriangle, FileText,
  Scale, Send, ArrowUpRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface ParticipantDashboardProps {
  onNavigate: (view: AppView, data?: any) => void;
}

const ParticipantDashboard: React.FC<ParticipantDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tickets' | 'history' | 'refunds' | 'disputes' | 'notifications'>('tickets');
  const [paymentModal, setPaymentModal]       = useState<any | null>(null);
  const [paymentModalLoading, setPaymentModalLoading] = useState(false);
  const [myTickets, setMyTickets] = useState<(Ticket & { raffle?: Raffle })[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Refund state
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedTicketForRefund, setSelectedTicketForRefund] = useState<(Ticket & { raffle?: Raffle }) | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // Dispute state
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [selectedRefundForDispute, setSelectedRefundForDispute] = useState<RefundRequest | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [showDisputeDetail, setShowDisputeDetail] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [disputeMessages, setDisputeMessages] = useState<DisputeMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'refunds') loadRefundRequests();
  }, [user, activeTab]);

  useEffect(() => {
    if (user && activeTab === 'disputes') loadDisputes();
  }, [user, activeTab]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [ticketsRes, notifRes] = await Promise.all([
      supabase.from('tickets').select('*, raffle:raffles(*)').eq('participant_id', user.id).order('purchased_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (ticketsRes.data) setMyTickets(ticketsRes.data);
    if (notifRes.data) setNotifications(notifRes.data);
    setLoading(false);
  };

  const loadRefundRequests = async () => {
    setRefundsLoading(true);
    const result = await listRefundRequests({ role: 'participant' });
    if (result.requests) setRefundRequests(result.requests);
    setRefundsLoading(false);
  };

  const loadDisputes = async () => {
    setDisputesLoading(true);
    const result = await listDisputes();
    if (result.disputes) setDisputes(result.disputes);
    setDisputesLoading(false);
  };

  const markNotificationRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const openPaymentModal = async (ticket: any) => {
    setPaymentModal({ ticket, request: null, organizer: null });
    setPaymentModalLoading(true);

    const raffleId = ticket.raffle?.id || ticket.raffle_id;

    // RPC con SECURITY DEFINER — puede leer datos del organizador sin violar RLS
    const { data, error } = await supabase.rpc('get_payment_detail', {
      p_raffle_id:     raffleId,
      p_ticket_number: ticket.ticket_number,
    });

    if (error || !data?.found) {
      setPaymentModal({ ticket, request: null, organizer: null });
      setPaymentModalLoading(false);
      return;
    }

    const req = {
      system_reference: data.system_reference,
      amount_total:     data.amount_total,
      status:           data.status,
      created_at:       data.created_at,
      organizer_notes:  data.organizer_notes,
    };
    const organizer = {
      bank_name:            data.bank_name,
      bank_account:         data.bank_account,
      bank_holder:          data.bank_holder,
      payment_instructions: data.bank_instructions,
    };

    setPaymentModal({ ticket, request: req, organizer });
    setPaymentModalLoading(false);
  };

  const openRefundModal = (ticket: Ticket & { raffle?: Raffle }) => {
    setSelectedTicketForRefund(ticket);
    setRefundReason('');
    setShowRefundModal(true);
  };

  const handleSubmitRefund = async () => {
    if (!selectedTicketForRefund || !refundReason.trim()) {
      toast({ title: 'Error', description: 'Por favor ingresa un motivo para el reembolso', variant: 'destructive' });
      return;
    }
    setSubmittingRefund(true);
    const result = await requestRefund({ ticketId: selectedTicketForRefund.id, reason: refundReason.trim() });
    if (result.success) {
      toast({ title: 'Solicitud enviada', description: `Tu solicitud de reembolso para el boleto #${selectedTicketForRefund.ticket_number} ha sido registrada.` });
      setShowRefundModal(false);
      setSelectedTicketForRefund(null);
      setRefundReason('');
      loadRefundRequests();
    } else {
      toast({ title: 'Error al solicitar reembolso', description: result.error || 'Ocurrió un error inesperado', variant: 'destructive' });
    }
    setSubmittingRefund(false);
  };

  // ============================================================
  // DISPUTE HANDLERS
  // ============================================================

  const openDisputeModal = (refundReq: RefundRequest) => {
    setSelectedRefundForDispute(refundReq);
    setDisputeReason('');
    setShowDisputeModal(true);
  };

  const handleSubmitDispute = async () => {
    if (!selectedRefundForDispute || !disputeReason.trim()) {
      toast({ title: 'Error', description: 'Por favor ingresa un motivo para la disputa', variant: 'destructive' });
      return;
    }
    setSubmittingDispute(true);
    const result = await createDispute({
      refundRequestId: selectedRefundForDispute.id,
      reason: disputeReason.trim(),
    });
    if (result.success) {
      toast({ title: 'Disputa creada', description: 'Tu disputa ha sido registrada. Un administrador la revisará.' });
      setShowDisputeModal(false);
      setSelectedRefundForDispute(null);
      setDisputeReason('');
      loadDisputes();
      setActiveTab('disputes');
    } else {
      toast({ title: 'Error al crear disputa', description: result.error || 'Error inesperado', variant: 'destructive' });
    }
    setSubmittingDispute(false);
  };

  const openDisputeDetail = async (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setShowDisputeDetail(true);
    setDetailLoading(true);
    const result = await getDisputeDetail(dispute.id);
    if (result.dispute) setSelectedDispute(result.dispute);
    setDisputeMessages(result.messages);
    setDetailLoading(false);
  };

  const handleSendMessage = async () => {
    if (!selectedDispute || !newMessage.trim()) return;
    setSendingMessage(true);
    const result = await addDisputeMessage({
      disputeId: selectedDispute.id,
      message: newMessage.trim(),
    });
    if (result.success) {
      setNewMessage('');
      // Reload messages
      const detail = await getDisputeDetail(selectedDispute.id);
      setDisputeMessages(detail.messages);
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo enviar el mensaje', variant: 'destructive' });
    }
    setSendingMessage(false);
  };

  const hasActiveRefundRequest = (ticketId: string): boolean => {
    return refundRequests.some(r => r.ticket_id === ticketId && ['pending', 'processing', 'approved'].includes(r.status));
  };

  const isRefundEligible = (ticket: Ticket & { raffle?: Raffle }): boolean => {
    if (!['sold', 'paid'].includes(ticket.status)) return false;
    if (!ticket.raffle) return false;
    if (['winner_declared', 'locked'].includes(ticket.raffle.status)) return false;
    if (hasActiveRefundRequest(ticket.id)) return false;
    return true;
  };

  const canEscalateToDispute = (refundReq: RefundRequest): boolean => {
    if (refundReq.status !== 'denied') return false;
    // Check if there's already an active dispute for this refund
    return !disputes.some(d => d.refund_request_id === refundReq.id && !['closed'].includes(d.status));
  };

  const activeTickets = myTickets.filter(t => t.raffle && ['active', 'closed', 'validated', 'locked'].includes(t.raffle.status));
  const pastTickets = myTickets.filter(t => t.raffle && ['winner_declared', 'cancelled'].includes(t.raffle.status));
  const totalSpent = myTickets.reduce((sum, t) => sum + (t.raffle?.price_per_ticket || 0), 0);
  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  const pendingRefunds = refundRequests.filter(r => r.status === 'pending').length;
  const activeDisputes = disputes.filter(d => ['open', 'under_review'].includes(d.status)).length;

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
      case 'system': return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
      default: return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Mi Panel</h1>
          <p className="text-gray-500 mt-1">Gestiona tus boletos y revisa resultados — Sorteos AMECREC</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Boletos Activos', value: activeTickets.length.toString(), icon: <TicketIcon className="w-5 h-5" />, color: 'from-blue-500 to-blue-600' },
            { label: 'Sorteos Participados', value: new Set(myTickets.map(t => t.raffle_id)).size.toString(), icon: <Trophy className="w-5 h-5" />, color: 'from-purple-500 to-purple-600' },
            { label: 'Total Invertido', value: `$${totalSpent.toLocaleString()}`, icon: <DollarSign className="w-5 h-5" />, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Disputas Activas', value: activeDisputes.toString(), icon: <Scale className="w-5 h-5" />, color: activeDisputes > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500' },
            { label: 'Notificaciones', value: unreadNotifs.toString(), icon: <Bell className="w-5 h-5" />, color: 'from-amber-500 to-amber-600' },
          ].map((m, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className={`w-10 h-10 bg-gradient-to-br ${m.color} rounded-xl flex items-center justify-center text-white mb-3`}>
                {m.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900">{m.value}</div>
              <div className="text-sm text-gray-500">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Security notice */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-6 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-xs text-emerald-800">
            Tus compras están protegidas con transacciones atómicas. Puedes solicitar reembolsos y escalar a disputas si tu reembolso es rechazado.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {[
            { id: 'tickets', label: 'Mis Boletos', icon: <TicketIcon className="w-4 h-4" /> },
            { id: 'refunds', label: `Reembolsos ${pendingRefunds > 0 ? `(${pendingRefunds})` : ''}`, icon: <RotateCcw className="w-4 h-4" /> },
            { id: 'disputes', label: `Disputas ${activeDisputes > 0 ? `(${activeDisputes})` : ''}`, icon: <Scale className="w-4 h-4" /> },
            { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" /> },
            { id: 'notifications', label: `Notificaciones ${unreadNotifs > 0 ? `(${unreadNotifs})` : ''}`, icon: <Bell className="w-4 h-4" /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tickets Tab */}
        {activeTab === 'tickets' && (
          <div>
            {loading ? (
              <div className="text-center py-16 text-gray-500">Cargando boletos...</div>
            ) : activeTickets.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <TicketIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No tienes boletos activos</h3>
                <p className="text-gray-500 mb-6">Explora los sorteos disponibles y compra tus primeros boletos</p>
                <button onClick={() => onNavigate('raffle-explorer')} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                  Explorar Sorteos
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeTickets.map(ticket => {
                  const eligible = isRefundEligible(ticket);
                  const hasRequest = hasActiveRefundRequest(ticket.id);
                  return (
                    <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div
                          onClick={() => {
                            if (ticket.payment_method === 'external' || ticket.status === 'pending_payment') {
                              openPaymentModal(ticket);
                            }
                          }}
                          className={`w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${
                            ticket.payment_method === 'external' || ticket.status === 'pending_payment'
                              ? 'cursor-pointer hover:from-blue-600 hover:to-indigo-700 active:scale-95 transition-all'
                              : ''
                          }`}
                          title={ticket.payment_method === 'external' || ticket.status === 'pending_payment' ? 'Ver referencia de pago' : undefined}
                        >
                          #{ticket.ticket_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900">{ticket.raffle?.name || 'Sorteo'}</h3>
                          <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{ticket.raffle ? new Date(ticket.raffle.draw_date).toLocaleDateString('es-MX') : '-'}</span>
                            <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />${ticket.raffle?.price_per_ticket || 0} MXN</span>
                            {ticket.payment_method === 'stripe' && (
                              <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Stripe</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            ticket.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                            ticket.status === 'sold' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {ticket.status === 'paid' ? 'Pagado' : ticket.status === 'sold' ? 'Pendiente de pago' : ticket.status}
                          </span>
                          {eligible && (
                            <button onClick={() => openRefundModal(ticket)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-orange-700 bg-orange-50 rounded-full hover:bg-orange-100 transition-colors" title="Solicitar reembolso">
                              <RotateCcw className="w-3 h-3" /> Reembolso
                            </button>
                          )}
                          {hasRequest && (
                            <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full">
                              <Clock className="w-3 h-3" /> Reembolso pendiente
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Refunds Tab */}
        {activeTab === 'refunds' && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-1">Política de reembolsos y disputas</h4>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>Puedes solicitar reembolso para boletos en sorteos activos o cerrados.</li>
                    <li>Si tu reembolso es rechazado, puedes escalar a una <strong>disputa</strong> con la plataforma.</li>
                    <li>Un administrador revisará tu caso y puede forzar el reembolso si lo considera justo.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Eligible tickets for refund */}
            {myTickets.filter(t => isRefundEligible(t)).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Boletos elegibles para reembolso</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myTickets.filter(t => isRefundEligible(t)).map(ticket => (
                    <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          #{ticket.ticket_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{ticket.raffle?.name}</p>
                          <p className="text-xs text-gray-500">${ticket.raffle?.price_per_ticket} MXN</p>
                        </div>
                      </div>
                      <button onClick={() => openRefundModal(ticket)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> Solicitar Reembolso
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refund requests list */}
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Mis solicitudes de reembolso</h3>
            {refundsLoading ? (
              <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando solicitudes...</div>
            ) : refundRequests.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <RotateCcw className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin solicitudes de reembolso</h3>
                <p className="text-gray-500">Tus solicitudes de reembolso aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {refundRequests.map(req => (
                  <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                        req.status === 'refunded' ? 'bg-emerald-100 text-emerald-700' :
                        req.status === 'denied' ? 'bg-red-100 text-red-700' :
                        req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        req.status === 'processing' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        #{req.ticket_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium text-gray-900">{req.raffle_name || 'Sorteo'}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REFUND_STATUS_COLORS[req.status as RefundStatus]}`}>
                            {REFUND_STATUS_LABELS[req.status as RefundStatus]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">
                          Boleto #{req.ticket_number} — ${req.amount} {req.currency}
                          {req.stripe_payment_id && <span className="ml-2 text-indigo-500"><CreditCard className="w-3 h-3 inline" /> Stripe</span>}
                        </p>
                        <p className="text-xs text-gray-600"><strong>Motivo:</strong> {req.reason}</p>
                        {req.organizer_notes && (
                          <p className="text-xs text-gray-600 mt-1"><strong>Respuesta del organizador:</strong> {req.organizer_notes}</p>
                        )}
                        {req.stripe_refund_id && (
                          <p className="text-xs text-emerald-600 mt-1 font-mono">Ref. Stripe: {req.stripe_refund_id}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">
                          Solicitado: {new Date(req.created_at).toLocaleString('es-MX')}
                          {req.reviewed_at && ` — Revisado: ${new Date(req.reviewed_at).toLocaleString('es-MX')}`}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                        {req.status === 'refunded' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        {req.status === 'denied' && <X className="w-5 h-5 text-red-500" />}
                        {req.status === 'pending' && <Clock className="w-5 h-5 text-amber-500" />}
                        {req.status === 'processing' && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                        {req.status === 'failed' && <AlertTriangle className="w-5 h-5 text-red-500" />}

                        {/* ESCALATE TO DISPUTE BUTTON */}
                        {canEscalateToDispute(req) && (
                          <button
                            onClick={() => openDisputeModal(req)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                          >
                            <Scale className="w-3.5 h-3.5" /> Escalar a Disputa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Disputes Tab */}
        {activeTab === 'disputes' && (
          <div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Scale className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 mb-1">Sistema de Disputas</h4>
                  <p className="text-xs text-red-700">
                    Las disputas son revisadas por administradores de la plataforma. Puedes comunicarte con el equipo a través del sistema de mensajes. El administrador puede forzar un reembolso si lo considera justo.
                  </p>
                </div>
              </div>
            </div>

            {disputesLoading ? (
              <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando disputas...</div>
            ) : disputes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin disputas</h3>
                <p className="text-gray-500">Si un reembolso es rechazado, puedes escalarlo a una disputa desde la pestaña de Reembolsos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {disputes.map(dispute => (
                  <div key={dispute.id} className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow cursor-pointer ${
                    ['open', 'under_review'].includes(dispute.status) ? 'border-red-200' : 'border-gray-200'
                  }`} onClick={() => openDisputeDetail(dispute)}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        dispute.status === 'open' ? 'bg-red-100' :
                        dispute.status === 'under_review' ? 'bg-amber-100' :
                        dispute.status === 'resolved_participant' ? 'bg-emerald-100' :
                        'bg-gray-100'
                      }`}>
                        <Scale className={`w-6 h-6 ${
                          dispute.status === 'open' ? 'text-red-600' :
                          dispute.status === 'under_review' ? 'text-amber-600' :
                          dispute.status === 'resolved_participant' ? 'text-emerald-600' :
                          'text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-gray-900">Boleto #{dispute.ticket_number}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[dispute.status as DisputeStatus]}`}>
                            {DISPUTE_STATUS_LABELS[dispute.status as DisputeStatus]}
                          </span>
                          {dispute.force_refund && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Reembolso Forzado</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-1">{dispute.raffle_name || 'Sorteo'} — ${dispute.amount} {dispute.currency}</p>
                        <p className="text-xs text-gray-500 line-clamp-2">{dispute.reason}</p>
                        {dispute.resolution_summary && (
                          <p className="text-xs text-emerald-700 mt-1 font-medium">Resolución: {dispute.resolution_summary}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">
                          Creada: {new Date(dispute.created_at).toLocaleString('es-MX')}
                          {dispute.resolved_at && ` — Resuelta: ${new Date(dispute.resolved_at).toLocaleString('es-MX')}`}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {pastTickets.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin historial</h3>
                <p className="text-gray-500">Tus sorteos pasados aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pastTickets.map(ticket => {
                  const isWinner = ticket.raffle?.winning_number === ticket.ticket_number;
                  return (
                    <div key={ticket.id} className={`rounded-xl border p-4 ${isWinner ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg ${
                          isWinner ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          #{ticket.ticket_number}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{ticket.raffle?.name}</h3>
                          <p className="text-sm text-gray-500">
                            Ganador: #{ticket.raffle?.winning_number || '?'} — {isWinner ? 'Felicidades, ganaste!' : 'No ganaste esta vez'}
                          </p>
                          {ticket.raffle?.result_locked && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 mt-1">
                              <Lock className="w-3 h-3" /> Resultado verificado e inmutable
                            </span>
                          )}
                        </div>
                        {isWinner && <Trophy className="w-6 h-6 text-yellow-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div>
            {notifications.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin notificaciones</h3>
                <p className="text-gray-500">Las notificaciones de tus sorteos aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map(notif => (
                  <div key={notif.id} onClick={() => !notif.is_read && markNotificationRead(notif.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-colors ${notif.is_read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        notif.type === 'success' ? 'bg-emerald-500' : notif.type === 'warning' ? 'bg-amber-500' : notif.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      }`} />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">{notif.title}</h4>
                        <p className="text-sm text-gray-500 mt-0.5">{notif.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(notif.created_at).toLocaleString('es-MX')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Action */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-center">
          <h3 className="text-xl font-bold text-white mb-2">¿Buscas tu próximo sorteo?</h3>
          <p className="text-blue-200 mb-4">Explora los sorteos disponibles y elige tus números de la suerte</p>
          <button onClick={() => onNavigate('raffle-explorer')} className="px-6 py-2.5 bg-white text-blue-700 rounded-lg font-bold hover:bg-blue-50 transition-colors">
            Explorar Sorteos
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REFUND REQUEST MODAL */}
      {/* ============================================================ */}
      {showRefundModal && selectedTicketForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowRefundModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Solicitar Reembolso</h3>
              <button onClick={() => setShowRefundModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
                  #{selectedTicketForRefund.ticket_number}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{selectedTicketForRefund.raffle?.name}</h4>
                  <p className="text-sm text-gray-500">Boleto #{selectedTicketForRefund.ticket_number}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Precio</span><p className="font-bold text-gray-900">${selectedTicketForRefund.raffle?.price_per_ticket} MXN</p></div>
                <div><span className="text-gray-500">Método de pago</span><p className="font-bold text-gray-900 flex items-center gap-1">
                  {selectedTicketForRefund.payment_method === 'stripe' ? <><CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Stripe</> : 'Externo'}
                </p></div>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-800 font-medium">Monto a reembolsar</span>
                <span className="text-lg font-bold text-orange-700">${selectedTicketForRefund.raffle?.price_per_ticket} MXN</span>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Motivo del reembolso <span className="text-red-500">*</span></label>
              <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Describe el motivo por el cual solicitas el reembolso..." rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none" maxLength={500} />
              <p className="text-xs text-gray-400 mt-1">{refundReason.length}/500 caracteres</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Importante:</strong> Si tu reembolso es rechazado, podrás escalarlo a una disputa con la plataforma.
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRefundModal(false)} disabled={submittingRefund} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={handleSubmitRefund} disabled={submittingRefund || !refundReason.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-bold hover:from-orange-600 hover:to-red-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {submittingRefund ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><RotateCcw className="w-4 h-4" /> Solicitar Reembolso</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DISPUTE CREATION MODAL */}
      {/* ============================================================ */}
      {showDisputeModal && selectedRefundForDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDisputeModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-red-600" /> Escalar a Disputa
              </h3>
              <button onClick={() => setShowDisputeModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <h4 className="text-sm font-bold text-red-800 mb-2">Reembolso rechazado</h4>
              <div className="text-xs text-red-700 space-y-1">
                <p><strong>Sorteo:</strong> {selectedRefundForDispute.raffle_name}</p>
                <p><strong>Boleto:</strong> #{selectedRefundForDispute.ticket_number}</p>
                <p><strong>Monto:</strong> ${selectedRefundForDispute.amount} {selectedRefundForDispute.currency}</p>
                <p><strong>Tu motivo:</strong> {selectedRefundForDispute.reason}</p>
                {selectedRefundForDispute.organizer_notes && (
                  <p><strong>Respuesta del organizador:</strong> {selectedRefundForDispute.organizer_notes}</p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ¿Por qué no estás de acuerdo con la decisión? <span className="text-red-500">*</span>
              </label>
              <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                placeholder="Explica por qué consideras que el reembolso debería ser aprobado. Un administrador revisará tu caso..."
                rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none" maxLength={1000} />
              <p className="text-xs text-gray-400 mt-1">{disputeReason.length}/1000 caracteres</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Al crear una disputa:</strong> Un administrador de la plataforma revisará tu caso. Podrás comunicarte directamente con el equipo. El administrador puede forzar el reembolso si lo considera justo.
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowDisputeModal(false)} disabled={submittingDispute} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={handleSubmitDispute} disabled={submittingDispute || !disputeReason.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-bold hover:from-red-700 hover:to-red-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {submittingDispute ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Scale className="w-4 h-4" /> Crear Disputa</>}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-red-600" /> Disputa — Boleto #{selectedDispute.ticket_number}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[selectedDispute.status as DisputeStatus]}`}>
                    {DISPUTE_STATUS_LABELS[selectedDispute.status as DisputeStatus]}
                  </span>
                  <span className="text-xs text-gray-500">{selectedDispute.raffle_name} — ${selectedDispute.amount} {selectedDispute.currency}</span>
                </div>
              </div>
              <button onClick={() => setShowDisputeDetail(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-5">
              {detailLoading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" /><p className="text-sm text-gray-500">Cargando...</p></div>
              ) : (
                <div className="space-y-3">
                  {disputeMessages.map(msg => (
                    <div key={msg.id} className={`rounded-xl border p-3 ${getMessageRoleColor(msg.sender_role)}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {getMessageTypeIcon(msg.message_type)}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getMessageRoleBadge(msg.sender_role)}`}>
                          {msg.sender_role === 'admin' ? 'Administrador' : msg.sender_role === 'organizer' ? 'Organizador' : msg.sender_role === 'system' ? 'Sistema' : 'Tú'}
                        </span>
                        {msg.sender_name && msg.sender_role !== 'system' && (
                          <span className="text-xs text-gray-600 font-medium">{msg.sender_name}</span>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto">{new Date(msg.created_at).toLocaleString('es-MX')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  ))}
                  {disputeMessages.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">No hay mensajes aún</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message input */}
            {!['resolved_participant', 'resolved_organizer', 'closed'].includes(selectedDispute.status) && (
              <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !newMessage.trim()}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Resolution banner */}
            {selectedDispute.resolution_summary && (
              <div className="p-4 border-t border-gray-200 bg-emerald-50 flex-shrink-0">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Resolución</p>
                    <p className="text-xs text-emerald-700">{selectedDispute.resolution_summary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal de referencia de pago */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPaymentModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-gray-900">Referencia de pago — #{paymentModal.ticket?.ticket_number}</h3>
              <button onClick={() => setPaymentModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {paymentModalLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <>
                  {/* Referencia del sistema */}
                  {paymentModal.request?.system_reference ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Tu referencia de pago</p>
                      <p className="font-mono font-bold text-blue-900 text-lg tracking-widest break-all">
                        {paymentModal.request.system_reference}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">Incluye esta referencia en tu transferencia o depósito.</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 text-center">
                      No se encontró referencia para este boleto.
                    </div>
                  )}

                  {/* Estado de la solicitud */}
                  {paymentModal.request && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Estado del pago</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        paymentModal.request.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                        paymentModal.request.status === 'rejected'  ? 'bg-red-100 text-red-700' :
                        paymentModal.request.status === 'expired'   ? 'bg-gray-100 text-gray-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {paymentModal.request.status === 'confirmed' ? '✅ Confirmado' :
                         paymentModal.request.status === 'rejected'  ? '❌ Rechazado' :
                         paymentModal.request.status === 'expired'   ? 'Expirado' :
                         '⏳ Pendiente de confirmación'}
                      </span>
                    </div>
                  )}

                  {/* Monto */}
                  {paymentModal.request?.amount_total && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Total a depositar</span>
                      <span className="font-bold text-gray-900">${paymentModal.request.amount_total.toLocaleString('es-MX')} MXN</span>
                    </div>
                  )}

                  {/* Datos bancarios del organizador */}
                  {paymentModal.organizer?.bank_account ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Datos para depósito</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-400">Banco</p>
                          <p className="font-medium text-gray-900">{paymentModal.organizer.bank_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Titular</p>
                          <p className="font-medium text-gray-900">{paymentModal.organizer.bank_holder || '—'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Número de tarjeta / CLABE</p>
                        <p className="font-mono font-bold text-gray-900 text-base tracking-widest break-all">{paymentModal.organizer.bank_account}</p>
                      </div>
                      {paymentModal.organizer.payment_instructions && (
                        <div className="border-t pt-2 text-xs text-gray-600 italic">
                          "{paymentModal.organizer.payment_instructions}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-amber-500 text-base flex-shrink-0">⚠️</span>
                      <div className="text-xs text-amber-800">
                        <p className="font-semibold mb-0.5">El organizador aún no ha registrado sus datos bancarios.</p>
                        <p>Contáctalo directamente para coordinar el pago: <a href="mailto:contacto@alianzaindigo.org" className="underline">contacto@alianzaindigo.org</a></p>
                      </div>
                    </div>
                  )}

                  {/* Fecha de solicitud */}
                  {paymentModal.request?.created_at && (
                    <p className="text-xs text-gray-400 text-center">
                      Solicitado el {new Date(paymentModal.request.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantDashboard;
