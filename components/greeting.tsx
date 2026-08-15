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
      className="mx-auto flex w-full max-w-3xl flex-col items-center px-0 md:px-4"
      key="overview"
    >
      <motion.div
        animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
        className="pointer-events-none flex select-none flex-row items-center gap-3 text-center"
        exit={{ opacity: 0, y: 10 }}
        initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5 }}
      >
        <OpenSuiteMCPLogo size={36} />
        <span
          className="font-light text-3xl tracking-tight md:text-4xl"
          style={{ fontFamily: "var(--font-raleway)" }}
        >
          Your <span className="font-semibold">NetSuite</span> AI Assistant
        </span>
      </motion.div>
      {children && (
        <motion.div
          animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
          className="mt-6 w-full"
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
