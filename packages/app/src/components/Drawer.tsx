import { useRef } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';


interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, children, footer }: DrawerProps) {
  const controls = useDragControls();
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Drawer Panel */}
          <motion.div
            ref={drawerRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
            className="absolute bottom-0 left-0 right-0 z-50 flex flex-col max-h-[90%] w-full bg-card backdrop-blur-xl border-t border-border rounded-t-[20px] shadow-2xl"
            style={{ willChange: 'transform' }} // Optimization
          >
            {/* Handle Bar */}
            <div 
                className="w-full flex items-center justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => controls.start(e)}
            >
              <div className="w-12 h-1.5 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="px-6 pb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
              <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Scroller */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 touch-pan-y custom-scrollbar">
              {children}
            </div>

            {/* Footer which sticks to bottom */}
            {footer && (
               <div className="px-6 py-4 border-t border-border bg-card backdrop-blur flex gap-3">
                 {footer}
               </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
