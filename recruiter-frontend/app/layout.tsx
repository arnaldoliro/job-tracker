import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ProfileGate } from "@/features/profile/components/profile-gate";
import {
  getProfiles,
  getSelectedProfile,
} from "@/features/profile/current-profile";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Rastreador pessoal de candidaturas a vagas.",
};

/**
 * O gate vive no layout, e não numa página: sem perfil escolhido, nenhuma rota
 * tem o que mostrar. Aqui ele guarda todas — inclusive quem abre direto em
 * /vagas/salvas com o cookie vazio.
 */
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [profiles, selected] = await Promise.all([
    getProfiles(),
    getSelectedProfile(),
  ]);

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ProfileGate profiles={profiles} selected={selected}>
          {children}
        </ProfileGate>
      </body>
    </html>
  );
}
