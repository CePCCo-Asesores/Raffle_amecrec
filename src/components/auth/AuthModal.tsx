import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/types';
import { X, Eye, EyeOff, User, Mail, Lock, Phone, Shield, Ticket, Users, MailCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'register';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultTab = 'login' }) => {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Pantalla de verificación
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('participant');
  const [regPhone, setRegPhone] = useState('');

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (success) onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) return;
    if (regPassword.length < 6) return;
    setLoading(true);
    const result = await signUp(regEmail, regPassword, regName, regRole);
    setLoading(false);
    if (result.success) {
      if (result.needsVerification) {
        setVerificationEmail(result.email || regEmail);
      } else {
        onClose();
      }
    }
  };

  const handleResendEmail = async () => {
    if (!verificationEmail) return;
    setResending(true);
    await supabase.auth.resend({ type: 'signup', email: verificationEmail });
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  const roleOptions: { value: UserRole; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'participant', label: 'Participante', desc: 'Compra boletos y participa en sorteos', icon: <Ticket className="w-5 h-5" /> },
    { value: 'organizer', label: 'Organizador', desc: 'Crea y gestiona tus propios sorteos', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-900 to-indigo-800 p-6 rounded-t-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              {verificationEmail ? <MailCheck className="w-5 h-5 text-white" /> : <Shield className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Sorteos AMECREC</h2>
              <p className="text-blue-200 text-sm">
                {verificationEmail ? 'Verifica tu correo' : 'Plataforma de Sorteos Digitales'}
              </p>
            </div>
          </div>
          {!verificationEmail && (
            <div className="flex bg-white/10 rounded-lg p-1">
              <button onClick={() => setTab('login')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${tab === 'login' ? 'bg-white text-blue-900 shadow-sm' : 'text-white/80 hover:text-white'}`}>
                Iniciar Sesión
              </button>
              <button onClick={() => setTab('register')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${tab === 'register' ? 'bg-white text-blue-900 shadow-sm' : 'text-white/80 hover:text-white'}`}>
                Registrarse
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6">

          {/* ── PANTALLA DE VERIFICACIÓN ── */}
          {verificationEmail ? (
            <div className="text-center space-y-5">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                <MailCheck className="w-10 h-10 text-blue-500" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Revisa tu correo</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Enviamos un enlace de verificación a:
                </p>
                <p className="font-semibold text-blue-700 text-sm mt-1 break-all">{verificationEmail}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-2">
                <p className="text-sm font-semibold text-amber-800">📧 ¿Qué debes hacer?</p>
                <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
                  <li>Abre tu bandeja de entrada (o spam)</li>
                  <li>Busca un correo de <strong>Sorteos AMECREC</strong></li>
                  <li>Haz clic en el enlace <strong>"Confirmar correo"</strong></li>
                  <li>Vuelve aquí e inicia sesión</li>
                </ol>
              </div>

              {resent && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 flex items-center gap-2">
                  <MailCheck className="w-4 h-4 flex-shrink-0" /> Correo reenviado correctamente.
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleResendEmail}
                  disabled={resending || resent}
                  className="w-full py-2.5 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {resending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Reenviando...</> : '📨 Reenviar correo de verificación'}
                </button>
                <button
                  onClick={() => { setVerificationEmail(null); setTab('login'); }}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  Ya verifiqué — Iniciar sesión
                </button>
                <button onClick={onClose} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                  Cerrar
                </button>
              </div>
            </div>

          ) : tab === 'login' ? (
            /* ── LOGIN ── */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="tu@email.com" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Tu contraseña" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50">
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </form>

          ) : (
            /* ── REGISTRO ── */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={regName} onChange={e => setRegName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Juan Pérez" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="tu@email.com" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono <span className="text-gray-400 font-normal">(opcional)</span></label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="+52 55 1234 5678" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de cuenta</label>
                <div className="grid grid-cols-2 gap-3">
                  {roleOptions.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setRegRole(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${regRole === opt.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`mb-1 ${regRole === opt.value ? 'text-blue-600' : 'text-gray-400'}`}>{opt.icon}</div>
                      <div className={`text-sm font-medium ${regRole === opt.value ? 'text-blue-900' : 'text-gray-700'}`}>{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Mínimo 6 caracteres" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="password" value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Repite tu contraseña" required />
                </div>
                {regConfirmPassword && regPassword !== regConfirmPassword && (
                  <p className="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
                )}
              </div>
              <button type="submit" disabled={loading || regPassword !== regConfirmPassword}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50">
                {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
