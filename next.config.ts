import type { NextConfig } from "next";
import { validateHostedDemoEnvironment } from './src/lib/demo-deployment-policy.mjs';

const hostedDemo = validateHostedDemoEnvironment(process.env);

const nextConfig: NextConfig = {
  // Opt-in only: existing production configuration is unchanged without demo flags.
  async headers() {
    if (!hostedDemo.enabled) return [];
    return [{ source: '/:path*', headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ] }];
  },
};

export default nextConfig;
