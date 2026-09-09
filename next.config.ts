import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@fontsource/noto-sans-kr/files/*.woff2"],
  },
};

export default nextConfig;
