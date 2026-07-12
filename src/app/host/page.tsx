'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  Unsubscribe 
} from 'firebase/firestore';
import { getDb } from '../../lib/firebase';
import { Disc, Radio, AlertCircle, Users, Power, ArrowLeft, CheckCircle2, Info } from 'lucide-react';

function mungeSdpForLatency(sdp: string | undefined): string {
  if (!sdp) return '';
  let modifiedSdp = sdp;
  if (modifiedSdp.includes('opus/48000')) {
    const match = modifiedSdp.match(/a=rtpmap:(\d+) opus\/48000/);
    if (match) {
      const payloadType = match[1];
      const fmtpRegex = new RegExp(`a=fmtp:${payloadType} ([^\\r\\n]+)`);
      const fmtpMatch = modifiedSdp.match(fmtpRegex);
      if (fmtpMatch) {
        let fmtpParams = fmtpMatch[1];
        fmtpParams = fmtpParams
          .replace(/;?minptime=\d+/, '')
          .replace(/;?ptime=\d+/, '')
          .replace(/;?maxptime=\d+/, '')
          .trim();
        const newFmtp = `a=fmtp:${payloadType} ${fmtpParams};minptime=3;ptime=3;maxptime=10`;
        modifiedSdp = modifiedSdp.replace(fmtpRegex, newFmtp);
      } else {
        modifiedSdp = modifiedSdp.replace(
          `a=rtpmap:${payloadType} opus/48000/2`,
          `a=rtpmap:${payloadType} opus/48000/2\r\na=fmtp:${payloadType} minptime=3;ptime=3;maxptime=10`
        );
      }
    }
  }
  return modifiedSdp;
}

