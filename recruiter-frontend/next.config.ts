import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O import do LinkedIn manda o ZIP por Server Action, e o padrão é 1 MB.
      // Uma folga acima do teto de 20 MB do parser, porque o limite se aplica
      // ao corpo HTTP cru — o multipart soma alguns KB de fronteiras e headers.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
