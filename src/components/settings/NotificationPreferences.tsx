import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationPreferences as NotifPrefs, EmailLog } from '@/lib/types';
import { getNotificationPreferences, updateNotificationPreferences, getEmailLog } from '@/lib/notifications';
import {
  ArrowLeft, Bell, Mail, ShieldCheck, CheckCircle2, XCircle,
  Clock, Loader2, Save, MailCheck, MailX, AlertCircle, Trophy,
  Ticket, TrendingUp, Megaphone, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface NotificationPreferencesProps {
  onBack: () => void;
}

const NotificationPreferencesPage: React.FC<NotificationPreferencesProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotifPrefs>({
    ticket_purchase_email: true,
    raffle_closed_email: true,
    winner_declared_email: true,
    sales_threshold_email: true,
    marketing_email: false,
  });
  const [emailLog, setEmailLog] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'preferences' | 'history'>('preferences');
  const [loadingLog, setLoadingLog] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    const prefs = await getNotificationPreferences();
    setPreferences(prefs);
    setLoading(false);
  };

  const loadEmailLog = async () => {
    setLoadingLog(true);
    const logs = await getEmailLog();
    setEmailLog(logs);
    setLoadingLog(false);
  };

  useEffect(() => {
    if (activeTab === 'history' && emailLog.length === 0) {
      loadEmailLog();
    }
  }, [activeTab]);

  const handleToggle = (key: keyof NotifPrefs) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateNotificationPreferences({
      ticket_purchase_email: preferences.ticket_purchase_email,
      raffle_closed_email: preferences.raffle_closed_email,
      winner_declared_email: preferences.winner_declared_email,
      sales_threshold_email: preferences.sales_threshold_email,
      marketing_email: preferences.marketing_email,
    });

    if (result.success) {
      toast({ title: 'Preferencias guardadas', description: 'Tus preferencias de notificación han sido actualizadas.' });
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudieron guardar las preferencias', variant: 'destructive' });
    }
    setSaving(false);
  };

  const getEmailTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      ticket_purchase: 'Compra de boletos',
      raffle_closed: 'Sorteo cerrado',
      winner_notification: 'Ganador declarado',
      result_notification: 'Resultado del sorteo',
      sales_threshold: 'Umbral de ventas',
    };
    return labels[type] || type;
  };

  const getEmailTypeIcon = (type: string) => {
    switch (type) {
      case 'ticket_purchase': return <Ticket className="w-4 h-4 text-blue-500" />;
      case 'raffle_closed': return <XCircle className="w-4 h-4 text-amber-500" />;
      case 'winner_notification': return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 'result_notification': return <Trophy className="w-4 h-4 text-purple-500" />;
      case 'sales_threshold': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      default: return <Mail className="w-4 h-4 text-gray-500" />;
    }
  };

  const notificationOptions = [
    {
      key: 'ticket_purchase_email' as keyof NotifPrefs,
      title: 'Confirmación de compra',
      description: 'Recibe un correo cada vez que compres boletos con los detalles de tu compra y números de boleto.',
      icon: <Ticket className="w-5 h-5" />,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      key: 'raffle_closed_email' as keyof NotifPrefs,
      title: 'Sorteo cerrado',
      description: 'Notificación cuando un sorteo en el que participas cierra sus ventas.',
      icon: <AlertCircle className="w-5 h-5" />,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      key: 'winner_declared_email' as keyof NotifPrefs,
      title: 'Ganador declarado',
      description: 'Recibe los resultados del sorteo con el número ganador y hash de verificación.',
      icon: <Trophy className="w-5 h-5" />,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      key: 'sales_threshold_email' as keyof NotifPrefs,
      title: 'Alerta de ventas (80%)',
      description: 'Para organizadores: alerta cuando tu sorteo alcanza el 80% de boletos vendidos.',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-emerald-600 bg-emerald-50',
      organizerOnly: true,
    },
    {
      key: 'marketing_email' as keyof NotifPrefs,
      title: 'Correos promocionales',
      description: 'Recibe información sobre nuevos sorteos, promociones y novedades de la plataforma.',
      icon: <Megaphone className="w-5 h-5" />,
      color: 'text-pink-600 bg-pink-50',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-500">Cargando preferencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
            <p className="text-gray-500 text-sm">Configura qué correos deseas recibir</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'preferences' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Bell className="w-4 h-4" /> Preferencias
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'history' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-4 h-4" /> Historial de correos
          </button>
        </div>

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="space-y-4">
            {/* Security notice */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Notificaciones seguras</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Los correos de resultado incluyen un hash criptográfico para verificar la integridad del resultado. Cada envío se registra en el log de auditoría.
                </p>
              </div>
            </div>

            {/* Notification toggles */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {notificationOptions
                .filter(opt => !opt.organizerOnly || user?.role === 'organizer')
                .map(opt => (
                  <div key={opt.key} className="p-5 flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${opt.color}`}>
                      {opt.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm">{opt.title}</h3>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggle(opt.key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        preferences[opt.key] ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                          preferences[opt.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-md"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Guardando...' : 'Guardar preferencias'}
              </button>
            </div>
          </div>
        )}

        {/* Email History Tab */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Últimos correos enviados a tu cuenta</p>
              <button
                onClick={loadEmailLog}
                disabled={loadingLog}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLog ? 'animate-spin' : ''}`} /> Actualizar
              </button>
            </div>

            {loadingLog ? (
              <div className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Cargando historial...</p>
              </div>
            ) : emailLog.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sin correos enviados</h3>
                <p className="text-gray-500 text-sm">Los correos de notificación aparecerán aquí cuando se envíen.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {emailLog.map(log => (
                  <div key={log.id} className="p-4 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getEmailTypeIcon(log.email_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 line-clamp-1">{log.subject}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">{getEmailTypeLabel(log.email_type)}</p>
                        </div>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                          log.status === 'sent' || log.status === 'delivered'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {log.status === 'sent' || log.status === 'delivered' ? (
                            <MailCheck className="w-3 h-3" />
                          ) : (
                            <MailX className="w-3 h-3" />
                          )}
                          {log.status === 'sent' ? 'Enviado' : log.status === 'delivered' ? 'Entregado' : log.status === 'failed' ? 'Fallido' : 'Rebotado'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400">
                          {new Date(log.created_at).toLocaleString('es-MX', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-red-500 mt-1">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPreferencesPage;
