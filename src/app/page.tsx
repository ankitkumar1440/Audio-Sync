import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  other: {
    'zap-site-verification': 'zap-verify-921622f5-5ad3-4f0c-a154-258294bf9952',
    'owner-email': 'akkr1440@gmail.com',
  },
};

export default function Home() {
  return <HomeClient />;
}
