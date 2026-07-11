'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Radio, Users, Zap, Disc, Settings } from 'lucide-react';
import { isFirebaseConfigured, getFirebaseConfig } from '../lib/firebase';
import FirebaseConfigWizard from '../components/FirebaseConfigWizard';

export default function Home() {
  const [configured, setConfigured] = useState<boolean>(true);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [activeProjectId, setActiveProjectId] = useState<string>('');

  useEffect(() => {
    const isConfigged = isFirebaseConfigured();
    setTimeout(() => {
      setConfigured(isConfigged);
      if (!isConfigged) {
        setShowWizard(true);
      } else {
        const config = getFirebaseConfig();
        if (config) {
          setActiveProjectId(config.projectId);
        }
      }
    }, 0);
  }, []);

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

      {/* Floating Settings Button */}
      {configured && (
        <button
          onClick={() => setShowWizard(true)}
          className="btn btn-secondary"
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            padding: '0.6rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          title="Configure Firebase"
        >
          <Settings size={20} />
        </button>
      )}

      <div className="glass-panel" style={{ zIndex: 1, textAlign: 'center' }}>
        <div className="logo-container" style={{ justifyContent: 'center' }}>
          <Disc size={42} className="gradient-text-accent" style={{ animation: 'spin 8s linear infinite' }} />
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', letterSpacing: '-0.02em' }}>Audiosync</h1>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.05rem', lineHeight: '1.6' }}>
          Synchronize audio playing from your host laptop to other devices in real-time. Purely serverless audio sync hosted on Vercel.
        </p>

        {activeProjectId && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginBottom: '1.5rem',
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '0.4rem 0.875rem',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <span style={{ width: '6px', height: '6px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
            Connected to Firebase: <span style={{ fontFamily: 'monospace' }}>{activeProjectId}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
          <Link href={configured ? "/host" : "#"} onClick={() => !configured && setShowWizard(true)} className="btn btn-primary" style={{ width: '100%' }}>
            <Radio size={20} />
            Host a Session
          </Link>
          <Link href={configured ? "/join" : "#"} onClick={() => !configured && setShowWizard(true)} className="btn btn-secondary" style={{ width: '100%' }}>
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

      {/* Show Wizard Modal if triggered */}
      {showWizard && (
        <FirebaseConfigWizard 
          onClose={() => {
            setShowWizard(false);
            setConfigured(isFirebaseConfigured());
            const config = getFirebaseConfig();
            if (config) {
              setActiveProjectId(config.projectId);
            }
          }}
          showCancel={configured}
        />
      )}
    </main>
  );
}
