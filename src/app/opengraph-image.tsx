import { ImageResponse } from 'next/og';

export const alt = 'Quizify - AI-Powered Quiz Generator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0b 0%, #17121f 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 110,
            height: 110,
            borderRadius: 28,
            background: '#8b5cf6',
            fontSize: 64,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          Q
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Quizify
        </div>
        <div style={{ fontSize: 30, color: '#a1a1aa', marginTop: 16, maxWidth: 800, textAlign: 'center' }}>
          Turn lecture notes into interactive AI quizzes in seconds
        </div>
      </div>
    ),
    { ...size }
  );
}
