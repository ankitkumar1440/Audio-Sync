import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  other: {
    'zap-site-verification': 'zap-verify-f52e9329-564a-4a9e-b080-fef7d02a952f',
    'owner-email': 'akkr1440@gmail.com',
  },
};

export default function Home() {
  return <HomeClient />;
}
