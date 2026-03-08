import React, { createContext, useContext, useState } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [viewData, setViewData] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  const navigateTo = (view: AppView, data?: any) => {
    setCurrentView(view);
    setViewData(data || null);
    window.scrollTo(0, 0);
  };

  const openAuthModal = (tab: 'login' | 'register') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

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
