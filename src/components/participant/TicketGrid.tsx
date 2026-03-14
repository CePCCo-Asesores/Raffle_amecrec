import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Raffle, Ticket, RAFFLE_VALIDATION_RULES } from '@/lib/types';
import { atomicTicketPurchase, reserveTickets, releaseTickets } from '@/lib/database';
import { createCheckoutSession, handlePaymentReturn, verifyPayment } from '@/lib/stripe';
import { sendTicketPurchaseNotification } from '@/lib/notifications';
import { rateLimiter } from '@/lib/rate-limiter';
import { formatTicketNumber } from '@/lib/utils';
import {
  ArrowLeft, Trophy, Calendar, DollarSign, Hash, Clock,
  CreditCard, Users, CheckCircle2, AlertCircle, ShoppingCart,
  X, Timer, Shield, Eye, Lock, ShieldCheck, AlertTriangle,
  ExternalLink, Loader2, Wallet, RefreshCw, Zap, Ban
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface TicketGridProps {
  raffle: Raffle;
  onBack: () => void;
}

const TicketGrid: React.FC<TicketGridProps> = ({ raffle, onBack }) => {
  const { user, isAuthenticated } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [reservationTimer, setReservationTimer] = useState<number>(0);
  const [searchNumber, setSearchNumber] = useState('');
  const [purchaseErrors, setPurchaseErrors] = useState<string[]>([]);
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [reservingTicket, setReservingTicket] = useState<number | null>(null);
  const [conflictTickets, setConflictTickets] = useState<number[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const reservedByMeRef = useRef<number[]>([]);

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('raffle_id', raffle.id)
      .order('ticket_number');

    if (data) {
      setTickets(data);
      // Check if any selected tickets are no longer available
      if (selectedTickets.length > 0) {
        const unavailable = selectedTickets.filter(num => {
          const t = data.find((tk: any) => tk.ticket_number === num);
          if (!t) return true;
          if (t.status === 'sold' || t.status === 'paid') return true;
          if (t.status === 'reserved' && t.reserved_by !== user?.id) {
            // Check if reservation expired
            if (t.reserved_until && new Date(t.reserved_until) < new Date()) return false;
            return true;
          }
          return false;
        });
        if (unavailable.length > 0) {
          setConflictTickets(unavailable);
          setSelectedTickets(prev => prev.filter(n => !unavailable.includes(n)));
          toast({
            title: 'Boletos no disponibles',
            description: `Los boletos #${unavailable.join(', #')} fueron tomados por otro usuario y se removieron de tu selección.`,
            variant: 'destructive',
          });
          // Clear conflict indicators after 3 seconds
          setTimeout(() => setConflictTickets([]), 3000);
        }
      }
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, [raffle.id, selectedTickets, user?.id]);

  // Check for payment return from Stripe
  useEffect(() => {
    const paymentReturn = handlePaymentReturn();
    if (paymentReturn.isPaymentReturn) {
      if (paymentReturn.status === 'success' && paymentReturn.sessionId) {
        setPaymentVerified(true);
        toast({
          title: 'Pago procesado',
          description: 'Tu pago con Stripe ha sido procesado exitosamente. Los boletos se actualizarán en un momento.',
        });
        verifyPayment(paymentReturn.sessionId).then(result => {
          if (result.status === 'paid') {
            toast({
              title: 'Pago confirmado',
              description: `Pago de $${((result.amount_total || 0) / 100).toLocaleString('es-MX')} MXN confirmado.`,
            });
          }
          setTimeout(loadTickets, 2000);
        });
      } else if (paymentReturn.status === 'cancelled') {
        toast({
          title: 'Pago cancelado',
          description: 'Has cancelado el proceso de pago. Los boletos reservados serán liberados.',
          variant: 'destructive',
        });
      }
    }
  }, []);

  // Load tickets and set up polling
  useEffect(() => {
    loadTickets();
    // Poll every 5 seconds for faster conflict detection
    const interval = setInterval(loadTickets, 5000);
    return () => clearInterval(interval);
  }, [raffle.id]);

  // Real-time subscription for ticket changes
  useEffect(() => {
    const channel = supabase
      .channel(`tickets-${raffle.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `raffle_id=eq.${raffle.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setTickets(prev => prev.map(t =>
            t.id === updated.id ? { ...t, ...updated } : t
          ));

          // If someone else took a ticket we selected, alert the user
          if (
            (updated.status === 'sold' || updated.status === 'paid') &&
            updated.participant_id !== user?.id &&
            selectedTickets.includes(updated.ticket_number)
          ) {
            setConflictTickets(prev => [...prev, updated.ticket_number]);
            setSelectedTickets(prev => prev.filter(n => n !== updated.ticket_number));
            toast({
              title: 'Boleto tomado',
              description: `El boleto #${updated.ticket_number} fue comprado por otro usuario.`,
              variant: 'destructive',
            });
            setTimeout(() => setConflictTickets(prev => prev.filter(n => n !== updated.ticket_number)), 3000);
          }

          // If someone reserved a ticket we were looking at
          if (
            updated.status === 'reserved' &&
            updated.reserved_by !== user?.id &&
            selectedTickets.includes(updated.ticket_number)
          ) {
            setSelectedTickets(prev => prev.filter(n => n !== updated.ticket_number));
            toast({
              title: 'Boleto reservado',
              description: `El boleto #${updated.ticket_number} fue reservado por otro usuario.`,
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raffle.id, user?.id, selectedTickets]);

  // Cleanup reservations on unmount
  useEffect(() => {
    return () => {
      if (reservedByMeRef.current.length > 0 && user?.id) {
        releaseTickets({
          userId: user.id,
          raffleId: raffle.id,
          ticketNumbers: reservedByMeRef.current,
        });
      }
    };
  }, [raffle.id, user?.id]);

  // Reservation timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (reservationTimer > 0) {
      timer = setInterval(() => {
        setReservationTimer(prev => {
          if (prev <= 1) {
            // Release reservations when timer expires
            if (reservedByMeRef.current.length > 0 && user?.id) {
              releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: reservedByMeRef.current });
              reservedByMeRef.current = [];
            }
            setSelectedTickets([]);
            setShowPurchaseModal(false);
            toast({ title: 'Reserva expirada', description: 'El tiempo de reserva ha terminado. Los boletos fueron liberados.', variant: 'destructive' });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [reservationTimer, raffle.id, user?.id]);

  const toggleTicket = async (ticketNumber: number) => {
    if (!isAuthenticated || !user) {
      toast({ title: 'Inicia sesión', description: 'Necesitas una cuenta para comprar boletos', variant: 'destructive' });
      return;
    }

    if (raffle.status !== 'active') {
      toast({ title: 'Sorteo no activo', description: 'Este sorteo no está aceptando compras en este momento', variant: 'destructive' });
      return;
    }

    const ticket = tickets.find(t => t.ticket_number === ticketNumber);
    if (!ticket) return;

    // Deselect
    if (selectedTickets.includes(ticketNumber)) {
      setSelectedTickets(prev => prev.filter(n => n !== ticketNumber));
      // Release reservation in background
      releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: [ticketNumber] });
      reservedByMeRef.current = reservedByMeRef.current.filter(n => n !== ticketNumber);
      return;
    }

    // Check if ticket is truly available
    if (ticket.status === 'sold' || ticket.status === 'paid') return;
    if (ticket.status === 'reserved' && ticket.reserved_by !== user.id) {
      // Check if reservation is expired
      if (ticket.reserved_until && new Date(ticket.reserved_until) > new Date()) {
        toast({ title: 'Boleto reservado', description: `El boleto #${ticketNumber} está reservado por otro usuario. Intenta en unos minutos.`, variant: 'destructive' });
        return;
      }
    }

    if (selectedTickets.length >= RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction) {
      toast({
        title: 'Límite alcanzado',
        description: `Máximo ${RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction} boletos por transacción`,
        variant: 'destructive',
      });
      return;
    }

    // Reserve ticket in database
    setReservingTicket(ticketNumber);
    const result = await reserveTickets({
      userId: user.id,
      raffleId: raffle.id,
      ticketNumbers: [ticketNumber],
      durationSeconds: 300,
    });

    if (result.failed.includes(ticketNumber)) {
      toast({
        title: 'No disponible',
        description: `El boleto #${ticketNumber} fue tomado por otro usuario.`,
        variant: 'destructive',
      });
      setReservingTicket(null);
      loadTickets(); // Refresh to show current state
      return;
    }

    setSelectedTickets(prev => [...prev, ticketNumber]);
    reservedByMeRef.current = [...reservedByMeRef.current, ticketNumber];
    setReservingTicket(null);
  };

  const startPurchase = () => {
    if (selectedTickets.length === 0) return;
    if (!user) return;

    const rateCheck = rateLimiter.canPurchaseTickets(user.id, selectedTickets.length);
    if (!rateCheck.allowed) {
      toast({ title: 'Límite de velocidad', description: rateCheck.reason, variant: 'destructive' });
      return;
    }

    setPurchaseErrors([]);
    setShowPurchaseModal(true);
    setReservationTimer(300); // 5 minutes to complete purchase
  };

  // STRIPE CHECKOUT
  const handleStripeCheckout = async () => {
    if (!user || selectedTickets.length === 0) return;
    setStripeRedirecting(true);
    setPurchaseErrors([]);

    try {
      const result = await createCheckoutSession({
        raffleId: raffle.id,
        raffleName: raffle.name,
        ticketNumbers: selectedTickets,
        pricePerTicket: raffle.price_per_ticket,
      });

      if (result.error) {
        setPurchaseErrors([result.error]);
        toast({ title: 'Error de Stripe', description: result.error, variant: 'destructive' });
        setStripeRedirecting(false);
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        setPurchaseErrors(['No se recibió URL de pago de Stripe']);
        setStripeRedirecting(false);
      }
    } catch (err: any) {
      setPurchaseErrors([err.message || 'Error al conectar con Stripe']);
      setStripeRedirecting(false);
    }
  };

  // DIRECT PURCHASE
  const handleDirectPurchase = async () => {
    if (!user || selectedTickets.length === 0) return;
    setPurchasing(true);
    setPurchaseErrors([]);

    try {
      const result = await atomicTicketPurchase({
        userId: user.id,
        userEmail: user.email,
        raffleId: raffle.id,
        ticketNumbers: selectedTickets,
        paymentMethod: raffle.payment_method,
        commissionRate: 5,
        pricePerTicket: raffle.price_per_ticket,
      });

      if (result.success) {
        const failedCount = selectedTickets.length - result.purchasedTickets.length;
        if (failedCount > 0) {
          toast({
            title: 'Compra parcial',
            description: `Se compraron ${result.purchasedTickets.length} de ${selectedTickets.length} boletos. ${result.errors.join('. ')}`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Compra exitosa',
            description: `Has adquirido ${result.purchasedTickets.length} boleto(s) para "${raffle.name}". Registrado en ledger financiero.`,
          });
        }

        sendTicketPurchaseNotification({
          userId: user.id,
          raffleId: raffle.id,
          ticketNumbers: result.purchasedTickets,
          amount: result.purchasedTickets.length * raffle.price_per_ticket,
          paymentMethod: raffle.payment_method,
        });

        reservedByMeRef.current = [];
        setSelectedTickets([]);
        setShowPurchaseModal(false);
        setReservationTimer(0);
        loadTickets();
      } else {
        setPurchaseErrors(result.errors);
        toast({
          title: 'Error en la compra',
          description: result.errors.join('\n'),
          variant: 'destructive',
        });
        // Refresh tickets to show current state
        loadTickets();
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Ocurrió un error al procesar la compra', variant: 'destructive' });
    }
    setPurchasing(false);
  };

  const cancelSelection = () => {
    // Release all reservations
    if (reservedByMeRef.current.length > 0 && user?.id) {
      releaseTickets({ userId: user.id, raffleId: raffle.id, ticketNumbers: reservedByMeRef.current });
      reservedByMeRef.current = [];
    }
    setSelectedTickets([]);
    setShowPurchaseModal(false);
    setReservationTimer(0);
    setStripeRedirecting(false);
  };

  const getTicketColor = (ticket: Ticket) => {
    const tk = ticket as any;
    // Conflict animation
    if (conflictTickets.includes(ticket.ticket_number)) return 'bg-red-500 text-white animate-pulse ring-2 ring-red-300';
    // Currently being reserved
    if (reservingTicket === ticket.ticket_number) return 'bg-blue-300 text-white animate-pulse';
    // Selected by current user
    if (selectedTickets.includes(ticket.ticket_number)) return 'bg-blue-600 text-white ring-2 ring-blue-300 scale-105';
    // Paid
    if (ticket.status === 'paid') return 'bg-emerald-500 text-white cursor-not-allowed';
    // Sold
    if (ticket.status === 'sold') return 'bg-gray-400 text-white cursor-not-allowed';
    // Reserved by another user (not expired)
    if (ticket.status === 'reserved' && tk.reserved_by !== user?.id) {
      if (tk.reserved_until && new Date(tk.reserved_until) > new Date()) {
        return 'bg-amber-300 text-amber-900 cursor-not-allowed';
      }
    }
    // Reserved by me
    if (ticket.status === 'reserved' && tk.reserved_by === user?.id) return 'bg-blue-400 text-white ring-2 ring-blue-200';
    // Winner
    if (raffle.winning_number === ticket.ticket_number) return 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white ring-2 ring-yellow-300';
    // Available
    return 'bg-white text-gray-700 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer';
  };

  const isTicketClickable = (ticket: Ticket) => {
    const tk = ticket as any;
    if (selectedTickets.includes(ticket.ticket_number)) return true; // Can deselect
    if (ticket.status === 'sold' || ticket.status === 'paid') return false;
    if (ticket.status === 'reserved' && tk.reserved_by !== user?.id) {
      if (tk.reserved_until && new Date(tk.reserved_until) > new Date()) return false;
    }
    if (reservingTicket !== null) return false; // Disable while reserving
    return true;
  };

  const availableCount = tickets.filter(t => t.status === 'available').length;
  const reservedByOthersCount = tickets.filter(t => {
    const tk = t as any;
    return t.status === 'reserved' && tk.reserved_by !== user?.id && tk.reserved_until && new Date(tk.reserved_until) > new Date();
  }).length;
  const soldCount = tickets.filter(t => t.status === 'sold' || t.status === 'paid').length;
  const totalCost = selectedTickets.length * raffle.price_per_ticket;
  const isStripePayment = raffle.payment_method === 'stripe';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fmtTk = (n: number) => formatTicketNumber(n, raffle.total_tickets);

  const filteredTickets = searchNumber
    ? tickets.filter(t => fmtTk(t.ticket_number).includes(searchNumber) || t.ticket_number.toString().includes(searchNumber))
    : tickets;


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a sorteos
        </button>

        {/* Payment success banner */}
        {paymentVerified && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-emerald-800">Pago confirmado con Stripe</h3>
              <p className="text-sm text-emerald-700">Tu pago ha sido procesado. Los boletos se actualizarán a estado "Pagado" automáticamente.</p>
            </div>
            <button onClick={() => setPaymentVerified(false)} className="ml-auto p-1 hover:bg-emerald-100 rounded">
              <X className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
        )}

        {/* Raffle Info Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-64 h-40 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              {raffle.image_url ? (
                <img src={raffle.image_url} alt={raffle.name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Trophy className="w-16 h-16 text-blue-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">{raffle.name}</h1>
                  <p className="text-gray-600 mb-4">{raffle.description || 'Sin descripción'}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  raffle.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {raffle.status === 'active' ? 'Activa' : raffle.status === 'winner_declared' ? 'Con Ganador' : raffle.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1"><DollarSign className="w-3.5 h-3.5" /> Precio</div>
                  <div className="font-bold text-gray-900">${raffle.price_per_ticket} MXN</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1"><Hash className="w-3.5 h-3.5" /> Disponibles</div>
                  <div className="font-bold text-emerald-600">{availableCount} / {raffle.total_tickets}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1"><Calendar className="w-3.5 h-3.5" /> Sorteo</div>
                  <div className="font-bold text-gray-900">{new Date(raffle.draw_date).toLocaleDateString('es-MX')}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                    {isStripePayment ? <CreditCard className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                    Pago
                  </div>
                  <div className="font-bold text-gray-900">
                    {isStripePayment ? (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.893 5.575C4.746 22.75 7.462 24 11.5 24c2.628 0 4.758-.652 6.293-1.872 1.636-1.305 2.449-3.233 2.449-5.535.032-4.366-2.676-5.768-6.266-7.443z" fill="#6772E5"/></svg>
                        Stripe
                      </span>
                    ) : 'Externo'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Concurrency protection info bar */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <Zap className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xs text-emerald-800 flex-1">
            <strong>Protección contra compra duplicada:</strong> Cada boleto se reserva al seleccionarlo y se bloquea atómicamente al comprar con <code className="bg-white/60 px-1 rounded">FOR UPDATE SKIP LOCKED</code>. 
            {isStripePayment && ' Pago seguro procesado por Stripe.'}
            {' '}Actualización en tiempo real cada 5s.
          </div>
          <button onClick={() => loadTickets()} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        {/* Reserved by others warning */}
        {reservedByOthersCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-800">
              <strong>{reservedByOthersCount} boleto(s)</strong> están reservados por otros usuarios. Se liberarán automáticamente si no completan la compra en 5 minutos.
            </span>
          </div>
        )}

        {/* Selection bar */}
        {selectedTickets.length > 0 && (
          <div className="sticky top-16 z-30 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-4 mb-4 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              <span className="font-medium">{selectedTickets.length} boleto(s) reservado(s)</span>
              <span className="text-blue-200">|</span>
              <span className="font-bold">${totalCost.toLocaleString('es-MX')} MXN</span>
              {reservationTimer > 0 && (
                <>
                  <span className="text-blue-200">|</span>
                  <span className="flex items-center gap-1 text-amber-200 text-xs">
                    <Timer className="w-3.5 h-3.5" /> {formatTime(reservationTimer)}
                  </span>
                </>
              )}
              {isStripePayment && (
                <>
                  <span className="text-blue-200">|</span>
                  <span className="flex items-center gap-1 text-blue-200 text-xs">
                    <CreditCard className="w-3.5 h-3.5" /> Pago con Stripe
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={cancelSelection} className="px-3 py-1.5 text-sm bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                Limpiar
              </button>
              <button
                onClick={startPurchase}
                className="px-4 py-1.5 text-sm bg-white text-blue-700 rounded-lg font-bold hover:bg-blue-50 transition-colors flex items-center gap-1"
              >
                <Lock className="w-3.5 h-3.5" />
                {isStripePayment ? 'Pagar con Stripe' : 'Comprar'}
              </button>
            </div>
          </div>
        )}

        {/* Search and legend */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={searchNumber}
            onChange={e => setSearchNumber(e.target.value)}
            placeholder="Buscar número..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
          />
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-white border border-gray-200" /> Disponible</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-600" /> Seleccionado</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-400" /> Vendido</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Pagado</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-300" /> Reservado (otro)</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500" /> Conflicto</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            Última actualización: {lastRefresh.toLocaleTimeString('es-MX')}
          </div>
        </div>

        {/* Ticket Grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
            Cargando boletos...
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-12 gap-2">

              {filteredTickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => toggleTicket(ticket.ticket_number)}
                  disabled={!isTicketClickable(ticket)}
                  title={
                    ticket.status === 'sold' ? `Vendido` :
                    ticket.status === 'paid' ? `Pagado` :
                    ticket.status === 'reserved' && (ticket as any).reserved_by !== user?.id ? `Reservado por otro usuario` :
                    `Boleto #${ticket.ticket_number} - Click para ${selectedTickets.includes(ticket.ticket_number) ? 'deseleccionar' : 'reservar'}`
                  }
                  className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-150 relative ${getTicketColor(ticket)}`}
                >
                  {reservingTicket === ticket.ticket_number ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    ticket.ticket_number
                  )}
                  {/* Lock icon for sold/paid */}
                  {(ticket.status === 'sold' || ticket.status === 'paid') && (
                    <Lock className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-50" />
                  )}
                  {/* Ban icon for reserved by others */}
                  {ticket.status === 'reserved' && (ticket as any).reserved_by !== user?.id && (ticket as any).reserved_until && new Date((ticket as any).reserved_until) > new Date() && (
                    <Ban className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-60" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Winner Banner */}
        {raffle.status === 'winner_declared' && raffle.winning_number && (
          <div className="mt-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-6 text-center">
            <Trophy className="w-12 h-12 text-white mx-auto mb-3" />
            <h3 className="text-2xl font-extrabold text-white mb-1">Número Ganador: #{raffle.winning_number}</h3>
            <p className="text-white/80">Basado en {raffle.lottery_type} - {raffle.lottery_draw_number}</p>
            <div className="flex items-center justify-center gap-1 mt-2 text-white/60 text-xs">
              <Lock className="w-3 h-3" /> Resultado inmutable — registrado con hash criptográfico
            </div>
          </div>
        )}

        {/* Purchase Modal */}
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
                    <div className="text-xs text-red-800">
                      {purchaseErrors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sorteo</span>
                  <span className="font-medium text-gray-900">{raffle.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Boletos</span>
                  <span className="font-medium text-gray-900">
                    {selectedTickets.sort((a, b) => a - b).map(n => `#${n}`).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Precio unitario</span>
                  <span className="font-medium text-gray-900">${raffle.price_per_ticket} MXN</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cantidad</span>
                  <span className="font-medium text-gray-900">{selectedTickets.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Método de pago</span>
                  <span className="font-medium text-gray-900 flex items-center gap-1">
                    {isStripePayment ? (
                      <>
                        <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                        Stripe (tarjeta)
                      </>
                    ) : (
                      <>
                        <Wallet className="w-3.5 h-3.5 text-gray-500" />
                        Pago externo
                      </>
                    )}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-xl text-blue-600">${totalCost.toLocaleString('es-MX')} MXN</span>
                </div>
              </div>

              {/* Concurrency protection notice */}
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800">
                    <strong>Boletos reservados y bloqueados:</strong> Tus boletos están reservados en la base de datos. Ningún otro usuario puede comprarlos mientras completas el pago.
                    {isStripePayment ? ' Serás redirigido a Stripe para completar el pago de forma segura.' : ' La compra se procesará atómicamente con bloqueo de fila.'}
                  </p>
                </div>
              </div>

              {isStripePayment && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-indigo-800">
                      <strong>Stripe Checkout:</strong> Acepta tarjetas de crédito/débito, OXXO, y otros métodos de pago. Tu información financiera es procesada directamente por Stripe.
                    </p>
                  </div>
                </div>
              )}

              {raffle.payment_method === 'external' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800">
                    <strong>Pago externo:</strong> El organizador te contactará con las instrucciones de pago. Tu boleto quedará como "vendido" hasta que el organizador confirme el pago.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={cancelSelection}
                  disabled={stripeRedirecting}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                {isStripePayment ? (
                  <button
                    onClick={handleStripeCheckout}
                    disabled={stripeRedirecting || purchasing}
                    className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {stripeRedirecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Redirigiendo a Stripe...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Pagar con Stripe
                        <ExternalLink className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleDirectPurchase}
                    disabled={purchasing}
                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {purchasing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        Confirmar Compra
                      </>
                    )}
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
