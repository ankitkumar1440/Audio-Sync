'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Disc, Volume2, VolumeX, AlertCircle, Info, Play, RefreshCw, XCircle } from 'lucide-react';

export default function Join() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [joined, setJoined] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const [webrtcState, setWebrtcState] = useState<string>('disconnected');
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Enter code to connect.');
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [audioStreamActive, setAudioStreamActive] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hostIdRef = useRef<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    // Stop canvas animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close WebRTC
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset stream
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
    }
    
    mediaStreamRef.current = null;
    iceCandidateQueueRef.current = [];
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || roomCode.length !== 4) {
      setError('Please enter a valid 4-digit room code.');
      return;
    }

    setError('');
    cleanup();
    setStatusMessage('Connecting...');

    const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001';
    const socket = io(serverUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { roomCode }, (response: { success: boolean; hostId?: string; error?: string }) => {
        if (response.success && response.hostId) {
          setJoined(true);
          hostIdRef.current = response.hostId;
          setStatusMessage('Waiting for Host to start sharing audio...');
          setWebrtcState('connecting');
        } else {
          setError(response.error || 'Failed to join room.');
          setStatusMessage('Connection failed.');
          socket.disconnect();
        }
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setWebrtcState('disconnected');
      setStatusMessage('Disconnected from server.');
    });

    socket.on('host-disconnected', () => {
      setError('The host disconnected. The session has ended.');
      setStatusMessage('Session ended.');
      cleanup();
      setJoined(false);
      setAudioStreamActive(false);
    });

    // Received signaling data (Offer or ICE candidate) from the Host
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('signal', async ({ senderId, data }: { senderId: string; data: any }) => {
      try {
        if (data.type === 'offer') {
          console.log('Received WebRTC Offer from host');
          setWebrtcState('connecting');
          setStatusMessage('Establishing synchronized connection...');
          
          const pc = new RTCPeerConnection(rtcConfig);
          peerConnectionRef.current = pc;

          // Send local candidates back to Host
          pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
              socketRef.current.emit('signal', {
                targetId: senderId,
                data: { candidate: event.candidate }
              });
            }
          };

          pc.onconnectionstatechange = () => {
            console.log(`WebRTC Connection State: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
              setWebrtcState('connected');
              setStatusMessage('Synchronized and playing!');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              setWebrtcState('disconnected');
              setStatusMessage('Connection lost. Waiting to reconnect...');
              setAudioStreamActive(false);
            }
          };

          // Receive Host audio stream
          pc.ontrack = (event) => {
            console.log('Received audio track from host');
            const stream = event.streams[0];
            mediaStreamRef.current = stream;
            
            if (audioElementRef.current) {
              audioElementRef.current.srcObject = stream;
              
              // Play the stream
              audioElementRef.current.play()
                .then(() => {
                  setAutoplayBlocked(false);
                  setAudioStreamActive(true);
                  initAudioVisualizer(stream);
                })
                .catch((err) => {
                  console.warn('Autoplay blocked:', err);
                  setAutoplayBlocked(true);
                  setAudioStreamActive(true);
                  setStatusMessage('Click "Resume Playback" to start audio');
                });
            }
          };

          // Apply Offer
          await pc.setRemoteDescription(new RTCSessionDescription(data));

          // Apply all queued ICE candidates
          const queue = iceCandidateQueueRef.current;
          for (const candidate of queue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidateQueueRef.current = [];

          // Create and send Answer
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (socketRef.current) {
            socketRef.current.emit('signal', {
              targetId: senderId,
              data: { type: 'answer', sdp: answer.sdp }
            });
          }
        } else if (data.candidate) {
          const candidate = new RTCIceCandidate(data.candidate);
          const pc = peerConnectionRef.current;
          
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            // Queue ICE candidate if peer connection not ready/remote description not set
            iceCandidateQueueRef.current.push(data.candidate);
          }
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
        setError('Error establishing peer connection.');
      }
    });
  };

  const handleManualResume = () => {
    if (audioElementRef.current) {
      audioElementRef.current.play()
        .then(() => {
          setAutoplayBlocked(false);
          setStatusMessage('Synchronized and playing!');
          if (mediaStreamRef.current) {
            initAudioVisualizer(mediaStreamRef.current);
          }
        })
        .catch((err) => {
          console.error('Manual play failed:', err);
          setError('Playback blocked by browser settings. Please enable audio for this site.');
        });
    }
  };

  const initAudioVisualizer = (stream: MediaStream) => {
    try {
      // Create Web Audio Context & Analyser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // Smaller size for smooth bars visualizer
      analyserRef.current = analyser;

      // Pipe Stream to Analyser (do not connect to destination to avoid duplicating output audio)
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start rendering loop
      renderVisualizer();
    } catch (err) {
      console.error('Failed to initialize audio visualizer:', err);
    }
  };

  const renderVisualizer = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;

      // Semi-transparent background for trails effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.fillRect(0, 0, width, height);

      const barCount = bufferLength;
      const barWidth = (width / barCount) * 0.8;
      const barGap = (width / barCount) * 0.2;

      // Draw mirrored frequency bars from the center
      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i];
        // Calculate height with slight scale booster
        const barHeight = (val / 255) * height * 0.8;

        // Position from center outward
        const xOffset = i * (barWidth + barGap);
        
        // Dynamic styling: purple-cyan gradient based on frequency
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, '#8b5cf6'); // Violet
        grad.addColorStop(0.5, '#06b6d4'); // Cyan
        grad.addColorStop(1, '#ec4899'); // Pink

        ctx.fillStyle = grad;
        
        // Draw bars on both left and right sides
        ctx.fillRect(width / 2 + xOffset, height - barHeight, barWidth, barHeight);
        ctx.fillRect(width / 2 - xOffset - barWidth, height - barHeight, barWidth, barHeight);
      }
    };

    draw();
  };

  const handleDisconnect = () => {
    cleanup();
    setJoined(false);
    setAudioStreamActive(false);
    setStatusMessage('Enter code to connect.');
  };

  return (
    <main className="app-container">
      {/* Decorative background glow circles */}
      <div 
        style={{
          position: 'absolute',
          top: '5%',
          right: '10%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.12)',
          filter: 'blur(100px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />

      <div className="glass-panel" style={{ zIndex: 1 }}>
        {/* Header navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <Link href="/" onClick={cleanup} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.25rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span className={connected ? "pulse-indicator" : ""} style={{ backgroundColor: connected ? '#22c55e' : '#ef4444' }}></span>
            {connected ? 'Sync Server Connected' : 'Not Connected'}
          </div>
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Disc size={28} className="gradient-text-accent" style={{ animation: audioStreamActive ? 'spin 3s linear infinite' : 'none' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Join Session</h2>
        </div>

        {/* Hidden HTML Audio Element */}
        <audio ref={audioElementRef} style={{ display: 'none' }} playsInline />

        {/* Form: Enter Room Code */}
        {!joined ? (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', margin: '1.5rem 0' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '0.5rem' }}>
              {statusMessage}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="code" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                Enter Room Code
              </label>
              <input
                id="code"
                type="text"
                maxLength={4}
                placeholder="e.g. 1234"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                className="input-field"
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.2em', fontWeight: 700 }}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              <Play size={18} />
              Connect to Session
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Connected Room
            </div>
            <div className="room-code-badge" style={{ fontSize: '1.8rem', padding: '0.5rem 1.25rem' }}>{roomCode}</div>

            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>
              {statusMessage}
            </div>

            {/* WebRTC Connection Status Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {webrtcState === 'connected' ? (
                <>
                  <Volume2 size={16} style={{ color: '#22c55e' }} />
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>Audio Sync Active</span>
                </>
              ) : webrtcState === 'connecting' ? (
                <>
                  <RefreshCw size={16} className="spin-animation" style={{ color: 'var(--accent-secondary)' }} />
                  <span>Connecting Audio Stream...</span>
                </>
              ) : (
                <>
                  <VolumeX size={16} style={{ color: 'var(--text-muted)' }} />
                  <span>Audio Inactive (Waiting for Host)</span>
                </>
              )}
            </div>

            {/* Autoplay blocker notification */}
            {autoplayBlocked && (
              <div style={{ marginTop: '1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  Browser blocked autoplay. Press below to enable sync audio.
                </p>
                <button onClick={handleManualResume} className="btn btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)' }}>
                  <Play size={18} />
                  Resume Audio Playback
                </button>
              </div>
            )}

            {/* Visualizer Canvas */}
            {webrtcState === 'connected' && !autoplayBlocked && (
              <canvas ref={canvasRef} className="visualizer-canvas" width={440} height={180} />
            )}

            <button 
              onClick={handleDisconnect} 
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '1.5rem', borderColor: '#ef4444', color: '#f87171', background: 'rgba(239, 68, 68, 0.05)' }}
            >
              <XCircle size={18} />
              Disconnect
            </button>
          </div>
        )}

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
            marginTop: '1.5rem',
            lineHeight: '1.4',
            textAlign: 'left'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Connection Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '1rem', marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>
            <Info size={16} /> Connection Help
          </div>
          <p style={{ lineHeight: '1.4' }}>
            If you connect successfully but don&apos;t hear any audio, make sure the Host has clicked <strong>&quot;Start Sharing Audio&quot;</strong> and checked the <strong>&quot;Share tab audio&quot;</strong> option in their browser popup window.
          </p>
        </div>
      </div>

    </main>
  );
}
