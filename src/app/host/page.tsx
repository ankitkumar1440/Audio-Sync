'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { Disc, Radio, AlertCircle, Users, Power, ArrowLeft, CheckCircle2, Info } from 'lucide-react';

export default function Host() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [sharingAudio, setSharingAudio] = useState<boolean>(false);
  const [clients, setClients] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to signaling server...');

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // WebRTC ice configuration using public STUN servers
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  };

  // Initialize a WebRTC connection with a receiver
  const initPeerConnection = async (peerId: string) => {
    console.log(`Initializing peer connection for ${peerId}`);
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerId, pc);
    iceQueuesRef.current.set(peerId, []);

    // Send local candidate to target receiver
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal', {
          targetId: peerId,
          data: { candidate: event.candidate }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state change for ${peerId}: ${pc.connectionState}`);
    };

    // If host is already sharing audio, attach the tracks immediately
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });
      
      // Create and send offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        if (socketRef.current) {
          socketRef.current.emit('signal', {
            targetId: peerId,
            data: { type: 'offer', sdp: offer.sdp }
          });
        }
      } catch (err) {
        console.error(`Error creating offer for ${peerId}:`, err);
      }
    }
  };

  // Close a WebRTC connection with a receiver
  const closePeerConnection = (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    iceQueuesRef.current.delete(peerId);
  };

  useEffect(() => {
    // Determine signaling server URL (from env variable or local fallback)
    const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001';
    
    // Connect to Socket.io server
    const socket = io(serverUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      setConnected(true);
      setStatusMessage('Creating synchronization room...');
      
      // Request room creation
      socket.emit('create-room', (response: { success: boolean; roomCode?: string; error?: string }) => {
        if (response.success && response.roomCode) {
          setRoomCode(response.roomCode);
          setStatusMessage('Room ready. Share code with other devices.');
        } else {
          setError(response.error || 'Failed to create room.');
          setStatusMessage('Initialization failed.');
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setConnected(false);
      setStatusMessage('Disconnected from server. Reconnecting...');
    });

    // A receiver joined our room
    socket.on('peer-joined', async ({ peerId }: { peerId: string }) => {
      console.log(`Peer joined: ${peerId}`);
      setClients((prev) => [...prev, peerId]);
      
      // Initialize peer connection for this client
      await initPeerConnection(peerId);
    });

    // A receiver left our room
    socket.on('peer-disconnected', ({ peerId }: { peerId: string }) => {
      console.log(`Peer disconnected: ${peerId}`);
      closePeerConnection(peerId);
      setClients((prev) => prev.filter((id) => id !== peerId));
    });

    // Received signaling data (Answer or ICE candidate) from a client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('signal', async ({ senderId, data }: { senderId: string; data: any }) => {
      const pc = peerConnectionsRef.current.get(senderId);
      if (!pc) return;

      try {
        if (data.type === 'answer') {
          console.log(`Received answer from client ${senderId}`);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          
          // Process queued ICE candidates now that remote description is set
          const queue = iceQueuesRef.current.get(senderId) || [];
          for (const candidate of queue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceQueuesRef.current.set(senderId, []);
        } else if (data.candidate) {
          const iceCandidate = new RTCIceCandidate(data.candidate);
          if (pc.remoteDescription) {
            await pc.addIceCandidate(iceCandidate);
          } else {
            // Queue ICE candidate if remote description is not set yet
            const queue = iceQueuesRef.current.get(senderId) || [];
            queue.push(data.candidate);
            iceQueuesRef.current.set(senderId, queue);
          }
        }
      } catch (err) {
        console.error(`Error handling signal from peer ${senderId}:`, err);
      }
    });

    const peerConnections = peerConnectionsRef.current;

    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Stop all peer connections
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
      
      // Stop local audio capture
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Start capturing tab audio
  const startAudioSharing = async () => {
    setError('');
    try {
      // Prompt user to select screen/tab to share
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required to capture tab audio in Chrome/Firefox
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      // Verify that an audio track exists
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Stop video tracks immediately if no audio is captured
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No tab audio shared. Make sure to tick the "Share tab audio" checkbox in the browser popup.');
      }

      // Stop video tracks since we only need the audio
      stream.getVideoTracks().forEach((track) => track.stop());
      
      localStreamRef.current = stream;
      setSharingAudio(true);
      setStatusMessage('Streaming tab audio in real-time...');

      // Connect to all already connected peers
      for (const peerId of clients) {
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc) {
          // Add audio track to existing connection
          audioTracks.forEach((track) => {
            pc.addTrack(track, stream);
          });

          // Create offer for this connection
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          if (socketRef.current) {
            socketRef.current.emit('signal', {
              targetId: peerId,
              data: { type: 'offer', sdp: offer.sdp }
            });
          }
        }
      }
    } catch (err) {
      console.error('Audio capture error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to capture tab audio.';
      setError(errorMessage);
    }
  };

  // Stop capturing tab audio
  const stopAudioSharing = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    
    setSharingAudio(false);
    setStatusMessage('Room ready. Share code with other devices.');

    // Remove tracks and close current peer connections (they will reconnect/reset on answer renegotiation)
    peerConnectionsRef.current.forEach((pc, peerId) => {
      // Re-create an empty peer connection to reset streams
      pc.close();
      initPeerConnection(peerId);
    });
  };

  return (
    <main className="app-container">
      {/* Decorative background glow circles */}
      <div 
        style={{
          position: 'absolute',
          top: '5%',
          left: '10%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(139, 92, 246, 0.15)',
          filter: 'blur(100px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
      
      <div className="glass-panel" style={{ zIndex: 1 }}>
        {/* Header navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <Link href="/" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.25rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span className={connected ? "pulse-indicator" : ""} style={{ backgroundColor: connected ? '#22c55e' : '#ef4444' }}></span>
            {connected ? 'Server Connected' : 'Server Disconnected'}
          </div>
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Disc size={28} className="gradient-text-accent" style={{ animation: sharingAudio ? 'spin 3s linear infinite' : 'none' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Host Session</h2>
        </div>

        {/* Room Code Area */}
        <div style={{ textAlign: 'center', margin: '2rem 0' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Room Code
          </p>
          {roomCode ? (
            <div className="room-code-badge">{roomCode}</div>
          ) : (
            <div style={{ margin: '1.5rem 0', color: 'var(--text-muted)' }}>Generating room code...</div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Open this website on other laptops and enter this code to connect.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '12px', 
            padding: '1rem', 
            color: '#f87171', 
            fontSize: '0.85rem',
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            lineHeight: '1.4'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Audio Share Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Sharing Audio Banner */}
        {sharingAudio && (
          <div style={{ 
            background: 'rgba(34, 197, 94, 0.1)', 
            border: '1px solid rgba(34, 197, 94, 0.2)', 
            borderRadius: '12px', 
            padding: '1rem', 
            color: '#4ade80', 
            fontSize: '0.85rem',
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            alignItems: 'center'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>Tab audio captured. Play music in your shared tab.</span>
          </div>
        )}

        {/* Connection status message */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          {statusMessage}
        </div>

        {/* Audio Share Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {!sharingAudio ? (
            <button 
              onClick={startAudioSharing} 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              disabled={!roomCode}
            >
              <Radio size={18} />
              Start Sharing Audio
            </button>
          ) : (
            <button 
              onClick={stopAudioSharing} 
              className="btn btn-secondary" 
              style={{ width: '100%', borderColor: '#ef4444', color: '#f87171', background: 'rgba(239, 68, 68, 0.05)' }}
            >
              <Power size={18} />
              Stop Sharing Audio
            </button>
          )}
        </div>

        {/* Guide / Instructions */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '1rem', marginBottom: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>
            <Info size={16} /> Important Guide
          </div>
          <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', lineHeight: '1.4' }}>
            <li>Click <strong>Start Sharing Audio</strong> above.</li>
            <li>In the browser prompt, select <strong>&quot;Chrome Tab&quot;</strong> (do not choose entire screen).</li>
            <li>Select the tab playing music (e.g. YouTube or Spotify Web).</li>
            <li>⚠️ <strong>Crucial:</strong> Tick the <strong>&quot;Share tab audio&quot;</strong> checkbox in the bottom-left of the browser popup before clicking Share.</li>
          </ol>
        </div>

        {/* Connected Clients */}
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            <Users size={16} /> Connected Receivers ({clients.length})
          </h3>
          {clients.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '1.5rem', 
              border: '1px dashed var(--glass-border)', 
              borderRadius: '12px', 
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}>
              Waiting for receivers to join using code {roomCode || '...'}
            </div>
          ) : (
            <div className="list-container">
              {clients.map((clientId, index) => (
                <div key={clientId} className="list-item">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="pulse-indicator" style={{ backgroundColor: '#22c55e' }}></span>
                    Laptop #{index + 1}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {clientId.substring(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </main>
  );
}
