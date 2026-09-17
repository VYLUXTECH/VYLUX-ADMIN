import { useState } from 'react';
import { apiPost } from '../hooks/useApi';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiPost('/api/login', { password: password.trim() });
      localStorage.setItem('vylux_token', res.token);
      onLogin(res.token);
    } catch (e) {
      setError(e.message || 'Invalid access key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-split">
      <div className="login-brand">
        <div className="login-brand-grid" />
        <div className="login-orb orb-1" />
        <div className="login-orb orb-2" />
        <div className="login-brand-inner">
          <div className="login-brand-head">
            <div className="logo-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </div>
            <span className="login-brand-name">VYLUX ADMIN</span>
          </div>
          <div className="login-brand-hero">
            <div className="login-eyebrow"><span className="pulse-dot"></span> VYLUX ADMIN · Live</div>
            <h1>Every system.<br />One surface.</h1>
            <p>Run your services, watch your revenue, track your visitors and keep every service healthy — from a single admin panel.</p>
          </div>
          <div className="login-brand-feats">
            <div className="login-feat">
              <span className="feat-ic" style={{ color: 'var(--success)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M17 6.5C17 4.5 14.5 3 12 3S7 4.5 7 6.5 9.5 10 12 10s5 1.5 5 3.5S14.5 17 12 17s-5-1.5-5-3.5"/></svg>
              </span>
              Revenue tracking
            </div>
            <div className="login-feat">
              <span className="feat-ic" style={{ color: 'var(--accent-cyan)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2"/></svg>
              </span>
              Visitor analytics
            </div>
            <div className="login-feat">
              <span className="feat-ic" style={{ color: 'var(--warning)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </span>
              Service health
            </div>
          </div>
        </div>
        <div className="login-brand-foot">VYLUX TECH · Engineering digital realities</div>
      </div>

      <div className="login-panel">
        <div className="login-box">
          <div className="login-box-badge">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </div>
          <h2>Welcome back</h2>
          <p className="login-box-sub">Enter your access key to open VYLUX ADMIN.</p>

          <form onSubmit={handleSubmit}>
            <label className="login-label" htmlFor="accessKey">Access key</label>
            <div className="login-input-group">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <input
                id="accessKey"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn btn-accent login-btn" disabled={loading}>
              {loading ? 'Authenticating…' : 'Access VYLUX ADMIN'}
              {!loading && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              )}
            </button>
          </form>

          <div className="login-box-foot">
            Protected dashboard · sessions are monitored
          </div>
        </div>
      </div>
    </div>
  );
}