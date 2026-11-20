import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalErrorBoundary] Uncaught application error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  private handleClearCache = async () => {
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }
      localStorage.removeItem('ecohero_active_tab');
      window.location.href = '/';
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-emerald-500/30 p-6 sm:p-8 space-y-6 shadow-2xl text-center relative overflow-hidden">
            {/* Ambient emerald backlight */}
            <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
              <ShieldAlert className="w-8 h-8 text-emerald-400" />
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest">
                Avtomatik Tiklash Tizimi
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Kutilmagan xatolik yuz berdi
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                EcoHero xavfsizlik tizimi xatolikni ushlab qoldi. Ma'lumotlaringiz va balansingiz xavfsiz saqlangan. Ilovani qayta yuklab davom etishingiz mumkin.
              </p>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                onClick={this.handleReload}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Qayta yuklash</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Bosh sahifa</span>
              </button>

              <button
                onClick={this.handleClearCache}
                className="py-3 px-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Keshni tozalash</span>
              </button>
            </div>

            {/* Error detail toggle */}
            <div className="pt-2 border-t border-slate-800/80 text-left">
              <button
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                className="text-[11px] text-slate-500 hover:text-slate-400 flex items-center gap-1 cursor-pointer mx-auto"
              >
                <span>Texnik ma'lumotlar</span>
                {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-rose-400 max-h-36 overflow-y-auto break-all">
                  <div><b>Xato:</b> {this.state.error?.toString()}</div>
                  {this.state.errorInfo?.componentStack && (
                    <div className="text-slate-500 mt-1 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer badge */}
            <div className="text-[10px] text-slate-500 font-mono">
              EcoHero 2.0 Ultra-Stable Architecture
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
