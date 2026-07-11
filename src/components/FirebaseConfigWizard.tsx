'use client';

import { useState, useEffect } from 'react';
import { setLocalFirebaseConfig, getFirebaseConfig, FirebaseConfig, isConfigFromEnv, resetFirebaseConfig } from '../lib/firebase';
import { Check, Settings, ShieldAlert, ArrowRight, HelpCircle } from 'lucide-react';

interface FirebaseConfigWizardProps {
  onClose?: () => void;
  showCancel?: boolean;
}

export default function FirebaseConfigWizard({ onClose, showCancel = false }: FirebaseConfigWizardProps) {
  const configFromEnv = isConfigFromEnv();
  const [hasLocalOverride, setHasLocalOverride] = useState<boolean>(false);
  const [rawConfig, setRawConfig] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [appId, setAppId] = useState<string>('');
  const [authDomain, setAuthDomain] = useState<string>('');
  const [storageBucket, setStorageBucket] = useState<string>('');
  const [messagingSenderId, setMessagingSenderId] = useState<string>('');
  
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        setHasLocalOverride(!!localStorage.getItem('audiosync_firebase_config'));
      }, 0);
    }
  }, []);

  useEffect(() => {
    // Populate fields if config already exists locally
    const current = getFirebaseConfig();
    if (current && !current.apiKey.startsWith('process.env')) {
      setTimeout(() => {
        setApiKey(current.apiKey || '');
        setProjectId(current.projectId || '');
        setAppId(current.appId || '');
        setAuthDomain(current.authDomain || '');
        setStorageBucket(current.storageBucket || '');
        setMessagingSenderId(current.messagingSenderId || '');
      }, 0);
    }
  }, []);

  // Try to parse JSON from pasted string
  const handlePasteConfig = (text: string) => {
    setRawConfig(text);
    setError('');

    try {
      // Clean up JS object format (remove variable assignments like 'const firebaseConfig =', etc.)
      let cleaned = text.trim();
      
      // Remove variable declarations
      cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/i, '');
      // Remove trailing semicolons
      cleaned = cleaned.replace(/;$/, '');
      
      // If it looks like a JavaScript object instead of JSON, we can extract key-values using regex
      const extractKey = (key: string) => {
        const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
        const match = cleaned.match(regex);
        return match ? match[1] : '';
      };

      const extractedApiKey = extractKey('apiKey');
      const extractedProjectId = extractKey('projectId');
      const extractedAppId = extractKey('appId');
      
      if (extractedApiKey && extractedProjectId && extractedAppId) {
        setApiKey(extractedApiKey);
        setProjectId(extractedProjectId);
        setAppId(extractedAppId);
        setAuthDomain(extractKey('authDomain'));
        setStorageBucket(extractKey('storageBucket'));
        setMessagingSenderId(extractKey('messagingSenderId'));
        return;
      }

      // Try parsing as raw JSON
      const parsed = JSON.parse(cleaned);
      if (parsed.apiKey && parsed.projectId && parsed.appId) {
        setApiKey(parsed.apiKey);
        setProjectId(parsed.projectId);
        setAppId(parsed.appId);
        setAuthDomain(parsed.authDomain || '');
        setStorageBucket(parsed.storageBucket || '');
        setMessagingSenderId(parsed.messagingSenderId || '');
      } else {
        setError('Pasted config is missing required fields (apiKey, projectId, or appId).');
      }
    } catch {
      // If parsing fails and it didn't match the regex, show error
      setError('Could not automatically parse the configuration. Try pasting the exact config object, or switch to manual input.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiKey || !projectId || !appId) {
      setError('API Key, Project ID, and App ID are required.');
      return;
    }

    const config: FirebaseConfig = {
      apiKey,
      projectId,
      appId,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      storageBucket: storageBucket || `${projectId}.appspot.com`,
      messagingSenderId: messagingSenderId || '',
    };

    try {
      setLocalFirebaseConfig(config);
      setSuccess(true);
      if (onClose) {
        setTimeout(onClose, 1000);
      }
    } catch {
      setError('Failed to save configuration.');
    }
  };

  if (configFromEnv) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.5rem'
      }}>
        <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              color: '#4ade80'
            }}>
              <Check size={28} />
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>System Configured</h2>
          </div>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.5', marginBottom: '2rem' }}>
            This instance of Audiosync is pre-configured securely via system environment variables. Your keys are hidden and protected.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {onClose && (
              <button type="button" onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>
                Close Settings
              </button>
            )}
            {hasLocalOverride && (
              <button 
                type="button" 
                onClick={() => resetFirebaseConfig()} 
                className="btn btn-secondary" 
                style={{ width: '100%', borderColor: '#ef4444', color: '#f87171', background: 'rgba(239, 68, 68, 0.02)' }}
              >
                Clear Local Overrides
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem',
      overflowY: 'auto'
    }}>
      <div className="glass-panel" style={{ 
        maxWidth: '560px', 
        width: '100%', 
        padding: '2rem',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <Settings size={28} className="gradient-text-accent" style={{ animation: 'spin 12s linear infinite' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Firebase Configuration</h2>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          Audiosync is 100% serverless and runs on Vercel. To enable WebRTC signaling, paste your free Firebase project settings below. They will remain securely in your local browser storage.
        </p>

        {/* Setup Guide Cards */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.02)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '16px', 
          padding: '1rem',
          marginBottom: '1.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>
            <HelpCircle size={14} /> Quick Setup Guide (Takes 2 mins)
          </div>
          <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: '1.4' }}>
            <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-secondary)', textDecoration: 'underline' }}>Firebase Console</a>.</li>
            <li>Create a new project & add a <strong>Web App</strong>.</li>
            <li>Build a <strong>Cloud Firestore</strong> database in production or test mode.</li>
            <li>Copy the <code>firebaseConfig</code> object and paste it below.</li>
          </ol>
        </div>

        {/* Tab Toggle */}
        <div style={{ 
          display: 'flex', 
          background: 'rgba(0, 0, 0, 0.2)', 
          padding: '0.25rem', 
          borderRadius: '10px', 
          marginBottom: '1.25rem',
          border: '1px solid var(--glass-border)'
        }}>
          <button 
            type="button"
            onClick={() => setActiveTab('paste')}
            className="btn"
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              fontSize: '0.85rem',
              background: activeTab === 'paste' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              borderRadius: '8px'
            }}
          >
            Paste Config Object
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('manual')}
            className="btn"
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              fontSize: '0.85rem',
              background: activeTab === 'manual' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              borderRadius: '8px'
            }}
          >
            Manual Input
          </button>
        </div>

        {/* Forms */}
        {activeTab === 'paste' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Paste firebaseConfig Code block
            </label>
            <textarea
              placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "...",\n  projectId: "..."\n};`}
              value={rawConfig}
              onChange={(e) => handlePasteConfig(e.target.value)}
              className="input-field"
              rows={6}
              style={{ 
                fontFamily: 'monospace', 
                fontSize: '0.8rem', 
                whiteSpace: 'pre',
                resize: 'vertical',
                lineHeight: '1.4'
              }}
            />
            {projectId && (
              <div style={{ fontSize: '0.8rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Check size={14} /> Successfully parsed project ID: <strong>{projectId}</strong>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Project ID *</label>
                <input
                  type="text"
                  placeholder="my-audiosync-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '0.85rem', padding: '0.6rem 0.875rem' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>API Key *</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '0.85rem', padding: '0.6rem 0.875rem' }}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>App ID *</label>
              <input
                type="text"
                placeholder="1:123456789:web:abcdef..."
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="input-field"
                style={{ fontSize: '0.85rem', padding: '0.6rem 0.875rem' }}
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Auth Domain (Optional)</label>
                <input
                  type="text"
                  placeholder="optional"
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '0.85rem', padding: '0.6rem 0.875rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sender ID (Optional)</label>
                <input
                  type="text"
                  placeholder="optional"
                  value={messagingSenderId}
                  onChange={(e) => setMessagingSenderId(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '0.85rem', padding: '0.6rem 0.875rem' }}
                />
              </div>
            </div>
          </form>
        )}

        {/* Error Notification */}
        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '12px', 
            padding: '0.75rem 1rem', 
            color: '#f87171', 
            fontSize: '0.8rem',
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.25rem',
            lineHeight: '1.4'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {/* Success Notification */}
        {success && (
          <div style={{ 
            background: 'rgba(34, 197, 94, 0.1)', 
            border: '1px solid rgba(34, 197, 94, 0.2)', 
            borderRadius: '12px', 
            padding: '0.75rem 1rem', 
            color: '#4ade80', 
            fontSize: '0.8rem',
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.25rem',
            alignItems: 'center'
          }}>
            <Check size={16} />
            <span>Config saved! Reloading application...</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          {showCancel && onClose && (
            <button 
              type="button" 
              onClick={onClose} 
              className="btn btn-secondary" 
              style={{ flex: 1 }}
              disabled={success}
            >
              Cancel
            </button>
          )}
          <button 
            type="button" 
            onClick={handleSubmit} 
            className="btn btn-primary" 
            style={{ flex: 2 }}
            disabled={!apiKey || !projectId || !appId || success}
          >
            Save Config & Start Sync
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
