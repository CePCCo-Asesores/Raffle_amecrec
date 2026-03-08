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

  // Auto-redirect to dashboard on login
  useEffect(() => {
    if (isAuthenticated && user && currentView === 'landing') {
      switch (user.role) {
        case 'admin':
          navigateTo('admin-dashboard');
          break;
        case 'organizer':
          navigateTo('organizer-dashboard');
          break;
        case 'participant':
          navigateTo('participant-dashboard');
          break;
      }
    }
  }, [isAuthenticated, user]);

  // Auto-redirect to landing on logout
  useEffect(() => {
    if (!isAuthenticated && !loading && currentView !== 'landing' && currentView !== 'raffle-explorer' && currentView !== 'raffle-public') {
      navigateTo('landing');
    }
  }, [isAuthenticated, loading]);

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
      {/* Navbar */}
      {currentView !== 'landing' && (
        <Navbar
          currentView={currentView}
          onNavigate={navigateTo}
          onOpenAuth={openAuthModal}
        />
      )}

      {currentView === 'landing' && (
        <div className="sticky top-0 z-40">
          <Navbar
            currentView={currentView}
            onNavigate={navigateTo}
            onOpenAuth={openAuthModal}
          />
        </div>
      )}

      {/* Main Content */}
      {renderView()}

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
