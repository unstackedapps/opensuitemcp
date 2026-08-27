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
      className="mx-auto flex w-full max-w-chat flex-col items-center px-0 md:px-4"
      key="overview"
    >
      <motion.div
        animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
        className="@container pointer-events-none flex w-full max-w-full select-none items-center justify-center"
        exit={{ opacity: 0, y: 10 }}
        initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5 }}
      >
        <span
          className="flex max-w-full items-center justify-center gap-[0.38em] whitespace-nowrap font-light tracking-tight text-[clamp(0.8125rem,5.85cqi,2.25rem)] md:text-4xl"
          style={{ fontFamily: "var(--font-raleway)" }}
        >
          <OpenSuiteMCPLogo size={36} />
          <span className="whitespace-nowrap">
            Your <span className="font-semibold">NetSuite</span> AI Assistant
          </span>
        </span>
      </motion.div>
      {children && (
        <motion.div
          animate={shouldAnimate ? { opacity: 1, y: 0 } : false}
          className="mt-2 w-full md:mt-6"
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
