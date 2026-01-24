import { ReactNode } from 'react';

export const LayoutWrapper = ({ children }: { children: ReactNode }) => (
  <div className="relative w-[360px] h-[520px] bg-background text-foreground font-sans overflow-hidden flex flex-col transition-colors duration-300">
    {/* Ambient Background Lights */}
    {/* Primary Blob */}
    <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full filter blur-[100px] pointer-events-none 
      bg-indigo-500/30 dark:bg-indigo-500/20 transition-all duration-700" 
    />
    
    {/* Secondary Blob */}
    <div className="absolute top-40 -right-20 w-60 h-60 rounded-full filter blur-[80px] pointer-events-none
      bg-violet-500/20 dark:bg-violet-600/15 transition-all duration-700"
    />
    
    <div className="relative z-10 flex flex-col h-full">
        {children}
    </div>
  </div>
);
