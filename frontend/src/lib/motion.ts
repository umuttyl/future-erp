import type { Variants } from 'framer-motion'

// Page transition: pure opacity + minimal Y. No scale (prevents layout thrashing).
// Exit is nearly instant so the new page feels responsive.
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, transition: { duration: 0.1,  ease: 'linear' } },
}

export const containerVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}

export const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 22, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1,   transition: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] } },
}

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0,  transition: { duration: 0.28, ease: 'easeOut' } },
}

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1,   transition: { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] } },
}

export const slideRight: Variants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.26, ease: 'easeOut' } },
}
