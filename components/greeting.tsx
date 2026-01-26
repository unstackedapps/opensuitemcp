import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { OpenSuiteMCPLogo } from "./icons";

let hasAnimated = false;

export const Greeting = ({ children }: { children?: ReactNode }) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    hasAnimated = true;
  }, []);

  const shouldAnimate = !hasAnimated;

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col items-center px-0 md:px-4"
      key="overview"
    >
      <motion.div
        animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
        className="pointer-events-none flex select-none flex-row items-center gap-2 font-semibold text-3xl"
        exit={{ opacity: 0, y: 10 }}
        initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5 }}
      >
        <OpenSuiteMCPLogo size={32} />
        Hello there, I'm Ava!
      </motion.div>
      {children && (
        <motion.div
          animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
          className="mt-4 w-full"
          exit={{ opacity: 0, y: 10 }}
          initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.6 }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
};
