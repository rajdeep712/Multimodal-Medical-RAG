import React from 'react';
import { Navbar } from '../components/layout/Navbar.tsx';
import { HeroSection } from '../components/home/HeroSection.tsx';
import { FeatureCards } from '../components/home/FeatureCards.tsx';
import { HowItWorks } from '../components/home/HowItWorks.tsx';
import { ProductShowcase } from '../components/home/ProductShowcase.tsx';
import { SecuritySection } from '../components/home/SecuritySection.tsx';
import { Footer } from '../components/home/Footer.tsx';

export const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFC]">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeatureCards />
        <HowItWorks />
        <ProductShowcase />
        <SecuritySection />
      </main>
      <Footer />
    </div>
  );
};
