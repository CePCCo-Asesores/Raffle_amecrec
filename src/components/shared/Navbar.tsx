import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AppView, Notification } from '@/lib/types';
import { Menu, X, Bell, ChevronDown, LogOut, User, LayoutDashboard, Ticket, Trophy, Settings, Shield, Home, CreditCard, BellRing, Check } from 'lucide-react';

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenAuth: (tab: 'login' | 'register') => void;
}

const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenAuth,
}) => {
  const { user, isAuthenticated, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);
  const [notifDropdown, setNotifDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadNotifications();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user]);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    }
  };

  const markAsRead = async (notifId: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getDashboardView = (): AppView => {
    if (!user) return 'landing';
    switch (user.role) {
      case 'admin': return 'admin-dashboard';
      case 'organizer': return 'organizer-dashboard';
      case 'participant': return 'participant-dashboard';
      default: return 'landing';
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onNavigate('landing');
    setProfileDropdown(false);
  };

  const roleLabel = user?.role === 'admin' ? 'Administrador' : user?.role === 'organizer' ? 'Organizador' : 'Participante';
  const roleBadgeColor = user?.role === 'admin' ? 'bg-red-100 text-red-700' : user?.role === 'organizer' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';

  const getNotifTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-emerald-100 text-emerald-700';
      case 'warning': return 'bg-amber-100 text-amber-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <button onClick={() => onNavigate(isAuthenticated ? getDashboardView() : 'landing')} className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-sm font-extrabold bg-gradient-to-r from-blue-900 to-indigo-800 bg-clip-text text-transparent">
                  Sorteos AMECREC
                </span>
                <span className="text-[9px] text-gray-400 font-medium tracking-wider">PLATAFORMA DE RIFAS</span>
              </div>
            </button>

            {/* Desktop Nav Links */}
            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => onNavigate(getDashboardView())}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView.includes('dashboard') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 inline mr-1.5" />
                  Panel
                </button>
                <button
                  onClick={() => onNavigate('raffle-explorer')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'raffle-explorer' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Ticket className="w-4 h-4 inline mr-1.5" />
                  Explorar Sorteos
                </button>
                {user?.role === 'organizer' && (
                  <button
                    onClick={() => onNavigate('organizer-create-raffle')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentView === 'organizer-create-raffle' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    + Nuevo Sorteo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {!isAuthenticated ? (
              <>
                <button onClick={() => onNavigate('raffle-explorer')} className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2">
                  Explorar Sorteos
                </button>
                <button onClick={() => onOpenAuth('login')} className="text-sm text-gray-700 hover:text-gray-900 font-medium px-3 py-2">
                  Iniciar Sesión
                </button>
                <button onClick={() => onOpenAuth('register')} className="text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm">
                  Registrarse
                </button>
              </>
            ) : (
              <>
                {/* Notifications Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => { setNotifDropdown(!notifDropdown); setProfileDropdown(false); }}
                    className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notifDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setNotifDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <h3 className="font-bold text-sm text-gray-900">Notificaciones</h3>
                          <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                              <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                                Marcar todas leídas
                              </button>
                            )}
                            <button
                              onClick={() => { onNavigate('notification-preferences'); setNotifDropdown(false); }}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Configurar notificaciones"
                            >
                              <Settings className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="text-center py-8 px-4">
                              <BellRing className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-sm text-gray-500">Sin notificaciones</p>
                            </div>
                          ) : (
                            notifications.map(notif => (
                              <div
                                key={notif.id}
                                className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                                  !notif.is_read ? 'bg-blue-50/50' : ''
                                }`}
                                onClick={() => {
                                  if (!notif.is_read) markAsRead(notif.id);
                                  if (notif.related_raffle_id) {
                                    setNotifDropdown(false);
                                  }
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${getNotifTypeColor(notif.type)}`}>
                                    {notif.type === 'success' ? 'OK' : notif.type === 'warning' ? 'ALERTA' : notif.type === 'error' ? 'ERROR' : 'INFO'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs ${!notif.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                      {notif.title}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      {new Date(notif.created_at).toLocaleString('es-MX', {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                  {!notif.is_read && (
                                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="px-4 py-2 border-t border-gray-100">
                          <button
                            onClick={() => { onNavigate('notification-preferences'); setNotifDropdown(false); }}
                            className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium py-1"
                          >
                            Configurar preferencias de notificación
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Profile Dropdown */}
                <div className="relative">
                  <button onClick={() => { setProfileDropdown(!profileDropdown); setNotifDropdown(false); }} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                      {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="hidden sm:block text-left">
                      <div className="text-sm font-medium text-gray-900 leading-tight">{user?.full_name || 'Usuario'}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadgeColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                  </button>

                  {profileDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProfileDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-20">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                          <p className="text-xs text-gray-500">{user?.email}</p>
                          {user?.stripe_connect_id && (
                            <div className="flex items-center gap-1 mt-1">
                              <CreditCard className="w-3 h-3 text-indigo-500" />
                              <span className="text-[10px] text-indigo-600 font-medium">Stripe Connect activo</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { onNavigate(getDashboardView()); setProfileDropdown(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <LayoutDashboard className="w-4 h-4" /> Mi Panel
                        </button>
                        <button
                          onClick={() => { onNavigate('notification-preferences'); setProfileDropdown(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Bell className="w-4 h-4" /> Notificaciones
                        </button>
                        <button onClick={() => setProfileDropdown(false)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <Settings className="w-4 h-4" /> Configuración
                        </button>
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                            <LogOut className="w-4 h-4" /> Cerrar Sesión
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile menu button */}
                <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="md:hidden border-t border-gray-200 bg-white pb-3">
          <div className="space-y-1 px-4 pt-2">
            <button
              onClick={() => { onNavigate(getDashboardView()); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              <LayoutDashboard className="w-4 h-4" /> Mi Panel
            </button>
            <button
              onClick={() => { onNavigate('raffle-explorer'); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              <Ticket className="w-4 h-4" /> Explorar Sorteos
            </button>
            <button
              onClick={() => { onNavigate('notification-preferences'); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              <Bell className="w-4 h-4" /> Notificaciones
            </button>
            {user?.role === 'organizer' && (
              <button
                onClick={() => { onNavigate('organizer-create-raffle'); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg"
              >
                + Nuevo Sorteo
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
