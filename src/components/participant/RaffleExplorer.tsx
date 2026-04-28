import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Raffle } from '@/lib/types';
import {
  Search, Trophy, Calendar, DollarSign,
  Clock, ArrowRight, Ticket, Lock, RefreshCw, AlertTriangle
} from 'lucide-react';

interface RaffleExplorerProps {
  onSelectRaffle: (raffle: Raffle) => void;
}

const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-purple-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
  'from-rose-500 to-red-600',
  'from-violet-500 to-purple-600',
  'from-lime-500 to-green-600',
];

function getStatusLabel(status: string) {
  switch (status) {
    case 'active':          return { text: 'ACTIVA',    color: 'bg-emerald-500/90' };
    case 'closed':          return { text: 'CERRADA',   color: 'bg-amber-500/90' };
    case 'validated':       return { text: 'VALIDADA',  color: 'bg-blue-500/90' };
    case 'locked':          return { text: 'BLOQUEADA', color: 'bg-indigo-500/90' };
    case 'winner_declared': return { text: 'GANADOR',   color: 'bg-purple-500/90' };
    default:                return { text: status.toUpperCase(), color: 'bg-gray-500/90' };
  }
}

function getPhoto(raffle: any): string | null {
  if (Array.isArray(raffle.image_urls)) {
    const first = raffle.image_urls.find((u: any) => typeof u === 'string' && u.trim() !== '');
    if (first) return first;
  }
  if (typeof raffle.image_url === 'string' && raffle.image_url.trim() !== '') {
    return raffle.image_url;
  }
  return null;
}

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  try {
    return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
  } catch {
    return 0;
  }
}

const RaffleExplorer: React.FC<RaffleExplorerProps> = ({ onSelectRaffle }) => {
  const [raffles, setRaffles]       = useState<Raffle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]         = useState<'newest' | 'price_low' | 'price_high' | 'ending_soon'>('newest');
  const [priceFilter, setPriceFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');

  const loadRaffles = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('raffles')
        .select('*')
        .in('status', ['active', 'closed', 'validated', 'locked', 'winner_declared'])
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message);
      } else {
        setRaffles(Array.isArray(data) ? data : []);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRaffles(); }, []);

  // ── filtrado y ordenación ─────────────────────────────────────────────────
  let filtered = raffles.filter(r => {
    const q = searchQuery.toLowerCase();
    return (r.name ?? '').toLowerCase().includes(q) ||
           (r.description ?? '').toLowerCase().includes(q);
  });

  if (priceFilter === 'low')  filtered = filtered.filter(r => (r.price_per_ticket ?? 0) <= 100);
  if (priceFilter === 'mid')  filtered = filtered.filter(r => (r.price_per_ticket ?? 0) > 100 && (r.price_per_ticket ?? 0) <= 500);
  if (priceFilter === 'high') filtered = filtered.filter(r => (r.price_per_ticket ?? 0) > 500);

  if (sortBy === 'price_low')    filtered = [...filtered].sort((a, b) => (a.price_per_ticket ?? 0) - (b.price_per_ticket ?? 0));
  if (sortBy === 'price_high')   filtered = [...filtered].sort((a, b) => (b.price_per_ticket ?? 0) - (a.price_per_ticket ?? 0));
  if (sortBy === 'ending_soon')  filtered = [...filtered].sort((a, b) => daysUntil((a as any).sales_close_date) - daysUntil((b as any).sales_close_date));

  // ── loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Explorar Sorteos</h1>
            <p className="text-gray-500">Encuentra el sorteo perfecto y elige tus números de la suerte</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-40 bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-12 bg-gray-100 rounded-lg" />
                    <div className="h-12 bg-gray-100 rounded-lg" />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8 bg-white rounded-2xl border border-gray-200">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Error al cargar sorteos</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button onClick={loadRaffles}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── render principal ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Explorar Sorteos</h1>
          <p className="text-gray-500">Encuentra el sorteo perfecto y elige tus números de la suerte</p>
        </div>

        {/* Búsqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar sorteos..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
          </div>
          <div className="flex gap-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500">
              <option value="newest">Más recientes</option>
              <option value="price_low">Precio: menor a mayor</option>
              <option value="price_high">Precio: mayor a menor</option>
              <option value="ending_soon">Próximas a cerrar</option>
            </select>
            <select value={priceFilter} onChange={e => setPriceFilter(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500">
              <option value="all">Todos los precios</option>
              <option value="low">Hasta $100</option>
              <option value="mid">$100 - $500</option>
              <option value="high">Más de $500</option>
            </select>
            <button onClick={loadRaffles}
              className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white hover:bg-gray-50 text-gray-600" title="Actualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sin sorteos */}
        {raffles.length === 0 && (
          <div className="text-center py-24 bg-white rounded-2xl border border-gray-200">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aún no hay sorteos disponibles</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">Los sorteos activos aparecerán aquí. Vuelve pronto o regístrate para recibir notificaciones.</p>
            <button onClick={loadRaffles}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors mx-auto">
              <RefreshCw className="w-4 h-4" /> Actualizar
            </button>
          </div>
        )}

        {/* Sin resultados en filtro */}
        {raffles.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Sin resultados</h3>
            <p className="text-gray-500 text-sm">No se encontraron sorteos con ese criterio.</p>
            <button onClick={() => { setSearchQuery(''); setPriceFilter('all'); }}
              className="mt-4 text-sm text-blue-600 hover:underline">Limpiar filtros</button>
          </div>
        )}

        {/* Grid de sorteos */}
        {filtered.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-4">{filtered.length} sorteo(s) encontrado(s)</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((raffle, idx) => {
                const sold     = raffle.tickets_sold ?? 0;
                const total    = raffle.total_tickets ?? 1;
                const progress = Math.min(100, (sold / total) * 100);
                const days     = daysUntil((raffle as any).sales_close_date);
                const status   = getStatusLabel(raffle.status);
                const photo    = getPhoto(raffle);
                const gradient = GRADIENTS[idx % GRADIENTS.length];

                return (
                  <div key={raffle.id} onClick={() => onSelectRaffle(raffle)}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group">

                    {/* Imagen / banner */}
                    <div className={`h-40 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
                      {photo && (
                        <img src={photo} alt={raffle.name} className="w-full h-full object-cover" />
                      )}
                      {!photo && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Trophy className="w-16 h-16 text-white/30" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm text-white ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      {days <= 3 && raffle.status === 'active' && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {days}d restantes
                          </span>
                        </div>
                      )}
                      {(raffle as any).result_locked && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="text-white font-bold text-lg leading-tight group-hover:translate-x-1 transition-transform">
                          {raffle.name}
                        </div>
                      </div>
                    </div>

                    {/* Contenido */}
                    <div className="p-4">
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4 min-h-[2.5rem]">
                        {raffle.description || ''}
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Boleto
                          </div>
                          <div className="font-bold text-gray-900">${raffle.price_per_ticket}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Sorteo
                          </div>
                          <div className="font-bold text-gray-900 text-sm">
                            {raffle.draw_date
                              ? new Date(raffle.draw_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                              : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">{sold} vendidos</span>
                          <span className="font-medium text-gray-700">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                            style={{ width: `${progress}%` }} />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {total - sold} disponibles de {total}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Ticket className="w-3.5 h-3.5" />
                          {raffle.lottery_type || '—'}
                          {raffle.lottery_draw_number ? ` - ${raffle.lottery_draw_number.split(' ').pop()}` : ''}
                        </div>
                        <span className="text-xs font-medium text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
                          Ver boletos <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default RaffleExplorer;
