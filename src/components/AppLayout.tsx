import React, { useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Raffle } from '@/lib/types';

// Components
import Navbar from '@/components/shared/Navbar';
import AuthModal from '@/components/auth/AuthModal';
import LandingPage from '@/components/landing/LandingPage';
import AdminDashboard from '@/components/admin/AdminDashboard';
import OrganizerDashboard from '@/components/organizer/OrganizerDashboard';
import CreateRaffleForm from '@/components/organizer/CreateRaffleForm';
import RaffleClosingFlow from '@/components/organizer/RaffleClosingFlow';
import ParticipantDashboard from '@/components/participant/ParticipantDashboard';
import RaffleExplorer from '@/components/participant/RaffleExplorer';
import TicketGrid from '@/components/participant/TicketGrid';
import NotificationPreferencesPage from '@/components/settings/NotificationPreferences';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: string | null}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error: error?.message ?? String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-red-200 p-6 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Error en la aplicación</h2>
            <pre className="text-xs text-red-600 bg-red-50 rounded-lg p-3 text-left overflow-auto mb-4">
              {this.state.error}
            </pre>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppLayout: React.FC = () => {
  const {
    currentView,
    navigateTo,
    viewData,
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
  } = useAppContext();
  const { user, isAuthenticated, loading } = useAuth();

  const isEmbedded = React.useMemo(() => {
    try {
      if (new URLSearchParams(window.location.search).get('embed') === 'true') return true;
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  // En modo embed, saltar la landing page y mostrar el explorador directamente
  useEffect(() => {
    if (isEmbedded && !loading && currentView === 'landing') {
      navigateTo('raffle-explorer');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded, loading]);

  // Redirección al dashboard cuando el usuario inicia sesión desde landing
  useEffect(() => {
    if (!isAuthenticated || !user || currentView !== 'landing') return;
    switch (user.role) {
      case 'admin':       navigateTo('admin-dashboard');       break;
      case 'organizer':   navigateTo('organizer-dashboard');   break;
      case 'participant': navigateTo('participant-dashboard'); break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role]); // user.role es suficiente; navigateTo es estable

  // Redirección a landing cuando cierra sesión (solo vistas protegidas)
  useEffect(() => {
    if (loading) return; // esperar a que auth resuelva
    if (isAuthenticated) return;
    const publicViews = ['landing', 'raffle-explorer', 'raffle-public'];
    if (!publicViews.includes(currentView)) {
      navigateTo('landing');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loading]); // currentView NO va en deps: solo reaccionar al cambio de auth

  const handleSelectRaffle = (raffle: Raffle) => {
    navigateTo('raffle-detail', { raffle });
  };

  const getDashboardView = () => {
    if (!user) return 'landing';
    switch (user.role) {
      case 'admin': return 'admin-dashboard';
      case 'organizer': return 'organizer-dashboard';
      case 'participant': return 'participant-dashboard';
      default: return 'landing';
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'landing':
        return (
          <LandingPage
            onOpenAuth={openAuthModal}
            onExplore={() => navigateTo('raffle-explorer')}
          />
        );

      case 'admin-dashboard':
        if (!user || user.role !== 'admin') {
          navigateTo('landing');
          return null;
        }
        return <AdminDashboard />;

      case 'organizer-dashboard':
        if (!user || user.role !== 'organizer') {
          navigateTo('landing');
          return null;
        }
        return <OrganizerDashboard onNavigate={navigateTo} />;

      case 'organizer-create-raffle':
        if (!user || user.role !== 'organizer') {
          navigateTo('landing');
          return null;
        }
        return (
          <CreateRaffleForm
            onBack={() => navigateTo('organizer-dashboard')}
            onCreated={(id) => navigateTo('organizer-dashboard')}
          />
        );

      case 'organizer-closing-flow':
        if (!user || user.role !== 'organizer') {
          navigateTo('landing');
          return null;
        }
        if (!viewData?.raffle) {
          navigateTo('organizer-dashboard');
          return null;
        }
        return (
          <RaffleClosingFlow
            raffle={viewData.raffle}
            onBack={() => navigateTo('organizer-dashboard')}
            onNavigate={navigateTo}
          />
        );



      case 'participant-dashboard':
        if (!user || user.role !== 'participant') {
          navigateTo('landing');
          return null;
        }
        return <ParticipantDashboard onNavigate={navigateTo} />;

      case 'raffle-explorer':
        return <RaffleExplorer onSelectRaffle={handleSelectRaffle} />;

      case 'raffle-detail':
        if (!viewData?.raffle) {
          navigateTo('raffle-explorer');
          return null;
        }
        return (
          <TicketGrid
            raffle={viewData.raffle}
            onBack={() => navigateTo('raffle-explorer')}
          />
        );

      case 'notification-preferences':
        if (!user) {
          navigateTo('landing');
          return null;
        }
        return (
          <NotificationPreferencesPage
            onBack={() => navigateTo(getDashboardView() as any)}
          />
        );

      default:
        return (
          <LandingPage
            onOpenAuth={openAuthModal}
            onExplore={() => navigateTo('raffle-explorer')}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Cargando Sorteos AMECREC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar — oculto en modo embed */}
      {!isEmbedded && currentView !== 'landing' && (
        <Navbar
          currentView={currentView}
          onNavigate={navigateTo}
          onOpenAuth={openAuthModal}
        />
      )}

      {!isEmbedded && currentView === 'landing' && (
        <div className="sticky top-0 z-40">
          <Navbar
            currentView={currentView}
            onNavigate={navigateTo}
            onOpenAuth={openAuthModal}
          />
        </div>
      )}

      {/* Main Content */}
      <ErrorBoundary>{renderView()}</ErrorBoundary>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        defaultTab={authModalTab}
      />
    </div>
  );
};

export default AppLayout;
