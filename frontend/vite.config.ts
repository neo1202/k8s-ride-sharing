import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // 這是你原本有的，讓外部能連線
    // 允許任何網址訪問 (包含 AWS ELB)
    allowedHosts: true,
  },
});
