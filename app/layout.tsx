import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipFlow — Tienda Nube → Andreani",
  description: "Convertí pedidos de Tienda Nube al formato de Andreani en segundos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Font Awesome — igual que en el web_app original */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
