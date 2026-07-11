import Link from 'next/link';
import { Radio, Users, Zap, Disc } from 'lucide-react';

export default function Home() {
  return (
    <main className="app-container">
      {/* Decorative background glow circles */}
      <div 
        style={{
          position: 'absolute',
          top: '10%',
          left: '15%',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'rgba(139, 92, 246, 0.15)',
          filter: 'blur(80px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
      <div 
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '15%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.12)',
          filter: 'blur(80px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />

      <div className="glass-panel" style={{ zIndex: 1, textAlign: 'center' }}>
        <div className="logo-container" style={{ justifyContent: 'center' }}>
          <Disc size={42} className="gradient-text-accent" style={{ animation: 'spin 8s linear infinite' }} />
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', letterSpacing: '-0.02em' }}>Audiosync</h1>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.05rem', lineHeight: '1.6' }}>
          Synchronize audio playing from your host laptop to other devices in real-time. Perfectly in sync, with zero delay using WebRTC.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
          <Link href="/host" className="btn btn-primary" style={{ width: '100%' }}>
            <Radio size={20} />
            Host a Session
          </Link>
          <Link href="/join" className="btn btn-secondary" style={{ width: '100%' }}>
            <Users size={20} />
            Join a Session
          </Link>
        </div>

        <div style={{ 
          borderTop: '1px solid var(--glass-border)', 
          paddingTop: '2rem', 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1.5rem',
          textAlign: 'left'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-secondary)', fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
              <Zap size={16} />
              Zero Latency
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4' }}>
              WebRTC direct streaming delivers sub-100ms real-time audio sync.
            </p>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
              <Radio size={16} />
              Tab Sharing
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4' }}>
              Stream any high-quality browser tab audio directly.
            </p>
          </div>
        </div>
      </div>


    </main>
  );
}
