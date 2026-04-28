import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Raffle } from '@/lib/types';
import {
  Search, Trophy, Calendar, DollarSign,
  Clock, ArrowRight, Ticket, Lock, RefreshCw
} from 'lucide-react';

interface RaffleExplorerProps {
  onSelectRaffle: (raffle: Raffle) => void;
}

const RaffleExplorer: React.FC<RaffleExplorerProps> = ({ onSelectRaffle }) => {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_low' | 'price_high' | 'ending_soon'>('newest');
  const [priceFilter, setPriceFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');

  useEffect(() => {
    loadRaffles();
  }, []);

  const loadRaffles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('raffles')
      .select('*')
      .in('status', ['active', 'closed', 'validated', 'locked', 'winner_declared'])
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (data) setRaffles(data);
    setLoading(false);
  };

  let filtered = raffles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (priceFilter === 'low') filtered = filtered.filter(r => r.price_per_ticket <= 100);
  else if (priceFilter === 'mid') filtered = filtered.filter(r => r.price_per_ticket > 100 && r.price_per_ticket <= 500);
  else if (priceFilter === 'high') filtered = filtered.filter(r => r.price_per_ticket > 500);

  if (sortBy === 'price_low') filtered.sort((a, b) => a.price_per_ticket - b.price_per_ticket);
  else if (sortBy === 'price_high') filtered.sort((a, b) => b.price_per_ticket - a.price_per_ticket);
  else if (sortBy === 'ending_soon') filtered.sort((a, b) => new Date(a.sales_close_date).getTime() - new Date(b.sales_close_date).getTime());

  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
    'from-rose-500 to-red-600',
    'from-violet-500 to-purple-600',
    'from-lime-500 to-green-600',
    'from-fuchsia-500 to-pink-600',
    'from-sky-500 to-indigo-600',
    'from-teal-500 to-cyan-600',
    'from-orange-500 to-red-600',
  ];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return { text: 'ACTIVA', color: 'bg-emerald-500/90' };
      case 'closed': return { text: 'CERRADA', color: 'bg-amber-500/90' };
      case 'validated': return { text: 'VALIDADA', color: 'bg-blue-500/90' };
      case 'locked': return { text: 'BLOQUEADA', color: 'bg-indigo-500/90' };
      case 'winner_declared': return { text: 'GANADOR', color: 'bg-purple-500/90' };
      default: return { text: status.toUpperCase(), color: 'bg-gray-500/90' };
    }
  };

  // Loading skeleton
  if (loading) {
    const getRafflePhoto = (r: any): string | null => {
    const urls = Array.isArray(r.image_urls) ? r.image_urls.filter(Boolean) : [];
    if (urls.length > 0) return urls[0];
    if (r.image_url) return r.image_url;
    return null;
  };

  return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Explorar Sorteos</h1>
            <p className="text-gray-500">Encuentra el sorteo perfecto y elige tus números de la suerte — Sorteos AMECREC</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-40 bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Explorar Sorteos</h1>
          <p className="text-gray-500">Encuentra el sorteo perfecto y elige tus números de la suerte — Sorteos AMECREC</p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar sorteos..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">Más recientes</option>
              <option value="price_low">Precio: menor a mayor</option>
              <option value="price_high">Precio: mayor a menor</option>
              <option value="ending_soon">Próximas a cerrar</option>
            </select>
            <select
              value={priceFilter}
              onChange={e => setPriceFilter(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los precios</option>
              <option value="low">Hasta $100</option>
              <option value="mid">$100 - $500</option>
              <option value="high">Más de $500</option>
            </select>
            <button
              onClick={loadRaffles}
              className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white hover:bg-gray-50 text-gray-600"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {raffles.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-gray-200">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aún no hay sorteos disponibles</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
              Los sorteos activos aparecerán aquí. Vuelve pronto o regístrate para recibir notificaciones.
            </p>
            <button
              onClick={loadRaffles}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors mx-auto"
            >
              <RefreshCw className="w-4 h-4" /> Actualizar
            </button>
          </div>
        ) : filtered.length === 0 ? (
          // No results after filtering
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Sin resultados</h3>
            <p className="text-gray-500 text-sm">No se encontraron sorteos con ese criterio de búsqueda.</p>
            <button
              onClick={() => { setSearchQuery(''); setPriceFilter('all'); }}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{filtered.length} sorteo(s) encontrado(s)</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((raffle, idx) => {
                const progress = (raffle.tickets_sold / raffle.total_tickets) * 100;
                const daysLeft = Math.max(0, Math.ceil((new Date(raffle.sales_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const statusInfo = getStatusLabel(raffle.status);

                return (
                  <div
                    key={raffle.id}
                    onClick={() => onSelectRaffle(raffle)}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group"
                  >
                    <div className={`h-40 bg-gradient-to-br ${gradients[idx % gradients.length]} relative overflow-hidden`}>
                      {getRafflePhoto(raffle) ? (
                        <img src={getRafflePhoto(raffle)!} alt={raffle.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Trophy className="w-16 h-16 text-white/30" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm text-white ${statusInfo.color}`}>
                          {statusInfo.text}
                        </span>
                      </div>
                      {daysLeft <= 3 && raffle.status === 'active' && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {daysLeft}d restantes
                          </span>
                        </div>
                      )}
                      {raffle.result_locked && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="text-white font-bold text-lg leading-tight group-hover:translate-x-1 transition-transform">{raffle.name}</div>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4 min-h-[2.5rem]">{raffle.description}</p>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Boleto</div>
                          <div className="font-bold text-gray-900">${raffle.price_per_ticket}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Sorteo</div>
                          <div className="font-bold text-gray-900 text-sm">{new Date(raffle.draw_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">{raffle.tickets_sold} vendidos</span>
                          <span className="font-medium text-gray-700">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${gradients[idx % gradients.length]} transition-all duration-500`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{raffle.total_tickets - raffle.tickets_sold} disponibles de {raffle.total_tickets}</div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Ticket className="w-3.5 h-3.5" />
                          {raffle.lottery_type} - {raffle.lottery_draw_number?.split(' ').pop()}
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

