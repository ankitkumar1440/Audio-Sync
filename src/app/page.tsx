import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  other: {
    'zap-site-verification': 'zap-verify-e182d634-74d5-4461-8d85-2a785d8eb03f',
    'owner-email': 'akkr1440@gmail.com',
  },
};

export default function Home() {
  return <HomeClient />;
}
