import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/contexts/AppContext';
import { Raffle, RAFFLE_VALIDATION_RULES } from '@/lib/types';
import { atomicTicketPurchase, reserveTickets, releaseTickets } from '@/lib/database';
import { createCheckoutSession, handlePaymentReturn, verifyPayment } from '@/lib/stripe';
import { sendTicketPurchaseNotification } from '@/lib/notifications';
import { rateLimiter } from '@/lib/rate-limiter';
import {
  ArrowLeft, Trophy, Calendar, DollarSign, Hash,
  CreditCard, CheckCircle2, ShoppingCart,
  X, Timer, Lock, ShieldCheck,
  ExternalLink, Loader2, Wallet, RefreshCw, Zap, AlertTriangle, Ban
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// ─── tipos locales ────────────────────────────────────────────────────────────
interface TicketInfo {
  id: string;
  status: 'available' | 'reserved' | 'sold' | 'paid';
  reserved_by?: string | null;
  reserved_until?: string | null;
  participant_id?: string | null;
}

interface TicketGridProps {
  raffle: Raffle;
  onBack: () => void;
}

function useCols(): number {
  const [cols, setCols] = useState(() =>
    window.innerWidth >= 1024 ? 12 : window.innerWidth >= 768 ? 10 : window.innerWidth >= 640 ? 8 : 5
  );
  useEffect(() => {
    const handler = () => setCols(window.innerWidth >= 1024 ? 12 : window.innerWidth >= 768 ? 10 : window.innerWidth >= 640 ? 8 : 5);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return cols;
}

// ─── componente ──────────────────────────────────────────────────────────────
const TicketGrid: React.FC<TicketGridProps> = ({ raffle, onBack }) => {
  const { user, isAuthenticated } = useAuth();
  const { openAuthModal } = useAppContext();
  const cols = useCols();

  // ticketMap solo almacena boletos NO-disponibles + los propios.
  // El resto se asume 'available', evitando cargar 100 K filas.
  const [ticketMap, setTicketMap]             = useState<Map<number, TicketInfo>>(new Map());
  const [loading, setLoading]                 = useState(true);
  const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchasing, setPurchasing]           = useState(false);
  const [reservationTimer, setReservationTimer] = useState(0);
  const [searchNumber, setSearchNumber]       = useState('');
  const [purchaseErrors, setPurchaseErrors]   = useState<string[]>([]);
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [reservingTicket, setReservingTicket] = useState<number | null>(null);
  const [conflictTickets, setConflictTickets] = useState<number[]>([]);
  const [lastRefresh, setLastRefresh]         = useState(new Date());

  // Número de inicio según tipo de sorteo (Zodiaco=0, resto=1)
  const START = (raffle as any).ticket_start_number ?? 1;

  // Paginación por bloques de 500
  const BLOCK_SIZE = 500;
  const totalBlocks = Math.ceil(raffle.total_tickets / BLOCK_SIZE);
  const [activeBlock, setActiveBlock] = useState(0);

  // Refs para callbacks estables
  const reservedByMeRef    = useRef<number[]>([]);
  const selectedTicketsRef = useRef<number[]>([]);
  const userIdRef          = useRef<string | undefined>(undefined);
  selectedTicketsRef.current = selectedTickets;
  userIdRef.current          = user?.id;

  // ── carga inteligente: solo boletos no-disponibles ─────────────────────────
  const loadTickets = useCallback(async () => {
    const PAGE = 1000;
    const rows: any[] = [];
    let from = 0;
    let more = true;

    while (more) {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, status, reserved_by, reserved_until, participant_id')
        .eq('raffle_id', raffle.id)
        .neq('status', 'available')          // ← solo los no-disponibles
        .order('ticket_number')
        .range(from, from + PAGE - 1);

      if (error || !data) break;
      rows.push(...data);
      more = data.length === PAGE;
      from += PAGE;
    }

    // También cargar los propios (por si son 'available' pero reservados por mí)
    if (user?.id) {
      const { data: own } = await supabase
        .from('tickets')
        .select('id, ticket_number, status, reserved_by, reserved_until, participant_id')
        .eq('raffle_id', raffle.id)
        .eq('reserved_by', user.id);
      if (own) rows.push(...own);
    }

    // Construir mapa num→info (deduplicado)
    const map = new Map<number, TicketInfo>();
    for (const r of rows) {
      map.set(r.ticket_number, {
        id: r.id,
        status: r.status,
        reserved_by: r.reserved_by,
        reserved_until: r.reserved_until,
        participant_id: r.participant_id,
      });
    }
    setTicketMap(map);

    // Verificar si algún boleto seleccionado ya no está disponible
    const current = selectedTicketsRef.current;
    const uid     = userIdRef.current;
    if (current.length > 0) {
      const unavailable = current.filter(n => {
        const t = map.get(n);
        if (!t) return false;                                           // sigue disponible
        if (t.status === 'sold' || t.status === 'paid') return true;
        if (t.status === 'reserved' && t.reserved_by !== uid) {
          return !t.reserved_until || new Date(t.reserved_until) > new Date();
        }
        return false;
      });
      if (unavailable.length > 0) {
        setConflictTickets(unavailable);
        setSelectedTickets(prev => prev.filter(n => !unavailable.includes(n)));
        toast({
          title: 'Boletos no disponibles',
          description: `Los boletos #${unavailable.join(', #')} fueron tomados por otro usuario.`,
          variant: 'destructive',
        });
        setTimeout(() => setConflictTickets([]), 3000);
      }
    }

    setLoading(false);
    setLastRefresh(new Date());
  }, [raffle.id, user?.id]);

  // ── retorno de Stripe ──────────────────────────────────────────────────────
  useEffect(() => {
    const ret = handlePaymentReturn();
    if (!ret.isPaymentReturn) return;
    if (ret.status === 'success' && ret.sessionId) {
      setPaymentVerified(true);
      toast({ title: 'Pago procesado', description: 'Tu pago con Stripe se procesó exitosamente.' });
      verifyPayment(ret.sessionId).then(result => {
        if (result.status === 'paid') {
          toast({ title: 'Pago confirmado', description: `$${((result.amount_total || 0) / 100).toLocaleString('es-MX')} MXN confirmado.` });
        }
        setTimeout(loadTickets, 2000);
      });
    } else if (ret.status === 'cancelled') {
      toast({ title: 'Pago cancelado', description: 'Los boletos reservados serán liberados.', variant: 'destructive' });
    }
  }, []); // eslint-disable-line

  // ── polling cada 10 s (solo no-disponibles = query ligera) ────────────────
  useEffect(() => {
    loadTickets();
    const id = setInterval(loadTickets, 10_000);
    return () => clearInterval(id);
  }, [raffle.id]); // eslint-disable-line

  // ── suscripción realtime ───────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`tickets-${raffle.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `raffle_id=eq.${raffle.id}` },
        (payload) => {
          const n = (payload.new as any);
          const o = (payload.old as any);
          const num: number = n?.ticket_number ?? o?.ticket_number;
          const uid = userIdRef.current;
          const sel = selectedTicketsRef.current;

          setTicketMap(prev => {
            const next = new Map(prev);
            if (!n || n.status === 'available') {
              next.delete(num);
            } else {
              next.set(num, { id: n.id, status: n.status, reserved_by: n.reserved_by, reserved_until: n.reserved_until, participant_id: n.participant_id });
            }
            return next;
          });

          if (!n) return;
          if ((n.status === 'sold' || n.status === 'paid') && n.participant_id !== uid && sel.includes(num)) {
            setConflictTickets(p => [...p, num]);
            setSelectedTickets(p => p.filter(x => x !== num));
            toast({ title: 'Boleto tomado', description: `El boleto #${num} fue comprado por otro usuario.`, variant: 'destructive' });
            setTimeout(() => setConflictTickets(p => p.filter(x => x !== num)), 3000);
          }
          if (n.status === 'reserved' && n.reserved_by !== uid && sel.includes(num)) {
            setSelectedTickets(p => p.filter(x => x !== num));
            toast({ title: 'Boleto reservado', description: `El boleto #${num} fue reservado por otro usuario.`, variant: 'destructive' });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [raffle.id]);

  // ── liberar reservas al salir ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (reservedByMeRef.current.length > 0 && user?.id) {
        releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: reservedByMeRef.current });
      }
    };
  }, [raffle.id, user?.id]);

  // ── timer de reserva ──────────────────────────────────────────────────────
  useEffect(() => {
    if (reservationTimer <= 0) return;
    const id = setInterval(() => {
      setReservationTimer(prev => {
        if (prev <= 1) {
          if (reservedByMeRef.current.length > 0 && user?.id) {
            releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: reservedByMeRef.current });
            reservedByMeRef.current = [];
          }
          setSelectedTickets([]);
          setShowPurchaseModal(false);
          toast({ title: 'Reserva expirada', description: 'Los boletos fueron liberados.', variant: 'destructive' });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [reservationTimer, raffle.id, user?.id]);

  // ── helpers de estado de boleto ───────────────────────────────────────────
  const getInfo = useCallback((num: number): TicketInfo => {
    return ticketMap.get(num) ?? { id: '', status: 'available' };
  }, [ticketMap]);

  const getColor = (num: number): string => {
    if (conflictTickets.includes(num))  return 'bg-red-500 text-white animate-pulse ring-2 ring-red-300';
    if (reservingTicket === num)        return 'bg-blue-300 text-white animate-pulse';
    if (selectedTickets.includes(num))  return 'bg-blue-600 text-white ring-2 ring-blue-300 scale-105';
    if (raffle.winning_number === num)  return 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white ring-2 ring-yellow-300';

    const t = getInfo(num);
    if (t.status === 'paid')  return 'bg-emerald-500 text-white cursor-not-allowed';
    if (t.status === 'sold')  return 'bg-gray-400 text-white cursor-not-allowed';
    if (t.status === 'reserved') {
      if (t.reserved_by === user?.id) return 'bg-blue-400 text-white ring-2 ring-blue-200';
      if (t.reserved_until && new Date(t.reserved_until) > new Date())
        return 'bg-amber-300 text-amber-900 cursor-not-allowed';
    }
    return 'bg-white text-gray-700 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer';
  };

  const isClickable = (num: number): boolean => {
    if (selectedTickets.includes(num)) return true;
    if (reservingTicket !== null)      return false;
    const t = getInfo(num);
    if (t.status === 'sold' || t.status === 'paid') return false;
    if (t.status === 'reserved' && t.reserved_by !== user?.id) {
      if (t.reserved_until && new Date(t.reserved_until) > new Date()) return false;
    }
    return true;
  };

  const hasBadge = (num: number): 'lock' | 'ban' | null => {
    const t = getInfo(num);
    if (t.status === 'sold' || t.status === 'paid') return 'lock';
    if (t.status === 'reserved' && t.reserved_by !== user?.id &&
        t.reserved_until && new Date(t.reserved_until) > new Date()) return 'ban';
    return null;
  };

  // ── toggleTicket ──────────────────────────────────────────────────────────
  const toggleTicket = async (num: number) => {
    if (!isAuthenticated || !user) {
      openAuthModal('register');
      return;
    }
    if (raffle.status !== 'active') {
      toast({ title: 'Sorteo no activo', description: 'Este sorteo no acepta compras ahora', variant: 'destructive' });
      return;
    }
    // Deseleccionar
    if (selectedTickets.includes(num)) {
      setSelectedTickets(p => p.filter(n => n !== num));
      releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: [num] });
      reservedByMeRef.current = reservedByMeRef.current.filter(n => n !== num);
      return;
    }
    // Verificar disponibilidad local
    const t = getInfo(num);
    if (t.status === 'sold' || t.status === 'paid') return;
    if (t.status === 'reserved' && t.reserved_by !== user.id) {
      if (t.reserved_until && new Date(t.reserved_until) > new Date()) {
        toast({ title: 'Boleto reservado', description: `El boleto #${num} está reservado. Intenta en unos minutos.`, variant: 'destructive' });
        return;
      }
    }
    if (selectedTickets.length >= RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction) {
      toast({ title: 'Límite alcanzado', description: `Máximo ${RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction} boletos por transacción`, variant: 'destructive' });
      return;
    }
    // Reservar en DB
    setReservingTicket(num);
    const result = await reserveTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: [num], durationSeconds: 300 });
    if (result.failed.includes(num)) {
      toast({ title: 'No disponible', description: `El boleto #${num} fue tomado por otro usuario.`, variant: 'destructive' });
      setReservingTicket(null);
      loadTickets();
      return;
    }
    setSelectedTickets(p => [...p, num]);
    reservedByMeRef.current = [...reservedByMeRef.current, num];
    setReservingTicket(null);
  };

  // ── compra ────────────────────────────────────────────────────────────────
  const startPurchase = () => {
    if (!selectedTickets.length || !user) return;
    const rc = rateLimiter.canPurchaseTickets(user.id, selectedTickets.length);
    if (!rc.allowed) { toast({ title: 'Límite de velocidad', description: rc.reason, variant: 'destructive' }); return; }
    setPurchaseErrors([]);
    setShowPurchaseModal(true);
    setReservationTimer(300);
  };

  const handleStripeCheckout = async () => {
    if (!user || !selectedTickets.length) return;
    setStripeRedirecting(true);
    try {
      const r = await createCheckoutSession({ raffleId: raffle.id, raffleName: raffle.name, ticketNumbers: selectedTickets, pricePerTicket: raffle.price_per_ticket });
      if (r.error) { setPurchaseErrors([r.error]); setStripeRedirecting(false); return; }
      if (r.url) window.location.href = r.url;
    } catch (e: any) { setPurchaseErrors([e.message]); setStripeRedirecting(false); }
  };

  const handleDirectPurchase = async () => {
    if (!user || !selectedTickets.length) return;
    setPurchasing(true);
    try {
      const r = await atomicTicketPurchase({ userId: user.id, userEmail: user.email, raffleId: raffle.id, ticketNumbers: selectedTickets, paymentMethod: raffle.payment_method, commissionRate: 5, pricePerTicket: raffle.price_per_ticket });
      if (r.success) {
        toast({ title: 'Compra exitosa', description: `${r.purchasedTickets.length} boleto(s) adquirido(s) para "${raffle.name}".` });
        sendTicketPurchaseNotification({ userId: user.id, raffleId: raffle.id, ticketNumbers: r.purchasedTickets, amount: r.purchasedTickets.length * raffle.price_per_ticket, paymentMethod: raffle.payment_method });
        reservedByMeRef.current = [];
        setSelectedTickets([]);
        setShowPurchaseModal(false);
        setReservationTimer(0);
        loadTickets();
      } else {
        setPurchaseErrors(r.errors);
        toast({ title: 'Error en la compra', description: r.errors.join('\n'), variant: 'destructive' });
        loadTickets();
      }
    } catch { toast({ title: 'Error', description: 'Ocurrió un error al procesar la compra', variant: 'destructive' }); }
    setPurchasing(false);
  };

  const cancelSelection = () => {
    if (reservedByMeRef.current.length > 0 && user?.id) {
      releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: reservedByMeRef.current });
      reservedByMeRef.current = [];
    }
    setSelectedTickets([]);
    setShowPurchaseModal(false);
    setReservationTimer(0);
    setStripeRedirecting(false);
  };

  // ── estadísticas ─────────────────────────────────────────────────────────
  const { soldCount, reservedByOthersCount, availableCount } = useMemo(() => {
    let sold = 0, reserved = 0;
    const now = new Date();
    ticketMap.forEach(t => {
      if (t.status === 'sold' || t.status === 'paid') sold++;
      else if (t.status === 'reserved' && t.reserved_by !== user?.id && t.reserved_until && new Date(t.reserved_until) > now) reserved++;
    });
    return { soldCount: sold, reservedByOthersCount: reserved, availableCount: raffle.total_tickets - sold - reserved };
  }, [ticketMap, user?.id, raffle.total_tickets]);

  const totalCost      = selectedTickets.length * raffle.price_per_ticket;
  const isStripePayment = raffle.payment_method === 'stripe';
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ── virtual grid ──────────────────────────────────────────────────────────

  const renderTicketButton = (num: number) => {
    const badge = hasBadge(num);
    return (
      <button
        key={num}
        onClick={() => toggleTicket(num)}
        disabled={!isClickable(num)}
        title={`Boleto #${num}`}
        className={`h-11 min-w-[2.5rem] flex-1 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-150 relative select-none ${getColor(num)}`}
      >
        {reservingTicket === num ? <Loader2 className="w-3 h-3 animate-spin" /> : formatTicketNumber(num, raffle.total_tickets)}
        {badge === 'lock' && <Lock className="w-2 h-2 absolute top-0.5 right-0.5 opacity-40" />}
        {badge === 'ban'  && <Ban  className="w-2 h-2 absolute top-0.5 right-0.5 opacity-50" />}
      </button>
    );
  };

  // Modo búsqueda: mostrar solo el número exacto + vecinos
  // Dígitos según el número más alto del sorteo
  const formatTicketNumber = (n: number, total: number): string => {
    const maxNum = START + total - 1;
    return n.toString().padStart(maxNum.toString().length, '0');
  };

  const searchResults = useMemo(() => {
    if (!searchNumber) return null;
    const n = parseInt(searchNumber);
    if (isNaN(n)) return [];
    const matches: number[] = [];
    for (let i = Math.max(START, n - 2); i <= Math.min(START + raffle.total_tickets - 1, n + 2); i++) {
      if (i.toString().includes(searchNumber) || formatTicketNumber(i, raffle.total_tickets).includes(searchNumber)) {
        matches.push(i);
      }
    }
    return matches;
  }, [searchNumber, raffle.total_tickets]);

  // ── render ────────────────────────────────────────────────────────────────
  const blockFrom = START + activeBlock * BLOCK_SIZE;
  const blockTo   = Math.min(START + (activeBlock + 1) * BLOCK_SIZE - 1, START + raffle.total_tickets - 1);
  const blockNums = Array.from({ length: blockTo - blockFrom + 1 }, (_, i) => blockFrom + i);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a sorteos
        </button>

        {paymentVerified && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-emerald-800">Pago confirmado con Stripe</h3>
              <p className="text-sm text-emerald-700">Los boletos se actualizarán automáticamente.</p>
            </div>
            <button onClick={() => setPaymentVerified(false)} className="ml-auto p-1 hover:bg-emerald-100 rounded">
              <X className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
        )}

        {/* Info rifa */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-64 h-40 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              {raffle.image_url
                ? <img src={raffle.image_url} alt={raffle.name} className="w-full h-full object-cover rounded-xl" />
                : <Trophy className="w-16 h-16 text-blue-400" />}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">{raffle.name}</h1>
                  <p className="text-gray-600">{raffle.description || 'Sin descripción'}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${raffle.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                  {raffle.status === 'active' ? 'Activa' : raffle.status === 'winner_declared' ? 'Con Ganador' : raffle.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Precio', value: `$${raffle.price_per_ticket} MXN` },
                  { icon: <Hash       className="w-3.5 h-3.5" />, label: 'Disponibles', value: `${availableCount.toLocaleString('es-MX')} / ${raffle.total_tickets.toLocaleString('es-MX')}`, green: true },
                  { icon: <Calendar   className="w-3.5 h-3.5" />, label: 'Sorteo', value: new Date(raffle.draw_date).toLocaleDateString('es-MX') },
                  { icon: isStripePayment ? <CreditCard className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />, label: 'Pago', value: isStripePayment ? 'Stripe' : 'Externo' },
                ].map(({ icon, label, value, green }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">{icon} {label}</div>
                    <div className={`font-bold ${green ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Barra de info */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <Zap className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="text-xs text-emerald-800 flex-1">
            <strong>Protección contra compra duplicada:</strong> Reserva atómica con <code className="bg-white/60 px-1 rounded">FOR UPDATE SKIP LOCKED</code>.
            {' '}Grid virtual para hasta 100,000 boletos.
          </div>
          <button onClick={loadTickets} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        {reservedByOthersCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-800">
              <strong>{reservedByOthersCount} boleto(s)</strong> reservados por otros usuarios. Se liberan en 5 min si no completan la compra.
            </span>
          </div>
        )}

        {/* Barra de selección */}
        {selectedTickets.length > 0 && (
          <div className="sticky top-16 z-30 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-4 mb-4 shadow-lg flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              <span className="font-medium">{selectedTickets.length} boleto(s)</span>
              <span className="text-blue-200">|</span>
              <span className="font-bold">${totalCost.toLocaleString('es-MX')} MXN</span>
              {reservationTimer > 0 && (
                <span className="flex items-center gap-1 text-amber-200 text-xs">
                  <Timer className="w-3.5 h-3.5" /> {formatTime(reservationTimer)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={cancelSelection} className="px-3 py-1.5 text-sm bg-white/20 rounded-lg hover:bg-white/30">Limpiar</button>
              <button onClick={startPurchase} className="px-4 py-1.5 text-sm bg-white text-blue-700 rounded-lg font-bold hover:bg-blue-50 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> {isStripePayment ? 'Pagar con Stripe' : 'Comprar'}
              </button>
            </div>
          </div>
        )}

        {/* Búsqueda y leyenda */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            type="number"
            min={1} max={raffle.total_tickets}
            value={searchNumber}
            onChange={e => setSearchNumber(e.target.value)}
            placeholder="Buscar número..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-44"
          />
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-white border border-gray-200" /> Disponible</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-600" /> Seleccionado</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-400" /> Vendido</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Pagado</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-300" /> Reservado (otro)</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            Actualizado: {lastRefresh.toLocaleTimeString('es-MX')}
          </div>
        </div>

        {/* Selector de bloque — solo si hay más de 500 boletos */}
        {totalBlocks > 1 && !searchResults && (
          <div className="mb-3 flex flex-wrap gap-2">
            {Array.from({ length: totalBlocks }, (_, i) => {
              const from = START + i * BLOCK_SIZE;
              const to   = Math.min(START + (i + 1) * BLOCK_SIZE - 1, START + raffle.total_tickets - 1);
              const hasSelected = selectedTickets.some(n => n >= from && n <= to);
              return (
                <button
                  key={i}
                  onClick={() => setActiveBlock(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activeBlock === i
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : hasSelected
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {from.toLocaleString('es-MX')} – {to.toLocaleString('es-MX')}
                  {hasSelected && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Grid */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          {loading ? (
            <div className="text-center py-16 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
              Cargando boletos...
            </div>
          ) : searchResults ? (
            <div>
              {searchResults.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">No se encontró el número</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {searchResults.map(num => renderTicketButton(num))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3 text-center">
                Resultados para "{searchNumber}". Borra la búsqueda para ver el grid completo.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {blockNums.map(renderTicketButton)}
            </div>
          )}
        </div>

        {/* Ganador */}
        {raffle.status === 'winner_declared' && raffle.winning_number && (
          <div className="mt-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-6 text-center">
            <Trophy className="w-12 h-12 text-white mx-auto mb-3" />
            <h3 className="text-2xl font-extrabold text-white mb-1">Número Ganador: #{raffle.winning_number}</h3>
            <p className="text-white/80">{raffle.lottery_type} — {raffle.lottery_draw_number}</p>
          </div>
        )}

        {/* Modal de compra */}
        {showPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Confirmar Compra</h3>
                <button onClick={cancelSelection} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              {reservationTimer > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <Timer className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-800">Reserva expira en: <strong>{formatTime(reservationTimer)}</strong></span>
                </div>
              )}
              {purchaseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">{purchaseErrors.map((e, i) => <p key={i}>{e}</p>)}</div>
                  </div>
                </div>
              )}
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Sorteo</span><span className="font-medium">{raffle.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Boletos</span><span className="font-medium">{selectedTickets.sort((a,b)=>a-b).map(n=>`#${n}`).join(', ')}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Precio unitario</span><span className="font-medium">${raffle.price_per_ticket} MXN</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Cantidad</span><span className="font-medium">{selectedTickets.length}</span></div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Método</span>
                  <span className="font-medium flex items-center gap-1">
                    {isStripePayment ? <><CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Stripe</> : <><Wallet className="w-3.5 h-3.5" /> Externo</>}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-xl text-blue-600">${totalCost.toLocaleString('es-MX')} MXN</span>
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800">
                    <strong>Boletos reservados:</strong> Nadie más puede comprarlos mientras completas el pago.
                    {isStripePayment ? ' Serás redirigido a Stripe.' : ' Compra atómica con bloqueo de fila.'}
                  </p>
                </div>
              </div>
              {raffle.payment_method === 'external' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800"><strong>Pago externo:</strong> El organizador te contactará con instrucciones de pago.</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={cancelSelection} disabled={stripeRedirecting} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Cancelar
                </button>
                {isStripePayment ? (
                  <button onClick={handleStripeCheckout} disabled={stripeRedirecting || purchasing} className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                    {stripeRedirecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo...</> : <><CreditCard className="w-4 h-4" /> Pagar con Stripe <ExternalLink className="w-3.5 h-3.5" /></>}
                  </button>
                ) : (
                  <button onClick={handleDirectPurchase} disabled={purchasing} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                    {purchasing ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><Lock className="w-4 h-4" /> Confirmar Compra</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TicketGrid;





