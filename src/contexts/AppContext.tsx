import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppView, Raffle } from '@/lib/types';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentView: AppView;
  navigateTo: (view: AppView, data?: any) => void;
  viewData: any;
  authModalOpen: boolean;
  authModalTab: 'login' | 'register';
  openAuthModal: (tab: 'login' | 'register') => void;
  closeAuthModal: () => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentView: 'landing',
  navigateTo: () => {},
  viewData: null,
  authModalOpen: false,
  authModalTab: 'login',
  openAuthModal: () => {},
  closeAuthModal: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [currentView, setCurrentView]     = useState<AppView>('landing');
  const [viewData, setViewData]           = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab]   = useState<'login' | 'register'>('login');

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // Navegar + empujar al historial del browser
  const navigateTo = useCallback((view: AppView, data?: any) => {
    setCurrentView(view);
    setViewData(data || null);
    window.scrollTo(0, 0);

    // Serializar viewData sin el objeto raffle completo (puede ser grande)
    // Solo guardamos la vista; viewData se restaura vacío al hacer "atrás"
    window.history.pushState({ view, hasData: !!data }, '', window.location.pathname);
  }, []);

  // Escuchar el botón Atrás del browser
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { view: AppView; hasData?: boolean } | null;
      if (state?.view) {
        setCurrentView(state.view);
        setViewData(null); // viewData no persiste en historial (objetos grandes)
      } else {
        // Sin estado = primera entrada, volver a landing
        setCurrentView('landing');
        setViewData(null);
      }
      window.scrollTo(0, 0);
    };

    window.addEventListener('popstate', handlePopState);

    // Registrar la entrada inicial para que haya algo a donde volver
    window.history.replaceState({ view: 'landing' }, '', window.location.pathname);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAuthModal = (tab: 'login' | 'register') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => setAuthModalOpen(false);

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        currentView,
        navigateTo,
        viewData,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
