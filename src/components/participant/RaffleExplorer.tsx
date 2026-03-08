import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Raffle, RAFFLE_STATUS_LABELS } from '@/lib/types';
import {
  Search, Filter, Trophy, Calendar, DollarSign, Hash,
  Clock, Users, ArrowRight, SlidersHorizontal, ChevronDown,
  Ticket, TrendingUp, Star, Lock, ShieldCheck
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

  // Demo raffles for when DB is empty
  const demoRaffles: Raffle[] = [
    { id: 'd1', organizer_id: '', name: 'BMW Serie 3 2026', description: 'Gana un BMW Serie 3 último modelo. Sorteo vinculado a Lotería Nacional.', image_url: '', price_per_ticket: 500, total_tickets: 1000, sales_close_date: '2026-04-15T00:00:00Z', draw_date: '2026-04-20T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'redraw', status: 'active', lottery_type: 'Mayor', lottery_draw_date: '2026-04-20T00:00:00Z', lottery_draw_number: 'Sorteo Mayor No. 3925', tickets_sold: 647, revenue: 323500, is_public: true, created_at: '2026-02-01T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd2', organizer_id: '', name: 'iPhone 16 Pro Max', description: 'El último iPhone con todas las funciones premium. 256GB.', image_url: '', price_per_ticket: 100, total_tickets: 500, sales_close_date: '2026-03-10T00:00:00Z', draw_date: '2026-03-15T00:00:00Z', payment_method: 'external', unsold_winner_policy: 'desert', status: 'active', lottery_type: 'Superior', lottery_draw_date: '2026-03-15T00:00:00Z', lottery_draw_number: 'Sorteo Superior No. 2841', tickets_sold: 312, revenue: 31200, is_public: true, created_at: '2026-02-05T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd3', organizer_id: '', name: 'Viaje a Europa (2 personas)', description: 'Viaje todo incluido a París, Roma y Barcelona por 15 días.', image_url: '', price_per_ticket: 350, total_tickets: 300, sales_close_date: '2026-03-25T00:00:00Z', draw_date: '2026-03-30T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'absorb', status: 'active', lottery_type: 'Zodiaco', lottery_draw_date: '2026-03-30T00:00:00Z', lottery_draw_number: 'Sorteo Zodiaco No. 1589', tickets_sold: 189, revenue: 66150, is_public: true, created_at: '2026-02-08T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd4', organizer_id: '', name: 'MacBook Pro M4', description: 'MacBook Pro 16" con chip M4 Pro, 32GB RAM, 1TB SSD.', image_url: '', price_per_ticket: 200, total_tickets: 400, sales_close_date: '2026-03-20T00:00:00Z', draw_date: '2026-03-22T00:00:00Z', payment_method: 'external', unsold_winner_policy: 'redraw', status: 'active', lottery_type: 'Mayor', lottery_draw_date: '2026-03-22T00:00:00Z', lottery_draw_number: 'Sorteo Mayor No. 3924', tickets_sold: 256, revenue: 51200, is_public: true, created_at: '2026-02-10T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd5', organizer_id: '', name: 'PlayStation 5 Pro + 10 Juegos', description: 'PS5 Pro con 10 juegos AAA de tu elección y 2 controles.', image_url: '', price_per_ticket: 80, total_tickets: 200, sales_close_date: '2026-03-05T00:00:00Z', draw_date: '2026-03-08T00:00:00Z', payment_method: 'external', unsold_winner_policy: 'desert', status: 'active', lottery_type: 'Especial', lottery_draw_date: '2026-03-08T00:00:00Z', lottery_draw_number: 'Sorteo Especial No. 245', tickets_sold: 178, revenue: 14240, is_public: true, created_at: '2026-02-12T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd6', organizer_id: '', name: 'Departamento en Cancún', description: 'Departamento de 2 recámaras frente al mar en zona hotelera.', image_url: '', price_per_ticket: 2000, total_tickets: 5000, sales_close_date: '2026-06-01T00:00:00Z', draw_date: '2026-06-15T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'extend', status: 'active', lottery_type: 'Gordo', lottery_draw_date: '2026-06-15T00:00:00Z', lottery_draw_number: 'Sorteo Gordo No. 389', tickets_sold: 1234, revenue: 2468000, is_public: true, created_at: '2026-01-15T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd7', organizer_id: '', name: 'Moto Harley Davidson', description: 'Harley-Davidson Iron 883 nueva, color negro mate.', image_url: '', price_per_ticket: 300, total_tickets: 800, sales_close_date: '2026-04-01T00:00:00Z', draw_date: '2026-04-05T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'redraw', status: 'active', lottery_type: 'Superior', lottery_draw_date: '2026-04-05T00:00:00Z', lottery_draw_number: 'Sorteo Superior No. 2843', tickets_sold: 445, revenue: 133500, is_public: true, created_at: '2026-02-14T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd8', organizer_id: '', name: '$100,000 MXN en Efectivo', description: 'Premio en efectivo directo a tu cuenta bancaria.', image_url: '', price_per_ticket: 150, total_tickets: 1000, sales_close_date: '2026-03-28T00:00:00Z', draw_date: '2026-03-30T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'desert', status: 'active', lottery_type: 'Mayor', lottery_draw_date: '2026-03-30T00:00:00Z', lottery_draw_number: 'Sorteo Mayor No. 3926', tickets_sold: 567, revenue: 85050, is_public: true, created_at: '2026-02-16T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd9', organizer_id: '', name: 'Smart TV Samsung 85"', description: 'Samsung Neo QLED 8K de 85 pulgadas con soundbar incluida.', image_url: '', price_per_ticket: 50, total_tickets: 600, sales_close_date: '2026-03-12T00:00:00Z', draw_date: '2026-03-14T00:00:00Z', payment_method: 'external', unsold_winner_policy: 'absorb', status: 'active', lottery_type: 'Zodiaco', lottery_draw_date: '2026-03-14T00:00:00Z', lottery_draw_number: 'Sorteo Zodiaco No. 1590', tickets_sold: 423, revenue: 21150, is_public: true, created_at: '2026-02-18T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd10', organizer_id: '', name: 'Rolex Submariner', description: 'Reloj Rolex Submariner Date nuevo con caja y documentos.', image_url: '', price_per_ticket: 1000, total_tickets: 500, sales_close_date: '2026-05-01T00:00:00Z', draw_date: '2026-05-05T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'redraw', status: 'active', lottery_type: 'Especial', lottery_draw_date: '2026-05-05T00:00:00Z', lottery_draw_number: 'Sorteo Especial No. 246', tickets_sold: 89, revenue: 89000, is_public: true, created_at: '2026-02-20T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd11', organizer_id: '', name: 'Beca Universitaria Completa', description: 'Beca completa para la universidad de tu elección en México.', image_url: '', price_per_ticket: 250, total_tickets: 2000, sales_close_date: '2026-07-01T00:00:00Z', draw_date: '2026-07-10T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'extend', status: 'active', lottery_type: 'Mayor', lottery_draw_date: '2026-07-10T00:00:00Z', lottery_draw_number: 'Sorteo Mayor No. 3930', tickets_sold: 345, revenue: 86250, is_public: true, created_at: '2026-02-22T00:00:00Z', updated_at: '', result_locked: false },
    { id: 'd12', organizer_id: '', name: 'Tesla Model 3', description: 'Tesla Model 3 Long Range 2026, color blanco perla.', image_url: '', price_per_ticket: 800, total_tickets: 2000, sales_close_date: '2026-08-01T00:00:00Z', draw_date: '2026-08-15T00:00:00Z', payment_method: 'stripe', unsold_winner_policy: 'redraw', status: 'active', lottery_type: 'Gordo', lottery_draw_date: '2026-08-15T00:00:00Z', lottery_draw_number: 'Sorteo Gordo No. 390', tickets_sold: 678, revenue: 542400, is_public: true, created_at: '2026-02-24T00:00:00Z', updated_at: '', result_locked: false },
  ];

  const displayRaffles = raffles.length > 0 ? raffles : demoRaffles;

  let filtered = displayRaffles.filter(r =>
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
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">{filtered.length} sorteo(s) encontrado(s)</p>

        {/* Raffle Grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">Cargando sorteos...</div>
        ) : (
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
                    {raffle.image_url ? (
                      <img src={raffle.image_url} alt={raffle.name} className="w-full h-full object-cover" />
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
        )}
      </div>
    </div>
  );
};

export default RaffleExplorer;
