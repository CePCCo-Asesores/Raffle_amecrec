import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, SubscriptionPlan, PlatformConfig, AuditLog, FinancialLedger, Dispute, DisputeStatus, DISPUTE_STATUS_LABELS, DISPUTE_STATUS_COLORS, DisputeMessage, DisputeStats } from '@/lib/types';
import { fetchAuditLogs, fetchLedgerEntries, createAuditLog } from '@/lib/database';
import { listDisputes, getDisputeDetail, addDisputeMessage, updateDisputeStatus, forceRefund, getDisputeStats } from '@/lib/disputes';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users, Ticket, DollarSign, TrendingUp, BarChart3, Settings,
  Search, MoreVertical, Shield, Eye, Ban, Trash2, CheckCircle2,
  AlertCircle, Clock, Activity, ChevronRight, Save, RefreshCw,
  Database, Lock, FileText, BookOpen, ShieldCheck, AlertTriangle,
  Scale, MessageSquare, Send, ArrowUpRight, Loader2, X, Gavel,
  UserCheck, UserX, ChevronDown
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PlatformMetrics {
  totalOrganizers: number;
  activeOrganizers: number;
  totalRaffles: number;
  activeRaffles: number;
  totalTicketsSold: number;
  totalRevenue: number;
  totalCommissions: number;
  totalParticipants: number;
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'participants' | 'organizers' | 'disputes' | 'plans' | 'config' | 'audit' | 'ledger'>('overview');
  const [organizers, setOrganizers]           = useState<Profile[]>([]);
  const [selectedOrganizer, setSelectedOrganizer] = useState<any | null>(null);
  const [orgDetail, setOrgDetail]             = useState<any | null>(null);
  const [orgDetailLoading, setOrgDetailLoading] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [config, setConfig] = useState<PlatformConfig[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<FinancialLedger[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [commissionRate, setCommissionRate] = useState('5');

  // Plan CRUD state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price_monthly: '',
    max_active_raffles: '',
    max_tickets_per_raffle: '',
    features: '',
    is_active: true,
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({
    totalOrganizers: 0,
    activeOrganizers: 0,
    totalRaffles: 0,
    activeRaffles: 0,
    totalTicketsSold: 0,
    totalRevenue: 0,
    totalCommissions: 0,
    totalParticipants: 0,
  });

  // Dispute state
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [participants, setParticipants]           = useState<any[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantFilter, setParticipantFilter] = useState<'all'|'active'|'suspended'>('all');
  const [selectedParticipant, setSelectedParticipant] = useState<any | null>(null);
  const [participantTickets, setParticipantTickets] = useState<any[]>([]);
  const [participantTicketsLoading, setParticipantTicketsLoading] = useState(false);
  const [disputeStats, setDisputeStats] = useState<DisputeStats>({ total: 0, open: 0, under_review: 0, resolved_participant: 0, resolved_organizer: 0, closed: 0 });
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputeFilter, setDisputeFilter] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [disputeMessages, setDisputeMessages] = useState<DisputeMessage[]>([]);
  const [showDisputeDetail, setShowDisputeDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalMessage, setIsInternalMessage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showForceRefundModal, setShowForceRefundModal] = useState(false);
  const [forceRefundDecision, setForceRefundDecision] = useState('');
  const [forceRefundNotes, setForceRefundNotes] = useState('');
  const [processingForceRefund, setProcessingForceRefund] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'participants') loadParticipants();
    if (activeTab === 'disputes') loadDisputeData();
  }, [activeTab]);

  const loadParticipants = async () => {
    setParticipantsLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'participant')
      .order('created_at', { ascending: false });
    setParticipants(data || []);
    setParticipantsLoading(false);
  };

  const loadParticipantTickets = async (participantId: string) => {
    setParticipantTicketsLoading(true);
    const { data } = await supabase
      .from('tickets')
      .select('*, raffle:raffle_id(name, draw_date, price_per_ticket)')
      .eq('participant_id', participantId)
      .order('purchased_at', { ascending: false });
    setParticipantTickets(data || []);
    setParticipantTicketsLoading(false);
  };

  const toggleSuspendParticipant = async (participant: any) => {
    const isSuspended = participant.is_suspended;
    const action = isSuspended ? 'reactivar' : 'suspender';
    if (!confirm(`¿Deseas ${action} a ${participant.full_name}?`)) return;
    const { error } = await supabase
      .from('profiles')
      .update({ is_suspended: !isSuspended })
      .eq('id', participant.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: isSuspended ? 'Cuenta reactivada' : 'Cuenta suspendida' });
      loadParticipants();
      if (selectedParticipant?.id === participant.id) {
        setSelectedParticipant({ ...selectedParticipant, is_suspended: !isSuspended });
      }
    }
  };

  const loadPlatformMetrics = async () => {
    try {
      const [
        organizersRes,
        activeOrgsRes,
        rafflesRes,
        activeRafflesRes,
        ticketsSoldRes,
        participantsRes,
        ledgerRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'organizer'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'organizer').eq('is_active', true),
        supabase.from('raffles').select('id', { count: 'exact', head: true }),
        supabase.from('raffles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'sold'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'participant'),
        supabase.from('financial_ledger').select('amount, entry_type'),
      ]);

      let totalRevenue = 0;
      let totalCommissions = 0;
      if (ledgerRes.data) {
        for (const entry of ledgerRes.data) {
          if (entry.entry_type === 'ticket_sale') totalRevenue += entry.amount || 0;
          if (entry.entry_type === 'platform_commission') totalCommissions += entry.amount || 0;
        }
      }

      setPlatformMetrics({
        totalOrganizers: organizersRes.count || 0,
        activeOrganizers: activeOrgsRes.count || 0,
        totalRaffles: rafflesRes.count || 0,
        activeRaffles: activeRafflesRes.count || 0,
        totalTicketsSold: ticketsSoldRes.count || 0,
        totalRevenue,
        totalCommissions,
        totalParticipants: participantsRes.count || 0,
      });
    } catch (err) {
      console.error('Error loading platform metrics:', err);
    }
  };

  const loadOrgDetail = async (orgId: string) => {
    setOrgDetailLoading(true);
    const [rafflesRes, ticketsRes, paymentsRes] = await Promise.all([
      supabase.from('raffles').select('id,name,status,total_tickets,tickets_sold,created_at,price_per_ticket')
        .eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('tickets').select('id,status,raffle:raffle_id(price_per_ticket)')
        .eq('status', 'sold').in('raffle_id',
          (await supabase.from('raffles').select('id').eq('organizer_id', orgId)).data?.map((r:any)=>r.id) || []
        ),
      supabase.from('external_payment_requests').select('id,status,amount_total')
        .in('raffle_id',
          (await supabase.from('raffles').select('id').eq('organizer_id', orgId)).data?.map((r:any)=>r.id) || []
        ),
    ]);
    const raffles = rafflesRes.data || [];
    const tickets = ticketsRes.data || [];
    const payments = paymentsRes.data || [];
    setOrgDetail({
      raffles,
      totalRaffles: raffles.length,
      activeRaffles: raffles.filter((r:any) => r.status === 'active').length,
      totalTicketsSold: tickets.length,
      totalRevenue: tickets.reduce((s:number, t:any) => s + (t.raffle?.price_per_ticket || 0), 0),
      pendingPayments: payments.filter((p:any) => p.status === 'pending').length,
    });
    setOrgDetailLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgRes, planRes, configRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'organizer').order('created_at', { ascending: false }),
        supabase.from('subscription_plans').select('*').order('price_monthly'),
        supabase.from('platform_config').select('*'),
      ]);
      if (orgRes.data) setOrganizers(orgRes.data);
      if (planRes.data) setPlans(planRes.data);
      if (configRes.data) {
        setConfig(configRes.data);
        const comm = configRes.data.find(c => c.key === 'commission_percentage');
        if (comm) setCommissionRate(comm.value);
      }
      const logs = await fetchAuditLogs({ limit: 50 });
      setAuditLogs(logs);
      const entries = await fetchLedgerEntries({ limit: 100 });
      setLedgerEntries(entries);
      const stats = await getDisputeStats();
      setDisputeStats(stats);
      await loadPlatformMetrics();
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
    setLoading(false);
  };

  const loadDisputeData = async () => {
    setDisputesLoading(true);
    const [disputesResult, statsResult] = await Promise.all([
      listDisputes(disputeFilter !== 'all' ? { status: disputeFilter } : undefined),
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
      isInternal: isInternalMessage,
    });
    if (result.success) {
      setNewMessage('');
      setIsInternalMessage(false);
      const detail = await getDisputeDetail(selectedDispute.id);
      setDisputeMessages(detail.messages);
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setSendingMessage(false);
  };

  const handleUpdateStatus = async () => {
    if (!selectedDispute || !newStatus) return;
    setUpdatingStatus(true);
    const result = await updateDisputeStatus({
      disputeId: selectedDispute.id,
      newStatus,
      adminNotes: statusNotes || undefined,
    });
    if (result.success) {
      toast({ title: 'Estado actualizado', description: `Disputa actualizada a: ${DISPUTE_STATUS_LABELS[newStatus as DisputeStatus]}` });
      setShowStatusModal(false);
      setNewStatus('');
      setStatusNotes('');
      const detail = await getDisputeDetail(selectedDispute.id);
      if (detail.dispute) setSelectedDispute(detail.dispute);
      setDisputeMessages(detail.messages);
      loadDisputeData();
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setUpdatingStatus(false);
  };

  const handleForceRefund = async () => {
    if (!selectedDispute || !forceRefundDecision.trim()) return;
    setProcessingForceRefund(true);
    const result = await forceRefund({
      disputeId: selectedDispute.id,
      adminDecision: forceRefundDecision.trim(),
      adminNotes: forceRefundNotes || undefined,
    });
    if (result.success) {
      toast({
        title: 'Reembolso forzado',
        description: `Reembolso de $${selectedDispute.amount} MXN procesado${result.stripeRefundId ? `. Ref: ${result.stripeRefundId}` : ''}`,
      });
      setShowForceRefundModal(false);
      setForceRefundDecision('');
      setForceRefundNotes('');
      const detail = await getDisputeDetail(selectedDispute.id);
      if (detail.dispute) setSelectedDispute(detail.dispute);
      setDisputeMessages(detail.messages);
      loadDisputeData();
    } else {
      toast({ title: 'Error al forzar reembolso', description: result.error, variant: 'destructive' });
    }
    setProcessingForceRefund(false);
  };

  const toggleOrganizerStatus = async (org: Profile) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ is_active: !org.is_active }).eq('id', org.id);
    if (!error) {
      setOrganizers(prev => prev.map(o => o.id === org.id ? { ...o, is_active: !o.is_active } : o));
      await createAuditLog({ userId: user.id, userEmail: user.email, action: org.is_active ? 'organizer_suspended' : 'organizer_activated', entityType: 'profile', entityId: org.id, oldValue: { is_active: org.is_active }, newValue: { is_active: !org.is_active }, details: { organizerName: org.full_name, organizerEmail: org.email } });
      toast({ title: org.is_active ? 'Organizador suspendido' : 'Organizador activado' });
    }
  };

  const saveCommission = async () => {
    if (!user) return;
    const oldRate = config.find(c => c.key === 'commission_percentage')?.value;
    const { error } = await supabase.from('platform_config').update({ value: commissionRate, updated_at: new Date().toISOString() }).eq('key', 'commission_percentage');
    if (!error) {
      await createAuditLog({ userId: user.id, userEmail: user.email, action: 'commission_rate_changed', entityType: 'platform_config', entityId: 'commission_percentage', oldValue: { rate: oldRate }, newValue: { rate: commissionRate }, details: { note: 'Cambio de comisión global.' } });
      toast({ title: 'Comisión actualizada', description: `Nueva comisión: ${commissionRate}%.` });
    }
  };

  const filteredOrganizers = organizers.filter(o =>
    o.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDisputes = disputeFilter === 'all' ? disputes : disputes.filter(d => d.status === disputeFilter);

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'disputes', label: `Disputas ${disputeStats.open + disputeStats.under_review > 0 ? `(${disputeStats.open + disputeStats.under_review})` : ''}`, icon: <Scale className="w-4 h-4" /> },
    { id: 'participants', label: 'Participantes', icon: <UserCheck className="w-4 h-4" /> },
    { id: 'organizers', label: 'Organizadores', icon: <Users className="w-4 h-4" /> },
    { id: 'plans', label: 'Planes', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'config', label: 'Configuración', icon: <Settings className="w-4 h-4" /> },
    { id: 'audit', label: 'Auditoría', icon: <Shield className="w-4 h-4" /> },
    { id: 'ledger', label: 'Ledger Financiero', icon: <Database className="w-4 h-4" /> },
  ];

  const getAuditActionColor = (action: string) => {
    if (action.includes('dispute')) return 'bg-red-500';
    if (action.includes('winner') || action.includes('declared')) return 'bg-yellow-500';
    if (action.includes('suspended') || action.includes('cancelled')) return 'bg-red-500';
    if (action.includes('purchase') || action.includes('paid')) return 'bg-emerald-500';
    if (action.includes('commission') || action.includes('config')) return 'bg-amber-500';
    if (action.includes('refund')) return 'bg-orange-500';
    if (action.includes('status') || action.includes('activated')) return 'bg-blue-500';
    return 'bg-gray-500';
  };

  const getLedgerTypeLabel = (type: string) => {
    switch (type) {
      case 'ticket_sale': return { label: 'Venta Boleto', color: 'bg-emerald-100 text-emerald-700' };
      case 'platform_commission': return { label: 'Comisión', color: 'bg-amber-100 text-amber-700' };
      case 'organizer_income': return { label: 'Ingreso Org.', color: 'bg-blue-100 text-blue-700' };
      case 'subscription_payment': return { label: 'Suscripción', color: 'bg-purple-100 text-purple-700' };
      case 'refund': return { label: 'Reembolso', color: 'bg-red-100 text-red-700' };
      default: return { label: type, color: 'bg-gray-100 text-gray-700' };
    }
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
      case 'admin_action': return <Gavel className="w-3.5 h-3.5 text-red-500" />;
      case 'system': return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
      default: return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  const fmtMXN = (n: number) =>
    n >= 1000000
      ? `$${(n / 1000000).toFixed(1)}M`
      : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${n.toLocaleString('es-MX')}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
          <p className="text-gray-500 mt-1">Gestión global de Sorteos AMECREC</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon} {t.label}
              {t.id === 'disputes' && (disputeStats.open + disputeStats.under_review) > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ============================================================ */}
        {/* OVERVIEW TAB */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                    <div className="h-10 w-10 bg-gray-200 rounded-xl mb-3" />
                    <div className="h-7 w-24 bg-gray-200 rounded mb-1" />
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Organizadores',
                    value: platformMetrics.totalOrganizers.toString(),
                    sub: `${platformMetrics.activeOrganizers} activos`,
                    icon: <Users className="w-5 h-5" />,
                    color: 'from-blue-500 to-blue-600',
                  },
                  {
                    label: 'Participantes',
                    value: platformMetrics.totalParticipants.toLocaleString('es-MX'),
                    sub: 'registrados',
                    icon: <UserCheck className="w-5 h-5" />,
                    color: 'from-indigo-500 to-indigo-600',
                  },
                  {
                    label: 'Sorteos Activos',
                    value: platformMetrics.activeRaffles.toString(),
                    sub: `${platformMetrics.totalRaffles} en total`,
                    icon: <Ticket className="w-5 h-5" />,
                    color: 'from-emerald-500 to-emerald-600',
                  },
                  {
                    label: 'Boletos Vendidos',
                    value: platformMetrics.totalTicketsSold.toLocaleString('es-MX'),
                    sub: 'confirmados',
                    icon: <BarChart3 className="w-5 h-5" />,
                    color: 'from-purple-500 to-purple-600',
                  },
                  {
                    label: 'Ingresos Totales',
                    value: fmtMXN(platformMetrics.totalRevenue),
                    sub: 'MXN en boletos',
                    icon: <TrendingUp className="w-5 h-5" />,
                    color: 'from-pink-500 to-pink-600',
                  },
                  {
                    label: 'Comisiones',
                    value: fmtMXN(platformMetrics.totalCommissions),
                    sub: 'MXN plataforma',
                    icon: <DollarSign className="w-5 h-5" />,
                    color: 'from-amber-500 to-amber-600',
                  },
                  {
                    label: 'Disputas Abiertas',
                    value: (disputeStats.open + disputeStats.under_review).toString(),
                    sub: disputeStats.open > 0 ? 'Requieren atención' : 'Sin pendientes',
                    icon: <Scale className="w-5 h-5" />,
                    color: disputeStats.open > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500',
                  },
                  {
                    label: 'Disputas Totales',
                    value: disputeStats.total.toString(),
                    sub: `${disputeStats.resolved_participant + disputeStats.resolved_organizer} resueltas`,
                    icon: <Activity className="w-5 h-5" />,
                    color: 'from-cyan-500 to-cyan-600',
                  },
                ].map((m, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 bg-gradient-to-br ${m.color} rounded-xl flex items-center justify-center text-white`}>{m.icon}</div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{m.value}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{m.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{m.sub}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Dispute Alert */}
            {(disputeStats.open + disputeStats.under_review) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Scale className="w-6 h-6 text-red-600" />
                  <h3 className="font-bold text-red-800">Disputas requieren atención</h3>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-red-100">
                    <div className="text-2xl font-bold text-red-600">{disputeStats.open}</div>
                    <div className="text-xs text-gray-500">Abiertas</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <div className="text-2xl font-bold text-amber-600">{disputeStats.under_review}</div>
                    <div className="text-xs text-gray-500">En Revisión</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <div className="text-2xl font-bold text-emerald-600">{disputeStats.resolved_participant + disputeStats.resolved_organizer}</div>
                    <div className="text-xs text-gray-500">Resueltas</div>
                  </div>
                </div>
                <button onClick={() => setActiveTab('disputes')} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">
                  <Scale className="w-4 h-4" /> Ir a Disputas
                </button>
              </div>
            )}

            {/* Security Status */}
            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <h3 className="font-bold text-gray-900">Estado de Seguridad</h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Compra Atómica', status: 'Activo', ok: true },
                  { label: 'Rate Limiting', status: '10/txn, 20/min', ok: true },
                  { label: 'Resultados Inmutables', status: 'Hash + Log', ok: true },
                  { label: 'Sistema de Disputas', status: 'Activo', ok: true },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-xs font-medium text-gray-700">{s.label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{s.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar métricas
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* PARTICIPANTS TAB */}
        {/* ============================================================ */}
        {activeTab === 'participants' && (
          <div className="flex gap-6 h-[700px]">

            {/* Lista */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Barra de búsqueda y filtros */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={participantSearch}
                    onChange={e => setParticipantSearch(e.target.value)}
                    placeholder="Buscar por nombre o email..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={participantFilter} onChange={e => setParticipantFilter(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="suspended">Suspendidos</option>
                </select>
                <button onClick={loadParticipants}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50">
                  <RefreshCw className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Lista de participantes */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {participantsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : participants
                    .filter(p => {
                      const q = participantSearch.toLowerCase();
                      const matchQ = !q || (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
                      const matchF = participantFilter === 'all' ||
                        (participantFilter === 'suspended' && p.is_suspended) ||
                        (participantFilter === 'active' && !p.is_suspended);
                      return matchQ && matchF;
                    })
                    .map(p => (
                      <div key={p.id}
                        onClick={() => { setSelectedParticipant(p); loadParticipantTickets(p.id); }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedParticipant?.id === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${p.is_suspended ? 'bg-red-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                              {(p.full_name || p.email || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 text-sm truncate">{p.full_name || '—'}</div>
                              <div className="text-xs text-gray-500 truncate">{p.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {p.is_suspended && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">Suspendido</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {new Date(p.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                }
                {!participantsLoading && participants.filter(p => {
                  const q = participantSearch.toLowerCase();
                  return (!q || (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)) &&
                    (participantFilter === 'all' || (participantFilter === 'suspended' && p.is_suspended) || (participantFilter === 'active' && !p.is_suspended));
                }).length === 0 && (
                  <div className="text-center py-16 text-gray-400 text-sm">No se encontraron participantes</div>
                )}
              </div>
              <div className="pt-3 text-xs text-gray-400 border-t mt-2">
                {participants.length} participante(s) registrado(s)
              </div>
            </div>

            {/* Detalle del participante seleccionado */}
            <div className="w-80 flex-shrink-0">
              {!selectedParticipant ? (
                <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <div className="text-center text-gray-400 text-sm p-6">
                    <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Selecciona un participante para ver su detalle
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-full overflow-hidden">
                  {/* Header */}
                  <div className={`p-4 ${selectedParticipant.is_suspended ? 'bg-red-50' : 'bg-gradient-to-br from-blue-50 to-indigo-50'} border-b`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${selectedParticipant.is_suspended ? 'bg-red-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                        {(selectedParticipant.full_name || selectedParticipant.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{selectedParticipant.full_name || '—'}</div>
                        <div className="text-sm text-gray-500">{selectedParticipant.email}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/70 rounded-lg p-2 text-center">
                        <div className="font-bold text-gray-900 text-base">
                          {participantTickets.filter(t => t.status === 'sold' || t.status === 'paid').length}
                        </div>
                        <div className="text-gray-500">Boletos comprados</div>
                      </div>
                      <div className="bg-white/70 rounded-lg p-2 text-center">
                        <div className="font-bold text-gray-900 text-base">
                          ${participantTickets.filter(t => t.status === 'sold' || t.status === 'paid')
                              .reduce((sum, t) => sum + (t.raffle?.price_per_ticket || 0), 0)
                              .toLocaleString('es-MX')}
                        </div>
                        <div className="text-gray-500">Total gastado</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => toggleSuspendParticipant(selectedParticipant)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedParticipant.is_suspended ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                        {selectedParticipant.is_suspended ? '✅ Reactivar cuenta' : '🚫 Suspender cuenta'}
                      </button>
                    </div>
                  </div>

                  {/* Historial de boletos */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historial de boletos</div>
                    {participantTicketsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      </div>
                    ) : participantTickets.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-xs">Sin boletos registrados</div>
                    ) : (
                      <div className="space-y-2">
                        {participantTickets.map(t => (
                          <div key={t.id} className="bg-gray-50 rounded-lg p-2.5 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-mono font-bold text-gray-800">#{t.ticket_number}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                t.status === 'paid'   ? 'bg-emerald-100 text-emerald-700' :
                                t.status === 'sold'   ? 'bg-blue-100 text-blue-700' :
                                t.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {t.status === 'paid' ? 'Pagado' : t.status === 'sold' ? 'Vendido' : t.status === 'pending_payment' ? 'Pend. pago' : t.status}
                              </span>
                            </div>
                            <div className="text-gray-600 truncate">{t.raffle?.name || '—'}</div>
                            <div className="text-gray-400 mt-0.5">
                              ${t.raffle?.price_per_ticket?.toLocaleString('es-MX')} MXN ·{' '}
                              {t.purchased_at ? new Date(t.purchased_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DISPUTES TAB */}
        {/* ============================================================ */}
        {activeTab === 'disputes' && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Abiertas', value: disputeStats.open, color: 'text-red-600', bg: 'bg-red-100', icon: <AlertCircle className="w-4 h-4 text-red-600" /> },
                { label: 'En Revisión', value: disputeStats.under_review, color: 'text-amber-600', bg: 'bg-amber-100', icon: <Eye className="w-4 h-4 text-amber-600" /> },
                { label: 'Favor Participante', value: disputeStats.resolved_participant, color: 'text-emerald-600', bg: 'bg-emerald-100', icon: <UserCheck className="w-4 h-4 text-emerald-600" /> },
                { label: 'Favor Organizador', value: disputeStats.resolved_organizer, color: 'text-blue-600', bg: 'bg-blue-100', icon: <UserX className="w-4 h-4 text-blue-600" /> },
                { label: 'Total', value: disputeStats.total, color: 'text-gray-900', bg: 'bg-gray-100', icon: <Scale className="w-4 h-4 text-gray-600" /> },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>{s.icon}</div>
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['all', 'open', 'under_review', 'resolved_participant', 'resolved_organizer', 'closed'].map(s => (
                <button
                  key={s}
                  onClick={() => { setDisputeFilter(s); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    disputeFilter === s ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s === 'all' ? 'Todas' : DISPUTE_STATUS_LABELS[s as DisputeStatus]}
                  {s === 'open' && disputeStats.open > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded-full text-[10px]">{disputeStats.open}</span>
                  )}
                </button>
              ))}
              <button onClick={loadDisputeData} disabled={disputesLoading} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50">
                <RefreshCw className={`w-3.5 h-3.5 ${disputesLoading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
            </div>

            {disputesLoading ? (
              <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando disputas...</div>
            ) : filteredDisputes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin disputas</h3>
                <p className="text-gray-500">Las disputas de los participantes aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDisputes.map(dispute => (
                  <div key={dispute.id} className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow cursor-pointer ${
                    dispute.status === 'open' ? 'border-red-200 border-l-4 border-l-red-500' :
                    dispute.status === 'under_review' ? 'border-amber-200 border-l-4 border-l-amber-500' :
                    'border-gray-200'
                  }`} onClick={() => openDisputeDetail(dispute)}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        dispute.status === 'open' ? 'bg-red-100' :
                        dispute.status === 'under_review' ? 'bg-amber-100' :
                        dispute.status === 'resolved_participant' ? 'bg-emerald-100' :
                        dispute.status === 'resolved_organizer' ? 'bg-blue-100' :
                        'bg-gray-100'
                      }`}>
                        <Scale className={`w-6 h-6 ${
                          dispute.status === 'open' ? 'text-red-600' :
                          dispute.status === 'under_review' ? 'text-amber-600' :
                          dispute.status === 'resolved_participant' ? 'text-emerald-600' :
                          dispute.status === 'resolved_organizer' ? 'text-blue-600' :
                          'text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="text-sm font-bold text-gray-900">Boleto #{dispute.ticket_number}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[dispute.status as DisputeStatus]}`}>
                            {DISPUTE_STATUS_LABELS[dispute.status as DisputeStatus]}
                          </span>
                          {dispute.force_refund && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Reembolso Forzado</span>
                          )}
                          <span className="text-xs font-bold text-orange-600">${dispute.amount} {dispute.currency}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 mb-2">
                          <div><span className="text-gray-400">Participante:</span> {dispute.participant_name}</div>
                          <div><span className="text-gray-400">Organizador:</span> {dispute.organizer_name}</div>
                          <div><span className="text-gray-400">Sorteo:</span> {dispute.raffle_name}</div>
                          <div><span className="text-gray-400">Asignado:</span> {dispute.assigned_admin_name || 'Sin asignar'}</div>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-1">{dispute.reason}</p>
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

        {/* Organizers Tab */}
        {activeTab === 'organizers' && (
          <div className="flex gap-6 h-[700px]">
            {/* Lista */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar organizadores..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={loadData} className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
                  <RefreshCw className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredOrganizers.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 text-sm">{loading ? 'Cargando...' : 'No se encontraron organizadores'}</div>
                ) : filteredOrganizers.map(org => (
                  <div key={org.id}
                    onClick={() => { setSelectedOrganizer(org); loadOrgDetail(org.id); }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedOrganizer?.id === org.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${org.is_active ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-400'}`}>
                          {(org.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm truncate">{org.full_name}</div>
                          <div className="text-xs text-gray-500 truncate">{org.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${org.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {org.is_active ? 'Activo' : 'Suspendido'}
                        </span>
                        {(org as any).stripe_connect_status === 'active' && (
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium">Stripe</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-3 text-xs text-gray-400 border-t mt-2">{organizers.length} organizador(es)</div>
            </div>

            {/* Detalle */}
            <div className="w-80 flex-shrink-0">
              {!selectedOrganizer ? (
                <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <div className="text-center text-gray-400 text-sm p-6">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Selecciona un organizador para ver su detalle
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-full overflow-hidden">
                  {/* Header */}
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-b">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${selectedOrganizer.is_active ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-400'}`}>
                        {(selectedOrganizer.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{selectedOrganizer.full_name}</div>
                        <div className="text-sm text-gray-500">{selectedOrganizer.email}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Desde {new Date(selectedOrganizer.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Resumen numérico */}
                    {orgDetailLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
                    ) : orgDetail && (
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        {[
                          { label: 'Sorteos totales', value: orgDetail.totalRaffles },
                          { label: 'Sorteos activos', value: orgDetail.activeRaffles },
                          { label: 'Boletos vendidos', value: orgDetail.totalTicketsSold },
                          { label: 'Ingresos MXN', value: `$${orgDetail.totalRevenue.toLocaleString('es-MX')}` },
                        ].map(s => (
                          <div key={s.label} className="bg-white/70 rounded-lg p-2 text-center">
                            <div className="font-bold text-gray-900 text-sm">{s.value}</div>
                            <div className="text-gray-500 text-[10px]">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex gap-2">
                      <button onClick={() => toggleOrganizerStatus(selectedOrganizer)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedOrganizer.is_active ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                        {selectedOrganizer.is_active ? '🚫 Suspender' : '✅ Reactivar'}
                      </button>
                    </div>
                  </div>

                  {/* Historial de sorteos */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sorteos</div>
                    {orgDetailLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
                    ) : !orgDetail?.raffles?.length ? (
                      <div className="text-center py-8 text-gray-400 text-xs">Sin sorteos registrados</div>
                    ) : orgDetail.raffles.map((r: any) => (
                      <div key={r.id} className="bg-gray-50 rounded-lg p-2.5 text-xs mb-2">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-gray-800 truncate flex-1">{r.name}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                            r.status === 'active'          ? 'bg-emerald-100 text-emerald-700' :
                            r.status === 'winner_declared' ? 'bg-purple-100 text-purple-700' :
                            r.status === 'closed'          ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{r.status}</span>
                        </div>
                        <div className="text-gray-500">
                          {r.tickets_sold} / {r.total_tickets} boletos ·{' '}
                          ${(r.tickets_sold * (r.price_per_ticket || 0)).toLocaleString('es-MX')} MXN
                        </div>
                        <div className="text-gray-400 mt-0.5">
                          {new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </div>
                        {/* Barra de progreso */}
                        <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(100, (r.tickets_sold / r.total_tickets) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Planes de Suscripción</h3>
                <p className="text-sm text-gray-500">{plans.length} plan(es) configurados</p>
              </div>
              <button
                onClick={() => {
                  setEditingPlan(null);
                  setPlanForm({ name: '', description: '', price_monthly: '', max_active_raffles: '', max_tickets_per_raffle: '', features: '', is_active: true });
                  setShowPlanModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <DollarSign className="w-4 h-4" /> Nuevo Plan
              </button>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map(plan => (
                <div key={plan.id} className={`bg-white rounded-xl border-2 p-6 relative ${plan.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
                  {/* Status badge */}
                  <div className="absolute top-4 right-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${plan.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {plan.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1 pr-16">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                  <div className="text-3xl font-extrabold text-gray-900 mb-4">${plan.price_monthly}<span className="text-sm font-normal text-gray-500">/mes</span></div>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Sorteos activos</span><span className="font-medium">{plan.max_active_raffles >= 999 ? 'Ilimitados' : plan.max_active_raffles}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Boletos por sorteo</span><span className="font-medium">{plan.max_tickets_per_raffle.toLocaleString()}</span></div>
                  </div>
                  <ul className="space-y-1.5 mb-6">
                    {(plan.features as string[]).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {f}</li>
                    ))}
                  </ul>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => {
                        setEditingPlan(plan);
                        setPlanForm({
                          name: plan.name,
                          description: plan.description || '',
                          price_monthly: plan.price_monthly.toString(),
                          max_active_raffles: plan.max_active_raffles.toString(),
                          max_tickets_per_raffle: plan.max_tickets_per_raffle.toString(),
                          features: (plan.features as string[]).join('\n'),
                          is_active: plan.is_active,
                        });
                        setShowPlanModal(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        const { error } = await supabase.from('subscription_plans').update({ is_active: !plan.is_active }).eq('id', plan.id);
                        if (!error) {
                          setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
                          toast({ title: plan.is_active ? 'Plan desactivado' : 'Plan activado' });
                        }
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${plan.is_active ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
                    >
                      {plan.is_active ? <><Ban className="w-3.5 h-3.5" /> Desactivar</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activar</>}
                    </button>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        const confirmed = confirm(`¿Eliminar el plan "${plan.name}"?\n\nEsta acción no se puede deshacer. Los organizadores con este plan activo no se verán afectados de inmediato.`);
                        if (!confirmed) return;
                        setDeletingPlanId(plan.id);
                        const { error } = await supabase.from('subscription_plans').delete().eq('id', plan.id);
                        if (!error) {
                          setPlans(prev => prev.filter(p => p.id !== plan.id));
                          toast({ title: 'Plan eliminado' });
                        } else {
                          toast({ title: 'Error', description: error.message, variant: 'destructive' });
                        }
                        setDeletingPlanId(null);
                      }}
                      disabled={deletingPlanId === plan.id}
                      className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {plans.length === 0 && (
                <div className="col-span-3 text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                  <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Sin planes configurados</h3>
                  <p className="text-gray-500 text-sm">Crea el primer plan para que los organizadores puedan suscribirse.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* PLAN MODAL — CREATE / EDIT */}
        {/* ============================================================ */}
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPlanModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">{editingPlan ? 'Editar Plan' : 'Nuevo Plan'}</h3>
                <button onClick={() => setShowPlanModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del plan <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={planForm.name}
                      onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ej: Básico, Estándar, Pro"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={planForm.description}
                      onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Descripción breve del plan"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio mensual (MXN) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      value={planForm.price_monthly}
                      onChange={e => setPlanForm(p => ({ ...p, price_monthly: e.target.value }))}
                      placeholder="299"
                      min="0"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sorteos activos <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      value={planForm.max_active_raffles}
                      onChange={e => setPlanForm(p => ({ ...p, max_active_raffles: e.target.value }))}
                      placeholder="999 = ilimitados"
                      min="1"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Boletos por sorteo <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      value={planForm.max_tickets_per_raffle}
                      onChange={e => setPlanForm(p => ({ ...p, max_tickets_per_raffle: e.target.value }))}
                      placeholder="1000"
                      min="1"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Características</label>
                    <p className="text-xs text-gray-400 mb-1.5">Una por línea — aparecen como lista con check en el PlanSelector</p>
                    <textarea
                      value={planForm.features}
                      onChange={e => setPlanForm(p => ({ ...p, features: e.target.value }))}
                      placeholder={"Soporte por email\nReportes básicos\nNotificaciones automáticas"}
                      rows={5}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        onClick={() => setPlanForm(p => ({ ...p, is_active: !p.is_active }))}
                        className={`w-11 h-6 rounded-full transition-colors ${planForm.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${planForm.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{planForm.is_active ? 'Plan activo (visible para organizadores)' : 'Plan inactivo (oculto)'}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button onClick={() => setShowPlanModal(false)} disabled={savingPlan} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  disabled={savingPlan || !planForm.name || !planForm.price_monthly || !planForm.max_active_raffles || !planForm.max_tickets_per_raffle}
                  onClick={async () => {
                    if (!user) return;
                    setSavingPlan(true);
                    const featuresArray = planForm.features.split('\n').map(f => f.trim()).filter(Boolean);
                    const payload = {
                      name: planForm.name.trim(),
                      description: planForm.description.trim(),
                      price_monthly: parseFloat(planForm.price_monthly),
                      max_active_raffles: parseInt(planForm.max_active_raffles),
                      max_tickets_per_raffle: parseInt(planForm.max_tickets_per_raffle),
                      features: featuresArray,
                      is_active: planForm.is_active,
                    };
                    if (editingPlan) {
                      const { error } = await supabase.from('subscription_plans').update(payload).eq('id', editingPlan.id);
                      if (!error) {
                        setPlans(prev => prev.map(p => p.id === editingPlan.id ? { ...p, ...payload } : p));
                        await createAuditLog({ userId: user.id, userEmail: user.email, action: 'plan_updated', entityType: 'subscription_plan', entityId: editingPlan.id, newValue: payload });
                        toast({ title: 'Plan actualizado', description: `"${payload.name}" guardado correctamente.` });
                        setShowPlanModal(false);
                      } else {
                        toast({ title: 'Error', description: error.message, variant: 'destructive' });
                      }
                    } else {
                      const { data, error } = await supabase.from('subscription_plans').insert(payload).select().single();
                      if (!error && data) {
                        setPlans(prev => [...prev, data]);
                        await createAuditLog({ userId: user.id, userEmail: user.email, action: 'plan_created', entityType: 'subscription_plan', entityId: data.id, newValue: payload });
                        toast({ title: 'Plan creado', description: `"${payload.name}" creado correctamente.` });
                        setShowPlanModal(false);
                      } else {
                        toast({ title: 'Error', description: error?.message, variant: 'destructive' });
                      }
                    }
                    setSavingPlan(false);
                  }}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {savingPlan ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> {editingPlan ? 'Guardar cambios' : 'Crear plan'}</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Comisión por Boleto</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800"><strong>Importante:</strong> Cambiar este valor solo afecta ventas futuras.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs">
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} min="0" max="50" step="0.5"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                </div>
                <button onClick={saveCommission} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <Save className="w-4 h-4" /> Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Registro de Auditoría</h3>
                <p className="text-gray-500 text-sm">Historial de acciones críticas</p>
              </div>
              <button onClick={async () => { const logs = await fetchAuditLogs({ limit: 50 }); setAuditLogs(logs); }} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
            </div>
            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500"><BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm">No hay registros de auditoría aún</p></div>
              ) : (
                auditLogs.map((log, i) => (
                  <div key={log.id || i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getAuditActionColor(log.action)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                      <p className="text-xs text-gray-500">{log.entity_type}: {log.entity_id?.substring(0, 8)}...{log.user_email && ` — por ${log.user_email}`}</p>
                      {log.old_value && <p className="text-[10px] text-gray-400 mt-0.5">Anterior: {JSON.stringify(log.old_value)} → Nuevo: {JSON.stringify(log.new_value)}</p>}
                    </div>
                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString('es-MX') : '-'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Ledger Tab */}
        {activeTab === 'ledger' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Ledger Financiero</h3>
                <p className="text-gray-500 text-sm">Registro contable inmutable</p>
              </div>
              <button onClick={async () => { const entries = await fetchLedgerEntries({ limit: 100 }); setLedgerEntries(entries); }} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">Cada entrada registra el % de comisión y monto calculado <strong>en el momento de la venta</strong>.</p>
              </div>
            </div>
            {ledgerEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500"><Database className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm">No hay entradas en el ledger aún</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Tipo</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Descripción</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2">Monto</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2">Comisión</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledgerEntries.map((entry, i) => {
                      const typeInfo = getLedgerTypeLabel(entry.entry_type);
                      return (
                        <tr key={entry.id || i} className="hover:bg-gray-50">
                          <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span></td>
                          <td className="px-3 py-2 text-sm text-gray-700 max-w-xs truncate">{entry.description}</td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 text-right">${entry.amount?.toLocaleString('es-MX')} {entry.currency}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 text-right">{entry.commission_rate_applied ? `${entry.commission_rate_applied}%` : '-'}{entry.commission_amount_calculated ? ` ($${entry.commission_amount_calculated})` : ''}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 text-right font-mono">{entry.created_at ? new Date(entry.created_at).toLocaleString('es-MX') : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* DISPUTE DETAIL MODAL */}
      {/* ============================================================ */}
      {showDisputeDetail && selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDisputeDetail(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-gray-200 flex-shrink-0">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-red-600" /> Disputa — Boleto #{selectedDispute.ticket_number}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${DISPUTE_STATUS_COLORS[selectedDispute.status as DisputeStatus]}`}>
                    {DISPUTE_STATUS_LABELS[selectedDispute.status as DisputeStatus]}
                  </span>
                  <span className="text-xs text-gray-500">{selectedDispute.raffle_name}</span>
                  <span className="text-xs font-bold text-orange-600">${selectedDispute.amount} {selectedDispute.currency}</span>
                  {selectedDispute.force_refund && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Reembolso Forzado</span>}
                </div>
              </div>
              <button onClick={() => setShowDisputeDetail(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-5 border-b border-gray-200 flex-shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-blue-50 rounded-lg p-3">
                  <span className="text-blue-600 font-medium">Participante</span>
                  <p className="text-gray-900 font-bold mt-0.5">{selectedDispute.participant_name}</p>
                  <p className="text-gray-500">{selectedDispute.participant_email}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <span className="text-amber-600 font-medium">Organizador</span>
                  <p className="text-gray-900 font-bold mt-0.5">{selectedDispute.organizer_name}</p>
                  <p className="text-gray-500">{selectedDispute.organizer_email}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-600 font-medium">Motivo reembolso</span>
                  <p className="text-gray-900 mt-0.5">{selectedDispute.refund_reason || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-600 font-medium">Respuesta organizador</span>
                  <p className="text-gray-900 mt-0.5">{selectedDispute.refund_organizer_notes || '-'}</p>
                </div>
              </div>

              {!['resolved_participant', 'resolved_organizer', 'closed'].includes(selectedDispute.status) && (
                <div className="flex flex-wrap gap-2 mt-4">
                  <button onClick={() => { setShowStatusModal(true); setNewStatus('under_review'); setStatusNotes(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Tomar en Revisión
                  </button>
                  <button onClick={() => { setShowStatusModal(true); setNewStatus('resolved_organizer'); setStatusNotes(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors">
                    <UserX className="w-3.5 h-3.5" /> Favor Organizador
                  </button>
                  <button onClick={() => { setShowForceRefundModal(true); setForceRefundDecision(''); setForceRefundNotes(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 transition-colors shadow-sm">
                    <Gavel className="w-3.5 h-3.5" /> Forzar Reembolso
                  </button>
                  <button onClick={() => { setShowStatusModal(true); setNewStatus('closed'); setStatusNotes(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors">
                    <X className="w-3.5 h-3.5" /> Cerrar
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Línea de tiempo</h4>
              {detailLoading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" /><p className="text-sm text-gray-500">Cargando...</p></div>
              ) : (
                <div className="space-y-3">
                  {disputeMessages.map(msg => (
                    <div key={msg.id} className={`rounded-xl border p-3 ${getMessageRoleColor(msg.sender_role)} ${msg.is_internal ? 'ring-2 ring-red-300 ring-offset-1' : ''}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {getMessageTypeIcon(msg.message_type)}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getMessageRoleBadge(msg.sender_role)}`}>
                          {msg.sender_role === 'admin' ? 'Admin' : msg.sender_role === 'organizer' ? 'Organizador' : msg.sender_role === 'system' ? 'Sistema' : 'Participante'}
                        </span>
                        {msg.sender_name && msg.sender_role !== 'system' && (
                          <span className="text-xs text-gray-600 font-medium">{msg.sender_name}</span>
                        )}
                        {msg.is_internal && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">Interno</span>}
                        <span className="text-[10px] text-gray-400 ml-auto">{new Date(msg.created_at).toLocaleString('es-MX')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  ))}
                  {disputeMessages.length === 0 && (
                    <div className="text-center py-8 text-gray-400"><MessageSquare className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">No hay mensajes aún</p></div>
                  )}
                </div>
              )}
            </div>

            {!['resolved_participant', 'resolved_organizer', 'closed'].includes(selectedDispute.status) && (
              <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={isInternalMessage} onChange={e => setIsInternalMessage(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <span className={isInternalMessage ? 'text-red-600 font-medium' : ''}>Nota interna (solo admins)</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder={isInternalMessage ? "Nota interna..." : "Escribe un mensaje..."}
                    className={`flex-1 px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:border-transparent ${
                      isInternalMessage ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'
                    }`} />
                  <button onClick={handleSendMessage} disabled={sendingMessage || !newMessage.trim()}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

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

      {/* STATUS CHANGE MODAL */}
      {showStatusModal && selectedDispute && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowStatusModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Cambiar Estado de Disputa</h3>
              <button onClick={() => setShowStatusModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nuevo estado</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="open">Abierta</option>
                <option value="under_review">En Revisión</option>
                <option value="resolved_participant">Resuelta (Favor Participante)</option>
                <option value="resolved_organizer">Resuelta (Favor Organizador)</option>
                <option value="closed">Cerrada</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas del administrador</label>
              <textarea value={statusNotes} onChange={e => setStatusNotes(e.target.value)} placeholder="Explica la razón del cambio de estado..."
                rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">El cambio de estado se notificará al participante y al organizador. Se registrará en auditoría.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowStatusModal(false)} disabled={updatingStatus} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={handleUpdateStatus} disabled={updatingStatus || !newStatus}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />} Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORCE REFUND MODAL */}
      {showForceRefundModal && selectedDispute && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowForceRefundModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Gavel className="w-5 h-5 text-red-600" /> Forzar Reembolso
              </h3>
              <button onClick={() => setShowForceRefundModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <h4 className="text-sm font-bold text-red-800 mb-2">Acción administrativa</h4>
              <div className="text-xs text-red-700 space-y-1">
                <p>Esta acción forzará un reembolso de <strong>${selectedDispute.amount} {selectedDispute.currency}</strong> al participante.</p>
                <p>Boleto #{selectedDispute.ticket_number} — {selectedDispute.raffle_name}</p>
                <p>Participante: {selectedDispute.participant_name}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Decisión administrativa <span className="text-red-500">*</span></label>
              <textarea value={forceRefundDecision} onChange={e => setForceRefundDecision(e.target.value)}
                placeholder="Explica la razón por la cual se fuerza el reembolso..."
                rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas adicionales (opcional)</label>
              <textarea value={forceRefundNotes} onChange={e => setForceRefundNotes(e.target.value)}
                placeholder="Notas internas..."
                rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none" />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Consecuencias:</strong>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>Reembolso de ${selectedDispute.amount} {selectedDispute.currency}</li>
                    <li>Boleto liberado para venta</li>
                    <li>Entradas en ledger financiero</li>
                    <li>Notificación a ambas partes</li>
                    <li>Registro en auditoría</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForceRefundModal(false)} disabled={processingForceRefund} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={handleForceRefund} disabled={processingForceRefund || !forceRefundDecision.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-bold hover:from-red-700 hover:to-red-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                {processingForceRefund ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><Gavel className="w-4 h-4" /> Forzar Reembolso</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