export default function Host() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [sharingAudio, setSharingAudio] = useState<boolean>(false);
  const [clients, setClients] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Initializing Firebase...');

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerUnsubscribesRef = useRef<Map<string, Unsubscribe[]>>(new Map());
  const roomUnsubscribeRef = useRef<Unsubscribe | null>(null);

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

  // Initialize a WebRTC connection with a receiver using Firestore signaling
  const initPeerConnection = async (peerId: string, code: string) => {
    console.log(`Initializing peer connection for ${peerId}`);
    const db = getDb();
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerId, pc);
    iceQueuesRef.current.set(peerId, []);

    // Create array to hold unsubscribe functions for this client
    const clientUnsubs: Unsubscribe[] = [];

    // Send local candidate to target receiver via Firestore
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          const candidatesCollection = collection(db, 'rooms', code, 'peers', peerId, 'hostCandidates');
          await addDoc(candidatesCollection, event.candidate.toJSON());
        } catch (e) {
          console.error(`Error saving host candidate for peer ${peerId}:`, e);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state change for ${peerId}: ${pc.connectionState}`);
    };

    // 1. Listen for ICE Candidates written by the client
    const clientCandidatesRef = collection(db, 'rooms', code, 'peers', peerId, 'clientCandidates');
    const unsubClientCand = onSnapshot(clientCandidatesRef, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data() as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (e) {
              console.error(`Error adding client candidate for ${peerId}:`, e);
            }
          } else {
            // Queue candidate
            const queue = iceQueuesRef.current.get(peerId) || [];
            queue.push(candidateData);
            iceQueuesRef.current.set(peerId, queue);
          }
        }
      });
    });
    clientUnsubs.push(unsubClientCand);

    // 2. Listen for the WebRTC Answer written by the client
    const peerDocRef = doc(db, 'rooms', code, 'peers', peerId);
    const unsubPeerDoc = onSnapshot(peerDocRef, async (snap) => {
      const data = snap.data();
      if (data && data.answer && !pc.remoteDescription) {
        console.log(`Received WebRTC answer from client ${peerId}`);
          try {
            const mungedAnswer = {
              type: data.answer.type,
              sdp: mungeSdpForLatency(data.answer.sdp)
            };
            await pc.setRemoteDescription(new RTCSessionDescription(mungedAnswer as RTCSessionDescriptionInit));
          
          // Process queued candidates now that remote description is active
          const queue = iceQueuesRef.current.get(peerId) || [];
          for (const candidateData of queue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          }
          iceQueuesRef.current.set(peerId, []);
        } catch (e) {
          console.error(`Error setting remote answer for ${peerId}:`, e);
        }
      }
    });
    clientUnsubs.push(unsubPeerDoc);

    // Store the unsubscribes
    peerUnsubscribesRef.current.set(peerId, clientUnsubs);

    // If host is already sharing audio, attach the tracks immediately and create Offer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });
      
      try {
        const offer = await pc.createOffer();
        const mungedSdp = mungeSdpForLatency(offer.sdp);
        await pc.setLocalDescription({ type: 'offer', sdp: mungedSdp });
        
        await updateDoc(peerDocRef, {
          offer: { sdp: mungedSdp, type: 'offer' }
        });
        console.log(`Sent offer to client ${peerId}`);
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

    // Unsubscribe from Firestore updates for this client
    const unsubs = peerUnsubscribesRef.current.get(peerId);
    if (unsubs) {
      unsubs.forEach((unsub) => unsub());
      peerUnsubscribesRef.current.delete(peerId);
    }
  };

  useEffect(() => {
    let activeRoomCode = '';
    const peerConnections = peerConnectionsRef.current;
    const peerUnsubscribes = peerUnsubscribesRef.current;
    
    const setupRoom = async () => {
      try {
        const db = getDb();
        
        // Generate random 4-digit code
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        activeRoomCode = code;
        setRoomCode(code);
        
        setStatusMessage('Creating synchronization room in Firestore...');
        
        // Create Room document in Firestore
        const roomRef = doc(db, 'rooms', code);
        await setDoc(roomRef, { createdAt: new Date() });
        
        setStatusMessage('Room ready. Share code with other devices.');

        // Listen for new peers joining the room
        const peersRef = collection(db, 'rooms', code, 'peers');
        const unsubscribePeers = onSnapshot(peersRef, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            const peerId = change.doc.id;
            if (change.type === 'added') {
              console.log(`Firestore Peer joined: ${peerId}`);
              setClients((prev) => [...prev, peerId]);
              await initPeerConnection(peerId, code);
            } else if (change.type === 'removed') {
              console.log(`Firestore Peer left: ${peerId}`);
              closePeerConnection(peerId);
              setClients((prev) => prev.filter((id) => id !== peerId));
            }
          });
        });

        roomUnsubscribeRef.current = unsubscribePeers;
      } catch (err) {
        console.error('Firebase Room Setup Error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setStatusMessage('Initialization failed.');
      }
    };

    setupRoom();

    return () => {
      // Cleanup on unmount
      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
      }
      
      // Stop all peer connections
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();

      // Unsubscribe from all peer-specific Firestore updates
      peerUnsubscribes.forEach((unsubs) => {
        unsubs.forEach((unsub) => unsub());
      });
      peerUnsubscribes.clear();
      
      // Stop local audio capture
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Delete Room document from Firestore
      if (activeRoomCode) {
        try {
          const db = getDb();
          const roomRef = doc(db, 'rooms', activeRoomCode);
          deleteDoc(roomRef);
          console.log(`Teared down room: ${activeRoomCode}`);
        } catch (e) {
          console.error('Error tearing down room:', e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Start capturing tab audio
  const startAudioSharing = async () => {
    setError('');
    try {
      const db = getDb();
      // Prompt user to select screen/tab to share
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required to capture tab audio in Chrome/Firefox
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-expect-error: latency property is non-standard but supported in Chrome
          latency: 0,
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false,
          googTypingNoiseDetection: false,
          googNoiseReduction: false,
          channelCount: 2
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
          const mungedSdp = mungeSdpForLatency(offer.sdp);
          await pc.setLocalDescription({ type: 'offer', sdp: mungedSdp });
          
          const peerDocRef = doc(db, 'rooms', roomCode, 'peers', peerId);
          await updateDoc(peerDocRef, {
            offer: { sdp: mungedSdp, type: 'offer' }
          });
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

    // Remove tracks and close current peer connections (recreating them resets state)
    peerConnectionsRef.current.forEach((pc, peerId) => {
      pc.close();
      initPeerConnection(peerId, roomCode);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.25rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span className="pulse-indicator" style={{ backgroundColor: '#22c55e' }}></span>
            Live Sync
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
